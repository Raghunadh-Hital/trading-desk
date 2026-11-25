import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { config } from './config.js';
import { fyersService } from './fyers-client.js';
import { wsProxy } from './ws-server.js';
import { tickAggregator } from './tick-aggregator.js';
import { symbolService } from './symbol-service.js';

export function createServerApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'vela-fyers-proxy',
      fyersConfigured: fyersService.isConfigured(),
      authenticated: fyersService.isAuthenticated(),
    });
  });

  // Symbol suggestions (complete NSE master with optional query search)
  app.get('/api/symbols', (req, res) => {
    const q = req.query['q'] as string | undefined;
    const symbols = q ? symbolService.search(q, 100) : symbolService.getAllSymbols();
    res.json({
      symbols,
    });
  });

  // Auth: status
  app.get('/api/auth/status', (_req, res) => {
    res.json({
      configured: fyersService.isConfigured(),
      authenticated: fyersService.isAuthenticated(),
      appId: config.fyersAppId ? `${config.fyersAppId.slice(0, 4)}...` : null,
      redirectUri: config.fyersRedirectUri,
    });
  });

  // Auth: login redirect
  app.get('/api/auth/login', (_req, res) => {
    if (!fyersService.isConfigured()) {
      return res.status(400).json({
        error: 'FYERS API credentials are not configured in server/.env',
        hint: 'Set FYERS_APP_ID and FYERS_SECRET_KEY in server/.env',
      });
    }
    try {
      const loginUrl = fyersService.getLoginUrl();
      res.redirect(loginUrl);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to generate login URL' });
    }
  });

  // Auth: OAuth callback
  app.get('/api/auth/callback', async (req, res) => {
    const authCode = (req.query['auth_code'] || req.query['code']) as string;
    if (!authCode) {
      return res.status(400).send('<h3>Error: auth_code parameter missing from callback</h3>');
    }

    const result = await fyersService.exchangeAuthCode(authCode);
    if (result.success) {
      tickAggregator.connectFyersSocket();
      res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>FYERS Authentication Successful</title></head>
        <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
          <div style="background: #1e293b; padding: 2rem; border-radius: 8px; border: 1px solid #334155; text-align: center; max-width: 480px;">
            <h2 style="color: #22c55e;">Authentication Successful!</h2>
            <p>Your FYERS API v3 access token has been generated and securely stored.</p>
            <p>You can return to the Vela Chart Terminal.</p>
            <a href="http://localhost:5190" style="display: inline-block; margin-top: 1rem; padding: 0.6rem 1.2rem; background: #3b82f6; color: white; text-decoration: none; border-radius: 4px;">Return to Chart</a>
          </div>
        </body>
        </html>
      `);
    } else {
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head><title>FYERS Authentication Failed</title></head>
        <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem;">
          <h2 style="color: #ef4444;">Authentication Failed</h2>
          <p>${result.message}</p>
        </body>
        </html>
      `);
    }
  });

  // Auth: manual token injection (for testing or direct token setups)
  app.post('/api/auth/token', (req, res) => {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token string is required' });
    }
    fyersService.setToken(token);
    res.json({ success: true, message: 'Token saved and configured' });
  });

  // Historical Candles endpoint
  // Query: ?symbol=NSE:RELIANCE-EQ&resolution=15&range_from=1700000000&range_to=1700100000
  app.get('/api/history', async (req, res) => {
    try {
      const symbol = (req.query.symbol as string) || 'NSE:NIFTY50-INDEX';
      const resolution = (req.query.resolution as string) || '15';
      const rangeFrom = req.query.range_from ? parseInt(req.query.range_from as string, 10) : undefined;
      const rangeTo = req.query.range_to ? parseInt(req.query.range_to as string, 10) : undefined;

      const result = await fyersService.getHistory({
        symbol,
        resolution,
        rangeFrom,
        rangeTo,
      });

      if (result.s === 'ok' && Array.isArray(result.candles) && result.candles.length > 0) {
        const lastCandle = result.candles[result.candles.length - 1];
        if (lastCandle && typeof lastCandle.close === 'number') {
          tickAggregator.setInitialPrice(symbol, lastCandle.close);
        }
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        s: 'error',
        candles: [],
        message: err?.message || 'Failed to fetch history',
      });
    }
  });

  return app;
}

export function startServer(port = config.port) {
  const app = createServerApp();
  const server = http.createServer(app);

  wsProxy.attach(server);

  server.listen(port, () => {
    console.log(`[vela-server] HTTP server running on http://127.0.0.1:${port}`);
    console.log(`[vela-server] WebSocket endpoint available at ws://127.0.0.1:${port}/ws/ticks`);
    if (fyersService.isAuthenticated()) {
      tickAggregator.connectFyersSocket();
    }
  });

  return { app, server };
}

// Auto-start if invoked directly
if (process.argv[1] && (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'))) {
  startServer();
}
