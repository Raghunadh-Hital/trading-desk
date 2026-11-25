import fyersModule from 'fyers-api-v3';
import { config } from './config.js';
import { getStoredToken, saveStoredToken, clearStoredToken } from './token-store.js';
import { historyCache } from './cache.js';
import {
  transformFyersCandlesToVelaBars,
  type VelaBar,
  type FyersHistoryResponse,
  type FyersRawCandle,
} from './types.js';
import { generateMockCandles } from './mock-data.js';

// fyersModule exports { fyersModel, fyersDataSocket, ... }
const { fyersModel } = fyersModule;

export class FyersClientService {
  private model: any;
  private currentToken: string | null = null;

  constructor() {
    this.model = new fyersModel();
    if (config.fyersAppId) {
      this.model.setAppId(config.fyersAppId);
    }
    if (config.fyersRedirectUri) {
      this.model.setRedirectUrl(config.fyersRedirectUri);
    }

    const saved = getStoredToken();
    if (saved) {
      this.setToken(saved);
    }
  }

  public isConfigured(): boolean {
    return Boolean(config.fyersAppId && config.fyersSecretKey);
  }

  public isAuthenticated(): boolean {
    return Boolean(this.currentToken);
  }

  public getToken(): string | null {
    return this.currentToken;
  }

  public setToken(token: string): void {
    this.currentToken = token;
    this.model.setAccessToken(token);
    saveStoredToken(token);
  }

  public logout(): void {
    this.currentToken = null;
    clearStoredToken();
  }

  public getLoginUrl(state = 'vela_state'): string {
    if (!config.fyersAppId) {
      throw new Error('FYERS_APP_ID is not configured in .env');
    }
    return this.model.generateAuthCode({
      client_id: config.fyersAppId,
      redirect_uri: config.fyersRedirectUri,
      state,
    });
  }

  public async exchangeAuthCode(authCode: string): Promise<{ success: boolean; accessToken?: string; message?: string }> {
    try {
      const response = await this.model.generate_access_token({
        auth_code: authCode,
        client_id: config.fyersAppId,
        secret_key: config.fyersSecretKey,
      });

      if (response && response.s === 'ok' && response.access_token) {
        this.setToken(response.access_token);
        return { success: true, accessToken: response.access_token };
      } else {
        const errorMsg = response?.message || 'Failed to exchange auth code for access token';
        return { success: false, message: errorMsg };
      }
    } catch (err: any) {
      return { success: false, message: err?.message || 'Error exchanging auth code' };
    }
  }

  public async getHistory(params: {
    symbol: string;
    resolution?: string;
    rangeFrom?: number; // epoch seconds or YYYY-MM-DD
    rangeTo?: number;
  }): Promise<{ s: 'ok' | 'error'; candles: VelaBar[]; source: 'fyers' | 'cache' | 'mock' }> {
    const symbol = params.symbol || 'NSE:NIFTY50-INDEX';
    const resolution = (params.resolution || '15').toUpperCase();
    const rangeTo = params.rangeTo || Math.floor(Date.now() / 1000);
    const rangeFrom = params.rangeFrom || (rangeTo - 30 * 86400);

    const cacheKey = `history:${symbol}:${resolution}:${rangeFrom}:${rangeTo}`;
    const cached = historyCache.get<VelaBar[]>(cacheKey);
    if (cached) {
      return { s: 'ok', candles: cached, source: 'cache' };
    }

    // Attempt real FYERS request if token and app id exist
    if (this.isAuthenticated() && this.isConfigured()) {
      try {
        const isDailyOrHigher =
          resolution === 'D' ||
          resolution === 'W' ||
          resolution === 'M' ||
          resolution === '1D' ||
          resolution === '1W' ||
          resolution === '1M';
        const chunkSec = isDailyOrHigher ? 365 * 86400 : 90 * 86400;

        // FYERS Historical Data retention limits:
        // - Intraday (1m, 3m, 5m, 15m, 60m): max 100 days history available from API
        // - Daily / Weekly / Monthly: multiple years supported
        const maxLookbackSec = isDailyOrHigher ? 10 * 365 * 86400 : 100 * 86400;
        const effectiveFrom = Math.max(rangeFrom, rangeTo - maxLookbackSec);

        // Partition requested time range into FYERS-compliant windows:
        // - 1D, 1W, 1M: max 365 days per API call
        // - Intraday: max 90-100 days per API call
        const chunkRanges: Array<{ from: number; to: number }> = [];
        let curr = effectiveFrom;
        while (curr < rangeTo) {
          const next = Math.min(curr + chunkSec, rangeTo);
          chunkRanges.push({ from: curr, to: next });
          curr = next;
        }

        // FYERS Standard Plan rate limit is 5 requests/sec.
        // Fetch in batches of 3 chunks with a 250ms pause between batches to stay comfortably below rate limits.
        const chunkResults: FyersRawCandle[][] = [];
        for (let i = 0; i < chunkRanges.length; i += 3) {
          const batch = chunkRanges.slice(i, i + 3);
          const batchResults = await Promise.all(
            batch.map(async (c) => {
              try {
                const fyersReq = {
                  symbol,
                  resolution,
                  date_format: '0',
                  range_from: c.from.toString(),
                  range_to: c.to.toString(),
                  cont_flag: '1',
                };
                const res: FyersHistoryResponse = await this.model.getHistory(fyersReq);
                if (res && res.s === 'ok' && Array.isArray(res.candles)) {
                  return res.candles as FyersRawCandle[];
                }
              } catch (err: any) {
                console.warn(`[fyers-client] Chunk [${c.from}..${c.to}] error:`, err?.message || err);
              }
              return [];
            })
          );
          chunkResults.push(...batchResults);
          if (i + 3 < chunkRanges.length) {
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        }

        const rawCandles: FyersRawCandle[] = [];
        for (const candles of chunkResults) {
          rawCandles.push(...candles);
        }

        if (rawCandles.length > 0) {
          const bars = transformFyersCandlesToVelaBars(rawCandles);
          const byTime = new Map<number, VelaBar>();
          for (const b of bars) byTime.set(b.time, b);
          const sorted = Array.from(byTime.values()).sort((a, b) => a.time - b.time);

          historyCache.set(cacheKey, sorted, 60);
          return { s: 'ok', candles: sorted, source: 'fyers' };
        }
      } catch (err: any) {
        console.warn(`[fyers-client] FYERS API call failed:`, err?.message || err);
      }
    }

    // Mock data fallback for developer experience
    const mockBars = generateMockCandles(symbol, resolution, rangeFrom, rangeTo);
    historyCache.set(cacheKey, mockBars, 30); // 30s cache for mock
    return { s: 'ok', candles: mockBars, source: 'mock' };
  }
}

export const fyersService = new FyersClientService();
