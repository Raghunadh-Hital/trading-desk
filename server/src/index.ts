import express from 'express';
import cors from 'cors';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
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
  app.get('/api/auth/status', async (_req, res) => {
    // If currently marked authenticated, verify token validity
    if (fyersService.isAuthenticated()) {
      await fyersService.validateToken();
    }
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
        <head>
          <meta charset="utf-8">
          <title>FYERS Authentication Successful</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0b101b; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #151d2f; padding: 2.5rem; border-radius: 12px; border: 1px solid #28354e; text-align: center; max-width: 480px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6); }
            h2 { color: #10b981; margin: 0 0 0.75rem; font-size: 1.5rem; }
            p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; margin: 0 0 1.5rem; }
            .badge { background: #090e18; border: 1px solid #1e293b; border-radius: 8px; padding: 0.85rem 1rem; margin-bottom: 1.5rem; color: #f1f5f9; font-size: 0.9rem; font-weight: 500; }
            .btn { background: #2563eb; color: #fff; border: none; padding: 0.65rem 1.4rem; border-radius: 6px; font-weight: 600; font-size: 0.9rem; cursor: pointer; text-decoration: none; display: inline-block; transition: background 150ms ease; }
            .btn:hover { background: #1d4ed8; }
          </style>
        </head>
        <body>
          <div class="card">
            <div style="font-size: 3rem; margin-bottom: 0.75rem;">🎉</div>
            <h2>Authentication Successful!</h2>
            <p>Your FYERS API v3 access token has been generated and securely saved on your device.</p>
            <div class="badge">
              ✓ You can now close this tab and return to <strong>Trading Desk</strong>!
            </div>
            <button class="btn" onclick="window.close()">Close This Tab</button>
          </div>
          <script>
            // Attempt to automatically close tab after 2 seconds
            setTimeout(() => { try { window.close(); } catch {} }, 2000);
          </script>
        </body>
        </html>
      `);
    } else {
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>FYERS Authentication Failed</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0b101b; color: #f8fafc; padding: 2.5rem; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #151d2f; padding: 2.5rem; border-radius: 12px; border: 1px solid #ef4444; max-width: 480px; text-align: center; }
            h2 { color: #ef4444; margin-top: 0; }
            p { color: #94a3b8; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Authentication Failed</h2>
            <p>${result.message}</p>
            <button onclick="window.close()" style="background:#334155; color:#fff; border:none; padding:8px 16px; border-radius:6px; cursor:pointer;">Close</button>
          </div>
        </body>
        </html>
      `);
    }
  });

  // Auth: configure credentials dynamically
  app.post('/api/auth/configure', (req, res) => {
    const { appId, secretKey, redirectUri } = req.body || {};
    if (!appId || !secretKey || typeof appId !== 'string' || typeof secretKey !== 'string') {
      return res.status(400).json({ error: 'appId and secretKey are required strings' });
    }
    fyersService.setCredentials(appId, secretKey, redirectUri);
    res.json({
      success: true,
      configured: true,
      appId: `${appId.slice(0, 4)}...`,
      message: 'Credentials updated and stored securely',
    });
  });

  // Auth: logout
  app.post('/api/auth/logout', (_req, res) => {
    fyersService.logout();
    tickAggregator.destroy();
    res.json({ success: true, message: 'Logged out successfully' });
  });

  // Auth: manual token injection (for testing or direct token setups)
  app.post('/api/auth/token', (req, res) => {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token string is required' });
    }
    fyersService.setToken(token);
    tickAggregator.connectFyersSocket();
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
          tickAggregator.setInitialBar(symbol, resolution, lastCandle);
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

  const staticDir = process.env.VELA_STATIC_DIR;
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get('*', (_req, res, next) => {
      const target = path.join(staticDir, 'terminal.html');
      if (fs.existsSync(target)) {
        res.sendFile(target);
      } else {
        next();
      }
    });
  }

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
