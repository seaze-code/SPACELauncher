const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  platform: process.platform,
  isMac: process.platform === 'darwin',
  minecraftGetCatalog(options) {
    return ipcRenderer.invoke('minecraft:get-catalog', options);
  },
  minecraftGetHomeFeed(options) {
    return ipcRenderer.invoke('minecraft:get-home-feed', options);
  },
  minecraftGetPatchNoteDetail(contentPath) {
    return ipcRenderer.invoke('minecraft:get-patch-note-detail', contentPath);
  },
  minecraftGetState() {
    return ipcRenderer.invoke('minecraft:get-state');
  },
  minecraftGetRoot() {
    return ipcRenderer.invoke('minecraft:get-root');
  },
  minecraftOpenRootDirectory() {
    return ipcRenderer.invoke('minecraft:open-root-directory');
  },
  minecraftGetInstalledVersions() {
    return ipcRenderer.invoke('minecraft:get-installed-versions');
  },
  minecraftGetInstalledMods(instanceId) {
    return ipcRenderer.invoke('minecraft:get-installed-mods', instanceId);
  },
  minecraftGetInstalledShaders(instanceId) {
    return ipcRenderer.invoke('minecraft:get-installed-shaders', instanceId);
  },
  minecraftGetInstalledResourcePacks(instanceId) {
    return ipcRenderer.invoke('minecraft:get-installed-resourcepacks', instanceId);
  },
  minecraftGetInstalledDatapacks(instanceId) {
    return ipcRenderer.invoke('minecraft:get-installed-datapacks', instanceId);
  },
  getInstances() {
    return ipcRenderer.invoke('instances:get-all');
  },
  createInstance(payload) {
    return ipcRenderer.invoke('instances:create', payload);
  },
  updateInstance(id, updates) {
    return ipcRenderer.invoke('instances:update', { id, updates });
  },
  deleteInstance(id) {
    return ipcRenderer.invoke('instances:delete', id);
  },
  duplicateInstance(id, newName) {
    return ipcRenderer.invoke('instances:duplicate', { id, newName });
  },
  scanBaseDirectory() {
    return ipcRenderer.invoke('instances:scan-base');
  },
  migrateBaseToInstance(payload) {
    return ipcRenderer.invoke('instances:migrate-base', payload);
  },
  pickInstanceImage() {
    return ipcRenderer.invoke('instances:pick-image');
  },
  javaDetectAll(options) {
    return ipcRenderer.invoke('java:detect-all', options);
  },
  javaPickExecutable() {
    return ipcRenderer.invoke('java:pick-executable');
  },
  minecraftToggleMod(modId, enable, instanceId) {
    return ipcRenderer.invoke('minecraft:toggle-mod', { modId, enable, instanceId });
  },
  minecraftSetAllModsEnabled(enable, instanceId) {
    return ipcRenderer.invoke('minecraft:set-all-mods-enabled', { enable, instanceId });
  },
  minecraftDeleteMod(modId, instanceId) {
    return ipcRenderer.invoke('minecraft:delete-mod', { modId, instanceId });
  },
  minecraftDeleteShader(fileName, instanceId) {
    return ipcRenderer.invoke('minecraft:delete-shader', { fileName, instanceId });
  },
  minecraftDeleteResourcePack(fileName, instanceId) {
    return ipcRenderer.invoke('minecraft:delete-resourcepack', { fileName, instanceId });
  },
  minecraftDeleteDatapack(fileName, instanceId) {
    return ipcRenderer.invoke('minecraft:delete-datapack', { fileName, instanceId });
  },
  minecraftOpenContentFolder(folderType, instanceId) {
    return ipcRenderer.invoke('minecraft:open-content-folder', folderType, instanceId);
  },
  minecraftInstallModFile(sourcePath, instanceId) {
    return ipcRenderer.invoke('minecraft:install-mod-file', { sourcePath, instanceId });
  },
  minecraftImportContentFile(payload, instanceId) {
    return ipcRenderer.invoke('minecraft:import-content-file', payload, instanceId);
  },
  minecraftModrinthSearch(params) {
    return ipcRenderer.invoke('minecraft:modrinth-search', params);
  },
  minecraftModrinthGetProject(idOrSlug) {
    return ipcRenderer.invoke('minecraft:modrinth-get-project', idOrSlug);
  },
  minecraftModrinthGetVersions(params) {
    return ipcRenderer.invoke('minecraft:modrinth-get-versions', params);
  },
  minecraftModrinthInstall(payload) {
    return ipcRenderer.invoke('minecraft:modrinth-install', payload);
  },
  minecraftCheckModUpdates(params) {
    return ipcRenderer.invoke('minecraft:check-mod-updates', params);
  },
  minecraftPickModFiles() {
    return ipcRenderer.invoke('minecraft:pick-mod-files');
  },
  minecraftPickContentFiles(type) {
    return ipcRenderer.invoke('minecraft:pick-content-files', type);
  },
  minecraftPickModpackFile() {
    return ipcRenderer.invoke('minecraft:pick-modpack-file');
  },
  minecraftInstallLocalModpack(payload) {
    return ipcRenderer.invoke('minecraft:install-local-modpack', payload);
  },
  minecraftInstallModrinthModpack(payload) {
    return ipcRenderer.invoke('minecraft:install-modrinth-modpack', payload);
  },
  minecraftSaveState(state) {
    return ipcRenderer.invoke('minecraft:save-state', state);
  },
  minecraftGetAuthState(profileKey, options) {
    return ipcRenderer.invoke('minecraft:get-auth-state', profileKey, options);
  },
  minecraftLogin(profileKey) {
    return ipcRenderer.invoke('minecraft:login', profileKey);
  },
  minecraftLoginCancel(profileKey) {
    return ipcRenderer.invoke('minecraft:login-cancel', profileKey);
  },
  minecraftLogout(profileKey) {
    return ipcRenderer.invoke('minecraft:logout', profileKey);
  },
  skinGetLibrary() {
    return ipcRenderer.invoke('skin:get-library');
  },
  skinFetchTexture(textureUrl) {
    return ipcRenderer.invoke('skin:fetch-texture', textureUrl);
  },
  skinImportUsername(username) {
    return ipcRenderer.invoke('skin:import-username', username);
  },
  skinPickFile() {
    return ipcRenderer.invoke('skin:pick-file');
  },
  skinSaveLocal(payload) {
    return ipcRenderer.invoke('skin:save-local', payload);
  },
  skinSetProfileLocal(payload) {
    return ipcRenderer.invoke('skin:set-profile-local', payload);
  },
  skinDeleteLocal(id) {
    return ipcRenderer.invoke('skin:delete-local', id);
  },
  skinApplyMicrosoft(payload) {
    return ipcRenderer.invoke('skin:apply-microsoft', payload);
  },
  skinSetMicrosoftCape(payload) {
    return ipcRenderer.invoke('skin:set-microsoft-cape', payload);
  },
  skinResetMicrosoft(profileKey) {
    return ipcRenderer.invoke('skin:reset-microsoft', profileKey);
  },
  minecraftCheckUpdate() {
    return ipcRenderer.invoke('minecraft:check-update');
  },
  minecraftApplyUpdate(payload) {
    return ipcRenderer.invoke('minecraft:apply-update', payload);
  },
  minecraftGetSettings() {
    return ipcRenderer.invoke('minecraft:get-settings');
  },
  getAppLanguage() {
    return ipcRenderer.invoke('app:get-language');
  },
  setAppLanguage(language) {
    return ipcRenderer.invoke('app:set-language', language);
  },
  getAppVersion() {
    return ipcRenderer.invoke('app:get-version');
  },
  getSystemTheme() {
    return ipcRenderer.invoke('app:get-system-theme');
  },
  setWindowTheme(resolvedTheme) {
    return ipcRenderer.invoke('app:set-window-theme', resolvedTheme);
  },
  getSystemInfo() {
    return ipcRenderer.invoke('system:get-info');
  },
  minecraftInstall(opts) {
    return ipcRenderer.invoke('minecraft:install', opts);
  },
  minecraftRun(opts) {
    return ipcRenderer.invoke('minecraft:run', opts);
  },
  minecraftStop(opts) {
    return ipcRenderer.invoke('minecraft:stop', opts);
  },
  minecraftInstallCancel(opts) {
    return ipcRenderer.invoke('minecraft:install-cancel', opts);
  },
  windowMinimize() {
    return ipcRenderer.invoke('window:minimize');
  },
  windowMaximize() {
    return ipcRenderer.invoke('window:maximize');
  },
  windowClose() {
    return ipcRenderer.invoke('window:close');
  },
  openExternal(url) {
    return ipcRenderer.invoke('shell:open-external', url);
  },
  invoke(channel, data) {
    return ipcRenderer.invoke(channel, data);
  },
  on(channel, listener) {
    const cb = (_, ...args) => listener(...args);
    // store reference so caller can remove if needed
    ipcRenderer.on(channel, cb);
    return () => ipcRenderer.removeListener(channel, cb);
  },
});