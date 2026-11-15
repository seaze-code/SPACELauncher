import { fetchHomeFeed, fetchPatchNoteDetail } from '../lib/mojangNews';

const launcherFallback = {
  platform: 'browser',
  isMac: typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform),
  systemTotalRamGb: 8,
  minecraftGetCatalog: () => Promise.resolve(null),
  minecraftGetHomeFeed: (options) => fetchHomeFeed(options),
  minecraftGetPatchNoteDetail: (contentPath) => fetchPatchNoteDetail(contentPath),
  minecraftGetState: () => Promise.resolve(null),
  minecraftGetRoot: () => Promise.resolve({ root: '' }),
  minecraftOpenRootDirectory: () => Promise.resolve({ skipped: true }),
  minecraftGetInstalledVersions: () => Promise.resolve([]),
  minecraftGetInstalledMods: () => Promise.resolve([]),
  minecraftGetInstalledShaders: () => Promise.resolve([]),
  minecraftGetInstalledResourcePacks: () => Promise.resolve([]),
  minecraftGetInstalledDatapacks: () => Promise.resolve([]),
  getInstances: () => Promise.resolve([]),
  createInstance: (payload) => Promise.resolve({ ok: true, instance: payload }),
  updateInstance: (id, updates) => Promise.resolve({ ok: true, instance: { id, ...updates } }),
  duplicateInstance: (id, newName) => Promise.resolve({ ok: true, instance: { id: `${id}-copy`, name: newName || 'Copy' } }),
  deleteInstance: (id) => Promise.resolve({ ok: true, id }),
  scanBaseDirectory: () => Promise.resolve({ modsCount: 0, shaderpacksCount: 0, resourcepacksCount: 0, savesCount: 0, hasConfig: false, hasOptions: false }),
  migrateBaseToInstance: (payload) => Promise.resolve({ ok: true, instance: { id: 'migrated', ...payload } }),
  pickInstanceImage: () => Promise.resolve({ canceled: true }),
  javaDetectAll: () => Promise.resolve({ ok: true, installations: [] }),
  javaPickExecutable: () => Promise.resolve({ canceled: true }),
  javaInstall: () => Promise.resolve({ ok: false, error: 'Desktop app required' }),
  exportInstance: () => Promise.resolve({ canceled: true }),
  worldsList: () => Promise.resolve({ ok: true, worlds: [] }),
  worldsBackup: () => Promise.resolve({ canceled: true }),
  worldsDelete: () => Promise.resolve({ ok: true }),
  worldsOpenFolder: () => Promise.resolve({ ok: true }),
  screenshotsList: () => Promise.resolve({ ok: true, screenshots: [] }),
  screenshotsGetFull: () => Promise.resolve({ ok: false }),
  screenshotsCopy: () => Promise.resolve({ ok: true }),
  screenshotsDelete: () => Promise.resolve({ ok: true }),
  discordUpdatePresence: () => Promise.resolve({ connected: false, reason: 'browser' }),
  discordGetStatus: () => Promise.resolve({ connected: false, reason: 'browser' }),
  minecraftToggleMod: () => Promise.resolve({ ok: true }),
  minecraftDeleteMod: () => Promise.resolve({ ok: true }),
  minecraftDeleteShader: () => Promise.resolve({ ok: true }),
  minecraftDeleteResourcePack: () => Promise.resolve({ ok: true }),
  minecraftDeleteDatapack: () => Promise.resolve({ ok: true }),
  minecraftOpenContentFolder: () => Promise.resolve({ ok: true }),
  minecraftImportContentFile: () => Promise.resolve({ ok: true }),
  minecraftPickContentFiles: () => Promise.resolve({ canceled: true, filePaths: [] }),
  minecraftInstallModFile: () => Promise.resolve({ ok: true }),
  minecraftPickModFiles: () => Promise.resolve({ canceled: true, filePaths: [] }),
  minecraftPickModpackFile: () => Promise.resolve({ canceled: true, filePath: null }),
  minecraftInstallLocalModpack: () => Promise.resolve({ error: 'Desktop app required for modpack installation' }),
  minecraftInstallModrinthModpack: () => Promise.resolve({ error: 'Desktop app required for modpack installation' }),
  minecraftSaveState: () => Promise.resolve({ ok: true }),
  minecraftSetAllModsEnabled: () => Promise.resolve({ ok: true }),
  minecraftGetAuthState: (profileKey, options) => {
    if (typeof window !== 'undefined' && window.launcher?.invoke) {
      return window.launcher.invoke('minecraft:get-auth-state', profileKey, options);
    }
    return Promise.resolve(null);
  },
  minecraftLogin: (profileKey) => {
    if (typeof window !== 'undefined' && window.launcher?.invoke) {
      return window.launcher.invoke('minecraft:login', profileKey);
    }
    return Promise.resolve({
      error: 'Interactive Microsoft login requires running inside SpaceLauncher desktop app.',
    });
  },
  minecraftLoginCancel: (profileKey) => {
    if (typeof window !== 'undefined' && window.launcher?.invoke) {
      return window.launcher.invoke('minecraft:login-cancel', profileKey);
    }
    return Promise.resolve({ ok: true });
  },
  minecraftLogout: (profileKey) => {
    if (typeof window !== 'undefined' && window.launcher?.invoke) {
      return window.launcher.invoke('minecraft:logout', profileKey);
    }
    return Promise.resolve(null);
  },
  minecraftCheckUpdate: () => Promise.resolve({ skipped: true }),
  minecraftApplyUpdate: (payload) => {
    if (typeof window !== 'undefined' && window.launcher?.invoke) {
      return window.launcher.invoke('minecraft:apply-update', payload);
    }
    return Promise.resolve({ skipped: true });
  },
  getAppVersion: () => Promise.resolve('1.0.0'),
  getSystemTheme: () => Promise.resolve(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  ),
  setWindowTheme: () => Promise.resolve({ ok: true }),
  getSystemInfo: () => Promise.resolve({ totalRamGb: 8 }),
  minecraftInstall: (opts) => {
    if (typeof window !== 'undefined' && window.launcher?.invoke) {
      return window.launcher.invoke('minecraft:install', opts);
    }
    return Promise.resolve({ installId: 'mock' });
  },
  minecraftRun: (opts) => {
    if (typeof window !== 'undefined' && window.launcher?.invoke) {
      return window.launcher.invoke('minecraft:run', opts);
    }
    return Promise.resolve({ pid: 1234 });
  },
  minecraftStop: (opts) => {
    if (typeof window !== 'undefined' && window.launcher?.invoke) {
      return window.launcher.invoke('minecraft:stop', opts);
    }
    return Promise.resolve({ stopped: true });
  },
  minecraftInstallCancel: (opts) => {
    if (typeof window !== 'undefined' && window.launcher?.invoke) {
      return window.launcher.invoke('minecraft:install-cancel', opts);
    }
    return Promise.resolve({ cancelled: true });
  },
  windowMinimize: () => { },
  windowMaximize: () => { },
  windowClose: () => { },
  openExternal: (url) => {
    if (typeof window !== 'undefined' && url) window.open(url, '_blank', 'noopener,noreferrer');
  },
  invoke: () => Promise.resolve(),
  on: () => () => { },
};

export const launcher = new Proxy({}, {
  get(_target, prop) {
    if (typeof window !== 'undefined' && window.launcher) {
      const val = window.launcher[prop];
      if (typeof val === 'function') {
        return val.bind(window.launcher);
      }
      if (val !== undefined) {
        return val;
      }
      if (typeof window.launcher.invoke === 'function') {
        if (prop === 'minecraftInstall') return (opts) => window.launcher.invoke('minecraft:install', opts);
        if (prop === 'minecraftRun') return (opts) => window.launcher.invoke('minecraft:run', opts);
        if (prop === 'minecraftStop') return (opts) => window.launcher.invoke('minecraft:stop', opts);
        if (prop === 'minecraftInstallCancel') return (opts) => window.launcher.invoke('minecraft:install-cancel', opts);
        if (prop === 'minecraftLogin') return (key) => window.launcher.invoke('minecraft:login', key);
        if (prop === 'minecraftLoginCancel') return (key) => window.launcher.invoke('minecraft:login-cancel', key);
        if (prop === 'minecraftLogout') return (key) => window.launcher.invoke('minecraft:logout', key);
        if (prop === 'minecraftGetAuthState') return (key, opts) => window.launcher.invoke('minecraft:get-auth-state', key, opts);
        if (prop === 'minecraftCheckUpdate') return () => window.launcher.invoke('minecraft:check-update');
        if (prop === 'minecraftApplyUpdate') return (payload) => window.launcher.invoke('minecraft:apply-update', payload);
      }
    }
    if (prop in launcherFallback) {
      return launcherFallback[prop];
    }
    return () => Promise.resolve();
  }
});

export const minecraftLoginWithAbort = async (profileKey, abortSignal) => {
  const cancelHandler = () => {
    launcher.minecraftLoginCancel?.(profileKey).catch(() => {});
  };
  if (abortSignal) {
    if (abortSignal.aborted) {
      cancelHandler();
      return { error: 'Login cancelled by user', cancelled: true };
    }
    abortSignal.addEventListener('abort', cancelHandler, { once: true });
  }
  try {
    return await launcher.minecraftLogin(profileKey);
  } finally {
    if (abortSignal) {
      abortSignal.removeEventListener('abort', cancelHandler);
    }
  }
};
