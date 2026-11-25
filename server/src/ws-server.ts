import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { tickAggregator } from './tick-aggregator.js';
import type { VelaBar } from './types.js';

interface ClientSubscription {
  ws: WebSocket;
  symbols: Set<string>;
  resolution: string;
}

export class LocalWebSocketProxy {
  private wss: WebSocketServer | null = null;
  private clients = new Map<WebSocket, ClientSubscription>();

  public attach(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws/ticks' });

    this.wss.on('connection', (ws: WebSocket) => {
      const sub: ClientSubscription = {
        ws,
        symbols: new Set<string>(['NSE:NIFTY50-INDEX']),
        resolution: '15',
      };
      this.clients.set(ws, sub);
      tickAggregator.subscribeSymbol('NSE:NIFTY50-INDEX');

      // Send greeting
      ws.send(
        JSON.stringify({
          type: 'connected',
          message: 'Connected to Vela Indian Market Live WebSocket Proxy',
        })
      );

      ws.on('message', (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'subscribe' && msg.symbol) {
            sub.symbols.add(msg.symbol);
            if (msg.resolution) {
              sub.resolution = msg.resolution;
            }
            tickAggregator.subscribeSymbol(msg.symbol);

            // Send current forming bar if available
            const current = tickAggregator.getCurrentBar(msg.symbol, sub.resolution);
            if (current) {
              ws.send(
                JSON.stringify({
                  type: 'bar',
                  symbol: msg.symbol,
                  resolution: sub.resolution,
                  bar: current,
                })
              );
            }
          } else if (msg.type === 'unsubscribe' && msg.symbol) {
            sub.symbols.delete(msg.symbol);
          } else if (msg.type === 'timeframe' && msg.resolution) {
            sub.resolution = msg.resolution;
          }
        } catch (err) {
          console.warn('[ws-server] Failed to parse client message:', err);
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', (err) => {
        console.warn('[ws-server] Client error:', err);
        this.clients.delete(ws);
      });
    });

    // Wire up tickAggregator updates to broadcast to subscribed clients
    tickAggregator.onBarUpdate(({ symbol, resolution, bar }) => {
      this.broadcastBar(symbol, resolution, bar);
    });

    console.log('[ws-server] WebSocket proxy mounted at /ws/ticks');
  }

  public broadcastBar(symbol: string, resolution: string, bar: VelaBar): void {
    const payload = JSON.stringify({
      type: 'bar',
      symbol,
      resolution,
      bar,
    });

    for (const [ws, sub] of this.clients.entries()) {
      if (ws.readyState === WebSocket.OPEN && sub.symbols.has(symbol) && sub.resolution === resolution) {
        ws.send(payload);
      }
    }
  }

  public close(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}

export const wsProxy = new LocalWebSocketProxy();
