import type { OHLCV } from '../../../core/model/ohlcv';
import type { BarRange, SymbolInfo } from '../../../core/ports/MarketDataFeed';
import type {
    DataProvider,
    ProviderInfo,
    ProviderCapabilities,
    SymbolDescriptor,
} from '../../../core/ports/DataProvider';
import type { Unsubscribe } from '../../../core/util/types';

export interface FyersProviderConfig {
    /** Base URL of the local proxy backend (default: 'http://127.0.0.1:5000'). */
    proxyUrl?: string;
    /** WebSocket URL of the local tick aggregator (default: 'ws://127.0.0.1:5000/ws/ticks'). */
    wsUrl?: string;
}

const TF_NORMALIZE: Record<string, string> = {
    '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
    '1h': '60', '2h': '120', '4h': '240', '1d': 'D', '1D': 'D',
    '1w': 'W', '1W': 'W', '1M': 'M',
    '3M': 'M', '6M': 'M',
    '12M': 'M', '1Y': 'M', '1y': 'M',
    D: 'D', W: 'W', M: 'M',
};

const DEFAULT_INDIAN_SYMBOLS: SymbolDescriptor[] = [
    { ticker: 'NIFTY50-INDEX', prefix: 'NSE', description: 'NIFTY 50 Index', type: 'index' },
    { ticker: 'NIFTYBANK-INDEX', prefix: 'NSE', description: 'NIFTY Bank Index', type: 'index' },
    { ticker: 'FINNIFTY-INDEX', prefix: 'NSE', description: 'NIFTY Financial Services Index', type: 'index' },
    { ticker: 'MIDCPNIFTY-INDEX', prefix: 'NSE', description: 'NIFTY Midcap Select Index', type: 'index' },
    { ticker: 'RELIANCE-EQ', prefix: 'NSE', description: 'Reliance Industries Ltd', type: 'stock' },
    { ticker: 'RVNL-EQ', prefix: 'NSE', description: 'Rail Vikas Nigam Ltd', type: 'stock' },
    { ticker: 'IRFC-EQ', prefix: 'NSE', description: 'Indian Railway Finance Corp', type: 'stock' },
    { ticker: 'TCS-EQ', prefix: 'NSE', description: 'Tata Consultancy Services Ltd', type: 'stock' },
    { ticker: 'INFY-EQ', prefix: 'NSE', description: 'Infosys Ltd', type: 'stock' },
    { ticker: 'HDFCBANK-EQ', prefix: 'NSE', description: 'HDFC Bank Ltd', type: 'stock' },
    { ticker: 'ICICIBANK-EQ', prefix: 'NSE', description: 'ICICI Bank Ltd', type: 'stock' },
    { ticker: 'SBIN-EQ', prefix: 'NSE', description: 'State Bank of India', type: 'stock' },
    { ticker: 'BHARTIARTL-EQ', prefix: 'NSE', description: 'Bharti Airtel Ltd', type: 'stock' },
    { ticker: 'ITC-EQ', prefix: 'NSE', description: 'ITC Ltd', type: 'stock' },
    { ticker: 'TATAMOTORS-EQ', prefix: 'NSE', description: 'Tata Motors Ltd', type: 'stock' },
    { ticker: 'SENSEX-INDEX', prefix: 'BSE', description: 'S&P BSE SENSEX', type: 'index' },
    { ticker: 'BANKEX-INDEX', prefix: 'BSE', description: 'S&P BSE BANKEX', type: 'index' },
    { ticker: 'RELIANCE-A', prefix: 'BSE', description: 'Reliance Industries Ltd (BSE)', type: 'stock' },
    { ticker: 'TCS-A', prefix: 'BSE', description: 'Tata Consultancy Services Ltd (BSE)', type: 'stock' },
    { ticker: 'INFY-A', prefix: 'BSE', description: 'Infosys Ltd (BSE)', type: 'stock' },
    { ticker: 'RVNL-A', prefix: 'BSE', description: 'Rail Vikas Nigam Ltd (BSE)', type: 'stock' },
];

const knownSymbolMap = new Map<string, string>();

export function registerKnownFyersSymbols(symbols: Array<{ symbol?: string; ticker?: string; prefix?: string }>): void {
    for (const s of symbols) {
        const raw = s.symbol || (s.prefix && s.ticker ? `${s.prefix}:${s.ticker}` : s.ticker);
        if (!raw) continue;
        const full = raw.trim().toUpperCase();
        knownSymbolMap.set(full, full);

        const parts = full.split(':');
        const venue = parts.length > 1 ? parts[0]! : 'NSE';
        const ticker = parts.length > 1 ? parts[1]! : full;
        knownSymbolMap.set(ticker, full);

        const base = ticker.split('-')[0] || ticker;
        if (!knownSymbolMap.has(base)) {
            knownSymbolMap.set(base, full);
        }
        if (!knownSymbolMap.has(`${venue}:${base}`)) {
            knownSymbolMap.set(`${venue}:${base}`, full);
        }
    }
}

// Seed defaults
registerKnownFyersSymbols(DEFAULT_INDIAN_SYMBOLS);

export function normalizeTf(tf: string): string {
    return TF_NORMALIZE[tf] ?? TF_NORMALIZE[tf.toLowerCase()] ?? tf;
}

export function formatFyersSymbol(rawTicker: string): string {
    const t = rawTicker.trim().toUpperCase();
    if (knownSymbolMap.has(t)) {
        return knownSymbolMap.get(t)!;
    }
    if (t.startsWith('NSE:') || t.startsWith('BSE:') || t.startsWith('MCX:')) {
        if (t.includes('-')) return t;
        const mapped = knownSymbolMap.get(t);
        if (mapped) return mapped;
        return `${t}-EQ`;
    }
    if (t.includes('SENSEX') || t.includes('BANKEX')) {
        return `BSE:${t.includes('-') ? t : `${t}-INDEX`}`;
    }
    if (t.includes('NIFTY')) {
        return `NSE:${t.includes('-') ? t : `${t}-INDEX`}`;
    }
    if (/-(A|B|T|Z|XT|X|MT|M|MS|P|E)$/.test(t) && !t.endsWith('-EQ')) {
        return `BSE:${t}`;
    }
    if (/-(EQ|BE|SM|ST|BZ|SZ|E1|IV)$/.test(t)) {
        return `NSE:${t}`;
    }
    const mapped = knownSymbolMap.get(t) || knownSymbolMap.get(`NSE:${t}`);
    if (mapped) return mapped;
    return `NSE:${t}-EQ`;
}

export function dedupeSorted(bars: OHLCV[]): OHLCV[] {
    const byTime = new Map<number, OHLCV>();
    for (const b of bars) byTime.set(b.time, b);
    return [...byTime.values()].sort((a, b) => a.time - b.time);
}

interface CachedSeries {
    fetchedAt: number;
    fromSec: number;
    toSec: number;
    bars: OHLCV[];
}

export class FyersProvider implements DataProvider {
    private readonly proxyUrl: string;
    private readonly wsUrl: string;
    private readonly lastCloses = new Map<string, number>();
    private readonly barCache = new Map<string, CachedSeries>();
    private readonly inflightRequests = new Map<string, Promise<OHLCV[]>>();

    constructor(config?: FyersProviderConfig) {
        this.proxyUrl = config?.proxyUrl?.replace(/\/$/, '') ?? 'http://127.0.0.1:5000';
        this.wsUrl = config?.wsUrl ?? 'ws://127.0.0.1:5000/ws/ticks';
    }

    /**
     * Clears in-memory bar cache and inflight promises.
     * Useful when switching authentication state to force fresh API history fetches.
     */
    clearCache(): void {
        this.barCache.clear();
        this.lastCloses.clear();
        this.inflightRequests.clear();
    }

    info(): ProviderInfo {
        const capabilities: ProviderCapabilities = {
            enumerate: true,
            stream: true,
            symbolInfo: true,
        };
        return {
            name: 'fyers',
            displayName: 'FYERS (Indian Markets)',
            requiresApiKey: false,
            supportedTimeframes: ['1', '3', '5', '15', '30', '60', '120', '240', 'D', 'W', 'M'],
            capabilities,
        };
    }

    getLastClose(ticker: string): number | undefined {
        const symbol = formatFyersSymbol(ticker);
        return this.lastCloses.get(symbol);
    }

    async listSymbols(): Promise<SymbolDescriptor[]> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            const res = await fetch(`${this.proxyUrl}/api/symbols`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.symbols)) {
                    registerKnownFyersSymbols(data.symbols);
                    return data.symbols.map((s: { symbol: string; name: string }) => {
                        const parts = s.symbol.split(':');
                        const prefix = (parts.length > 1 ? parts[0] : 'NSE') ?? 'NSE';
                        const ticker = (parts.length > 1 ? parts[1] : parts[0]) ?? s.symbol;
                        return {
                            ticker,
                            prefix,
                            description: s.name,
                            type: ticker.includes('INDEX') ? 'index' : 'stock',
                        };
                    });
                }
            }
        } catch {
            // Fall back to default static list
        }
        return DEFAULT_INDIAN_SYMBOLS;
    }

    async getSymbolInfo(ticker: string): Promise<SymbolInfo> {
        return {
            ticker: formatFyersSymbol(ticker),
            timezone: 'Asia/Kolkata',
            session: '0915-1530',
            mintick: 0.05,
            timeframes: {
                finest: '1',
                default: '15',
                list: ['1', '3', '5', '15', '30', '60', '120', '240', 'D', 'W', 'M'],
            },
        };
    }

    async getBars(ticker: string, timeframe: string, range: BarRange): Promise<OHLCV[]> {
        const symbol = formatFyersSymbol(ticker);
        const resolution = normalizeTf(timeframe);

        const nowSec = Math.floor(Date.now() / 1000);
        // Align live upper bound to 60s buckets so indicator re-runs on 1s ticks don't bust the cache.
        const rangeTo = range.to ? Math.floor(range.to / 1000) : Math.ceil(nowSec / 60) * 60;

        let rangeFrom: number;
        if (range.from != null) {
            rangeFrom = Math.floor(Math.floor(range.from / 1000) / 60) * 60;
        } else {
            // Indian markets trade 6.25 hours/day (09:15 - 15:30 IST) on weekdays.
            const intervalSec = this.resolutionInSeconds(resolution);
            if (resolution === 'W') {
                // Weekly: request 5 full calendar years (~260 weekly candles)
                rangeFrom = rangeTo - 5 * 365 * 86400;
            } else if (resolution === 'M') {
                // Monthly: request 5 full calendar years (matches FYERS safe epoch lookback)
                rangeFrom = rangeTo - 5 * 365 * 86400;
            } else if (resolution === 'D') {
                // Daily: request 3 full calendar years (~750 daily trading sessions)
                rangeFrom = rangeTo - 3 * 365 * 86400;
            } else if (intervalSec >= 3600) {
                // 1h - 4h: request 1 full calendar year (~1,500 hourly candles)
                rangeFrom = rangeTo - 365 * 86400;
            } else {
                // Intraday (1m - 30m): request 180 calendar days (~2,800 candles)
                rangeFrom = rangeTo - 180 * 86400;
            }
        }

        const seriesKey = `${symbol}:${resolution}`;
        const existing = this.barCache.get(seriesKey);
        if (
            existing &&
            Date.now() - existing.fetchedAt < 60_000 &&
            existing.fromSec <= rangeFrom &&
            existing.toSec >= rangeTo - 60
        ) {
            return existing.bars.filter((b) => b.time >= rangeFrom * 1000 && b.time <= rangeTo * 1000);
        }

        const flightKey = `${seriesKey}:${rangeFrom}:${rangeTo}`;
        const inflight = this.inflightRequests.get(flightKey);
        if (inflight) {
            return inflight;
        }

        const requestPromise = (async (): Promise<OHLCV[]> => {
            const url = `${this.proxyUrl}/api/history?symbol=${encodeURIComponent(symbol)}&resolution=${encodeURIComponent(resolution)}&range_from=${rangeFrom}&range_to=${rangeTo}`;

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 6000);
                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const data = await res.json();
                    if (data && Array.isArray(data.candles) && data.candles.length > 0) {
                        const bars: OHLCV[] = data.candles.map((c: any) => ({
                            time: Number(c.time),
                            open: Number(c.open),
                            high: Number(c.high),
                            low: Number(c.low),
                            close: Number(c.close),
                            volume: Number(c.volume ?? 0),
                        }));
                        const sorted = dedupeSorted(bars);
                        if (sorted.length > 0) {
                            const last = sorted[sorted.length - 1];
                            if (last) this.lastCloses.set(symbol, last.close);
                            const prev = this.barCache.get(seriesKey);
                            const merged = prev ? dedupeSorted([...prev.bars, ...sorted]) : sorted;
                            this.barCache.set(seriesKey, {
                                fetchedAt: Date.now(),
                                fromSec: prev ? Math.min(prev.fromSec, rangeFrom) : rangeFrom,
                                toSec: prev ? Math.max(prev.toSec, rangeTo) : rangeTo,
                                bars: merged,
                            });
                            return sorted;
                        }
                    }
                }
            } catch (err) {
                console.warn(`[FyersProvider] Fetch failed: ${err}. Using fallback synthesis.`);
            }

            // Fallback synthetic candles if server proxy is unavailable or returned 0 candles
            const fallback = this.synthesizeBars(symbol, resolution, rangeFrom, rangeTo);
            if (fallback.length > 0) {
                const last = fallback[fallback.length - 1];
                if (last) this.lastCloses.set(symbol, last.close);
            }
            return fallback;
        })().finally(() => {
            this.inflightRequests.delete(flightKey);
        });

        this.inflightRequests.set(flightKey, requestPromise);
        return requestPromise;
    }

    subscribe(ticker: string, timeframe: string, onBar: (bar: OHLCV) => void): Unsubscribe {
        const symbol = formatFyersSymbol(ticker);
        const resolution = normalizeTf(timeframe);
        let ws: WebSocket | null = null;
        let closed = false;
        let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
        let lastEmittedMs = 0;
        let pendingBar: OHLCV | null = null;
        let throttleTimer: ReturnType<typeof setTimeout> | null = null;

        const THROTTLE_MS = 60; // 60ms (~16 FPS) matches TradingView responsive candle glide without starving render loop
        const emitThrottled = (bar: OHLCV) => {
            const now = Date.now();
            if (now - lastEmittedMs >= THROTTLE_MS) {
                lastEmittedMs = now;
                onBar(bar);
            } else {
                pendingBar = bar;
                if (!throttleTimer) {
                    throttleTimer = setTimeout(() => {
                        throttleTimer = null;
                        if (pendingBar && !closed) {
                            lastEmittedMs = Date.now();
                            onBar(pendingBar);
                            pendingBar = null;
                        }
                    }, THROTTLE_MS - (now - lastEmittedMs));
                }
            }
        };

        const connect = () => {
            if (closed) return;
            try {
                if (typeof WebSocket === 'undefined') return;
                ws = new WebSocket(this.wsUrl);

                ws.onopen = () => {
                    if (closed) {
                        ws?.close();
                        return;
                    }
                    ws?.send(
                        JSON.stringify({
                            type: 'subscribe',
                            symbol,
                            resolution,
                        })
                    );
                };

                ws.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);
                        if (msg.type === 'bar' && msg.symbol === symbol && msg.resolution === resolution && msg.bar) {
                            const close = Number(msg.bar.close);
                            const lastClose = this.lastCloses.get(symbol);
                            // Sanity filter: prevent cross-symbol tick pollution (e.g. 1260 Reliance tick hitting a 75 Rs stock)
                            if (lastClose && lastClose > 0) {
                                const ratio = close / lastClose;
                                if (ratio < 0.3 || ratio > 3.0) {
                                    return;
                                }
                            }
                            this.lastCloses.set(symbol, close);
                            emitThrottled({
                                time: Number(msg.bar.time),
                                open: Number(msg.bar.open),
                                high: Number(msg.bar.high),
                                low: Number(msg.bar.low),
                                close,
                                volume: Number(msg.bar.volume ?? 0),
                            });
                        }
                    } catch {
                        // Ignore parse error
                    }
                };

                ws.onclose = () => {
                    if (!closed) {
                        reconnectTimeout = setTimeout(connect, 3000);
                    }
                };

                ws.onerror = () => {
                    ws?.close();
                };
            } catch {
                if (!closed) {
                    reconnectTimeout = setTimeout(connect, 3000);
                }
            }
        };

        connect();

        return () => {
            closed = true;
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            if (throttleTimer) clearTimeout(throttleTimer);
            if (ws && ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(JSON.stringify({ type: 'unsubscribe', symbol }));
                    ws.close();
                } catch {
                    // Ignore
                }
            }
        };
    }

    private resolutionInSeconds(res: string): number {
        switch (res.toUpperCase()) {
            case '1': return 60;
            case '3': return 180;
            case '5': return 300;
            case '15': return 900;
            case '30': return 1800;
            case '60': return 3600;
            case '120': return 7200;
            case '240': return 14400;
            case 'D': return 86400;
            case 'W': return 604800;
            case 'M': return 2592000;
            default: return 900;
        }
    }

    private synthesizeBars(symbol: string, resolution: string, fromSec: number, toSec: number): OHLCV[] {
        const intervalSec = this.resolutionInSeconds(resolution);
        const alignedStart = Math.floor(fromSec / intervalSec) * intervalSec;
        const bars: OHLCV[] = [];
        let price = symbol.includes('NIFTY50') ? 24200 : symbol.includes('BANK') ? 51800 : 1260;

        for (let ts = alignedStart; ts <= toSec; ts += intervalSec) {
            const delta = (Math.random() - 0.495) * (price * 0.005);
            const open = Math.round(price * 100) / 100;
            const close = Math.round((open + delta) * 100) / 100;
            const high = Math.round((Math.max(open, close) + Math.random() * 5) * 100) / 100;
            const low = Math.round((Math.min(open, close) - Math.random() * 5) * 100) / 100;
            const volume = Math.floor(Math.random() * 20000) + 1000;

            bars.push({ time: ts * 1000, open, high, low, close, volume });
            price = close;
        }
        return bars;
    }
}
