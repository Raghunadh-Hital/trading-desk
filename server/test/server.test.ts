import { describe, it, expect, beforeEach } from 'vitest';
import {
  transformFyersCandlesToVelaBars,
  resolutionToSeconds,
  type FyersRawCandle,
} from '../src/types.js';
import { TickAggregator } from '../src/tick-aggregator.js';
import { historyCache } from '../src/cache.js';
import { createServerApp } from '../src/index.js';

describe('Vela FYERS Server Proxy', () => {
  beforeEach(() => {
    historyCache.flushAll();
  });

  describe('Data Mapping & Resolution', () => {
    it('maps FYERS raw candle tuples to VelaBar objects with millisecond timestamps', () => {
      const rawCandles: FyersRawCandle[] = [
        [1700000000, 24000.5, 24100.0, 23950.0, 24050.25, 12500],
        [1700000900, 24050.25, 24200.0, 24020.0, 24180.0, 18200],
      ];

      const velaBars = transformFyersCandlesToVelaBars(rawCandles);

      expect(velaBars).toHaveLength(2);
      expect(velaBars[0]).toEqual({
        time: 1700000000 * 1000,
        open: 24000.5,
        high: 24100.0,
        low: 23950.0,
        close: 24050.25,
        volume: 12500,
      });
      expect(velaBars[1].time).toBe(1700000900 * 1000);
      expect(velaBars[1].close).toBe(24180.0);
    });

    it('correctly parses resolutions into seconds', () => {
      expect(resolutionToSeconds('1')).toBe(60);
      expect(resolutionToSeconds('3')).toBe(180);
      expect(resolutionToSeconds('5')).toBe(300);
      expect(resolutionToSeconds('15')).toBe(900);
      expect(resolutionToSeconds('60')).toBe(3600);
      expect(resolutionToSeconds('D')).toBe(86400);
      expect(resolutionToSeconds('1D')).toBe(86400);
    });
  });

  describe('Tick Aggregator', () => {
    it('aggregates live ticks into a forming bar', () => {
      const aggregator = new TickAggregator();
      const symbol = 'NSE:RELIANCE-EQ';
      const baseTime = 1700000000000; // Aligned ms

      // Tick 1
      aggregator.processTick(symbol, 2500.0, 10, baseTime);
      let bar = aggregator.getCurrentBar(symbol, '15');
      expect(bar).toBeDefined();
      expect(bar?.open).toBe(2500.0);
      expect(bar?.high).toBe(2500.0);
      expect(bar?.low).toBe(2500.0);
      expect(bar?.close).toBe(2500.0);
      expect(bar?.volume).toBe(10);

      // Tick 2: Higher price
      aggregator.processTick(symbol, 2520.0, 5, baseTime + 1000);
      bar = aggregator.getCurrentBar(symbol, '15');
      expect(bar?.high).toBe(2520.0);
      expect(bar?.close).toBe(2520.0);
      expect(bar?.low).toBe(2500.0);
      expect(bar?.volume).toBe(15);

      // Tick 3: Lower price
      aggregator.processTick(symbol, 2480.0, 8, baseTime + 2000);
      bar = aggregator.getCurrentBar(symbol, '15');
      expect(bar?.high).toBe(2520.0);
      expect(bar?.low).toBe(2480.0);
      expect(bar?.close).toBe(2480.0);
      expect(bar?.volume).toBe(23);

      aggregator.destroy();
    });

    it('rolls over to a new bar when timestamp crosses the interval threshold', () => {
      const aggregator = new TickAggregator();
      const symbol = 'NSE:NIFTY50-INDEX';
      const intervalMs = 900 * 1000; // 15m
      const t1 = 1700000000000;
      const t2 = t1 + intervalMs + 1000; // next bucket

      aggregator.processTick(symbol, 24000, 100, t1);
      const bar1 = aggregator.getCurrentBar(symbol, '15');
      expect(bar1?.close).toBe(24000);

      aggregator.processTick(symbol, 24050, 50, t2);
      const bar2 = aggregator.getCurrentBar(symbol, '15');
      expect(bar2?.open).toBe(24050);
      expect(bar2?.close).toBe(24050);
      expect(bar2?.volume).toBe(50);
      expect(bar2?.time).toBeGreaterThan(bar1!.time);

      aggregator.destroy();
    });
  });

  describe('Express Endpoints', () => {
    it('returns health status', async () => {
      const app = createServerApp();
      const res = await (app as any).handle(
        { method: 'GET', url: '/api/health', headers: {} },
        {
          statusCode: 200,
          setHeader: () => {},
          json: (data: any) => {
            expect(data.status).toBe('ok');
            expect(data.service).toBe('vela-fyers-proxy');
          },
        }
      );
    });

    it('returns symbol suggestions for Indian markets', async () => {
      const app = createServerApp();
      await (app as any).handle(
        { method: 'GET', url: '/api/symbols', headers: {} },
        {
          statusCode: 200,
          setHeader: () => {},
          json: (data: any) => {
            expect(Array.isArray(data.symbols)).toBe(true);
            const nifty = data.symbols.find((s: any) => s.symbol === 'NSE:NIFTY50-INDEX');
            expect(nifty).toBeDefined();
            const rvnl = data.symbols.find((s: any) => s.symbol === 'NSE:RVNL-EQ');
            expect(rvnl).toBeDefined();
          },
        }
      );
    });
  });
});
