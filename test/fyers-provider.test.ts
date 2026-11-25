import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    FyersProvider,
    normalizeTf,
    formatFyersSymbol,
    dedupeSorted,
} from '../src/data/providers/fyers/FyersProvider';
import type { OHLCV } from '../src/core/model/ohlcv';

describe('FyersProvider', () => {
    describe('pure helpers', () => {
        it('normalizeTf maps user timeframe strings to canonical keys', () => {
            expect(normalizeTf('1m')).toBe('1');
            expect(normalizeTf('5m')).toBe('5');
            expect(normalizeTf('15m')).toBe('15');
            expect(normalizeTf('1h')).toBe('60');
            expect(normalizeTf('2h')).toBe('120');
            expect(normalizeTf('4h')).toBe('240');
            expect(normalizeTf('1d')).toBe('D');
            expect(normalizeTf('1D')).toBe('D');
            expect(normalizeTf('15')).toBe('15');
        });

        it('formatFyersSymbol formats Indian market symbols with venue prefixes', () => {
            expect(formatFyersSymbol('RELIANCE-EQ')).toBe('NSE:RELIANCE-EQ');
            expect(formatFyersSymbol('NSE:RELIANCE-EQ')).toBe('NSE:RELIANCE-EQ');
            expect(formatFyersSymbol('NIFTY50-INDEX')).toBe('NSE:NIFTY50-INDEX');
            expect(formatFyersSymbol('SENSEX-INDEX')).toBe('BSE:SENSEX-INDEX');
            expect(formatFyersSymbol('BANKEX-INDEX')).toBe('BSE:BANKEX-INDEX');
            expect(formatFyersSymbol('RELIANCE-A')).toBe('BSE:RELIANCE-A');
            expect(formatFyersSymbol('BSE:SENSEX-INDEX')).toBe('BSE:SENSEX-INDEX');
            expect(formatFyersSymbol('BSE:TCS-A')).toBe('BSE:TCS-A');
        });

        it('dedupeSorted sorts by open-time and drops duplicates', () => {
            const b1: OHLCV = { time: 2000, open: 100, high: 105, low: 95, close: 102, volume: 10 };
            const b2: OHLCV = { time: 1000, open: 90, high: 95, low: 85, close: 92, volume: 20 };
            const b3: OHLCV = { time: 1000, open: 91, high: 96, low: 86, close: 93, volume: 25 }; // overrides b2
            const result = dedupeSorted([b1, b2, b3]);

            expect(result).toHaveLength(2);
            expect(result[0]?.time).toBe(1000);
            expect(result[0]?.open).toBe(91);
            expect(result[1]?.time).toBe(2000);
        });
    });

    describe('provider contract and metadata', () => {
        const provider = new FyersProvider({ proxyUrl: 'http://invalid-host:9999' });

        it('reports correct provider capabilities and metadata', () => {
            const info = provider.info();
            expect(info.name).toBe('fyers');
            expect(info.displayName).toContain('FYERS');
            expect(info.capabilities.enumerate).toBe(true);
            expect(info.capabilities.stream).toBe(true);
            expect(info.capabilities.symbolInfo).toBe(true);
            expect(info.supportedTimeframes).toContain('15');
            expect(info.supportedTimeframes).toContain('D');
        });

        it('returns Indian market hours and timezone in getSymbolInfo', async () => {
            const symInfo = await provider.getSymbolInfo('NSE:NIFTY50-INDEX');
            expect(symInfo.timezone).toBe('Asia/Kolkata');
            expect(symInfo.session).toBe('0915-1530');
            expect(symInfo.timeframes?.default).toBe('15');
        });

        it('lists major Indian indices and equities in listSymbols', async () => {
            const symbols = await provider.listSymbols();
            expect(symbols.length).toBeGreaterThan(0);
            const nifty = symbols.find((s) => s.ticker === 'NIFTY50-INDEX');
            expect(nifty).toBeDefined();
            expect(nifty?.prefix).toBe('NSE');
            const rvnl = symbols.find((s) => s.ticker === 'RVNL-EQ');
            expect(rvnl).toBeDefined();
            expect(rvnl?.prefix).toBe('NSE');
        });
    });

    describe('getBars and subscribe', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('fetches and converts bars from proxy endpoint when available', async () => {
            const provider = new FyersProvider({ proxyUrl: 'http://127.0.0.1:5000' });
            const mockCandles = [
                { time: 1700000000000, open: 24000, high: 24100, low: 23900, close: 24050, volume: 1000 },
                { time: 1700000900000, open: 24050, high: 24200, low: 24000, close: 24150, volume: 1500 },
            ];

            vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                ok: true,
                json: async () => ({ s: 'ok', candles: mockCandles }),
            } as any);

            const bars = await provider.getBars('NSE:NIFTY50-INDEX', '15', { limit: 10 });
            expect(bars).toHaveLength(2);
            expect(bars[0]?.time).toBe(1700000000000);
            expect(bars[0]?.close).toBe(24050);
        });

        it('synthesizes realistic fallback candles when proxy is offline', async () => {
            const provider = new FyersProvider({ proxyUrl: 'http://invalid-host:9999' });
            vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection refused'));

            const bars = await provider.getBars('NSE:NIFTY50-INDEX', '15', { limit: 20 });
            expect(bars.length).toBeGreaterThan(0);
            expect(bars[0]).toBeDefined();
            expect(bars[0]!.open).toBeGreaterThan(0);
            expect(bars[0]!.high).toBeGreaterThanOrEqual(bars[0]!.low);
        });
    });
});
