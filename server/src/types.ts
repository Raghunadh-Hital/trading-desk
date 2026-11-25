export interface VelaBar {
  time: number; // Timestamp in milliseconds (epoch_sec * 1000)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// FYERS raw candle: [ epoch_seconds, open, high, low, close, volume ]
export type FyersRawCandle = [number, number, number, number, number, number];

export interface FyersHistoryResponse {
  s: 'ok' | 'no_data' | 'error';
  candles?: FyersRawCandle[];
  message?: string;
  code?: number;
}

export interface FyersTick {
  symbol: string;
  ltp: number; // Last traded price
  prev_close_price?: number;
  high_price?: number;
  low_price?: number;
  open_price?: number;
  vol_traded_today?: number;
  last_traded_time?: number; // epoch seconds or ms
  timestamp?: number;
  volume?: number;
}

export function transformFyersCandlesToVelaBars(candles: FyersRawCandle[]): VelaBar[] {
  return candles.map((c) => ({
    time: c[0] * 1000,
    open: c[1],
    high: c[2],
    low: c[3],
    close: c[4],
    volume: c[5],
  }));
}

export function resolutionToSeconds(resolution: string): number {
  switch (resolution.toUpperCase()) {
    case '1':
      return 60;
    case '2':
      return 120;
    case '3':
      return 180;
    case '5':
      return 300;
    case '10':
      return 600;
    case '15':
      return 900;
    case '30':
      return 1800;
    case '60':
    case '1H':
      return 3600;
    case '120':
    case '2H':
      return 7200;
    case '240':
    case '4H':
      return 14400;
    case 'D':
    case '1D':
      return 86400;
    case 'W':
    case '1W':
      return 7 * 86400;
    case 'M':
    case '1M':
      return 30 * 86400;
    default: {
      const num = parseInt(resolution, 10);
      return isNaN(num) || num <= 0 ? 900 : num * 60;
    }
  }
}
