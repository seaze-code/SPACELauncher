import { app, BrowserWindow, Menu, nativeTheme } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createMainWindow } from './services/windowManager.js';
import { registerAllIpc } from './ipc/registerIpc.js';
import { checkForLauncherUpdate } from './services/updater.js';
import { loadLauncherState } from '../src/lib/launcherState.js';
import { disconnectDiscordRpc, updateDiscordPresence } from './services/discordRpc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = Boolean(process.argv.includes('--dev') || process.env.SPACELAUNCHER_DEV === '1' || process.env.OPENLAUNCHER_DEV === '1');

// Only load dotenv during development to save production cold startup time
if (isDev) {
  import('dotenv').then(dotenv => dotenv.default.config()).catch(() => {});
}

app.setName('SpaceLauncher');
nativeTheme.themeSource = 'system';

// On Linux AppImage / portable tar.gz builds, chrome-sandbox lacks SUID root (4755),
// which causes Chromium to abort on modern kernels unless --no-sandbox is enabled.
if (process.platform === 'linux') {
  if (process.env.APPIMAGE) {
    app.commandLine.appendSwitch('no-sandbox');
  } else {
    try {
      const sandboxPath = path.join(path.dirname(process.execPath), 'chrome-sandbox');
      const stat = fs.statSync(sandboxPath);
      const isRootSuid = stat.uid === 0 && (stat.mode & 0o4000) !== 0;
      if (!isRootSuid) {
        app.commandLine.appendSwitch('no-sandbox');
      }
    } catch {
      app.commandLine.appendSwitch('no-sandbox');
    }
  }
}

// Electron & Chromium engine optimizations (Ultra low RAM, disk cache, background processes)
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128 --expose-gc');
app.commandLine.appendSwitch('renderer-process-limit', '1');
app.commandLine.appendSwitch('disk-cache-size', '16777216');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('disable-speech-api');
app.commandLine.appendSwitch('disable-breakpad');
app.commandLine.appendSwitch('disable-print-preview');
app.commandLine.appendSwitch('disable-features', 'Autofill,CalculateNativeWinOcclusion,InterestFeedContentSuggestions,MediaSessionService,Translate,PreloadMediaEngagementData');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const mainWin = BrowserWindow.getAllWindows()[0];
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      if (!mainWin.isVisible()) mainWin.show();
      mainWin.focus();
    }
  });
}

async function init() {
  Menu.setApplicationMenu(null);

  registerAllIpc();

  const mainWindow = await createMainWindow({
    isDev,
    electronDir: __dirname,
  });

  // Auto-check for updates & initialize Discord Rich Presence if enabled
  setTimeout(async () => {
    try {
      const state = await loadLauncherState(app.getPath('userData'));
      if (state.settings?.discordRpc !== false && state.settings?.discordClientId) {
        updateDiscordPresence({
          enabled: true,
          clientId: state.settings.discordClientId,
          details: 'In SpaceLauncher',
          state: 'Idle',
        }).catch(() => {});
      }
      if (state.settings?.autoUpdate !== false) {
        checkForLauncherUpdate({
          onEvent: (channel, payload) => {
            try { mainWindow?.webContents.send(channel, payload); } catch { }
          },
        }).catch((err) => {
          console.warn('Auto update check error:', err?.message || err);
        });
      }
    } catch { }
  }, 3000);
}

if (gotTheLock) {
  app.whenReady().then(() => init().catch((err) => {
    console.error('[SpaceLauncher] init failed:', err);
  }));
}

app.on('will-quit', () => {
  disconnectDiscordRpc();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow({ isDev, electronDir: __dirname });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});