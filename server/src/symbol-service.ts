import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SymbolItem {
  symbol: string;
  name: string;
  basePrice: number;
}

const PRIMARY_INDICES: SymbolItem[] = [
  { symbol: 'NSE:NIFTY50-INDEX', name: 'NIFTY 50 Index', basePrice: 24200 },
  { symbol: 'NSE:NIFTYBANK-INDEX', name: 'NIFTY Bank Index', basePrice: 51800 },
  { symbol: 'NSE:FINNIFTY-INDEX', name: 'NIFTY Financial Services Index', basePrice: 23500 },
  { symbol: 'NSE:MIDCPNIFTY-INDEX', name: 'NIFTY Midcap Select Index', basePrice: 13100 },
  { symbol: 'NSE:NIFTYNEXT50-INDEX', name: 'NIFTY Next 50 Index', basePrice: 71000 },
  { symbol: 'NSE:NIFTYIT-INDEX', name: 'NIFTY IT Index', basePrice: 42000 },
  { symbol: 'NSE:NIFTYAUTO-INDEX', name: 'NIFTY Auto Index', basePrice: 24000 },
  { symbol: 'NSE:NIFTYPHARMA-INDEX', name: 'NIFTY Pharma Index', basePrice: 22000 },
  { symbol: 'NSE:NIFTYFMCG-INDEX', name: 'NIFTY FMCG Index', basePrice: 59000 },
  { symbol: 'NSE:NIFTYMETAL-INDEX', name: 'NIFTY Metal Index', basePrice: 9100 },
  { symbol: 'NSE:INDIAVIX-INDEX', name: 'India VIX', basePrice: 15 },
  { symbol: 'BSE:SENSEX-INDEX', name: 'S&P BSE SENSEX', basePrice: 79500 },
  { symbol: 'BSE:BANKEX-INDEX', name: 'BSE Bankex', basePrice: 58000 },
];

const DEFAULT_POPULAR_EQUITIES: SymbolItem[] = [
  { symbol: 'NSE:RELIANCE-EQ', name: 'Reliance Industries Ltd', basePrice: 1260 },
  { symbol: 'NSE:RVNL-EQ', name: 'Rail Vikas Nigam Ltd', basePrice: 420 },
  { symbol: 'NSE:IRFC-EQ', name: 'Indian Railway Finance Corp', basePrice: 150 },
  { symbol: 'NSE:TCS-EQ', name: 'Tata Consultancy Services Ltd', basePrice: 4150 },
  { symbol: 'NSE:INFY-EQ', name: 'Infosys Ltd', basePrice: 1850 },
  { symbol: 'NSE:SBIN-EQ', name: 'State Bank of India', basePrice: 820 },
  { symbol: 'NSE:HDFCBANK-EQ', name: 'HDFC Bank Ltd', basePrice: 1740 },
  { symbol: 'NSE:ICICIBANK-EQ', name: 'ICICI Bank Ltd', basePrice: 1280 },
  { symbol: 'NSE:BHARTIARTL-EQ', name: 'Bharti Airtel Ltd', basePrice: 1600 },
  { symbol: 'NSE:ITC-EQ', name: 'ITC Ltd', basePrice: 470 },
  { symbol: 'NSE:TATAMOTORS-EQ', name: 'Tata Motors Ltd', basePrice: 980 },
  { symbol: 'NSE:TATASTEEL-EQ', name: 'Tata Steel Ltd', basePrice: 150 },
  { symbol: 'NSE:ZOMATO-EQ', name: 'Zomato Ltd', basePrice: 270 },
  { symbol: 'NSE:LT-EQ', name: 'Larsen & Toubro Ltd', basePrice: 3500 },
  { symbol: 'NSE:KOTAKBANK-EQ', name: 'Kotak Mahindra Bank Ltd', basePrice: 1750 },
  { symbol: 'NSE:AXISBANK-EQ', name: 'Axis Bank Ltd', basePrice: 1150 },
];

const VALID_NSE_SERIES = new Set(['EQ', 'BE', 'SM', 'ST', 'BZ', 'SZ', 'E1', 'IV', 'INDEX']);
const VALID_BSE_SERIES = new Set(['A', 'B', 'T', 'X', 'XT', 'M', 'MT', 'MS', 'P', 'Z', 'ZP', 'E', 'INDEX']);

class SymbolService {
  private symbols: SymbolItem[] = [...PRIMARY_INDICES, ...DEFAULT_POPULAR_EQUITIES];
  private cacheFilePath: string;
  private bundledCacheFilePath: string;
  private isUpdating = false;

  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const dataDir = process.env.VELA_DATA_DIR || path.resolve(__dirname, '..');
    this.cacheFilePath = path.resolve(dataDir, '.symbols-cache.json');
    this.bundledCacheFilePath = path.resolve(__dirname, '..', '.symbols-cache.json');
    this.init();
  }

  private init(): void {
    // 1. Try to load from disk cache first for instant startup
    this.loadFromDiskCache();

    // 2. Fetch fresh master from FYERS in background
    void this.fetchFyersMaster();
  }

  private loadFromDiskCache(): void {
    try {
      const targetPath = fs.existsSync(this.cacheFilePath)
        ? this.cacheFilePath
        : fs.existsSync(this.bundledCacheFilePath)
          ? this.bundledCacheFilePath
          : null;

      if (targetPath) {
        const raw = fs.readFileSync(targetPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.symbols = parsed;
        }
      }
    } catch {
      // Ignore cache read errors, fallback remains intact
    }
  }

  private saveToDiskCache(): void {
    try {
      const dir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(this.symbols), 'utf-8');
    } catch {
      // Ignore cache write errors
    }
  }

  public async fetchFyersMaster(): Promise<void> {
    if (this.isUpdating) return;
    this.isUpdating = true;

    try {
      const [nseRes, bseRes] = await Promise.all([
        fetch('https://public.fyers.in/sym_details/NSE_CM.csv', {
          signal: AbortSignal.timeout(15000),
        }).catch(() => null),
        fetch('https://public.fyers.in/sym_details/BSE_CM.csv', {
          signal: AbortSignal.timeout(15000),
        }).catch(() => null),
      ]);

      const equityMap = new Map<string, SymbolItem>();

      if (nseRes && nseRes.ok) {
        const text = await nseRes.text();
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]?.trim();
          if (!line) continue;
          const cols = line.split(',');
          const fyersSym = cols[9];
          const name = cols[1];
          if (fyersSym && fyersSym.startsWith('NSE:') && name) {
            const lastDash = fyersSym.lastIndexOf('-');
            const sfx = lastDash > -1 ? fyersSym.slice(lastDash + 1) : '';
            if (VALID_NSE_SERIES.has(sfx)) {
              equityMap.set(fyersSym, {
                symbol: fyersSym,
                name: name.replace(/\s+/g, ' ').trim(),
                basePrice: 100,
              });
            }
          }
        }
      }

      if (bseRes && bseRes.ok) {
        const text = await bseRes.text();
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]?.trim();
          if (!line) continue;
          const cols = line.split(',');
          const fyersSym = cols[9];
          const name = cols[1];
          if (fyersSym && fyersSym.startsWith('BSE:') && name) {
            const lastDash = fyersSym.lastIndexOf('-');
            const sfx = lastDash > -1 ? fyersSym.slice(lastDash + 1) : '';
            if (VALID_BSE_SERIES.has(sfx)) {
              equityMap.set(fyersSym, {
                symbol: fyersSym,
                name: name.replace(/\s+/g, ' ').trim(),
                basePrice: 100,
              });
            }
          }
        }
      }

      if (equityMap.size > 0) {
        // Merge primary indices + all discovered NSE and BSE equities
        const list = [...PRIMARY_INDICES];
        for (const item of equityMap.values()) {
          list.push(item);
        }
        this.symbols = list;
        this.saveToDiskCache();
      }
    } catch {
      // Keep existing cached/default symbols on network error
    } finally {
      this.isUpdating = false;
    }
  }

  public getAllSymbols(): SymbolItem[] {
    return this.symbols;
  }

  public search(query: string, limit = 50): SymbolItem[] {
    const q = query.trim().toUpperCase();
    if (!q) return this.symbols.slice(0, limit);

    const exact: SymbolItem[] = [];
    const prefix: SymbolItem[] = [];
    const substr: SymbolItem[] = [];
    const nameMatches: SymbolItem[] = [];

    for (const item of this.symbols) {
      const symUpper = item.symbol.toUpperCase();
      const rawTicker = symUpper.split(':')[1] || symUpper;
      const baseTicker = rawTicker.split('-')[0] || rawTicker;
      const nameUpper = item.name.toUpperCase();

      if (rawTicker === q || baseTicker === q || symUpper === q) {
        exact.push(item);
      } else if (rawTicker.startsWith(q) || baseTicker.startsWith(q)) {
        prefix.push(item);
      } else if (rawTicker.includes(q)) {
        substr.push(item);
      } else if (nameUpper.startsWith(q) || nameUpper.includes(q)) {
        nameMatches.push(item);
      }
    }

    return [...exact, ...prefix, ...substr, ...nameMatches].slice(0, limit);
  }
}

export const symbolService = new SymbolService();
