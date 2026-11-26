import * as monaco from 'monaco-editor';
import { VelaWorkspace } from '../src/workspace';
import { FyersProvider } from '../src/data/providers/fyers';
import { PineEngine } from '@luxalgo/vela-pinets';
import { DemoEngine } from './demo-engine';
import { playgroundStorage } from './persistence';
import { USER_PINESCRIPT } from './user-script';

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
    theme: 'dark',
    autofocus: true,
    persist: 'vela-indian-terminal',
    timezone: 'Asia/Kolkata',
    timeframes: ['1', '5', '15', '30', '60', '120', '240', 'D', 'W', 'M'],
    storage,
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
        right: ['layout', 'actions', 'alerts', 'panels', 'screenshot', 'fullscreen'],
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
    if (/-(A|B|T|Z|XT|X|MT|M|P)$/.test(s) && !s.endsWith('-EQ')) {
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

// Wire live price updates and tab title
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

    cellChart.on('load:end', (e: any) => {
        if (cellChart === ws.chart) {
            updateTabTitle(null, e.symbol);
        }
    });

    cellChart.on('indicator:inputs', ({ id }: { id: string }) => {
        const handle = cellChart.indicators().find((h: any) => h.id === id);
        if (handle) {
            const currentInputs = handle.inputValues();
            const saved = getSavedIndicatorState() || { applied: true, allInputs: {} };
            saved.allInputs ??= {};
            saved.allInputs[id] = currentInputs;
            if (id === ALL_IN_ONE_ID) saved.inputs = currentInputs;
            localStorage.setItem(INDICATOR_STATE_KEY, JSON.stringify(saved));
        }
    });

    cellChart.on('indicator:removed', ({ id }: { id: string }) => {
        const existing = getSavedIndicatorState() || { applied: false, allInputs: {} };
        if (existing.allInputs) delete existing.allInputs[id];
        if (id === ALL_IN_ONE_ID) existing.applied = false;
        localStorage.setItem(INDICATOR_STATE_KEY, JSON.stringify(existing));
    });
}

// Wire the active chart immediately
wireCellEvents(ws.chart);

// Helper to apply current active script & MRS indicators to a chart
async function syncIndicatorsToChart(c: any): Promise<void> {
    const savedState = getSavedIndicatorState();
    const scriptToRun = editor ? editor.getValue().trim() : initialCode;
    const finalAllInOne = scriptToRun || initialCode;
    if (!savedState || savedState.applied !== false) {
        await applyScript(finalAllInOne, ALL_IN_ONE_ID, c);
    }
    await applyScript(PINE_TEMPLATES.mrs, MRS_INDICATOR_ID, c);
}

// Wire any newly created cells when switching layouts (e.g. 2h, 4, 8)
ws.on('cell:created', ({ id }) => {
    const cell = ws.cell(id);
    if (cell) {
        wireCellEvents(cell.chart);
        // Inherit price style (e.g. Heikin Ashi, Candles) from active cell
        const activeStyle = ws.active?.priceStyle || ws.chart?.renderer?.get?.('priceStyle') || 'candles';
        if (activeStyle && typeof cell.setPriceStyle === 'function') {
            cell.setPriceStyle(activeStyle);
        }
        // Automatically apply the indicators and style to the newly minted chart
        void cell.chart.ready().then(async () => {
            await syncIndicatorsToChart(cell.chart);
        });
    }
});

// When layout changes, ensure every cell in the new grid carries the indicators and styling
ws.on('layout:changed', () => {
    const activeStyle = ws.active?.priceStyle;
    for (const cell of ws.cells()) {
        if (activeStyle && typeof cell.setPriceStyle === 'function' && cell.priceStyle !== activeStyle) {
            cell.setPriceStyle(activeStyle);
        }
        void cell.chart.ready().then(async () => {
            const hasAllInOne = cell.chart.indicators().some((h: any) => h.id === ALL_IN_ONE_ID);
            const hasMRS = cell.chart.indicators().some((h: any) => h.id === MRS_INDICATOR_ID);
            if (!hasAllInOne || !hasMRS) {
                await syncIndicatorsToChart(cell.chart);
            }
        });
    }
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
        ws.chart.renderer.set('autoScale', true);
        ws.chart.panBy(0);
    } catch {
        // Ignore if renderer not ready
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

const loginScreen = document.getElementById('login-screen')!;
const screenTokenInput = document.getElementById('screen-token-input') as HTMLInputElement;
const screenTokenBtn = document.getElementById('screen-token-btn')!;

function setLoginScreenVisible(visible: boolean) {
    if (loginScreen) {
        if (visible) {
            loginScreen.classList.add('visible');
        } else {
            loginScreen.classList.remove('visible');
        }
    }
}

let consecutiveOfflineCount = 0;

async function checkFyersStatus() {
    try {
        const res = await fetch('http://127.0.0.1:5000/api/auth/status');
        if (res.ok) {
            const data = await res.json();
            if (data.authenticated) {
                consecutiveOfflineCount = 0;
                statusDot.className = 'status-dot online';
                statusLabel.textContent = 'FYERS: Authenticated';
                setLoginScreenVisible(false);
            } else {
                statusDot.className = 'status-dot';
                statusLabel.textContent = 'FYERS: Login Required (Session Expired)';
                setLoginScreenVisible(true);
            }
        } else {
            consecutiveOfflineCount++;
            if (consecutiveOfflineCount >= 3) {
                statusDot.className = 'status-dot';
                statusLabel.textContent = 'FYERS: Service Unavailable';
                setLoginScreenVisible(true);
            }
        }
    } catch {
        consecutiveOfflineCount++;
        // Don't flash modal on a single transient network glitch
        if (consecutiveOfflineCount >= 3) {
            statusDot.className = 'status-dot';
            statusLabel.textContent = 'FYERS: Local Proxy Offline';
            setLoginScreenVisible(true);
        }
    }
}

void checkFyersStatus();
setInterval(checkFyersStatus, 10000);

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
            // Reload the chart market so fresh data immediately loads
            void ws.chart.setMarket({ symbol: ws.chart.symbol, timeframe: ws.chart.timeframe });
        }
    } catch (err) {
        alert(`Failed to save token: ${err}`);
    }
}

authBtn.addEventListener('click', () => {
    authModal.classList.add('open');
});
closeModalBtn.addEventListener('click', () => {
    authModal.classList.remove('open');
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

// 5. Storage Keys & Initial Setup for TradingView-style Persistence
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

const savedCode = localStorage.getItem(SCRIPT_STORAGE_KEY);
// If savedCode is empty or contains outdated code, automatically use fresh template
const isOutdated = savedCode && (savedCode.includes('runtime.error') || savedCode.includes('import TradingView/ta/10') || !savedCode.includes('TF Demand'));
const initialCode = (!savedCode || isOutdated) ? PINE_TEMPLATES.userAllInOne : savedCode;
if (isOutdated) {
    localStorage.setItem(SCRIPT_STORAGE_KEY, initialCode);
}

// 6. Initialize Monaco Editor
const monacoContainer = document.getElementById('monaco-container')!;
const editor = monaco.editor.create(monacoContainer, {
    value: initialCode,
    language: 'pinescript',
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    tabSize: 4,
});

// Auto-save script text on edits (debounced)
let scriptAutoSaveTimer: ReturnType<typeof setTimeout> | null = null;
editor.onDidChangeModelContent(() => {
    if (scriptAutoSaveTimer) clearTimeout(scriptAutoSaveTimer);
    scriptAutoSaveTimer = setTimeout(() => {
        localStorage.setItem(SCRIPT_STORAGE_KEY, editor.getValue());
    }, 800);
});

// 7. Template Dropdown
const templateSelect = document.getElementById('template-select') as HTMLSelectElement;
templateSelect.addEventListener('change', () => {
    const val = templateSelect.value;
    if (PINE_TEMPLATES[val]) {
        editor.setValue(PINE_TEMPLATES[val]);
        localStorage.setItem(SCRIPT_STORAGE_KEY, PINE_TEMPLATES[val]);
    }
});

// 8. Toggle & Close Editor Panel
const editorPanel = document.getElementById('editor-panel')!;
const toggleEditorBtn = document.getElementById('toggle-editor-btn')!;
const closeEditorBtn = document.getElementById('close-editor-btn')!;
const editorConsole = document.getElementById('editor-console')!;

toggleEditorBtn.addEventListener('click', () => {
    editorPanel.classList.toggle('collapsed');
    editor.layout();
});
closeEditorBtn.addEventListener('click', () => {
    editorPanel.classList.add('collapsed');
});

// 9. Save & Persistence (TradingView-style)
function saveAll(): void {
    const currentCode = editor.getValue();
    localStorage.setItem(SCRIPT_STORAGE_KEY, currentCode);

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
    editorConsole.textContent = '✓ Saved script and chart indicator settings to browser storage.';

    const headerSaveText = document.getElementById('header-save-text');
    if (headerSaveText) {
        headerSaveText.textContent = 'Saved ✓';
        setTimeout(() => {
            headerSaveText.textContent = 'Save';
        }, 2000);
    }
}

const saveScriptBtn = document.getElementById('save-script-btn');
saveScriptBtn?.addEventListener('click', saveAll);

const headerSaveBtn = document.getElementById('header-save-btn');
headerSaveBtn?.addEventListener('click', saveAll);

// Ctrl+S / Cmd+S hotkey
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveAll();
    }
});

// Listen to chart indicator settings/input edits and persist them immediately
ws.chart.on('indicator:inputs', ({ id }) => {
    const handle = ws.chart.indicators().find((h) => h.id === id);
    if (handle) {
        const currentInputs = handle.inputValues();
        const saved = getSavedIndicatorState() || { applied: true, allInputs: {} };
        saved.allInputs ??= {};
        saved.allInputs[id] = currentInputs;
        if (id === ALL_IN_ONE_ID) saved.inputs = currentInputs;
        localStorage.setItem(INDICATOR_STATE_KEY, JSON.stringify(saved));
        console.log(`[terminal] Persisted settings for ${id} to localStorage:`, Object.keys(currentInputs).length, 'values');
    }
});

ws.chart.on('indicator:removed', ({ id }) => {
    const existing = getSavedIndicatorState() || { applied: false, allInputs: {} };
    if (existing.allInputs) delete existing.allInputs[id];
    if (id === ALL_IN_ONE_ID) existing.applied = false;
    localStorage.setItem(INDICATOR_STATE_KEY, JSON.stringify(existing));
    console.log(`[terminal] Indicator ${id} removed; updated state.`);
});

const reloadScriptBtn = document.getElementById('reload-script-btn');
reloadScriptBtn?.addEventListener('click', () => {
    editor.setValue(PINE_TEMPLATES.userAllInOne);
    localStorage.setItem(SCRIPT_STORAGE_KEY, PINE_TEMPLATES.userAllInOne);
    editorConsole.className = 'success';
    editorConsole.textContent = '✓ Reloaded fresh pinescript.txt from disk with visible TradingFinder Demand/Supply zones!';
});

// 10. "Apply to Chart" Execution
const applyScriptBtn = document.getElementById('apply-script-btn')!;
let isCompiling = false;

async function applyScript(scriptCode: string, targetId?: string, targetChart?: any): Promise<{ ok: boolean; title?: string; error?: string }> {
    const raw = scriptCode.trim();
    if (!raw) return { ok: false, error: 'Empty script' };
    const sanitizedScript = sanitizePineScript(raw);
    const isMRS = targetId === MRS_INDICATOR_ID || raw.includes('Mansfield') || raw.includes('MRS');
    const id = targetId ?? (isMRS ? MRS_INDICATOR_ID : ALL_IN_ONE_ID);

    const savedState = getSavedIndicatorState();
    const existingInputs = savedState?.allInputs?.[id] ?? (id === ALL_IN_ONE_ID ? savedState?.inputs : undefined);

    let timerId: ReturnType<typeof setTimeout> | null = null;
    const compileTimeout = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => reject(new Error('Compilation timed out after 15s')), 15000);
    });

    try {
        const c = targetChart ?? ws.chart;
        const existing = c.indicators().find((h: any) => h.id === id);
        if (existing) {
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

    const isMRS = scriptCode.includes('Mansfield') || scriptCode.includes('MRS');
    const id = isMRS ? MRS_INDICATOR_ID : ALL_IN_ONE_ID;

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
        saveAll();
        focusCMP();
    } else {
        editorConsole.className = 'error';
        editorConsole.textContent = `✗ Compilation error (${elapsed}ms): ${result.error || 'Unknown error'}`;
    }
    isCompiling = false;
}

applyScriptBtn.addEventListener('click', () => {
    void applyCurrentScript();
});

// Auto-apply indicators on initial load once chart is ready
setTimeout(async () => {
    const savedState = getSavedIndicatorState();
    if (!savedState || savedState.applied !== false) {
        await applyScript(initialCode, ALL_IN_ONE_ID);
    }
    // Also apply Mansfield Relative Strength (MRS) to the separate bottom pane
    await applyScript(PINE_TEMPLATES.mrs, MRS_INDICATOR_ID);
    focusCMP();
}, 1000);

console.log('[vela-terminal] Indian Market Terminal initialized.');
