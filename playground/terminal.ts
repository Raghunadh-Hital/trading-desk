import * as monaco from 'monaco-editor';
import { VelaWorkspace } from '../src/workspace';
import { FyersProvider } from '../src/data/providers/fyers';
import { PineEngine } from '@luxalgo/vela-pinets';
import { DemoEngine } from './demo-engine';
import { playgroundStorage } from './persistence';
import { USER_PINESCRIPT } from './user-script';
import { registerWidgetAction, registerIcon } from '../src/plugin';

// Register Pine Script icon and topbar button next to layout selector
registerIcon(
    'pine-code',
    '<svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 4-3.5 4L5 12M11 4l3.5 4-3.5 4"/></svg>'
);

registerWidgetAction({
    id: 'pine-scripts-action',
    target: 'topbar',
    label: 'Pine Editor',
    icon: 'pine-code',
    tooltip: 'Pine Script Library & Editor',
    run: () => {
        openScriptsModal();
    },
});

const PINE_TEMPLATES: Record<string, string> = {
    userAllInOne: USER_PINESCRIPT,
    mrs: `//@version=5
// Mansfield Relative Strength (MRS) indicator
// Use this indicator to compare how security is performing in compare with preferred index (NSE:NIFTY50-INDEX by default). 
// > 0 outperforming 
// < 0 underperforming
// Works best for weekly, but can be applied to monthly and daily charts.

indicator("Mansfield Relative Strength indicator", overlay=false)

index = input.symbol("NSE:NIFTY50-INDEX", "Index")
sector = input.symbol("NSE:NIFTY50-INDEX", "Sector (optional)")
industry = input.symbol("NSE:NIFTY50-INDEX", "Industry (optional)")

ma_type = input.string("SMA", "Which moving average to use?", options=["SMA", "WMA", "EMA"])
len_daily = input.int(200, "MA length for Daily")
len_weekly = input.int(52, "MA length for Weekly")
len_monthly = input.int(10, "MA length for Monthly")
len_other = input.int(52, "MA length for all other periods")

// Style Settings
show_bg = input.bool(true, "Background Color", group="Style", inline="bg")
col_bull = input.color(#26a69a, "Bullish", group="Style", inline="bg")
col_bear = input.color(#ef5350, "Bearish", group="Style", inline="bg")

show_mrs = input.bool(true, "MRS index", group="Style", inline="mrs")
col_mrs = input.color(#00897b, "", group="Style", inline="mrs")
width_mrs = input.int(3, "Width", minval=1, maxval=5, group="Style", inline="mrs")

show_sector = input.bool(false, "MRS sector", group="Style", inline="sector")
col_sector = input.color(#2962ff, "", group="Style", inline="sector")
width_sector = input.int(2, "Width", minval=1, maxval=5, group="Style", inline="sector")

show_industry = input.bool(false, "MRS industry", group="Style", inline="ind")
col_industry = input.color(#ff9800, "", group="Style", inline="ind")
width_industry = input.int(1, "Width", minval=1, maxval=5, group="Style", inline="ind")

show_zero = input.bool(true, "Zero baseline", group="Style", inline="zero")
col_zero = input.color(#7e57c2, "", group="Style", inline="zero")
width_zero = input.int(1, "Width", minval=1, maxval=5, group="Style", inline="zero")

val = close

len = timeframe.isweekly ? len_weekly : (timeframe.isdaily ? len_daily : (timeframe.ismonthly ? len_monthly : len_other))

ma_func(source, length) =>
    ma_type == "WMA" ? ta.wma(source, length) : (ma_type == "SMA" ? ta.sma(source, length) : ta.ema(source, length))

calc_mrs(src, benchmark, length) =>
    sec = request.security(benchmark, timeframe.period, src)
    ratio = src / sec
    ((ratio / ma_func(ratio, length)) - 1) * 10

mrs_index = calc_mrs(val, index, len)
mrs_sector = calc_mrs(val, sector, len)
mrs_industry = calc_mrs(val, industry, len)
c = math.sign(mrs_index) + math.sign(mrs_sector) + math.sign(mrs_industry)

bg_col = show_bg ? (c == 3 ? color.new(col_bull, 80) : c == 2 ? color.new(col_bull, 75) : c == 1 ? color.new(col_bull, 70) : c == -1 ? color.new(col_bear, 70) : c == -2 ? color.new(col_bear, 75) : c == -3 ? color.new(col_bear, 80) : na) : na
bgcolor(bg_col)

plot(show_mrs ? mrs_index : na, "MRS index", color=col_mrs, linewidth=width_mrs)
plot(show_sector and (mrs_sector != mrs_index) ? mrs_sector : na, "MRS sector", color=col_sector, linewidth=width_sector)
plot(show_industry and (mrs_industry != mrs_index) ? mrs_industry : na, "MRS industry", color=col_industry, linewidth=width_industry)
plot(show_zero ? 0.0 : na, "Zero baseline", color=col_zero, linewidth=width_zero)
hline(0, "Zero baseline", color=#7e57c2, linestyle=hline.style_solid)
`,
    emaCross: `//@version=5
indicator("Custom NSE EMA Cross", overlay=true)
fastLen = input.int(9, "Fast Length")
slowLen = input.int(21, "Slow Length")
fastEma = ta.ema(close, fastLen)
slowEma = ta.ema(close, slowLen)
plot(fastEma, "Fast EMA", color=color.blue)
plot(slowEma, "Slow EMA", color=color.orange)
`,
    rsi: `//@version=5
indicator("NSE RSI 14", overlay=false)
len = input.int(14, "RSI Length")
r = ta.rsi(close, len)
plot(r, "RSI", color=color.purple)
hline(70, "Overbought", color=color.red)
hline(30, "Oversold", color=color.green)
`,
    bollinger: `//@version=5
indicator("Bollinger Bands", overlay=true)
length = input.int(20, "Length")
mult = input.float(2.0, "StdDev")
basis = ta.sma(close, length)
dev = mult * ta.stdev(close, length)
upper = basis + dev
lower = basis - dev
plot(basis, "Basis", color=color.yellow)
plot(upper, "Upper", color=color.teal)
plot(lower, "Lower", color=color.teal)
`,
    macd: `//@version=5
indicator("MACD", overlay=false)
fast = ta.ema(close, 12)
slow = ta.ema(close, 26)
macd = fast - slow
signal = ta.ema(macd, 9)
hist = macd - signal
plot(macd, "MACD", color=color.blue)
plot(signal, "Signal", color=color.orange)
plot(hist, "Histogram", color=color.gray)
`,
};

// 1. Initialize Vela Workspace with FYERS provider and Pine engine
const storage = playgroundStorage();

// Ensure workspace defaults to Indian Standard Time (Asia/Kolkata) and includes 2h timeframe
const savedState = storage.get('vela-indian-terminal');
if (savedState) {
    try {
        const parsed = JSON.parse(savedState);
        if (!parsed.timezone || parsed.timezone === 'Etc/UTC') {
            parsed.timezone = 'Asia/Kolkata';
        }
        if (Array.isArray(parsed.timeframeFavorites) && !parsed.timeframeFavorites.includes('120')) {
            const idx60 = parsed.timeframeFavorites.indexOf('60');
            if (idx60 !== -1) {
                parsed.timeframeFavorites.splice(idx60 + 1, 0, '120');
            } else {
                parsed.timeframeFavorites.push('120');
            }
        }
        storage.set('vela-indian-terminal', JSON.stringify(parsed));
    } catch {
        // Ignore JSON parse errors
    }
}

let currentFyersProvider: FyersProvider | null = null;

const ws = new VelaWorkspace('#chart', {
    layout: '1',
    symbol: 'NSE:NIFTY50-INDEX',
    timeframe: '15',
    live: true,
    theme: 'light',
    autofocus: true,
    persist: 'vela-indian-terminal',
    timezone: 'Asia/Kolkata',
    timeframes: ['1', '5', '15', '30', '60', '120', '240', 'D', 'W', 'M'],
    storage,
    animations: {
        liveBar: 120, // 120ms smooth fluid glide on forming candle wicks/body
    },
    currentPriceLine: true,
    sync: {
        crosshair: true,
        style: true,
        timeframe: false,
        symbol: false,
    },
    providers: {
        fyers: () => {
            currentFyersProvider = new FyersProvider({
                proxyUrl: 'http://127.0.0.1:5000',
                wsUrl: 'ws://127.0.0.1:5000/ws/ticks',
            });
            return currentFyersProvider;
        },
    },
    engines: {
        pine: () => new PineEngine(),
        demo: () => new DemoEngine(),
    },
    defaultLanguage: 'pine',
    volume: true,
    bars: 1000,
    visibleRange: '1M',
    topbar: {
        left: ['symbol', 'timeframes', 'style', 'indicators', 'actions', 'undo-redo'],
        right: ['layout', 'pine-scripts-action', 'actions', 'alerts', 'panels', 'screenshot', 'fullscreen'],
    },
});

ws.setTimezone('Asia/Kolkata');

(window as any).ws = ws;

// 1.1 Real-time Tab Title with Stock Name, Exchange & Live Price
function parseSymbolVenue(rawSymbol: string): { exchange: string; ticker: string } {
    const s = rawSymbol.trim().toUpperCase();
    if (s.startsWith('BSE:')) {
        return { exchange: 'BSE', ticker: s.slice(4) };
    }
    if (s.startsWith('NSE:')) {
        return { exchange: 'NSE', ticker: s.slice(4) };
    }
    if (s.startsWith('MCX:')) {
        return { exchange: 'MCX', ticker: s.slice(4) };
    }
    if (s.includes('SENSEX') || s.includes('BANKEX')) {
        return { exchange: 'BSE', ticker: s };
    }
    if (/-(A|B|T|Z|XT|X|MT|M|MS|P|E)$/.test(s) && !s.endsWith('-EQ')) {
        return { exchange: 'BSE', ticker: s };
    }
    return { exchange: 'NSE', ticker: s };
}

function formatPrice(price: number): string {
    if (isNaN(price) || price == null) return '';
    return price.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

let lastPrice: number | null = null;
let lastSymbol: string = 'NSE:NIFTY50-INDEX';

function updateTabTitle(price?: number | null, symbolOverride?: string): void {
    const sym = symbolOverride ?? ws.chart.market?.symbol ?? lastSymbol;
    lastSymbol = sym;

    if (price !== undefined && price !== null && !isNaN(price)) {
        lastPrice = price;
    } else if (lastPrice === null && currentFyersProvider) {
        const stored = currentFyersProvider.getLastClose(sym);
        if (stored) lastPrice = stored;
    }

    const { exchange, ticker } = parseSymbolVenue(sym);
    if (lastPrice !== null && !isNaN(lastPrice)) {
        document.title = `${formatPrice(lastPrice)} | ${ticker} (${exchange}) — Trading Desk`;
    } else {
        document.title = `${ticker} (${exchange}) — Trading Desk`;
    }
}

// 2. Storage Keys & Multi-Script State for Persistence
const SCRIPT_STORAGE_KEY = 'vela-terminal-user-pinescript';
const INDICATOR_STATE_KEY = 'vela-terminal-indicator-state';
const ALL_IN_ONE_ID = 'user-pine-indicator';
const MRS_INDICATOR_ID = 'mrs-pine-indicator';
const INDICATOR_ID = ALL_IN_ONE_ID; // alias for compatibility

interface SavedIndicatorState {
    applied: boolean;
    inputs?: Record<string, any>;
    allInputs?: Record<string, Record<string, any>>;
}

function getSavedIndicatorState(): SavedIndicatorState | null {
    try {
        const raw = localStorage.getItem(INDICATOR_STATE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function sanitizePineScript(scriptCode: string): string {
    let code = scriptCode
        .replace(/^\s*import\s+TradingView\/ta\/\d+/gm, '// import TradingView/ta/10 (built-in in PineTS)')
        .replace(/runtime\.error\s*\([^\)]+\)/g, 'na');

    // Upgrade v3/v4 to v5 if detected
    if (/^\s*\/\/\s*@version=[34]/m.test(code) || /^\s*study\s*\(/m.test(code)) {
        code = code
            .replace(/^\s*\/\/\s*@version=[34]/m, '//@version=5')
            .replace(/^\s*study\s*\(([^)]*)\)/m, (_match, args) => {
                if (!args.includes('overlay')) {
                    return `indicator(${args}, overlay=false)`;
                }
                return `indicator(${args})`;
            })
            .replace(/input\s*\(\s*title\s*=\s*(".*?")\s*,\s*type\s*=\s*symbol\s*,\s*defval\s*=\s*(".*?")\s*\)/g, 'input.symbol($2, $1)')
            .replace(/input\s*\(\s*title\s*=\s*(".*?")\s*,\s*defval\s*=\s*(".*?")\s*,\s*options\s*=\s*(\[[^\]]*\])\s*\)/g, 'input.string($2, $1, options=$3)')
            .replace(/input\s*\(\s*title\s*=\s*(".*?")\s*,\s*defval\s*=\s*(\d+)\s*\)/g, 'input.int($2, $1)')
            .replace(/\bperiod\b/g, 'timeframe.period')
            .replace(/\bsecurity\s*\(/g, 'request.security(')
            .replace(/\bwma\s*\(/g, 'ta.wma(')
            .replace(/\bsma\s*\(/g, 'ta.sma(')
            .replace(/\bema\s*\(/g, 'ta.ema(')
            .replace(/\bsign\s*\(/g, 'math.sign(')
            .replace(/color\s*\(\s*green\s*,\s*(\d+)\s*\)/g, 'color.new(#26a69a, $1)')
            .replace(/color\s*\(\s*red\s*,\s*(\d+)\s*\)/g, 'color.new(#ef5350, $1)')
            .replace(/linestyle\s*=\s*dashed/g, 'linestyle=hline.style_dashed')
            .replace(/hline\s*\(\s*price\s*=\s*0/g, 'hline(0');
    }

    // Enhance MRS script with zero baseline style controls if missing
    if ((code.includes('calc_mrs') || code.includes('mrs_index')) && !code.includes('show_zero')) {
        code = code.replace(/val\s*=\s*close/m, 'show_zero = input.bool(true, "Zero baseline", group="Style", inline="zero")\ncol_zero = input.color(#7e57c2, "", group="Style", inline="zero")\nwidth_zero = input.int(1, "Width", minval=1, maxval=5, group="Style", inline="zero")\nval = close');
        if (!code.includes('plot(show_zero')) {
            code = code.replace(/(plot\([^)]*mrs_industry[^)]*\)[^\n]*)/, '$1\nplot(show_zero ? 0.0 : na, "Zero baseline", color=col_zero, linewidth=width_zero)\nhline(0, "Zero baseline", color=#7e57c2, linestyle=hline.style_solid)');
        }
    }
    return code;
}

interface SavedPineScript {
    id: string;
    title: string;
    code: string;
    updatedAt: number;
    isDefault?: boolean;
}

const SAVED_SCRIPTS_KEY = 'vela-terminal-saved-pine-scripts-v2';
const ACTIVE_SCRIPT_ID_KEY = 'vela-terminal-active-pine-script-id-v2';

function getDefaultScripts(): SavedPineScript[] {
    const legacyCode = localStorage.getItem(SCRIPT_STORAGE_KEY);
    const hasLegacyCustom = legacyCode && !legacyCode.includes('runtime.error') && legacyCode.includes('TF Demand');
    return [
        {
            id: 'all-in-one',
            title: 'All in One (Demand/Supply)',
            code: hasLegacyCustom ? legacyCode : PINE_TEMPLATES.userAllInOne,
            updatedAt: Date.now(),
            isDefault: true,
        },
        {
            id: 'mrs',
            title: 'Mansfield Relative Strength (MRS)',
            code: PINE_TEMPLATES.mrs,
            updatedAt: Date.now() - 3600000,
            isDefault: true,
        },
        {
            id: 'ema-cross',
            title: 'EMA Cross (v5)',
            code: PINE_TEMPLATES.emaCross,
            updatedAt: Date.now() - 7200000,
        },
        {
            id: 'rsi-oscillator',
            title: 'RSI Oscillator',
            code: PINE_TEMPLATES.rsi,
            updatedAt: Date.now() - 10800000,
        },
    ];
}

function loadSavedScripts(): SavedPineScript[] {
    try {
        const raw = localStorage.getItem(SAVED_SCRIPTS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        }
    } catch {
        // Fall back to defaults
    }
    const def = getDefaultScripts();
    saveSavedScripts(def);
    return def;
}

function saveSavedScripts(scripts: SavedPineScript[]): void {
    localStorage.setItem(SAVED_SCRIPTS_KEY, JSON.stringify(scripts));
}

let savedScripts = loadSavedScripts();
let activeScriptId = localStorage.getItem(ACTIVE_SCRIPT_ID_KEY) || savedScripts[0].id;
if (!savedScripts.some((s) => s.id === activeScriptId)) {
    activeScriptId = savedScripts[0].id;
}
let activeScript = savedScripts.find((s) => s.id === activeScriptId)!;
let activeScriptOriginalCode = activeScript.code;

// 3. Robust Script Application and Indicator Synchronizer
let isCompiling = false;

async function applyScript(
    scriptCode: string,
    targetId?: string,
    targetChart?: any,
    overrideInputs?: Record<string, any>
): Promise<{ ok: boolean; title?: string; error?: string }> {
    const raw = scriptCode.trim();
    if (!raw) return { ok: false, error: 'Empty script' };
    const sanitizedScript = sanitizePineScript(raw);
    const isMRS = targetId === MRS_INDICATOR_ID || raw.includes('Mansfield') || raw.includes('MRS');
    const id = targetId ?? (isMRS ? MRS_INDICATOR_ID : ALL_IN_ONE_ID);

    const savedState = getSavedIndicatorState();
    const existingInputs = overrideInputs ?? (savedState?.allInputs?.[id] ?? (id === ALL_IN_ONE_ID ? savedState?.inputs : undefined));

    let timerId: ReturnType<typeof setTimeout> | null = null;
    const compileTimeout = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => reject(new Error('Compilation timed out after 15s')), 15000);
    });

    try {
        const c = targetChart ?? ws.chart;
        const existing = c.indicators().find((h: any) => h.id === id);
        if (existing) {
            if (existing.source === sanitizedScript) {
                // If the script code is already running, just update inputs / styling if changed
                if (existingInputs && Object.keys(existingInputs).length > 0) {
                    try {
                        const curStr = JSON.stringify(existing.inputValues() || {});
                        const newStr = JSON.stringify(existingInputs);
                        if (curStr !== newStr) {
                            existing.setInputs(existingInputs);
                        }
                    } catch {
                        // ignore
                    }
                }
                return { ok: true, title: existing.title || 'Pine Script Indicator' };
            }
            try {
                existing.remove();
            } catch {
                // Ignore removal failure
            }
        }

        const runPromise = c.runIndicator(sanitizedScript, {
            id,
            language: 'pine',
            inputs: existingInputs,
        });

        const result = await Promise.race([runPromise, compileTimeout]);
        if (timerId) clearTimeout(timerId);

        if (result.ok) {
            return { ok: true, title: result.handle?.title || 'Pine Script Indicator' };
        } else {
            return { ok: false, error: result.error?.message || 'Unknown error' };
        }
    } catch (err: any) {
        if (timerId) clearTimeout(timerId);
        return { ok: false, error: err?.message || String(err) };
    }
}

let isSyncingLayout = false;
let isSyncingInputs = false;
let globalSyncInputsTimeout: ReturnType<typeof setTimeout> | null = null;
let globalSaveStorageTimeout: ReturnType<typeof setTimeout> | null = null;
let syncLayoutDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function triggerSyncAllIndicatorsAcrossLayout(delay = 120): void {
    if (syncLayoutDebounceTimer) clearTimeout(syncLayoutDebounceTimer);
    syncLayoutDebounceTimer = setTimeout(() => {
        void syncAllIndicatorsAcrossLayout();
    }, delay);
}

/**
 * Copies and synchronizes all indicators, Pine scripts, and custom settings
 * from the primary chart (Chart 1) across all layout cells (2, 3, 4 panes).
 */
async function syncAllIndicatorsAcrossLayout(): Promise<void> {
    if (isSyncingLayout) return;
    isSyncingLayout = true;
    showCalculatingIndicator('Updating Indicator...');
    try {
        const cells = ws.cells();
        if (cells.length === 0) return;

        // Cell 0 is the primary / first chart
        const primaryCell = cells[0];
        const primaryChart = primaryCell.chart;
        const activeStyle = primaryCell.priceStyle || ws.active?.priceStyle || 'candles';

        interface IndicatorSpec {
            id: string;
            source: string;
            inputs?: Record<string, any>;
        }
        const specsToApply: IndicatorSpec[] = [];
        const savedState = getSavedIndicatorState();

        // 1. Gather all indicators that belong on the layout from primary chart
        const primaryHandles = primaryChart.indicators();
        if (primaryHandles.length > 0) {
            for (const h of primaryHandles) {
                let code = h.source;
                if (!code) {
                    if (h.id === ALL_IN_ONE_ID || h.id === 'all-in-one') {
                        code = ((window as any).terminalEditor ? (window as any).terminalEditor.getValue().trim() : '') ||
                            savedScripts.find((s) => s.id === 'all-in-one')?.code ||
                            PINE_TEMPLATES.userAllInOne;
                    } else if (h.id === MRS_INDICATOR_ID || h.id === 'mrs') {
                        code = savedScripts.find((s) => s.id === 'mrs')?.code || PINE_TEMPLATES.mrs;
                    } else if (activeScript && h.id === activeScript.id) {
                        code = ((window as any).terminalEditor ? (window as any).terminalEditor.getValue().trim() : '') || activeScript.code;
                    } else {
                        const found = savedScripts.find((s) => s.id === h.id);
                        if (found) code = found.code;
                    }
                }
                if (code) {
                    const inputs = h.inputValues() || savedState?.allInputs?.[h.id] || (h.id === ALL_IN_ONE_ID ? savedState?.inputs : undefined);
                    specsToApply.push({ id: h.id, source: code, inputs });
                }
            }
        }

        // If primary chart had no indicators yet, populate from saved defaults
        if (specsToApply.length === 0) {
            const defaultAllInOne = savedScripts.find((s) => s.id === 'all-in-one') || activeScript;
            specsToApply.push({
                id: ALL_IN_ONE_ID,
                source: defaultAllInOne.code,
                inputs: savedState?.allInputs?.[ALL_IN_ONE_ID] ?? savedState?.inputs,
            });
            const mrsScript = savedScripts.find((s) => s.id === 'mrs') || { code: PINE_TEMPLATES.mrs };
            specsToApply.push({
                id: MRS_INDICATOR_ID,
                source: mrsScript.code,
                inputs: savedState?.allInputs?.[MRS_INDICATOR_ID],
            });
        }

        // 2. Apply to EVERY cell in the layout (including new columns/panes) simultaneously
        await Promise.all(
            cells.map(async (cell) => {
                // Inherit price style (Candles, Heikin Ashi, etc.)
                if (activeStyle && typeof cell.setPriceStyle === 'function' && cell.priceStyle !== activeStyle) {
                    cell.setPriceStyle(activeStyle);
                }

                await cell.chart.ready().catch(() => {});

                for (const spec of specsToApply) {
                    await applyScript(spec.source, spec.id, cell.chart, spec.inputs);
                }
            })
        );
    } finally {
        isSyncingLayout = false;
        hideCalculatingIndicator(250);
        focusCMP();
    }
}

// Smooth TradingView-style Non-blocking Calculating Indicator
const calculatingIndicator = document.getElementById('chart-calculating-indicator');
let calcHideTimeout: ReturnType<typeof setTimeout> | null = null;
let calcAutoDismissTimeout: ReturnType<typeof setTimeout> | null = null;

function showCalculatingIndicator(label = 'Calculating...') {
    if (calcHideTimeout) clearTimeout(calcHideTimeout);
    if (calcAutoDismissTimeout) clearTimeout(calcAutoDismissTimeout);
    if (calculatingIndicator) {
        const textEl = document.getElementById('chart-calc-text');
        if (textEl) textEl.textContent = label;
        calculatingIndicator.classList.add('visible');
    }
    // Hard safety guard: Never allow the calculating indicator to remain indefinitely visible
    calcAutoDismissTimeout = setTimeout(() => {
        hideCalculatingIndicator(0);
    }, 4000);
}

function hideCalculatingIndicator(delayMs = 250) {
    if (calcHideTimeout) clearTimeout(calcHideTimeout);
    if (calcAutoDismissTimeout) clearTimeout(calcAutoDismissTimeout);
    calcHideTimeout = setTimeout(() => {
        if (calculatingIndicator) {
            calculatingIndicator.classList.remove('visible');
        }
    }, delayMs);
}

// 4. Wire cell events, live prices, and input persistence
function wireCellEvents(cellChart: any): void {
    cellChart.on('bar', (bar: any) => {
        if (cellChart === ws.chart && bar && bar.close != null) {
            updateTabTitle(bar.close);
        }
    });

    cellChart.on('market:changed', (e: any) => {
        if (cellChart === ws.chart) {
            lastPrice = null;
            updateTabTitle(null, e.symbol);
        }
    });

    cellChart.on('load:start', () => {
        showCalculatingIndicator('Loading Market Data...');
    });

    cellChart.on('load:end', (e: any) => {
        hideCalculatingIndicator(150);
        if (cellChart === ws.chart) {
            updateTabTitle(null, e.symbol);
        }
    });

    cellChart.on('indicator:model', () => {
        hideCalculatingIndicator(150);
    });

    // Synchronize indicator input/styling edits across ALL layout cells (debounced smoothly)
    cellChart.on('indicator:inputs', ({ id }: { id: string }) => {
        // Prevent recursive cascading broadcast loops when already syncing
        if (isSyncingLayout || isSyncingInputs) {
            return;
        }

        const handle = cellChart.indicators().find((h: any) => h.id === id);
        if (!handle) {
            hideCalculatingIndicator(150);
            return;
        }

        const currentInputs = handle.inputValues();
        if (!currentInputs) {
            hideCalculatingIndicator(150);
            return;
        }

        showCalculatingIndicator('Updating Indicator...');

        if (globalSaveStorageTimeout) clearTimeout(globalSaveStorageTimeout);
        globalSaveStorageTimeout = setTimeout(() => {
            const saved = getSavedIndicatorState() || { applied: true, allInputs: {} };
            saved.allInputs ??= {};
            saved.allInputs[id] = currentInputs;
            if (id === ALL_IN_ONE_ID) saved.inputs = currentInputs;
            localStorage.setItem(INDICATOR_STATE_KEY, JSON.stringify(saved));
        }, 300);

        // Replicate this updated styling/inputs to all other cells after debounce
        if (globalSyncInputsTimeout) clearTimeout(globalSyncInputsTimeout);
        globalSyncInputsTimeout = setTimeout(() => {
            isSyncingInputs = true;
            try {
                const currentStr = JSON.stringify(currentInputs);
                for (const cell of ws.cells()) {
                    if (cell.chart !== cellChart) {
                        const h = cell.chart.indicators().find((item: any) => item.id === id);
                        if (h) {
                            try {
                                const otherStr = JSON.stringify(h.inputValues() || {});
                                if (otherStr !== currentStr) {
                                    h.setInputs(currentInputs);
                                }
                            } catch {
                                // ignore
                            }
                        }
                    }
                }
            } finally {
                isSyncingInputs = false;
                hideCalculatingIndicator(250);
            }
        }, 600);
    });

    cellChart.on('indicator:removed', ({ id }: { id: string }) => {
        const existing = getSavedIndicatorState() || { applied: false, allInputs: {} };
        if (existing.allInputs) delete existing.allInputs[id];
        if (id === ALL_IN_ONE_ID) existing.applied = false;
        localStorage.setItem(INDICATOR_STATE_KEY, JSON.stringify(existing));

        // Sync removal across all cells
        for (const cell of ws.cells()) {
            if (cell.chart !== cellChart) {
                const h = cell.chart.indicators().find((item: any) => item.id === id);
                if (h) {
                    try {
                        h.remove();
                    } catch {
                        // ignore
                    }
                }
            }
        }
    });
}

// Wire the active chart immediately
wireCellEvents(ws.chart);

// When new cells are created (e.g. 2h, 3, 4 layout), wire them and sync indicators
ws.on('cell:created', ({ id }) => {
    const cell = ws.cell(id);
    if (cell) {
        wireCellEvents(cell.chart);
        triggerSyncAllIndicatorsAcrossLayout(100);
    }
});

// When layout changes, ensure every cell in the new grid carries the indicators and styling
ws.on('layout:changed', () => {
    triggerSyncAllIndicatorsAcrossLayout(120);
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        focusCMP();
    }, 200);
});

ws.on('cell:active', () => {
    lastPrice = null;
    updateTabTitle();
});

void ws.chart.ready().then(() => {
    updateTabTitle();
});

setInterval(() => {
    updateTabTitle();
}, 1000);

// 2. Setup CMP Auto Zoom in Header
function focusCMP(): void {
    try {
        for (const cell of ws.cells()) {
            try {
                cell.chart.renderer.set('autoScale', true);
                if (typeof cell.chart.fitContent === 'function') {
                    cell.chart.fitContent();
                }
                cell.chart.panBy(0);
            } catch {
                // Ignore if cell renderer not ready
            }
        }
    } catch {
        // Ignore if workspace not ready
    }
}

const focusCmpBtn = document.getElementById('focus-cmp-btn');
focusCmpBtn?.addEventListener('click', focusCMP);

// 3. Setup FYERS Auth Status Check, Modal & Fullscreen Login Screen
const authBtn = document.getElementById('fyers-auth-btn')!;
const statusDot = document.getElementById('status-indicator')!;
const statusLabel = document.getElementById('status-label')!;
const authModal = document.getElementById('auth-modal')!;
const closeModalBtn = document.getElementById('close-modal-btn')!;
const saveTokenBtn = document.getElementById('save-token-btn')!;
const manualTokenInput = document.getElementById('manual-token-input') as HTMLInputElement;

// Onboarding & Authentication Controls
const loginScreen = document.getElementById('login-screen')!;
const screenStatusBadge = document.getElementById('screen-status-badge');
const screenStatusText = document.getElementById('screen-status-text');

// Step 1 Elements
const step1Card = document.getElementById('step1-card');
const step1Tag = document.getElementById('step1-tag');
const openFyersDashBtn = document.getElementById('open-fyers-dash-btn');
const step1UserIp = document.getElementById('step1-user-ip');
const step1CopyIpBtn = document.getElementById('step1-copy-ip-btn');
const step1CopyRedirectBtn = document.getElementById('step1-copy-redirect-btn');

// Step 2 & Timeline Step 4 Elements
const step2Card = document.getElementById('step2-card');
const step2Tag = document.getElementById('step2-tag');
const timelineStep4 = document.getElementById('timeline-step-4');
const screenAppIdInput = document.getElementById('screen-app-id') as HTMLInputElement | null;
const screenSecretKeyInput = document.getElementById('screen-secret-key') as HTMLInputElement | null;
const screenSaveCredsBtn = document.getElementById('screen-save-creds-btn') as HTMLButtonElement | null;
const step2Feedback = document.getElementById('step2-feedback');

// Step 3 & Timeline Step 5 Elements
const step3Card = document.getElementById('step3-card');
const step3Tag = document.getElementById('step3-tag');
const timelineStep5 = document.getElementById('timeline-step-5');
const screenLoginBtn = document.getElementById('screen-login-btn') as HTMLButtonElement | null;
const screenWaitingNotice = document.getElementById('screen-waiting-notice');
const reopenBrowserBtn = document.getElementById('reopen-browser-btn');
const oauthLoginLink = document.getElementById('oauth-login-link');

// Manual Token Fallback
const screenTokenInput = document.getElementById('screen-token-input') as HTMLInputElement | null;
const screenTokenBtn = document.getElementById('screen-token-btn');

// Session state: Step 4 is only considered saved if user enters credentials and saves them in this session
let isStep4SavedInSession = false;

// Header Logout Button & Confirmation Dialog Controls
const headerLogoutBtn = document.getElementById('header-logout-btn');
const logoutConfirmModal = document.getElementById('logout-confirm-modal');
const cancelLogoutBtn = document.getElementById('cancel-logout-btn');
const confirmLogoutBtn = document.getElementById('confirm-logout-btn');

headerLogoutBtn?.addEventListener('click', () => {
    logoutConfirmModal?.classList.add('open');
});

cancelLogoutBtn?.addEventListener('click', () => {
    logoutConfirmModal?.classList.remove('open');
});

logoutConfirmModal?.addEventListener('click', (e) => {
    if (e.target === logoutConfirmModal) {
        logoutConfirmModal.classList.remove('open');
    }
});

const onStep4InputChange = () => {
    isStep4SavedInSession = false;
    step2Card?.classList.remove('completed');
    timelineStep4?.classList.remove('completed');
    if (step2Tag) step2Tag.textContent = 'Action Required';

    step3Card?.classList.add('locked');
    step3Card?.classList.remove('active');
    timelineStep5?.classList.remove('active');
    timelineStep5?.classList.remove('completed');
    if (step3Tag) step3Tag.textContent = 'Awaiting Step 4';
    if (screenLoginBtn) {
        screenLoginBtn.setAttribute('disabled', 'true');
        screenLoginBtn.classList.add('disabled');
        screenLoginBtn.style.opacity = '0.45';
        screenLoginBtn.style.pointerEvents = 'none';
    }
};
screenAppIdInput?.addEventListener('input', onStep4InputChange);
screenSecretKeyInput?.addEventListener('input', onStep4InputChange);

function openExternalUrl(url: string) {
    const desktopApi = (window as unknown as { velaDesktop?: { openExternal?: (url: string) => void } }).velaDesktop;
    if (desktopApi?.openExternal) {
        desktopApi.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
}

function openFyersOAuthLogin(e?: Event) {
    if (e) e.preventDefault();
    const loginUrl = 'http://127.0.0.1:5000/api/auth/login';
    if (screenWaitingNotice) {
        screenWaitingNotice.style.display = 'block';
    }
    openExternalUrl(loginUrl);
}

screenLoginBtn?.addEventListener('click', openFyersOAuthLogin);
oauthLoginLink?.addEventListener('click', openFyersOAuthLogin);
reopenBrowserBtn?.addEventListener('click', openFyersOAuthLogin);

openFyersDashBtn?.addEventListener('click', () => {
    openExternalUrl('https://fyers.in/web/api-dashboard/user-apps');
});

// Auto-detect User's Public IP for FYERS Primary IP address field
async function detectUserIp() {
    if (!step1UserIp) return;
    try {
        const res = await fetch('https://api.ipify.org?format=json');
        if (res.ok) {
            const data = (await res.json()) as { ip?: string };
            if (data.ip && step1UserIp) {
                step1UserIp.textContent = data.ip;
                step1UserIp.setAttribute('data-ip', data.ip);
            }
        }
    } catch {
        if (step1UserIp) {
            step1UserIp.textContent = 'Check your public IP via whatismyip.com';
        }
    }
}

void detectUserIp();

step1CopyIpBtn?.addEventListener('click', () => {
    const ip = step1UserIp?.getAttribute('data-ip') || step1UserIp?.textContent?.trim() || '';
    if (ip && !ip.startsWith('Check') && !ip.startsWith('Detecting')) {
        void navigator.clipboard.writeText(ip).then(() => {
            if (step1CopyIpBtn) {
                const originalText = step1CopyIpBtn.textContent;
                step1CopyIpBtn.textContent = 'Copied!';
                step1CopyIpBtn.style.background = '#10b981';
                setTimeout(() => {
                    step1CopyIpBtn.textContent = originalText;
                    step1CopyIpBtn.style.background = '';
                }, 2000);
            }
        });
    } else {
        openExternalUrl('https://api.ipify.org');
    }
});

step1CopyRedirectBtn?.addEventListener('click', () => {
    const url = 'http://127.0.0.1:5000/api/auth/callback';
    void navigator.clipboard.writeText(url).then(() => {
        if (step1CopyRedirectBtn) {
            const originalText = step1CopyRedirectBtn.textContent;
            step1CopyRedirectBtn.textContent = 'Copied!';
            step1CopyRedirectBtn.style.background = '#10b981';
            step1CopyRedirectBtn.style.borderColor = '#10b981';
            setTimeout(() => {
                step1CopyRedirectBtn.textContent = originalText;
                step1CopyRedirectBtn.style.background = '';
                step1CopyRedirectBtn.style.borderColor = '';
            }, 2000);
        }
    }).catch(() => {
        alert(`Redirect URL:\n${url}`);
    });
});

function setLoginScreenVisible(visible: boolean) {
    if (loginScreen) {
        if (visible) {
            loginScreen.classList.add('visible');
            if (headerLogoutBtn) {
                headerLogoutBtn.classList.remove('visible');
                headerLogoutBtn.style.display = 'none';
            }
        } else {
            loginScreen.classList.remove('visible');
            if (headerLogoutBtn && wasAuthenticated) {
                headerLogoutBtn.classList.add('visible');
                headerLogoutBtn.style.display = 'inline-flex';
            }
        }
    }
}

let consecutiveOfflineCount = 0;
let wasAuthenticated: boolean | null = null;
let isReloadingOnAuth = false;

/**
 * Force-reloads all charts and re-syncs Pine Script indicators across the entire workspace.
 * Called automatically when FYERS authentication succeeds (e.g. after completing onboarding or token input).
 */
async function reloadChartsAndIndicators(): Promise<void> {
    if (isReloadingOnAuth) return;
    isReloadingOnAuth = true;
    console.log('[terminal] FYERS connected: Reloading market data & Pine Scripts across all chart cells...');
    try {
        currentFyersProvider?.clearCache();
        const cells = ws.cells();
        await Promise.all(
            cells.map(async (cell) => {
                try {
                    await cell.chart.setMarket({ force: true });
                } catch (err) {
                    console.warn('[terminal] Failed reloading cell market:', err);
                }
            })
        );
        window.dispatchEvent(new Event('resize'));
        await ws.chart.ready().catch(() => {});

        setTimeout(async () => {
            try {
                await syncAllIndicatorsAcrossLayout();
                focusCMP();
            } catch (err) {
                console.warn('[terminal] Failed syncing indicators after market reload:', err);
            } finally {
                isReloadingOnAuth = false;
            }
        }, 300);
    } catch (err) {
        console.warn('[terminal] reloadChartsAndIndicators error:', err);
        isReloadingOnAuth = false;
    }
}

async function checkFyersStatus() {
    try {
        const res = await fetch('http://127.0.0.1:5000/api/auth/status');
        if (res.ok) {
            const data = await res.json();
            if (data.authenticated) {
                consecutiveOfflineCount = 0;
                statusDot.className = 'status-dot online';
                statusLabel.textContent = 'FYERS: Authenticated';
                if (screenWaitingNotice) screenWaitingNotice.style.display = 'none';
                setLoginScreenVisible(false);
                if (headerLogoutBtn) {
                    headerLogoutBtn.classList.add('visible');
                    headerLogoutBtn.style.display = 'inline-flex';
                }

                // If user just authenticated (transitioned from unauthenticated -> authenticated),
                // immediately reload all charts & Pine Scripts with live data!
                if (wasAuthenticated === false) {
                    console.log('[terminal] First-time authentication detected! Refreshing terminal charts...');
                    void reloadChartsAndIndicators();
                }
                wasAuthenticated = true;
            } else {
                wasAuthenticated = false;
                statusDot.className = 'status-dot';
                if (headerLogoutBtn) {
                    headerLogoutBtn.classList.remove('visible');
                    headerLogoutBtn.style.display = 'none';
                }

                const hasInputs = Boolean(screenAppIdInput?.value.trim() && screenSecretKeyInput?.value.trim());
                if (!isStep4SavedInSession || !hasInputs) {
                    statusLabel.textContent = 'FYERS: Credentials Not Configured';
                    if (screenStatusText) screenStatusText.textContent = 'Step 4: Configure FYERS API Credentials';
                    screenStatusBadge?.classList.remove('configured');
                    
                    // Step 4 needs action
                    step2Card?.classList.remove('completed');
                    timelineStep4?.classList.remove('completed');
                    if (step2Tag) step2Tag.textContent = 'Action Required';

                    // Step 5 locked & strictly disabled
                    step3Card?.classList.add('locked');
                    step3Card?.classList.remove('active');
                    timelineStep5?.classList.remove('active');
                    timelineStep5?.classList.remove('completed');
                    if (step3Tag) step3Tag.textContent = 'Awaiting Step 4';
                    if (screenLoginBtn) {
                        screenLoginBtn.setAttribute('disabled', 'true');
                        screenLoginBtn.classList.add('disabled');
                        screenLoginBtn.style.opacity = '0.45';
                        screenLoginBtn.style.pointerEvents = 'none';
                    }
                } else {
                    statusLabel.textContent = 'FYERS: Login Required (Session Expired)';
                    if (screenStatusText) screenStatusText.textContent = 'Step 5: Ready to Log in with FYERS';
                    screenStatusBadge?.classList.add('configured');

                    // Step 1, 2, 3, 4 completed
                    if (step1Tag) step1Tag.textContent = 'Configured ✓';
                    step2Card?.classList.add('completed');
                    timelineStep4?.classList.add('completed');
                    if (step2Tag) step2Tag.textContent = 'Saved ✓';

                    // Step 5 unlocked and active
                    step3Card?.classList.remove('locked');
                    step3Card?.classList.add('active');
                    timelineStep5?.classList.add('active');
                    if (step3Tag) step3Tag.textContent = 'Ready to Connect';
                    if (screenLoginBtn) {
                        screenLoginBtn.removeAttribute('disabled');
                        screenLoginBtn.classList.remove('disabled');
                        screenLoginBtn.style.opacity = '1';
                        screenLoginBtn.style.pointerEvents = 'auto';
                    }
                }
                setLoginScreenVisible(true);
            }
        } else {
            consecutiveOfflineCount++;
            if (consecutiveOfflineCount >= 3) {
                if (headerLogoutBtn) {
                    headerLogoutBtn.classList.remove('visible');
                    headerLogoutBtn.style.display = 'none';
                }
                statusDot.className = 'status-dot';
                statusLabel.textContent = 'FYERS: Service Unavailable';
                setLoginScreenVisible(true);
            }
        }
    } catch {
        consecutiveOfflineCount++;
        if (consecutiveOfflineCount >= 3) {
            if (headerLogoutBtn) {
                headerLogoutBtn.classList.remove('visible');
                headerLogoutBtn.style.display = 'none';
            }
            statusDot.className = 'status-dot';
            statusLabel.textContent = 'FYERS: Local Proxy Offline';
            setLoginScreenVisible(true);
        }
    }
}

void checkFyersStatus();
setInterval(checkFyersStatus, 2000);

async function saveApiCredentials(appId: string, secretKey: string, feedbackEl?: HTMLElement | null) {
    const aid = appId.trim();
    const sec = secretKey.trim();
    if (!aid || !sec) {
        if (feedbackEl) {
            feedbackEl.className = 'step-feedback error';
            feedbackEl.textContent = 'Please enter both App ID and Secret Key.';
            feedbackEl.style.display = 'block';
        } else {
            alert('Please enter both App ID and Secret Key.');
        }
        return;
    }
    try {
        const res = await fetch('http://127.0.0.1:5000/api/auth/configure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appId: aid, secretKey: sec }),
        });
        if (res.ok) {
            isStep4SavedInSession = true;
            if (feedbackEl) {
                feedbackEl.className = 'step-feedback success';
                feedbackEl.textContent = '✓ Credentials saved successfully! Step 5 is now unlocked.';
                feedbackEl.style.display = 'block';
            } else {
                alert('FYERS API credentials saved successfully!');
            }
            // Unlock Step 5 right away for instant responsiveness
            step2Card?.classList.add('completed');
            timelineStep4?.classList.add('completed');
            if (step2Tag) step2Tag.textContent = 'Saved ✓';
            step3Card?.classList.remove('locked');
            step3Card?.classList.add('active');
            timelineStep5?.classList.add('active');
            if (step3Tag) step3Tag.textContent = 'Ready to Connect';
            if (screenLoginBtn) {
                screenLoginBtn.removeAttribute('disabled');
                screenLoginBtn.classList.remove('disabled');
                screenLoginBtn.style.opacity = '1';
                screenLoginBtn.style.pointerEvents = 'auto';
            }
            await checkFyersStatus();
        } else {
            const err = await res.json().catch(() => ({}));
            const msg = `Failed to save credentials: ${err.error || res.statusText}`;
            if (feedbackEl) {
                feedbackEl.className = 'step-feedback error';
                feedbackEl.textContent = msg;
                feedbackEl.style.display = 'block';
            } else {
                alert(msg);
            }
        }
    } catch (err) {
        const msg = `Failed to connect to proxy: ${err}`;
        if (feedbackEl) {
            feedbackEl.className = 'step-feedback error';
            feedbackEl.textContent = msg;
            feedbackEl.style.display = 'block';
        } else {
            alert(msg);
        }
    }
}

screenSaveCredsBtn?.addEventListener('click', () => {
    if (screenAppIdInput && screenSecretKeyInput) {
        void saveApiCredentials(screenAppIdInput.value, screenSecretKeyInput.value, step2Feedback);
    }
});

const modalAppIdInput = document.getElementById('modal-app-id') as HTMLInputElement | null;
const modalSecretKeyInput = document.getElementById('modal-secret-key') as HTMLInputElement | null;
const modalSaveCredsBtn = document.getElementById('modal-save-creds-btn');
const modalLogoutBtn = document.getElementById('modal-logout-btn');

async function performLogout() {
    isStep4SavedInSession = false;
    try {
        logoutConfirmModal?.classList.remove('open');
        authModal?.classList.remove('open');
        await fetch('http://127.0.0.1:5000/api/auth/logout', { method: 'POST' });
    } catch (err) {
        console.warn('[terminal] Logout API call error:', err);
    }
    currentFyersProvider?.clearCache();
    wasAuthenticated = false;
    statusDot.className = 'status-dot';
    statusLabel.textContent = 'FYERS: Logged Out';

    if (headerLogoutBtn) {
        headerLogoutBtn.classList.remove('visible');
        headerLogoutBtn.style.display = 'none';
    }

    if (screenAppIdInput) screenAppIdInput.value = '';
    if (screenSecretKeyInput) screenSecretKeyInput.value = '';
    if (step2Feedback) {
        step2Feedback.style.display = 'none';
        step2Feedback.textContent = '';
    }

    step2Card?.classList.remove('completed');
    timelineStep4?.classList.remove('completed');
    if (step2Tag) step2Tag.textContent = 'Action Required';

    step3Card?.classList.add('locked');
    step3Card?.classList.remove('active');
    timelineStep5?.classList.remove('active');
    timelineStep5?.classList.remove('completed');
    if (step3Tag) step3Tag.textContent = 'Awaiting Step 4';
    if (screenLoginBtn) {
        screenLoginBtn.setAttribute('disabled', 'true');
        screenLoginBtn.classList.add('disabled');
        screenLoginBtn.style.opacity = '0.45';
        screenLoginBtn.style.pointerEvents = 'none';
    }

    setLoginScreenVisible(true);
    await checkFyersStatus();
}

confirmLogoutBtn?.addEventListener('click', () => {
    void performLogout();
});

modalLogoutBtn?.addEventListener('click', () => {
    logoutConfirmModal?.classList.add('open');
});

modalSaveCredsBtn?.addEventListener('click', () => {
    if (modalAppIdInput && modalSecretKeyInput) {
        void saveApiCredentials(modalAppIdInput.value, modalSecretKeyInput.value);
    }
});

screenTokenBtn?.addEventListener('click', () => {
    if (screenTokenInput?.value) {
        void submitToken(screenTokenInput.value);
    }
});

async function submitToken(tokenStr: string) {
    const token = tokenStr.trim();
    if (!token) return;
    try {
        const res = await fetch('http://127.0.0.1:5000/api/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        });
        if (res.ok) {
            authModal?.classList.remove('open');
            await checkFyersStatus();
            // Force-reload all charts and Pine Scripts with fresh market data
            void reloadChartsAndIndicators();
        }
    } catch (err) {
        alert(`Failed to save token: ${err}`);
    }
}

authBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    authModal?.classList.add('open');
});
closeModalBtn?.addEventListener('click', () => {
    authModal?.classList.remove('open');
});
authModal?.addEventListener('click', (e) => {
    if (e.target === authModal) {
        authModal.classList.remove('open');
    }
});
saveTokenBtn.addEventListener('click', () => {
    void submitToken(manualTokenInput.value);
});
screenTokenBtn?.addEventListener('click', () => {
    void submitToken(screenTokenInput.value);
});

// 4. Register Pine Script Language in Monaco
monaco.languages.register({ id: 'pinescript' });
monaco.languages.setMonarchTokensProvider('pinescript', {
    keywords: [
        'indicator', 'strategy', 'library', 'if', 'else', 'for', 'to', 'by', 'while',
        'var', 'varip', 'import', 'export', 'type', 'method', 'return',
    ],
    typeKeywords: [
        'int', 'float', 'bool', 'string', 'color', 'line', 'label', 'box', 'table',
    ],
    builtins: [
        'plot', 'plotshape', 'plotchar', 'plotbar', 'plotcandle', 'bgcolor', 'barcolor',
        'hline', 'fill', 'alert', 'alertcondition', 'input', 'input.int', 'input.float',
        'input.bool', 'input.string', 'input.color', 'input.source', 'input.timeframe',
        'ta.ema', 'ta.sma', 'ta.rsi', 'ta.macd', 'ta.stdev', 'ta.atr', 'ta.crossover',
        'ta.crossunder', 'ta.highest', 'ta.lowest', 'ta.vwap',
        'math.abs', 'math.max', 'math.min', 'math.round', 'math.sqrt',
        'color.blue', 'color.orange', 'color.green', 'color.red', 'color.yellow',
        'color.purple', 'color.teal', 'color.gray', 'color.white', 'color.black',
    ],
    constants: ['true', 'false', 'na', 'close', 'open', 'high', 'low', 'volume', 'time', 'hl2', 'hlc3', 'ohlc4'],
    tokenizer: {
        root: [
            [/\/\/.*$/, 'comment'],
            [/\/\*/, 'comment', '@comment'],
            [/"([^"\\]|\\.)*"/, 'string'],
            [/'([^'\\]|\\.)*'/, 'string'],
            [/\b\d+(\.\d+)?\b/, 'number'],
            [
                /[a-zA-Z_]\w*(\.[a-zA-Z_]\w*)*/,
                {
                    cases: {
                        '@keywords': 'keyword',
                        '@typeKeywords': 'type',
                        '@builtins': 'predefined',
                        '@constants': 'constant',
                        '@default': 'identifier',
                    },
                },
            ],
            [/[{}()[\]]/, '@brackets'],
            [/[-+/*%=<>!&|]/, 'operator'],
        ],
        comment: [
            [/[^/*]+/, 'comment'],
            [/\*\//, 'comment', '@pop'],
            [/[/*]/, 'comment'],
        ],
    },
});

// 7. Initialize Monaco Editor
const monacoContainer = document.getElementById('monaco-container')!;
const editor = monaco.editor.create(monacoContainer, {
    value: activeScript.code,
    language: 'pinescript',
    theme: 'vs',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    tabSize: 4,
});
(window as any).terminalEditor = editor;

// UI elements
const editorPanel = document.getElementById('editor-panel')!;
const editorConsole = document.getElementById('editor-console')!;
const activeScriptBtn = document.getElementById('active-script-btn')!;
const activeScriptTitleEl = document.getElementById('active-script-title')!;
const activeScriptModifiedEl = document.getElementById('active-script-modified')!;
const openScriptsModalBtn = document.getElementById('open-scripts-modal-btn');
const scriptsLibraryBtn = document.getElementById('scripts-library-btn');
const closeEditorBtn = document.getElementById('close-editor-btn');
const applyScriptBtn = document.getElementById('apply-script-btn')!;
const saveScriptBtn = document.getElementById('save-script-btn');
const headerSaveBtn = document.getElementById('header-save-btn');
const scriptsModal = document.getElementById('scripts-modal')!;
const scriptsModalList = document.getElementById('scripts-modal-list')!;
const closeScriptsModalBtn = document.getElementById('close-scripts-modal-btn');
const modalNewScriptBtn = document.getElementById('modal-new-script-btn');
const scriptTitleDialog = document.getElementById('script-title-dialog')!;
const scriptDialogHeading = document.getElementById('script-dialog-heading')!;
const scriptDialogDesc = document.getElementById('script-dialog-desc')!;
const scriptTitleInput = document.getElementById('script-title-input') as HTMLInputElement;
const scriptDialogCancel = document.getElementById('script-dialog-cancel')!;
const scriptDialogConfirm = document.getElementById('script-dialog-confirm')!;

function updateActiveScriptUI(): void {
    if (activeScriptTitleEl) {
        activeScriptTitleEl.textContent = activeScript.title;
    }
    const isDirty = editor.getValue() !== activeScriptOriginalCode;
    if (activeScriptModifiedEl) {
        if (isDirty) {
            activeScriptModifiedEl.classList.remove('hidden');
        } else {
            activeScriptModifiedEl.classList.add('hidden');
        }
    }
}

updateActiveScriptUI();

// Dirty tracking
editor.onDidChangeModelContent(() => {
    updateActiveScriptUI();
});

// 8. Drawer Toggle & Layout Handling
function openEditorDrawer(): void {
    editorPanel.classList.remove('collapsed');
    setTimeout(() => {
        editor.layout();
        window.dispatchEvent(new Event('resize'));
    }, 50);
}

function closeEditorDrawer(): void {
    editorPanel.classList.add('collapsed');
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 200);
}

closeEditorBtn?.addEventListener('click', closeEditorDrawer);

// Switch Active Script
function switchToScript(id: string, openDrawer = true): void {
    const target = savedScripts.find((s) => s.id === id);
    if (!target) return;
    activeScriptId = id;
    activeScript = target;
    localStorage.setItem(ACTIVE_SCRIPT_ID_KEY, id);
    activeScriptOriginalCode = target.code;
    editor.setValue(target.code);
    updateActiveScriptUI();
    if (openDrawer) {
        openEditorDrawer();
    }
}

// 9. Saved Scripts Library Modal
function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function openScriptsModal(): void {
    renderScriptsList();
    scriptsModal.classList.add('open');
}

function closeScriptsModal(): void {
    scriptsModal.classList.remove('open');
}

function deleteScript(id: string): void {
    if (savedScripts.length <= 1) {
        alert('Cannot delete the last remaining script.');
        return;
    }
    savedScripts = savedScripts.filter((s) => s.id !== id);
    saveSavedScripts(savedScripts);
    if (activeScriptId === id) {
        switchToScript(savedScripts[0].id, false);
    }
    renderScriptsList();
}

function renderScriptsList(): void {
    scriptsModalList.innerHTML = '';
    if (savedScripts.length === 0) {
        scriptsModalList.innerHTML = `
            <div class="scripts-empty-state">
                <p>No saved Pine scripts found.</p>
                <button id="empty-new-script-btn" class="action-btn" style="margin-top:12px;">+ Create New Script</button>
            </div>
        `;
        document.getElementById('empty-new-script-btn')?.addEventListener('click', () => {
            promptNewScript();
        });
        return;
    }

    for (const script of savedScripts) {
        const item = document.createElement('div');
        item.className = `script-item${script.id === activeScriptId ? ' active' : ''}`;

        const isOverlay = script.code.includes('overlay=true') || script.code.includes('overlay = true');
        const badgeType = isOverlay ? 'Overlay' : 'Pane';
        const updatedDate = new Date(script.updatedAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });

        item.innerHTML = `
            <div class="script-item-info">
                <div class="script-item-title">
                    <span>${escapeHtml(script.title)}</span>
                    <span class="script-badge">${badgeType}</span>
                    ${script.id === activeScriptId ? '<span class="script-badge active-badge">Active</span>' : ''}
                </div>
                <div class="script-item-meta">
                    Last modified: ${updatedDate}
                </div>
            </div>
            <div class="script-item-actions">
                <button class="script-item-btn open-btn" title="Open in Pine Editor">
                    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8">
                        <path d="M12 2H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM9 8H7M8 7v2"/>
                    </svg>
                    <span style="margin-left:4px;">Edit</span>
                </button>
                <button class="script-item-btn run-btn" title="Run on Chart" style="color:var(--success);">
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                        <path d="M4 2v12l10-6L4 2z"/>
                    </svg>
                    <span style="margin-left:4px;">Run</span>
                </button>
                ${savedScripts.length > 1
                ? `
                <button class="script-item-btn delete delete-btn" title="Delete Script">
                    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8">
                        <path d="M3 4h10M6 4V2h4v2M5 4v9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4"/>
                    </svg>
                </button>`
                : ''
            }
            </div>
        `;

        item.querySelector('.open-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            closeScriptsModal();
            switchToScript(script.id, true);
        });

        item.addEventListener('click', () => {
            closeScriptsModal();
            switchToScript(script.id, true);
        });

        item.querySelector('.run-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            closeScriptsModal();
            switchToScript(script.id, false);
            void applyCurrentScript();
        });

        item.querySelector('.delete-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Delete Pine script "${script.title}"?`)) {
                deleteScript(script.id);
            }
        });

        scriptsModalList.appendChild(item);
    }
}

openScriptsModalBtn?.addEventListener('click', openScriptsModal);
scriptsLibraryBtn?.addEventListener('click', openScriptsModal);
closeScriptsModalBtn?.addEventListener('click', closeScriptsModal);
modalNewScriptBtn?.addEventListener('click', () => {
    promptNewScript();
});

// 10. Title / Name Dialog Handling
let onDialogConfirm: ((title: string) => void) | null = null;

function showScriptTitleDialog(options: {
    heading: string;
    desc: string;
    initialValue: string;
    confirmLabel: string;
    onConfirm: (title: string) => void;
}): void {
    scriptDialogHeading.textContent = options.heading;
    scriptDialogDesc.textContent = options.desc;
    scriptTitleInput.value = options.initialValue;
    scriptDialogConfirm.textContent = options.confirmLabel;
    onDialogConfirm = options.onConfirm;
    scriptTitleDialog.classList.add('open');
    setTimeout(() => {
        scriptTitleInput.focus();
        scriptTitleInput.select();
    }, 50);
}

function hideScriptTitleDialog(): void {
    scriptTitleDialog.classList.remove('open');
    onDialogConfirm = null;
}

scriptDialogCancel?.addEventListener('click', hideScriptTitleDialog);
scriptDialogConfirm?.addEventListener('click', () => {
    const val = scriptTitleInput.value.trim();
    if (val && onDialogConfirm) {
        onDialogConfirm(val);
    }
    hideScriptTitleDialog();
});
scriptTitleInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        scriptDialogConfirm.click();
    } else if (e.key === 'Escape') {
        hideScriptTitleDialog();
    }
});

function promptNewScript(): void {
    closeScriptsModal();
    showScriptTitleDialog({
        heading: 'Create New Pine Script',
        desc: 'Enter a name for your new Pine Script indicator:',
        initialValue: 'My Custom Indicator',
        confirmLabel: 'Create',
        onConfirm: (title) => {
            const id = 'script_' + Date.now();
            const newScript: SavedPineScript = {
                id,
                title,
                code: `//@version=5\nindicator("${title}", overlay=true)\n\n// Add your Pine Script logic here\nplot(close, "Close", color=color.blue)\n`,
                updatedAt: Date.now(),
            };
            savedScripts.unshift(newScript);
            saveSavedScripts(savedScripts);
            switchToScript(id, true);
        },
    });
}

function promptRenameScript(): void {
    showScriptTitleDialog({
        heading: 'Rename Script',
        desc: 'Enter a new title for this Pine Script:',
        initialValue: activeScript.title,
        confirmLabel: 'Rename',
        onConfirm: (newTitle) => {
            activeScript.title = newTitle;
            activeScript.updatedAt = Date.now();
            saveSavedScripts(savedScripts);
            updateActiveScriptUI();
        },
    });
}

activeScriptBtn?.addEventListener('click', promptRenameScript);

// 11. Save Active Script & Indicator Persistence
function saveActiveScript(): void {
    const currentCode = editor.getValue();
    activeScript.code = currentCode;
    activeScript.updatedAt = Date.now();
    activeScriptOriginalCode = currentCode;
    saveSavedScripts(savedScripts);
    updateActiveScriptUI();

    // Also persist chart indicator inputs
    const allInputs: Record<string, Record<string, any>> = {};
    for (const h of ws.chart.indicators()) {
        try {
            allInputs[h.id] = h.inputValues();
        } catch {
            // ignore
        }
    }

    const state: SavedIndicatorState = {
        applied: true,
        inputs: allInputs[ALL_IN_ONE_ID],
        allInputs,
    };
    localStorage.setItem(INDICATOR_STATE_KEY, JSON.stringify(state));

    editorConsole.className = 'success';
    editorConsole.textContent = `✓ Saved "${activeScript.title}" to library.`;

    const saveLabel = document.getElementById('save-script-label');
    if (saveLabel) {
        saveLabel.textContent = 'Saved ✓';
        setTimeout(() => {
            saveLabel.textContent = 'Save';
        }, 2000);
    }
    const headerSaveText = document.getElementById('header-save-text');
    if (headerSaveText) {
        headerSaveText.textContent = 'Saved ✓';
        setTimeout(() => {
            headerSaveText.textContent = 'Save';
        }, 2000);
    }
}

saveScriptBtn?.addEventListener('click', saveActiveScript);
headerSaveBtn?.addEventListener('click', saveActiveScript);

// Ctrl+S / Cmd+S hotkey
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveActiveScript();
    }
});

async function applyCurrentScript(): Promise<void> {
    if (isCompiling) return;
    const scriptCode = editor.getValue().trim();
    if (!scriptCode) {
        editorConsole.className = 'error';
        editorConsole.textContent = 'Error: Script code cannot be empty.';
        return;
    }

    isCompiling = true;
    const startTime = performance.now();
    editorConsole.className = '';
    editorConsole.textContent = 'Compiling and executing Pine Script...';

    const isMRS = activeScript.id === 'mrs' || scriptCode.includes('Mansfield') || scriptCode.includes('MRS');
    const id = isMRS ? MRS_INDICATOR_ID : activeScript.id === 'all-in-one' ? ALL_IN_ONE_ID : activeScript.id;

    // Apply to the active cell
    const result = await applyScript(scriptCode, id, ws.chart);
    // And propagate to any other visible layout cells
    for (const cell of ws.cells()) {
        if (cell.chart !== ws.chart) {
            void applyScript(scriptCode, id, cell.chart);
        }
    }

    const elapsed = Math.round(performance.now() - startTime);
    if (result.ok) {
        editorConsole.className = 'success';
        const paneInfo = isMRS ? ' (separate bottom pane)' : '';
        editorConsole.textContent = `✓ Successfully applied "${result.title}"${paneInfo} in ${elapsed}ms across all charts.`;
        saveActiveScript();
        focusCMP();
    } else {
        editorConsole.className = 'error';
        editorConsole.textContent = `✗ Compilation error (${elapsed}ms): ${result.error || 'Unknown error'}`;
    }
    isCompiling = false;
}

applyScriptBtn.addEventListener('click', () => {
    saveActiveScript();
    void applyCurrentScript();
});

// Auto-apply indicators on initial load once chart is ready across all layout cells
setTimeout(async () => {
    await syncAllIndicatorsAcrossLayout();
    focusCMP();
}, 1000);

console.log('[vela-terminal] Indian Market Terminal initialized.');
