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
  private lastPrices = new Map<string, number>();
  private lastFyersTickBySymbol = new Map<string, number>();
  private lastVolTradedToday = new Map<string, number>();

  constructor() {
    // Only real FYERS WebSocket ticks are processed. No fake or randomized simulation.
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
    // Resolutions to aggregate (matches all supported Vela and FYERS intraday & daily resolutions)
    const standardResolutions = ['1', '2', '3', '5', '10', '15', '30', '60', '120', '240', 'D', 'W', 'M'];

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
    }
  }

  public setInitialBar(symbol: string, resolution: string, bar: VelaBar): void {
    if (bar && bar.close > 0) {
      this.lastPrices.set(symbol, bar.close);
      const key = `${symbol}:${resolution}`;
      const existing = this.activeBars.get(key);
      if (!existing || existing.time <= bar.time) {
        this.activeBars.set(key, { ...bar });
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
          if (this.subscribedSymbols.size > 0) {
            this.socketInstance.subscribe(Array.from(this.subscribedSymbols));
          }
        });

        this.socketInstance.on('message', (msg: any) => {
          const tickData = msg?.SocketMessage || msg;
          if (!tickData) return;
          const tickList = Array.isArray(tickData) ? tickData : [tickData];
          for (const t of tickList) {
            if (t && t.symbol) {
              const price =
                typeof t.ltp === 'number' && t.ltp > 0
                  ? t.ltp
                  : typeof t.bid_price === 'number' && t.bid_price > 0
                    ? t.bid_price
                    : typeof t.bp === 'number' && t.bp > 0
                      ? t.bp
                      : null;
              if (price !== null) {
                this.lastFyersTickBySymbol.set(t.symbol, Date.now());
                const prevVol = this.lastVolTradedToday.get(t.symbol);
                let deltaVol = 1;
                if (typeof t.vol_traded_today === 'number' && t.vol_traded_today > 0) {
                  if (prevVol !== undefined && t.vol_traded_today >= prevVol) {
                    deltaVol = t.vol_traded_today - prevVol;
                  } else {
                    deltaVol = t.last_traded_qty || 1;
                  }
                  this.lastVolTradedToday.set(t.symbol, t.vol_traded_today);
                } else if (typeof t.last_traded_qty === 'number') {
                  deltaVol = t.last_traded_qty;
                }
                this.processTick(t.symbol, price, deltaVol, Date.now());
              }
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
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.warn('[TickAggregator] Failed to initialize FYERS socket:', msg);
      if (/expired token|failed to decode jwt/i.test(msg)) {
        fyersService.logout();
      }
      this.socketInstance = null;
    }
  }

  public destroy(): void {
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
