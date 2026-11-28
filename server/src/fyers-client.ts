import fyersModule from 'fyers-api-v3';
import { config } from './config.js';
import {
  getStoredToken,
  saveStoredToken,
  clearStoredToken,
  getStoredCredentials,
  saveStoredCredentials,
  clearStoredCredentials,
} from './token-store.js';
import { historyCache } from './cache.js';
import {
  transformFyersCandlesToVelaBars,
  type VelaBar,
  type FyersHistoryResponse,
  type FyersRawCandle,
} from './types.js';

// fyersModule exports { fyersModel, fyersDataSocket, ... }
const { fyersModel } = fyersModule;

export class FyersClientService {
  private model: any;
  private currentToken: string | null = null;
  private lastValidatedAt: number = 0;
  private dailyLimitUntil: number = 0;
  private inflightHistory = new Map<string, Promise<{ s: 'ok' | 'error'; candles: VelaBar[]; source: 'fyers' | 'cache' | 'mock'; rateLimited?: boolean }>>();
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

    const storedCreds = getStoredCredentials();
    if (storedCreds) {
      if (!config.fyersAppId && storedCreds.appId) config.fyersAppId = storedCreds.appId;
      if (!config.fyersSecretKey && storedCreds.secretKey) config.fyersSecretKey = storedCreds.secretKey;
      if (storedCreds.redirectUri) config.fyersRedirectUri = storedCreds.redirectUri;
    }

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

  public setCredentials(appId: string, secretKey: string, redirectUri?: string): void {
    config.fyersAppId = appId.trim();
    config.fyersSecretKey = secretKey.trim();
    if (redirectUri && redirectUri.trim()) {
      config.fyersRedirectUri = redirectUri.trim();
    }
    this.model.setAppId(config.fyersAppId);
    this.model.setRedirectUrl(config.fyersRedirectUri);
    saveStoredCredentials({
      appId: config.fyersAppId,
      secretKey: config.fyersSecretKey,
      redirectUri: config.fyersRedirectUri,
    });
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
    this.dailyLimitUntil = 0;
    this.model.setAccessToken(token);
    saveStoredToken(token);
  }

  public logout(): void {
    this.currentToken = null;
    this.lastValidatedAt = 0;
    config.fyersAppId = '';
    config.fyersSecretKey = '';
    clearStoredToken();
    clearStoredCredentials();
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
  }): Promise<{ s: 'ok' | 'error'; candles: VelaBar[]; source: 'fyers' | 'cache' | 'mock'; rateLimited?: boolean }> {
    const symbol = params.symbol || 'NSE:NIFTY50-INDEX';
    const resolution = (params.resolution || '15').toUpperCase();
    const nowSec = Math.floor(Date.now() / 1000);
    const rawTo = params.rangeTo ? Math.min(Math.floor(params.rangeTo), nowSec) : nowSec;
    const rawFrom = params.rangeFrom ? Math.floor(params.rangeFrom) : rawTo - 30 * 86400;

    // Align request key to 60s buckets so concurrent panes/ticks coalesce into a single fetch.
    const bucketFrom = Math.floor(rawFrom / 60) * 60;
    const bucketTo = Math.ceil(rawTo / 60) * 60;
    const cacheKey = `history:${symbol}:${resolution}:${bucketFrom}:${bucketTo}`;
    const cached = historyCache.get<VelaBar[]>(cacheKey);
    if (cached) {
      return { s: 'ok', candles: cached, source: 'cache' };
    }

    const inflight = this.inflightHistory.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const promise = this.fetchHistoryCoalesced(symbol, resolution, rawFrom, rawTo, cacheKey).finally(() => {
      this.inflightHistory.delete(cacheKey);
    });
    this.inflightHistory.set(cacheKey, promise);
    return promise;
  }

  private async fetchHistoryCoalesced(
    symbol: string,
    resolution: string,
    rawFrom: number,
    rawTo: number,
    cacheKey: string
  ): Promise<{ s: 'ok' | 'error'; candles: VelaBar[]; source: 'fyers' | 'cache' | 'mock'; rateLimited?: boolean }> {
    let hitDailyLimit = this.dailyLimitUntil > Date.now();

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
        const maxLookbackSec = isDailyOrHigher ? 5 * 365 * 86400 : 100 * 86400;

        const nowSec = Math.floor(Date.now() / 1000);
        const end = Math.min(rawTo, nowSec);
        const effectiveFrom = Math.max(rawFrom, end - maxLookbackSec);

        // Anchor chunk windows to today's UTC midnight so historical windows keep identical
        // timestamps all day and hit the 24h chunk cache instead of shifting every second.
        const todayMidnight = Math.floor(nowSec / 86400) * 86400;
        const numPastWindows = Math.ceil(maxLookbackSec / chunkSec);
        const allWindows: Array<{ from: number; to: number; isToday: boolean; cacheKey: string }> = [];

        for (let k = numPastWindows; k >= 1; k--) {
          const wFrom = Math.max(todayMidnight - k * chunkSec, todayMidnight - maxLookbackSec);
          const wTo = todayMidnight - (k - 1) * chunkSec;
          if (wTo > wFrom) {
            allWindows.push({
              from: wFrom,
              to: wTo,
              isToday: false,
              cacheKey: `chunk:${symbol}:${resolution}:${wFrom}:${wTo}`,
            });
          }
        }
        if (nowSec > todayMidnight) {
          allWindows.push({
            from: todayMidnight,
            to: nowSec,
            isToday: true,
            cacheKey: `chunk:${symbol}:${resolution}:today:${todayMidnight}`,
          });
        }

        const chunkRanges = allWindows.filter((w) => w.to >= effectiveFrom && w.from <= end);
        const chunkResults: FyersRawCandle[][] = [];
        let fetchedAnyFromNetwork = false;

        for (const c of chunkRanges) {
          const cachedChunk = historyCache.get<FyersRawCandle[]>(c.cacheKey);
          if (cachedChunk) {
            chunkResults.push(cachedChunk);
            continue;
          }

          if (hitDailyLimit || this.dailyLimitUntil > Date.now()) {
            hitDailyLimit = true;
            continue;
          }

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
                const candles = res.candles as FyersRawCandle[];
                fetchedAnyFromNetwork = true;
                // Past windows are immutable (24h cache); today's window caches for 120s (live ticks arrive via WebSocket)
                historyCache.set(c.cacheKey, candles, c.isToday ? 120 : 86400);
                return candles;
              } else if (res && (res as any).code === -16) {
                this.logout();
              }
            } catch (err: any) {
              const errMsg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err)) || '';
              if (/requests\/day|daily limit/i.test(errMsg)) {
                if (this.dailyLimitUntil <= Date.now()) {
                  console.warn(`[fyers-client] Daily API limit reached (5,000 req/day). Pausing REST history calls for 15 minutes; cached bars & live WebSocket ticks remain active.`);
                }
                this.dailyLimitUntil = Date.now() + 15 * 60 * 1000;
                hitDailyLimit = true;
                return [];
              }
              if (/limit of 5 requests\/second|rate limit/i.test(errMsg) && attempt < 1) {
                await new Promise((resolve) => setTimeout(resolve, 1200));
                return fetchChunk(attempt + 1);
              }
              console.warn(`[fyers-client] Chunk [${c.from}..${c.to}] error:`, errMsg);
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
          for (const b of bars) {
            if (b.time >= effectiveFrom * 1000 && b.time <= end * 1000) {
              byTime.set(b.time, b);
            }
          }
          const sorted = Array.from(byTime.values()).sort((a, b) => a.time - b.time);

          if (sorted.length > 0) {
            historyCache.set(cacheKey, sorted, 120);
            return {
              s: 'ok',
              candles: sorted,
              source: fetchedAnyFromNetwork ? 'fyers' : 'cache',
              ...(hitDailyLimit ? { rateLimited: true } : {}),
            };
          }
        }
      } catch (err: any) {
        console.warn(`[fyers-client] FYERS API call failed:`, err?.message || err);
      }
    }

    return {
      s: 'ok',
      candles: [],
      source: 'fyers',
      ...(hitDailyLimit ? { rateLimited: true } : {}),
    };
  }
}

export const fyersService = new FyersClientService();
