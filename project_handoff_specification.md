# Project Specification: Custom Indian Market Charting Terminal (Vela + PineTS + FYERS API v3)

## 1. Executive Summary & Objective
The goal of this project is to build a self-hosted, web-based financial charting application tailored for the Indian stock market (NSE, BSE, MCX). 
The user has cloned the open-source **LuxAlgo Vela** repository (`github.com/LuxAlgo/Vela`). The terminal will integrate:
1. **Frontend Charting UI:** LuxAlgo's `@luxalgo/vela` & `@luxalgo/vela-ui`.
2. **Scripting Engine:** Native Pine Script v5 / v6 execution via `@luxalgo/vela-pinets` and `PineWorkerEngine`.
3. **Market Data Provider:** **FYERS API v3** (Free Standard Tier) providing historical OHLCV data and real-time WebSocket tick streams for Indian equities, indices, and F&O.
4. **Local Proxy Backend:** A Node.js / Express backend to handle FYERS OAuth authentication, data transformations, tick aggregation into OHLCV bars, and rate-limit caching.

---

## 2. Tech Stack Overview

| Layer | Tool / Library | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | React / TypeScript / Vite | Renders the web workspace & Monaco Code Editor |
| **Chart UI Engine** | `@luxalgo/vela`, `@luxalgo/vela-ui` | High-performance HTML5 Canvas charting framework |
| **Script Execution** | `@luxalgo/vela-pinets`, `pinets` | Executes Pine Script v5/v6 inside Web Workers |
| **Code Editor** | `@monaco-editor/react` | Code editor with syntax highlighting for Pine Script |
| **Backend Proxy** | Node.js + Express + `ws` | Handles FYERS API v3 calls, authentication & token storage |
| **Data Provider** | FYERS API v3 (`fyers-api-v3`) | Free historical candles + real-time WebSocket data feed |
| **Broker Integration** | FYERS (Data) / Zerodha (Optional Orders) | Market data stream & trading execution |

---

## 3. Architecture & Data Flow

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                          LOCAL BACKEND PROXY (Node.js)                  │
│                                                                         │
│  ┌───────────────────────┐             ┌─────────────────────────────┐  │
│  │ FYERS REST Client     │             │ FYERS Data WebSocket        │  │
│  │ (History / Auth)      │             │ (Live Tick Aggregator)      │  │
│  └───────────┬───────────┘             └──────────────┬──────────────┘  │
└──────────────┼────────────────────────────────────────┼─────────────────┘
               │ REST (Candles)                         │ Local WS (Ticks)
               ▼                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          BROWSER / FRONTEND                             │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                       Vela Chart Instance                         │  │
│  └─────────────────────────────────┬─────────────────────────────────┘  │
│                                    │                                    │
│                                    ▼                                    │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │         PineWorkerEngine (@luxalgo/vela-pinets) (Web Worker)       │  │
│  │    --> Runs Pine Script v5/v6 on Indian OHLCV arrays              │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. FYERS API v3 Specifications & Data Mapping

### 4.1 Symbol Format Standard
FYERS uses standardized prefixing for Indian market symbols:
- **NSE Equities:** `NSE:RELIANCE-EQ`, `NSE:SBIN-EQ`
- **NSE Indices:** `NSE:NIFTY50-INDEX`, `NSE:NIFTYBANK-INDEX`
- **BSE Equities:** `BSE:RELIANCE-A`, `BSE:SENSEX-INDEX`
- **NSE Derivatives:** `NSE:NIFTY26NOV22000CE`

### 4.2 Rate Limits & Caching Rules (CRITICAL)
FYERS API v3 enforces the following limits:
- **Max Requests:** 5 req/sec, 50 req/min, 5,000 req/day.
- **Rule:** If 50 req/min is breached 3 times in a single day, FYERS temporarily blocks API access for 24 hours.
- **Backend Task:** The backend proxy MUST implement in-memory caching (e.g., Node-Cache or LRU cache) for historical responses to prevent redundant requests during chart timeframe switching or MTF Pine Script `request.security()` calls.

### 4.3 Data Format Mapping for Vela
FYERS returns raw historical candles as array tuples:
`[ epoch_timestamp_in_seconds, open, high, low, close, volume ]`

Vela expects candle objects with timestamps in **epoch milliseconds**:
```typescript
interface VelaBar {
  time: number;   // Timestamp in milliseconds (ts * 1000)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
```

---

## 5. Implementation Roadmap for the AI Agent

### Phase 1: Local Backend Proxy Setup (`/server`)
1. Create a `server/` folder inside the workspace.
2. Initialize Node.js TypeScript project (`express`, `ws`, `fyers-api-v3`, `dotenv`, `cors`, `node-cache`).
3. Create `.env` configuration template:
   ```env
   FYERS_APP_ID=YOUR_APP_ID
   FYERS_SECRET_KEY=YOUR_SECRET_KEY
   FYERS_REDIRECT_URI=http://127.0.0.1:5000/api/auth/callback
   PORT=5000
   ```
4. Implement OAuth token generation route (`/api/auth/login` and `/api/auth/callback`).
5. Build the historical data endpoint `/api/history`:
   - Query params: `symbol`, `resolution` (1, 3, 5, 15, 60, D), `range_from`, `range_to`.
   - Check cache first. If cache miss, fetch from FYERS API v3 `getHistory()`.
   - Transform timestamp `ts * 1000`. Return transformed `VelaBar[]`.
6. Implement Local WebSocket Proxy (`ws://localhost:5000/ws/ticks`):
   - Listen to FYERS WebSocket tick data.
   - Aggregate incoming ticks into current forming timeframe bar (`time`, `open`, `high`, `low`, `close`, `volume`).
   - Broadcast live bar updates to connected Vela frontend clients.

### Phase 2: Frontend Integration (`/playground` or Main App)
1. Navigate to the Vela workspace. Ensure packages `@luxalgo/vela`, `@luxalgo/vela-ui`, `@luxalgo/vela-pinets`, and `pinets` are linked/installed.
2. Build Custom Data Provider for Vela:
   ```typescript
   import { Vela } from '@luxalgo/vela';
   import { PineWorkerEngine } from '@luxalgo/vela-pinets';

   // Initialize Vela Chart
   const chart = new Vela('#chart-container', {
     theme: 'dark',
     timeframe: '15m',
     symbol: 'NSE:RELIANCE-EQ',
   });

   // Register PineTS Worker Engine
   chart.registerEngine('pine', new PineWorkerEngine());
   ```
3. Attach Custom FYERS Fetcher to Vela Data Manager:
   - Wire `chart.data.registerProvider()` to request candles from local Node.js proxy `/api/history`.
   - Establish local WebSocket connection (`ws://localhost:5000/ws/ticks`) to feed live candle updates into `chart.updateBar(...)`.

### Phase 3: Pine Script v5/v6 Monaco Editor Integration
1. Add `@monaco-editor/react` component to the UI layout.
2. Create standard Pine Script template code in editor:
   ```pinescript
   //@version=5
   indicator("Custom NSE EMA Cross", overlay=true)
   fastLen = input.int(9, "Fast Length")
   slowLen = input.int(21, "Slow Length")
   fastEma = ta.ema(close, fastLen)
   slowEma = ta.ema(close, slowLen)
   plot(fastEma, "Fast EMA", color=color.blue)
   plot(slowEma, "Slow EMA", color=color.orange)
   ```
3. Add "Apply to Chart" button:
   - On click, extract script string from Monaco Editor.
   - Execute `chart.addIndicator(scriptCode)`.
   - Catch compilation errors from `PineWorkerEngine` and display error toast in UI if script contains unsupported syntax.

---

## 6. Verification & Test Plan

1. **Authentication Test:** Run local proxy, visit login endpoint, authenticate with FYERS credentials, verify `access_token` generation.
2. **Historical Candle Verification:** Request `NSE:NIFTY50-INDEX` 15-minute candles. Verify timestamps align with Indian Market hours (09:15 IST to 15:30 IST) and correctly render on Vela chart Canvas.
3. **Indicator Execution Test:** Load a Pine Script indicator containing `ta.rsi()`, `ta.ema()`, and custom drawing tables. Confirm indicators plot accurately over FYERS NSE candles without UI lagging.
4. **Live Streaming Test:** Subscribe to live feeds during market hours (or test with mock ticks). Verify forming candle updates live.

---

## 7. Immediate Next Task for AI Agent
Execute **Phase 1** by setting up the `/server` directory, initializing the Node.js TypeScript proxy backend, configuring the FYERS API v3 SDK, and implementing the rate-limited historical data endpoint.