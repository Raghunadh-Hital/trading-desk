import { describe, it, expect } from 'vitest';
import { ProviderRegistry } from '../src/data/ProviderRegistry';
import { MultiProviderFeed } from '../src/data/MultiProviderFeed';
import { BarStore } from '../src/data/BarStore';
import type { DataProvider, OHLCV } from '../src';

function makeFyersMockProvider(knownTickers: string[]): DataProvider {
    return {
        async listSymbols() {
            return knownTickers.map((ticker) => ({
                ticker,
                prefix: 'NSE',
                description: `${ticker} Description`,
                type: 'stock',
            }));
        },
        async getBars(ticker: string): Promise<OHLCV[]> {
            const now = Date.now();
            return [
                { time: now - 3600000, open: 100, high: 105, low: 99, close: 104, volume: 1000 },
                { time: now - 1800000, open: 104, high: 108, low: 103, close: 107, volume: 1200 },
                { time: now, open: 107, high: 110, low: 106, close: 109, volume: 1500 },
            ];
        },
    };
}

describe('FYERS symbol resolution and non-blocking market load', () => {
    it('resolves NSE and BSE exchange prefixes to fyers even if not in eager index', async () => {
        const feed = new MultiProviderFeed(new BarStore());
        await feed.registerProvider('fyers', makeFyersMockProvider(['RELIANCE-EQ', 'NIFTY50-INDEX']));

        // SJVN-EQ is not in knownTickers, but has NSE: prefix
        const resolved = feed.resolveSymbol('NSE:SJVN-EQ');
        expect(resolved).toEqual({ provider: 'fyers', ticker: 'SJVN-EQ' });

        const resolvedBse = feed.resolveSymbol('BSE:SJVN-A');
        expect(resolvedBse).toEqual({ provider: 'fyers', ticker: 'SJVN-A' });
    });

    it('resolves bare ticker to default fyers provider without hanging', async () => {
        const feed = new MultiProviderFeed(new BarStore());
        await feed.registerProvider('fyers', makeFyersMockProvider(['RELIANCE-EQ']));

        // Bare ticker not in eager index
        const resolved = feed.resolveSymbol('SJVN-EQ');
        expect(resolved).toEqual({ provider: 'fyers', ticker: 'SJVN-EQ' });

        const bars = await feed.load({ symbol: 'SJVN-EQ', timeframe: '15', bars: 10 });
        expect(bars.length).toBeGreaterThan(0);
    });

    it('whenResolvable resolves promptly for Indian stock switches', async () => {
        const registry = new ProviderRegistry();
        await registry.register('fyers', makeFyersMockProvider(['RELIANCE-EQ']));

        const resolved = await registry.whenResolvable('NSE:SJVN-EQ', { default: 'fyers' });
        expect(resolved).toEqual({ provider: 'fyers', ticker: 'SJVN-EQ' });
    });
});
