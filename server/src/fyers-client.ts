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
  private lastValidatedAt: number = 0;
  private apiQueue: Promise<unknown> = Promise.resolve();
  private lastApiCallAt: number = 0;

  /**
   * Serialize all FYERS REST calls through a single global queue spaced by >= 350ms
   * (~2.8 req/s) so concurrent chart panes and indicators never exceed FYERS's
   * Standard Plan limit of 5 requests/second.
   */
  private scheduleFyersCall<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.apiQueue.then(async () => {
      const elapsed = Date.now() - this.lastApiCallAt;
      if (elapsed < 350) {
        await new Promise((resolve) => setTimeout(resolve, 350 - elapsed));
      }
      this.lastApiCallAt = Date.now();
      return fn();
    });
    this.apiQueue = run.catch(() => {});
    return run;
  }

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

  public async validateToken(force = false): Promise<boolean> {
    if (!this.currentToken) return false;
    const now = Date.now();
    // Cache profile validation result for 60 seconds to avoid hitting FYERS rate limits (5 req/sec limit)
    if (!force && now - this.lastValidatedAt < 60000) {
      return true;
    }
    try {
      const res = await this.scheduleFyersCall<any>(() => this.model.get_profile());
      if (res && res.s === 'ok') {
        this.lastValidatedAt = now;
        return true;
      }
      const msg = (res?.message || '').toLowerCase();
      // Only logout on explicit token rejection/expiration, NEVER on rate limits or invalid input
      if (res && (res.code === -16 || res.code === 401 || (res.s === 'error' && /expired|could not authenticate/i.test(msg)))) {
        console.warn('[fyers-client] Token validation failed: token is expired or unauthorized');
        this.logout();
        return false;
      }
      return Boolean(this.currentToken);
    } catch (err: any) {
      const msg = (err?.message || (typeof err === 'string' ? err : JSON.stringify(err)) || '').toLowerCase();
      if (err?.code === -16 || err?.code === 401 || /token is invalid|expired token|could not authenticate the user/i.test(msg)) {
        console.warn('[fyers-client] Token expired on profile test:', err?.message || err);
        this.logout();
        return false;
      }
      return Boolean(this.currentToken);
    }
  }

  public getToken(): string | null {
    return this.currentToken;
  }

  public setToken(token: string): void {
    this.currentToken = token;
    this.lastValidatedAt = Date.now();
    this.model.setAccessToken(token);
    saveStoredToken(token);
  }

  public logout(): void {
    this.currentToken = null;
    this.lastValidatedAt = 0;
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
        // Use 360 days (< 365/366) per chunk for daily/weekly/monthly so leap years never exceed FYERS 365-day window
        const chunkSec = isDailyOrHigher ? 360 * 86400 : 90 * 86400;

        // FYERS Historical Data retention limits:
        // - Intraday (1m, 3m, 5m, 15m, 60m): max 100 days history available from API
        // - Daily / Weekly / Monthly: cap at 5 years to avoid FYERS "Invalid input" on very old epoch ranges
        const maxLookbackSec = isDailyOrHigher ? 5 * 365 * 86400 : 100 * 86400;
        const nowSec = Math.floor(Date.now() / 1000);
        const end = Math.min(Math.floor(rangeTo), nowSec);
        const effectiveFrom = Math.max(Math.floor(rangeFrom), end - maxLookbackSec);

        // Partition requested time range into FYERS-compliant windows
        const chunkRanges: Array<{ from: number; to: number }> = [];
        let curr = effectiveFrom;
        while (curr < end) {
          const next = Math.min(curr + chunkSec, end);
          if (next > curr) {
            chunkRanges.push({ from: curr, to: next });
          }
          curr = next;
        }

        // Execute all chunks through the global rate-limited queue (max ~2.8 req/s across the entire server).
        const chunkResults: FyersRawCandle[][] = [];
        for (const c of chunkRanges) {
          const fetchChunk = async (attempt = 0): Promise<FyersRawCandle[]> => {
            try {
              const fyersReq = {
                symbol,
                resolution,
                date_format: '0',
                range_from: c.from.toString(),
                range_to: c.to.toString(),
                cont_flag: '1',
              };
              const res: FyersHistoryResponse = await this.scheduleFyersCall(() => this.model.getHistory(fyersReq));
              if (res && res.s === 'ok' && Array.isArray(res.candles)) {
                return res.candles as FyersRawCandle[];
              } else if (res && (res as any).code === -16) {
                this.logout();
              }
            } catch (err: any) {
              const errMsg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err)) || '';
              if (/limit of 5 requests\/second|rate limit/i.test(errMsg) && attempt < 1) {
                await new Promise((resolve) => setTimeout(resolve, 1200));
                return fetchChunk(attempt + 1);
              }
              console.warn(`[fyers-client] Chunk [${c.from}..${c.to}] error:`, errMsg);
              // ONLY logout if FYERS explicitly rejects the user/token credentials.
              if (/could not authenticate the user|token is invalid|expired token/i.test(errMsg) || err?.code === -16) {
                this.logout();
              }
            }
            return [];
          };
          chunkResults.push(await fetchChunk());
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
