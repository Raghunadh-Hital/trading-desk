import fyersModule from 'fyers-api-v3';
import { fyersService } from './fyers-client.js';
import { symbolService } from './symbol-service.js';
import { resolutionToSeconds, type VelaBar, type FyersTick } from './types.js';

// Suppress verbose internal fyers-api-v3 SocketMessage console dumps
const originalConsoleLog = console.log;
console.log = function (...args: any[]) {
  if (args.length > 0 && args[0] && typeof args[0] === 'object' && 'SocketMessage' in args[0]) {
    return; // Silently filter out library debug dumps to keep server terminal clean
  }
  originalConsoleLog.apply(console, args);
};

const { fyersDataSocket } = fyersModule;

export type BarUpdateCallback = (update: {
  symbol: string;
  resolution: string;
  bar: VelaBar;
}) => void;

interface FormingBarKey {
  symbol: string;
  resolution: string;
}

export class TickAggregator {
  private activeBars = new Map<string, VelaBar>();
  private listeners: BarUpdateCallback[] = [];
  private socketInstance: any = null;
  private socketListenersAttached = false;
  private subscribedSymbols = new Set<string>();
  private mockIntervalTimer: NodeJS.Timeout | null = null;
  private lastPrices = new Map<string, number>();

  constructor() {
    this.startMockTickGenerator();
  }

  public subscribeSymbol(symbol: string): void {
    this.subscribedSymbols.add(symbol);
    if (this.socketInstance && typeof this.socketInstance.subscribe === 'function') {
      try {
        this.socketInstance.subscribe([symbol]);
      } catch (err) {
        console.warn(`[TickAggregator] Socket subscribe error: ${err}`);
      }
    }
  }

  public unsubscribeSymbol(symbol: string): void {
    this.subscribedSymbols.delete(symbol);
    if (this.socketInstance && typeof this.socketInstance.unsubscribe === 'function') {
      try {
        this.socketInstance.unsubscribe([symbol]);
      } catch (err) {
        console.warn(`[TickAggregator] Socket unsubscribe error: ${err}`);
      }
    }
  }

  public onBarUpdate(callback: BarUpdateCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  public processTick(symbol: string, ltp: number, deltaVolume = 1, timestampMs = Date.now()): void {
    this.lastPrices.set(symbol, ltp);
    // Resolutions to aggregate
    const standardResolutions = ['1', '3', '5', '15', '60', 'D', 'W', 'M'];

    for (const res of standardResolutions) {
      const intervalMs = resolutionToSeconds(res) * 1000;
      const barTime = Math.floor(timestampMs / intervalMs) * intervalMs;
      const key = `${symbol}:${res}`;

      let bar = this.activeBars.get(key);
      if (!bar || bar.time !== barTime) {
        bar = {
          time: barTime,
          open: ltp,
          high: ltp,
          low: ltp,
          close: ltp,
          volume: Math.max(1, deltaVolume),
        };
      } else {
        bar.high = Math.max(bar.high, ltp);
        bar.low = Math.min(bar.low, ltp);
        bar.close = ltp;
        bar.volume += Math.max(0, deltaVolume);
      }

      this.activeBars.set(key, bar);

      // Notify listeners
      for (const cb of this.listeners) {
        cb({
          symbol,
          resolution: res,
          bar: { ...bar },
        });
      }
    }
  }

  public setInitialPrice(symbol: string, price: number): void {
    if (price > 0) {
      this.lastPrices.set(symbol, price);
      // Clean up any stale forming bar for this symbol that may have been generated with an uncalibrated price
      for (const key of this.activeBars.keys()) {
        if (key.startsWith(`${symbol}:`)) {
          this.activeBars.delete(key);
        }
      }
    }
  }

  public getCurrentBar(symbol: string, resolution: string): VelaBar | undefined {
    return this.activeBars.get(`${symbol}:${resolution}`);
  }

  public connectFyersSocket(): void {
    const token = fyersService.getToken();
    if (!token) {
      console.log('[TickAggregator] No FYERS token; using local tick aggregator.');
      return;
    }

    try {
      const sock =
        typeof fyersDataSocket.getInstance === 'function'
          ? fyersDataSocket.getInstance(token)
          : new fyersDataSocket(token);

      if (sock && typeof sock === 'object' && 'accessToken' in sock) {
        sock.accessToken = token;
      }
      this.socketInstance = sock;

      if (!this.socketListenersAttached) {
        this.socketListenersAttached = true;

        this.socketInstance.on('connect', () => {
          console.log('[TickAggregator] FYERS DataSocket connected successfully.');
          if (this.mockIntervalTimer) {
            clearInterval(this.mockIntervalTimer);
            this.mockIntervalTimer = null;
          }
          if (this.subscribedSymbols.size > 0) {
            this.socketInstance.subscribe(Array.from(this.subscribedSymbols));
          }
        });

        this.socketInstance.on('message', (msg: any) => {
          const tickData = msg?.SocketMessage || msg;
          if (!tickData) return;
          const tickList = Array.isArray(tickData) ? tickData : [tickData];
          for (const t of tickList) {
            if (t && t.symbol && typeof t.ltp === 'number') {
              this.processTick(t.symbol, t.ltp, t.vol_traded_today || t.volume || 1, Date.now());
            }
          }
        });

        this.socketInstance.on('error', (err: any) => {
          console.warn('[TickAggregator] FYERS DataSocket error:', err);
        });

        this.socketInstance.on('close', () => {
          console.log('[TickAggregator] FYERS DataSocket closed.');
        });
      }

      this.socketInstance.connect();
    } catch (err) {
      console.warn('[TickAggregator] Failed to initialize FYERS socket (token may be expired):', err);
      // Clean up failed socket reference so mock tick generator can continue fallback
      this.socketInstance = null;
      this.startMockTickGenerator();
    }
  }

  private startMockTickGenerator(): void {
    if (this.mockIntervalTimer) return;

    this.mockIntervalTimer = setInterval(() => {
      // If we don't have an active FYERS socket connected, generate ticks for subscribed symbols
      if (!this.socketInstance || !this.socketInstance.isConnected?.()) {
        if (this.subscribedSymbols.size === 0) return;

        for (const symbol of this.subscribedSymbols) {
          let prev = this.lastPrices.get(symbol);
          if (!prev || prev <= 0) {
            // Check if symbol master has a base price
            const known = symbolService.getAllSymbols().find((s) => s.symbol === symbol);
            if (known && known.basePrice > 0) {
              prev = known.basePrice;
              this.lastPrices.set(symbol, prev);
            } else {
              // Do NOT generate random ticks if the true baseline price is unknown yet!
              continue;
            }
          }

          const delta = (Math.random() - 0.49) * (prev * 0.0004);
          const newPrice = Math.round((prev + delta) * 100) / 100;
          const vol = Math.floor(Math.random() * 50) + 1;
          this.processTick(symbol, newPrice, vol);
        }
      }
    }, 1500);
  }

  public destroy(): void {
    if (this.mockIntervalTimer) {
      clearInterval(this.mockIntervalTimer);
      this.mockIntervalTimer = null;
    }
    if (this.socketInstance) {
      try {
        this.socketInstance.close();
      } catch {
        // Ignore
      }
      this.socketInstance = null;
    }
  }
}

export const tickAggregator = new TickAggregator();
