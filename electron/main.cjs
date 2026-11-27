const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const http = require('node:http');

let mainWindow = null;
let serverProcess = null;

ipcMain.on('open-external', (_event, url) => {
    if (url && typeof url === 'string') {
        console.log(`[Electron IPC] Opening in system browser: ${url}`);
        shell.openExternal(url);
    }
});

// Ensure local user data directory is configured
const userDataPath = path.join(app.getPath('userData'), 'vela-data');
if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
}
process.env.VELA_DATA_DIR = userDataPath;

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
const PORT = 5000;
const DEV_URL = 'http://localhost:5190/terminal.html';
const PROD_URL = `http://127.0.0.1:${PORT}/terminal.html`;

function startBackendServer() {
    return new Promise((resolve) => {
        const serverDir = isDev
            ? path.join(__dirname, '..', 'server')
            : path.join(process.resourcesPath, 'server');

        console.log(`[Electron] Starting local proxy server from ${serverDir} with VELA_DATA_DIR=${userDataPath}`);

        const staticDir = isDev
            ? ''
            : fs.existsSync(path.join(process.resourcesPath, 'dist-desktop'))
                ? path.join(process.resourcesPath, 'dist-desktop')
                : path.join(__dirname, '..', 'dist-desktop');

        const env = {
            ...process.env,
            PORT: String(PORT),
            VELA_DATA_DIR: userDataPath,
            VELA_STATIC_DIR: staticDir,
            NODE_ENV: isDev ? 'development' : 'production',
        };

        if (isDev) {
            const tsxBin = process.platform === 'win32'
                ? path.join(__dirname, '..', 'node_modules', '.bin', 'tsx.cmd')
                : path.join(__dirname, '..', 'node_modules', '.bin', 'tsx');
            
            const serverScript = path.join(serverDir, 'src', 'index.ts');
            serverProcess = spawn(tsxBin, [serverScript], {
                cwd: serverDir,
                env,
                stdio: 'pipe',
                shell: true,
            });
        } else {
            const serverScript = path.join(serverDir, 'dist', 'index.js');
            serverProcess = spawn(process.execPath, [serverScript], {
                cwd: serverDir,
                env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
                stdio: 'pipe',
            });
        }

        serverProcess.stdout?.on('data', (data) => {
            const str = data.toString();
            console.log(`[Server] ${str.trim()}`);
            try { fs.appendFileSync(path.join(userDataPath, 'server.log'), str); } catch {}
        });

        serverProcess.stderr?.on('data', (data) => {
            const str = data.toString();
            console.error(`[Server ERR] ${str.trim()}`);
            try { fs.appendFileSync(path.join(userDataPath, 'server-error.log'), str); } catch {}
        });

        serverProcess.on('exit', (code) => {
            console.log(`[Server] Exited with code ${code}`);
        });

        let attempts = 0;
        const checkReady = () => {
            attempts++;
            http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
                if (res.statusCode === 200) {
                    console.log('[Electron] Backend proxy is online and healthy.');
                    resolve();
                } else if (attempts < 20) {
                    setTimeout(checkReady, 500);
                } else {
                    resolve();
                }
            }).on('error', () => {
                if (attempts < 20) {
                    setTimeout(checkReady, 500);
                } else {
                    resolve();
                }
            });
        };

        checkReady();
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 640,
        backgroundColor: '#F7F8FF',
        icon: path.join(__dirname, 'icon.png'),
        title: 'Trading Desk',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false,
        },
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error(`[Electron] Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
        // Retry loading after a brief pause if server was still starting up
        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                console.log(`[Electron] Retrying load of ${validatedURL}...`);
                mainWindow.loadURL(validatedURL).catch(() => {});
            }
        }, 1500);
    });

    // Intercept in-window navigation so authentication and external sites ALWAYS open in the user's real browser
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (url.includes('/api/auth/login') || url.includes('fyers.in') || url.includes('api-t1.fyers.in') || (url.startsWith('http') && !url.includes(':5000') && !url.includes(':5190'))) {
            event.preventDefault();
            console.log(`[Electron] Redirecting navigation to system browser: ${url}`);
            shell.openExternal(url);
        }
    });

    // Handle OAuth external redirects & links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        console.log(`[Electron] Opening external link in system browser: ${url}`);
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function loadAppUrl() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const targetUrl = isDev ? DEV_URL : PROD_URL;
    console.log(`[Electron] Loading application URL: ${targetUrl}`);
    mainWindow.loadURL(targetUrl).catch((err) => {
        console.error(`[Electron] Initial load failed: ${err.message}`);
    });
}

app.whenReady().then(async () => {
    createWindow();
    await startBackendServer();
    loadAppUrl();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
            loadAppUrl();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    if (serverProcess) {
        console.log('[Electron] Terminating local backend server...');
        serverProcess.kill('SIGTERM');
        serverProcess = null;
    }
});
