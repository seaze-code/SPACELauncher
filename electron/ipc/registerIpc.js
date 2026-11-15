import { app, dialog, ipcMain, nativeTheme, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getMinecraftRoot } from '../services/paths.js';
import { getMainWindow } from '../services/windowManager.js';
import { checkForLauncherUpdate, downloadAndApplyUpdate } from '../services/updater.js';
import {
  readInstalledMods,
  readInstalledShaders,
  readInstalledResourcePacks,
  readInstalledDatapacks,
  toggleMod,
  setAllModsEnabled,
  deleteMod,
  deleteShader,
  deleteResourcePack,
  deleteDatapack,
  openContentFolder,
  importModFile,
  importContentFile,
  pickContentFiles,
  installModrinthProject,
  checkInstalledModsUpdates,
} from '../services/contentManager.js';
import {
  readInstalledVersions,
  installMinecraft,
  cancelInstall,
} from '../services/minecraftInstaller.js';
import {
  launchMinecraft,
  stopMinecraft,
} from '../services/minecraftRunner.js';
import { loadLauncherCatalog } from '../../src/lib/minecraftLauncher.js';
import { fetchHomeFeed, fetchPatchNoteDetail } from '../../src/lib/mojangNews.js';
import { loadLauncherState, saveLauncherState } from '../../src/lib/launcherState.js';
import {
  getMicrosoftAuthState,
  loginMicrosoftInteractive,
  logoutMicrosoft,
  uploadMicrosoftSkin,
  setMicrosoftActiveCape,
  resetMicrosoftSkin,
} from '../../src/lib/microsoftAuth.js';
import {
  loadSkinsLibrary,
  fetchTextureAsDataUri,
  importUsernameSkin,
  pickSkinPngFile,
  saveCustomSkin,
  setProfileLocalSkin,
  deleteCustomSkin,
  decodeDataUriToPngBuffer,
} from '../services/skinManager.js';
import {
  searchModrinthProjects,
  getModrinthProject,
  getModrinthProjectVersions,
} from '../../src/lib/modrinth.js';
import {
  readAllInstances,
  createInstance,
  updateInstance,
  duplicateInstance,
  deleteInstance,
  scanBaseDirectory,
  migrateBaseToInstance,
} from '../services/instanceManager.js';
import { detectAllJavaInstallations } from '../services/javaDetector.js';
import { installJavaRuntime } from '../services/javaInstaller.js';
import {
  listInstanceWorlds,
  backupInstanceWorld,
  deleteInstanceWorld,
  openInstanceWorldFolder,
  listInstanceScreenshots,
  getInstanceScreenshotFull,
  copyInstanceScreenshot,
  deleteInstanceScreenshot,
} from '../services/worldsScreenshotsManager.js';
import { disconnectDiscordRpc, getDiscordRpcStatus, updateDiscordPresence } from '../services/discordRpc.js';
import {
  pickModpackFile,
  installMrpackArchive,
  installModrinthModpack,
  exportInstanceArchive,
} from '../services/modpackInstaller.js';

const activeLoginControllers = new Map();

function isAllowedExternalUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:';
  } catch {
    return false;
  }
}

export function registerAllIpc() {
  const sendToRenderer = (channel, payload) => {
    try {
      const win = getMainWindow();
      win?.webContents.send(channel, payload);
    } catch { }
  };

  const sendLog = (type, msg) => {
    sendToRenderer('minecraft:run-log', { type, msg });
  };

  // ── Window and Shell Controls ──
  ipcMain.handle('window:minimize', () => getMainWindow()?.minimize());
  ipcMain.handle('window:maximize', () => {
    const win = getMainWindow();
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle('window:close', () => getMainWindow()?.close());
  ipcMain.handle('shell:open-external', (_, url) => {
    if (!isAllowedExternalUrl(url)) {
      return { error: 'InvalidUrl', message: 'Only http/https/mailto URLs can be opened externally.' };
    }
    return shell.openExternal(url);
  });

  // ── Directory and System Information ──
  ipcMain.handle('minecraft:open-root-directory', async () => {
    const minecraftRoot = getMinecraftRoot();
    try {
      await fs.promises.mkdir(minecraftRoot, { recursive: true });
      const result = await shell.openPath(minecraftRoot);
      if (result) {
        return { error: 'OpenPathFailed', message: result, path: minecraftRoot };
      }
      return { ok: true, path: minecraftRoot };
    } catch (error) {
      return { error: 'OpenPathFailed', message: error?.message || String(error), path: minecraftRoot };
    }
  });

  ipcMain.handle('minecraft:get-root', async () => ({ root: getMinecraftRoot() }));
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('system:get-info', async () => {
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    const totalRamGb = Math.max(2, Math.round(totalBytes / (1024 * 1024 * 1024)));
    const freeRamGb = Math.max(0, Math.round(freeBytes / (1024 * 1024 * 1024)));
    return {
      totalRamGb,
      freeRamGb,
      cpuCount: os.cpus()?.length || 4,
      platform: process.platform,
      arch: process.arch,
    };
  });

  // ── State and Settings ──
  ipcMain.handle('minecraft:get-state', async () => {
    const state = await loadLauncherState(app.getPath('userData'));
    return { ...state, minecraftRoot: getMinecraftRoot() };
  });

  ipcMain.handle('minecraft:save-state', async (_, state) => {
    if (state.settings && typeof state.settings === 'object') {
      state.settings.javaPath = state.settings.javaPath || '';
    }
    return saveLauncherState(app.getPath('userData'), state);
  });

  ipcMain.handle('minecraft:get-settings', async () => {
    const state = await loadLauncherState(app.getPath('userData'));
    return {
      keepOpen: state.settings?.keepOpen ?? false,
      launchBehavior: state.settings?.launchBehavior || (state.settings?.keepOpen ? 'keepOpen' : 'hide'),
      javaPath: state.settings?.javaPath || '',
      showConsole: state.settings?.showConsole ?? true,
      autoUpdate: state.settings?.autoUpdate ?? true,
      showSnapshots: state.settings?.showSnapshots ?? false,
    };
  });

  ipcMain.handle('app:get-language', async () => {
    try {
      const state = await loadLauncherState(app.getPath('userData'));
      return state.settings?.language || 'en';
    } catch {
      return 'en';
    }
  });

  ipcMain.handle('app:set-language', async (_, language) => {
    try {
      const currentState = await loadLauncherState(app.getPath('userData'));
      await saveLauncherState(app.getPath('userData'), {
        ...currentState,
        settings: { ...currentState.settings, language: typeof language === 'string' && language.trim() ? language.trim() : 'en' },
      });
      return { ok: true };
    } catch (error) {
      return { error: 'SaveFailed', message: error?.message || String(error) };
    }
  });

  // ── Catalog ──
  ipcMain.handle('minecraft:get-catalog', async (_, options) => {
    const currentState = await loadLauncherState(app.getPath('userData'));
    const includeSnapshots = options?.includeSnapshots !== undefined
      ? Boolean(options.includeSnapshots)
      : (options?.showSnapshots !== undefined
        ? Boolean(options.showSnapshots)
        : currentState.settings?.showSnapshots === true);
    const catalog = await loadLauncherCatalog({ includeSnapshots });
    try {
      const nextSettings = { ...(currentState.settings || {}), showSnapshots: includeSnapshots };
      await saveLauncherState(app.getPath('userData'), {
        ...currentState,
        settings: nextSettings,
        versions: catalog.versions,
        installTargets: catalog.installTargets,
        latest: catalog.latest,
      });
    } catch { }
    return catalog;
  });

  ipcMain.handle('minecraft:get-home-feed', async (_, options = {}) => {
    try {
      return await fetchHomeFeed({ forceRefresh: Boolean(options?.forceRefresh) });
    } catch (error) {
      return { ok: false, error: 'HomeFeedFailed', message: error?.message || String(error), news: [], patchNotes: [] };
    }
  });

  ipcMain.handle('minecraft:get-patch-note-detail', async (_, contentPath) => {
    try {
      return await fetchPatchNoteDetail(contentPath);
    } catch (error) {
      return { ok: false, error: 'PatchNoteFailed', message: error?.message || String(error) };
    }
  });

  // ── Java Runtime Discovery ──
  ipcMain.handle('java:detect-all', async (_, options = {}) => {
    try {
      const list = await detectAllJavaInstallations({ forceRefresh: Boolean(options?.forceRefresh) });
      return { ok: true, installations: list };
    } catch (error) {
      return { error: 'JavaScanFailed', message: error?.message || String(error), installations: [] };
    }
  });

  ipcMain.handle('java:pick-executable', async () => {
    const win = getMainWindow();
    const isWin = process.platform === 'win32';
    const result = await dialog.showOpenDialog(win || undefined, {
      title: 'Select Java Executable',
      properties: ['openFile'],
      filters: isWin
        ? [{ name: 'Java Executable', extensions: ['exe'] }, { name: 'All Files', extensions: ['*'] }]
        : [{ name: 'All Files', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  ipcMain.handle('java:install', async (_, { major = 21 } = {}) => {
    try {
      return await installJavaRuntime(major, {
        onLog: sendLog,
        onProgress: (p) => sendToRenderer('java:install-progress', p),
      });
    } catch (error) {
      return { ok: false, error: 'JavaInstallFailed', message: error?.message || String(error) };
    }
  });

  // ── Authentication ──
  ipcMain.handle('minecraft:get-auth-state', async (_, profileKey = 'default', options = {}) => {
    return getMicrosoftAuthState({
      profileKey,
      storageDir: app.getPath('userData'),
      forceRefresh: Boolean(options?.forceRefresh),
    });
  });

  ipcMain.handle('minecraft:login', async (event, profileKey = 'default') => {
    const key = String(profileKey || 'default');
    const prev = activeLoginControllers.get(key);
    if (prev) {
      try { prev.abort(); } catch {}
    }
    const controller = new AbortController();
    activeLoginControllers.set(key, controller);
    try {
      return await loginMicrosoftInteractive({
        profileKey: key,
        storageDir: app.getPath('userData'),
        openExternal: url => (isAllowedExternalUrl(url) ? shell.openExternal(url) : Promise.reject(new Error('Invalid OAuth URL'))),
        abortSignal: controller.signal,
      });
    } catch (error) {
      if (error?.message === 'Login cancelled by user') {
        return { error: error.message, cancelled: true };
      }
      return { error: error?.message || 'Microsoft login failed.' };
    } finally {
      if (activeLoginControllers.get(key) === controller) {
        activeLoginControllers.delete(key);
      }
    }
  });

  ipcMain.handle('minecraft:login-cancel', async (_, profileKey = 'default') => {
    const key = String(profileKey || 'default');
    const controller = activeLoginControllers.get(key);
    if (controller) {
      try { controller.abort(); } catch {}
      activeLoginControllers.delete(key);
      return { ok: true };
    }
    for (const [k, c] of activeLoginControllers.entries()) {
      try { c.abort(); } catch {}
      activeLoginControllers.delete(k);
    }
    return { ok: true };
  });

  ipcMain.handle('minecraft:logout', async (_, profileKey = 'default') => {
    return logoutMicrosoft({ profileKey, storageDir: app.getPath('userData') });
  });

  // ── Skins & Cosmetics ──
  ipcMain.handle('skin:get-library', async () => loadSkinsLibrary(app.getPath('userData')));
  ipcMain.handle('skin:fetch-texture', async (_, textureUrl) => {
    try {
      return await fetchTextureAsDataUri(textureUrl, app.getPath('userData'));
    } catch (error) {
      return { error: 'TextureFetchFailed', message: error?.message || String(error) };
    }
  });
  ipcMain.handle('skin:import-username', async (_, username) => {
    try {
      return await importUsernameSkin(username, app.getPath('userData'));
    } catch (error) {
      return { error: 'SkinImportFailed', message: error?.message || String(error) };
    }
  });
  ipcMain.handle('skin:pick-file', async () => {
    try {
      return await pickSkinPngFile(getMainWindow());
    } catch (error) {
      return { canceled: true, error: error?.message || String(error) };
    }
  });
  ipcMain.handle('skin:save-local', async (_, payload) => {
    try {
      return await saveCustomSkin({ userDataDir: app.getPath('userData'), ...payload });
    } catch (error) {
      return { error: 'SaveSkinFailed', message: error?.message || String(error) };
    }
  });
  ipcMain.handle('skin:set-profile-local', async (_, payload) => {
    try {
      return await setProfileLocalSkin({ userDataDir: app.getPath('userData'), ...payload });
    } catch (error) {
      return { error: 'SetLocalSkinFailed', message: error?.message || String(error) };
    }
  });
  ipcMain.handle('skin:delete-local', async (_, id) => {
    try {
      return await deleteCustomSkin({ userDataDir: app.getPath('userData'), id });
    } catch (error) {
      return { error: 'DeleteSkinFailed', message: error?.message || String(error) };
    }
  });
  ipcMain.handle('skin:apply-microsoft', async (_, { profileKey = 'default', dataUri, variant = 'classic' }) => {
    try {
      const pngBuffer = decodeDataUriToPngBuffer(dataUri);
      const account = await uploadMicrosoftSkin({
        profileKey,
        storageDir: app.getPath('userData'),
        pngBuffer,
        variant,
      });
      return { ok: true, account };
    } catch (error) {
      return { error: 'ApplyMicrosoftSkinFailed', message: error?.message || String(error) };
    }
  });
  ipcMain.handle('skin:set-microsoft-cape', async (_, { profileKey = 'default', capeId = '' }) => {
    try {
      const account = await setMicrosoftActiveCape({
        profileKey,
        storageDir: app.getPath('userData'),
        capeId,
      });
      return { ok: true, account };
    } catch (error) {
      return { error: 'SetCapeFailed', message: error?.message || String(error) };
    }
  });
  ipcMain.handle('skin:reset-microsoft', async (_, profileKey = 'default') => {
    try {
      const account = await resetMicrosoftSkin({
        profileKey,
        storageDir: app.getPath('userData'),
      });
      return { ok: true, account };
    } catch (error) {
      return { error: 'ResetSkinFailed', message: error?.message || String(error) };
    }
  });

  // ── Instances ──
  ipcMain.handle('instances:get-all', async () => readAllInstances());
  ipcMain.handle('instances:create', async (_, payload) => createInstance(payload));
  ipcMain.handle('instances:update', async (_, { id, updates }) => updateInstance(id, updates));
  ipcMain.handle('instances:duplicate', async (_, { id, newName }) => duplicateInstance(id, newName));
  ipcMain.handle('instances:delete', async (_, id) => deleteInstance(id));
  ipcMain.handle('instances:scan-base', async () => scanBaseDirectory());
  ipcMain.handle('instances:migrate-base', async (_, payload) => migrateBaseToInstance(payload));
  ipcMain.handle('instances:export', async (_, payload = {}) => {
    try {
      return await exportInstanceArchive(payload);
    } catch (error) {
      return { error: 'ExportFailed', message: error?.message || String(error) };
    }
  });

  // ── Worlds & Screenshots ──
  ipcMain.handle('worlds:list', async (_, instanceId) => {
    try {
      return await listInstanceWorlds(instanceId);
    } catch (error) {
      return { ok: false, error: 'WorldsListFailed', message: error?.message || String(error), worlds: [] };
    }
  });
  ipcMain.handle('worlds:backup', async (_, { instanceId, folderName } = {}) => {
    try {
      return await backupInstanceWorld(instanceId, folderName);
    } catch (error) {
      return { error: 'WorldBackupFailed', message: error?.message || String(error) };
    }
  });
  ipcMain.handle('worlds:delete', async (_, { instanceId, folderName } = {}) => {
    try {
      return await deleteInstanceWorld(instanceId, folderName);
    } catch (error) {
      return { error: 'WorldDeleteFailed', message: error?.message || String(error) };
    }
  });
  ipcMain.handle('worlds:open-folder', async (_, { instanceId, folderName } = {}) => {
    try {
      return await openInstanceWorldFolder(instanceId, folderName);
    } catch (error) {
      return { error: 'WorldOpenFailed', message: error?.message || String(error) };
    }
  });

  ipcMain.handle('screenshots:list', async (_, instanceId) => {
    try {
      return await listInstanceScreenshots(instanceId);
    } catch (error) {
      return { ok: false, error: 'ScreenshotsListFailed', message: error?.message || String(error), screenshots: [] };
    }
  });
  ipcMain.handle('screenshots:get-full', async (_, { instanceId, fileName } = {}) => {
    try {
      return await getInstanceScreenshotFull(instanceId, fileName);
    } catch (error) {
      return { error: 'ScreenshotReadFailed', message: error?.message || String(error) };
    }
  });
  ipcMain.handle('screenshots:copy', async (_, { instanceId, fileName } = {}) => {
    try {
      return await copyInstanceScreenshot(instanceId, fileName);
    } catch (error) {
      return { error: 'ScreenshotCopyFailed', message: error?.message || String(error) };
    }
  });
  ipcMain.handle('screenshots:delete', async (_, { instanceId, fileName } = {}) => {
    try {
      return await deleteInstanceScreenshot(instanceId, fileName);
    } catch (error) {
      return { error: 'ScreenshotDeleteFailed', message: error?.message || String(error) };
    }
  });

  // ── Discord Rich Presence ──
  ipcMain.handle('discord:update-presence', async (_, payload = {}) => {
    try {
      if (payload?.enabled === false) {
        disconnectDiscordRpc();
        return getDiscordRpcStatus();
      }
      return await updateDiscordPresence(payload);
    } catch {
      return getDiscordRpcStatus();
    }
  });
  ipcMain.handle('discord:get-status', async () => getDiscordRpcStatus());
  ipcMain.handle('instances:pick-image', async () => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win || undefined, {
      title: 'Select instance icon image',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
    try {
      const filePath = result.filePaths[0];
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      const buf = await fs.promises.readFile(filePath);
      return { canceled: false, dataUri: `data:${mime};base64,${buf.toString('base64')}` };
    } catch (err) {
      return { canceled: true, error: err.message };
    }
  });

  // ── Content Management (Mods, Shaders, Resource Packs, Data Packs) ──
  ipcMain.handle('minecraft:get-installed-versions', async () => readInstalledVersions());
  ipcMain.handle('minecraft:get-installed-mods', async (_, instanceId) => readInstalledMods(instanceId));
  ipcMain.handle('minecraft:get-installed-shaders', async (_, instanceId) => readInstalledShaders(instanceId));
  ipcMain.handle('minecraft:get-installed-resourcepacks', async (_, instanceId) => readInstalledResourcePacks(instanceId));
  ipcMain.handle('minecraft:get-installed-datapacks', async (_, instanceId) => readInstalledDatapacks(instanceId));

  ipcMain.handle('minecraft:toggle-mod', async (_, { modId, enable, instanceId }) => toggleMod(modId, enable, instanceId));
  ipcMain.handle('minecraft:set-all-mods-enabled', async (_, { enable, instanceId }) => setAllModsEnabled(Boolean(enable), instanceId));
  ipcMain.handle('minecraft:delete-mod', async (_, { modId, instanceId }) => deleteMod(modId, instanceId));
  ipcMain.handle('minecraft:delete-shader', async (_, { fileName, instanceId }) => deleteShader(fileName, instanceId));
  ipcMain.handle('minecraft:delete-resourcepack', async (_, { fileName, instanceId }) => deleteResourcePack(fileName, instanceId));
  ipcMain.handle('minecraft:delete-datapack', async (_, { fileName, instanceId }) => deleteDatapack(fileName, instanceId));
  ipcMain.handle('minecraft:open-content-folder', async (_, folderType, instanceId) => openContentFolder(folderType, instanceId));
  ipcMain.handle('minecraft:install-mod-file', async (_, { sourcePath, instanceId }) => importModFile({ sourcePath }, instanceId));
  ipcMain.handle('minecraft:import-content-file', async (_, payload, instanceId) => importContentFile(payload, instanceId));

  ipcMain.handle('minecraft:pick-mod-files', async () => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win || undefined, {
      title: 'Select mod files',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Minecraft Mods', extensions: ['jar', 'disabled', 'slpkg', 'olpkg'] }, { name: 'All Files', extensions: ['*'] }],
    });
    if (result.canceled) return { canceled: true, filePaths: [] };
    return { canceled: false, filePaths: result.filePaths || [] };
  });

  ipcMain.handle('minecraft:pick-content-files', async (_, type) => pickContentFiles(type));

  // ── Modrinth Integration ──
  ipcMain.handle('minecraft:modrinth-search', async (_, params) => searchModrinthProjects(params));
  ipcMain.handle('minecraft:modrinth-get-project', async (_, idOrSlug) => getModrinthProject(idOrSlug));
  ipcMain.handle('minecraft:modrinth-get-versions', async (_, params) => getModrinthProjectVersions(params));
  ipcMain.handle('minecraft:modrinth-install', async (_, payload) => installModrinthProject(payload, { onLog: sendLog }));
  ipcMain.handle('minecraft:check-mod-updates', async (_, params) => checkInstalledModsUpdates(params));

  ipcMain.handle('minecraft:pick-modpack-file', async () => pickModpackFile());
  ipcMain.handle('minecraft:install-local-modpack', async (_, { filePath, mrpackPath, instanceName } = {}) => {
    try {
      return await installMrpackArchive(
        { mrpackPath: mrpackPath || filePath, instanceName },
        {
          onLog: sendLog,
          onProgress: (p) => sendToRenderer('minecraft:install-progress', p),
        }
      );
    } catch (error) {
      return { ok: false, error: 'ModpackInstallFailed', message: error?.message || String(error) };
    }
  });
  ipcMain.handle('minecraft:install-modrinth-modpack', async (_, payload = {}) => {
    try {
      return await installModrinthModpack(payload, {
        onLog: sendLog,
        onProgress: (p) => sendToRenderer('minecraft:install-progress', p),
      });
    } catch (error) {
      return { ok: false, error: 'ModpackInstallFailed', message: error?.message || String(error) };
    }
  });

  // ── Updates ──
  ipcMain.handle('minecraft:check-update', async () => {
    return checkForLauncherUpdate({
      onEvent: sendToRenderer,
    });
  });

  ipcMain.handle('minecraft:apply-update', async (_, updatePayload) => {
    return downloadAndApplyUpdate(updatePayload, {
      onEvent: sendToRenderer,
    });
  });

  // ── Game Installation and Execution ──
  ipcMain.handle('minecraft:install', async (_, opts) => {
    return installMinecraft(opts, {
      onLog: sendLog,
      onProgress: (p) => {
        sendToRenderer('minecraft:install-file-progress', p);
        sendToRenderer('minecraft:install-progress', p);
      },
      onComplete: (c) => sendToRenderer('minecraft:install-complete', c),
    });
  });

  ipcMain.handle('minecraft:install-cancel', async (_, { installId }) => {
    const result = cancelInstall(installId);
    if (result.ok) {
      sendToRenderer('minecraft:install-cancelled', { installId });
    }
    return result;
  });

  ipcMain.handle('minecraft:run', async (_, opts) => {
    return launchMinecraft(opts, {
      onLog: sendLog,
      onAssetProgress: (p) => sendToRenderer('minecraft:asset-progress', p),
      onExit: (e) => sendToRenderer('minecraft:run-exit', e),
      onConflict: (c) => sendToRenderer('minecraft:mod-conflict', c),
    });
  });

  ipcMain.handle('minecraft:stop', async (_, { pid }) => stopMinecraft(pid));

  // ── System Theme Integration ──
  ipcMain.handle('app:get-system-theme', () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'));
  ipcMain.handle('app:set-window-theme', (_, resolvedTheme) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.setBackgroundColor(resolvedTheme === 'light' ? '#f8f9fb' : '#09090b');
    }
    return { ok: true };
  });
  nativeTheme.removeAllListeners('updated');
  nativeTheme.on('updated', () => {
    sendToRenderer('app:system-theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  });
}
