import { describe, it, expect } from 'vitest';
import { computePaneScale } from '../src/renderers/native/core/autoscale';
import type { OHLCV } from '../src/core/model/ohlcv';

describe('autoscale — drawing outlier guard', () => {
    const bars: OHLCV[] = [
        { time: 1000, open: 1050, high: 1100, low: 1000, close: 1083, volume: 100 },
        { time: 2000, open: 1083, high: 1120, low: 1040, close: 1090, volume: 100 },
    ];

    it('rejects extreme negative drawing coordinates from expanding the price scale', () => {
        // Runaway pivot calculation with S5 = -28,000,000
        const scale = computePaneScale([], bars, true, 0, 1, { min: -28_029_402, max: 1100 });
        expect(scale.min).toBeGreaterThan(0);
        expect(scale.min).toBeLessThan(1000);
        expect(scale.max).toBeGreaterThanOrEqual(1120);
    });

    it('rejects extreme multi-million drawing coordinates from squishing candlesticks', () => {
        // Runaway pivot calculation with R5 = 59,283,648 on a stock trading at ~1,083
        const scale = computePaneScale([], bars, true, 0, 1, { min: 1000, max: 59_283_648 });
        expect(scale.max).toBeLessThan(5000);
        expect(scale.min).toBeGreaterThan(0);
    });

    it('accepts legitimate drawing coordinates that lie reasonably near visible candles', () => {
        // Support line at 950 and resistance line at 1200
        const scale = computePaneScale([], bars, true, 0, 1, { min: 950, max: 1200 });
        expect(scale.min).toBeLessThanOrEqual(950);
        expect(scale.max).toBeGreaterThanOrEqual(1200);
    });
});
