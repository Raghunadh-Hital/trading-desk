import { resolutionToSeconds, type VelaBar } from './types.js';

interface SymbolSpec {
  basePrice: number;
  volatility: number;
  name: string;
}

const DEFAULT_SYMBOLS: Record<string, SymbolSpec> = {
  'NSE:NIFTY50-INDEX': { basePrice: 24200, volatility: 0.003, name: 'NIFTY 50' },
  'NSE:NIFTYBANK-INDEX': { basePrice: 51800, volatility: 0.005, name: 'NIFTY BANK' },
  'NSE:RELIANCE-EQ': { basePrice: 1260, volatility: 0.006, name: 'Reliance Industries Ltd' },
  'NSE:RVNL-EQ': { basePrice: 420, volatility: 0.009, name: 'Rail Vikas Nigam Ltd' },
  'NSE:IRFC-EQ': { basePrice: 150, volatility: 0.008, name: 'Indian Railway Finance Corp' },
  'NSE:TCS-EQ': { basePrice: 4150, volatility: 0.004, name: 'Tata Consultancy Services' },
  'NSE:INFY-EQ': { basePrice: 1850, volatility: 0.005, name: 'Infosys Ltd' },
  'NSE:SBIN-EQ': { basePrice: 820, volatility: 0.007, name: 'State Bank of India' },
  'NSE:HDFCBANK-EQ': { basePrice: 1740, volatility: 0.005, name: 'HDFC Bank Ltd' },
  'NSE:TATAMOTORS-EQ': { basePrice: 980, volatility: 0.008, name: 'Tata Motors Ltd' },
};

export function getKnownSymbols(): Array<{ symbol: string; name: string; basePrice: number }> {
  return Object.entries(DEFAULT_SYMBOLS).map(([symbol, spec]) => ({
    symbol,
    name: spec.name,
    basePrice: spec.basePrice,
  }));
}

export function generateMockCandles(
  symbol: string,
  resolution: string,
  rangeFromSec?: number,
  rangeToSec?: number
): VelaBar[] {
  const spec = DEFAULT_SYMBOLS[symbol] || {
    basePrice: 1000,
    volatility: 0.005,
    name: symbol,
  };

  const intervalSec = resolutionToSeconds(resolution);
  const nowSec = Math.floor(Date.now() / 1000);
  const toSec = rangeToSec && rangeToSec > 0 ? Math.min(rangeToSec, nowSec) : nowSec;
  const count = 300;
  const fromSec = rangeFromSec && rangeFromSec > 0 ? rangeFromSec : toSec - count * intervalSec;

  const bars: VelaBar[] = [];
  let currentPrice = spec.basePrice;

  // Stable pseudo-random generator based on symbol seed
  let seed = 0;
  for (let i = 0; i < symbol.length; i++) {
    seed = (seed * 31 + symbol.charCodeAt(i)) >>> 0;
  }
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Align start to interval
  const alignedStart = Math.floor(fromSec / intervalSec) * intervalSec;

  for (let ts = alignedStart; ts <= toSec; ts += intervalSec) {
    const changePercent = (nextRand() - 0.495) * spec.volatility * 2;
    const open = Math.round(currentPrice * 100) / 100;
    const close = Math.round((open * (1 + changePercent)) * 100) / 100;
    const maxVal = Math.max(open, close);
    const minVal = Math.min(open, close);
    const high = Math.round((maxVal + nextRand() * spec.volatility * open * 1.5) * 100) / 100;
    const low = Math.round((minVal - nextRand() * spec.volatility * open * 1.5) * 100) / 100;
    const volume = Math.round(10000 + nextRand() * 50000);

    bars.push({
      time: ts * 1000,
      open,
      high,
      low,
      close,
      volume,
    });

    currentPrice = close;
  }

  return bars;
}
