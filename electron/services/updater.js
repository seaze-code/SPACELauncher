import { app, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { loadLauncherState } from '../../src/lib/launcherState.js';
import { downloadFileAtomic, fetchWithRetry } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPDATE_REPOSITORY = process.env.SPACELAUNCHER_UPDATE_REPO || 'seaze-code/SPACELauncher';
const UPDATE_RELEASES_API = `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`;
const UPDATE_RELEASES_PAGE = `https://github.com/${UPDATE_REPOSITORY}/releases/latest`;
const UPDATER_USER_AGENT = 'SpaceLauncher-Updater/1.0.0';

const localeCache = new Map();

export async function loadLocaleData(language = 'en') {
  const lang = String(language || 'en').trim().toLowerCase();
  if (localeCache.has(lang)) return localeCache.get(lang);

  try {
    const localePath = path.resolve(__dirname, `../../src/locales/${lang}.json`);
    const content = await fs.promises.readFile(localePath, 'utf8');
    const parsed = JSON.parse(content);
    localeCache.set(lang, parsed);
    return parsed;
  } catch {
    if (lang !== 'en') {
      return loadLocaleData('en');
    }
    return {};
  }
}

export async function getUpdaterStrings(language) {
  const locale = await loadLocaleData(language);
  return locale?.updater || {};
}

export function versionToTuple(version) {
  const value = String(version || '').trim();
  const lower = value.toLowerCase();
  let versionType = 2;
  if (lower.includes('alpha')) versionType = 0;
  else if (lower.includes('beta')) versionType = 1;
  const match = value.match(/(\d+(?:\.\d+)*)/);
  if (!match) return [versionType, 0];
  return [versionType, ...match[1].split('.').map(part => Number(part) || 0)];
}

export function compareVersionTuples(left, right) {
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }
  return 0;
}

export function normalizeReleaseVersionTag(release) {
  const raw = String(release?.tag_name || release?.name || '').trim();
  return raw.replace(/^v/i, '');
}

export function isLaunchableUpdateAsset(assetName) {
  const lowerName = String(assetName || '').toLowerCase();
  if (process.platform === 'win32') {
    return lowerName.endsWith('.exe') || lowerName.endsWith('.zip');
  }
  if (process.platform === 'linux') {
    return lowerName.endsWith('.appimage') || lowerName.endsWith('.deb') || lowerName.endsWith('.tar.gz') || lowerName.endsWith('.tar.xz');
  }
  if (process.platform === 'darwin') {
    return lowerName.endsWith('.dmg') || lowerName.endsWith('.zip');
  }
  return lowerName.endsWith('.exe') || lowerName.endsWith('.appimage');
}

export function formatI18nMessage(template, values = {}) {
  return String(template || '').replace(/\{(\w+)\}/g, (match, key) => {
    return values[key] !== undefined ? String(values[key]) : match;
  });
}

export async function getPreferredLanguage() {
  try {
    const state = await loadLauncherState(app.getPath('userData'));
    return state.settings?.language || 'en';
  } catch {
    return 'en';
  }
}

export function pickUpdateAsset(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  if (assets.length === 0) return null;
  const platform = process.platform;
  const scoredAssets = assets
    .filter(asset => asset && typeof asset === 'object')
    .filter(asset => !/source code/i.test(String(asset.name || '')))
    .map(asset => {
      const assetName = String(asset.name || '').toLowerCase();
      let score = 0;
      if (platform === 'win32') {
        const isPortableRunning = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
        if (assetName.endsWith('.exe')) {
          if (assetName.includes('portable')) {
            score += isPortableRunning ? 140 : 80;
          } else if (assetName.includes('websetup')) {
            score += isPortableRunning ? 60 : 110;
          } else {
            score += isPortableRunning ? 70 : 125;
          }
        }
        if (assetName.includes('setup') || assetName.includes('installer')) score += 10;
        if (assetName.endsWith('.zip')) score += 90;
        if (assetName.includes('win')) score += 5;
      } else if (platform === 'linux') {
        if (assetName.endsWith('.appimage')) {
          score += process.env.APPIMAGE ? 120 : 100;
        }
        if (assetName.endsWith('.deb')) {
          score += 90;
        }
        if (assetName.endsWith('.tar.gz') || assetName.endsWith('.tar.xz')) {
          score += 80;
        }
        if (assetName.includes('linux')) score += 5;
      } else if (platform === 'darwin') {
        if (assetName.endsWith('.dmg')) score += 100;
        if (assetName.endsWith('.zip')) score += 80;
        if (assetName.includes('mac')) score += 10;
      }
      return { asset, score };
    })
    .sort((left, right) => right.score - left.score);
  if (scoredAssets.length === 0) return null;
  return scoredAssets[0].asset;
}

export async function downloadFileToPath(url, outPath, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  let lastProgressTime = 0;
  await downloadFileAtomic(url, outPath, {
    headers: { 'User-Agent': UPDATER_USER_AGENT, Accept: 'application/octet-stream' },
    timeoutMs: 120000,
    retries: 2,
    onProgress: (loaded, total) => {
      const now = Date.now();
      const safeTotal = total || null;
      if (now - lastProgressTime > 100 || (safeTotal && loaded >= safeTotal)) {
        lastProgressTime = now;
        const percent = safeTotal ? Math.round((loaded / safeTotal) * 100) : null;
        onProgress?.({ loaded, total: safeTotal, percent });
      }
    },
  });
  return outPath;
}

export async function launchDownloadedUpdate(filePath) {
  const resolvedPath = String(filePath || '').trim();
  if (!resolvedPath) throw new Error('Missing update file path.');
  const extension = path.extname(resolvedPath).toLowerCase();
  const basename = path.basename(resolvedPath).toLowerCase();

  if (process.platform === 'linux') {
    if (extension === '.appimage' || extension === '' || basename.endsWith('.tar.gz') || basename.endsWith('.tar.xz')) {
      await fs.promises.chmod(resolvedPath, 0o755).catch(() => { });
    }
    if (extension === '.appimage') {
      try {
        const appImageTarget = process.env.APPIMAGE;
        if (appImageTarget) {
          let targetWritable = false;
          try {
            fs.accessSync(appImageTarget, fs.constants.W_OK);
            fs.accessSync(path.dirname(appImageTarget), fs.constants.W_OK);
            targetWritable = true;
          } catch { }
          if (targetWritable) {
            const currentPid = process.pid;
            const shPath = path.join(app.getPath('temp'), `spacelauncher-appimage-${currentPid}.sh`);
            const shLines = [
              '#!/bin/sh',
              `while kill -0 ${currentPid} 2>/dev/null; do sleep 0.25; done`,
              'sleep 0.4',
              `TARGET="${appImageTarget.replace(/"/g, '\\"')}"`,
              `STAGED="${resolvedPath.replace(/"/g, '\\"')}"`,
              'TMP_TARGET="${TARGET}.new"',
              'if cp -f "$STAGED" "$TMP_TARGET" && chmod +x "$TMP_TARGET" && mv -f "$TMP_TARGET" "$TARGET"; then',
              '  rm -f "$STAGED"',
              '  "$TARGET" >/dev/null 2>&1 &',
              'else',
              '  rm -f "$TMP_TARGET"',
              '  "$STAGED" >/dev/null 2>&1 &',
              'fi',
              `rm -f "${shPath.replace(/"/g, '\\"')}"`,
            ].join('\n');
            await fs.promises.writeFile(shPath, shLines, { mode: 0o755 });
            const child = spawn('/bin/sh', [shPath], { detached: true, stdio: 'ignore' });
            child.unref();
            return { ok: true, launched: true, path: appImageTarget };
          }
        }
        const child = spawn(resolvedPath, [], { detached: true, stdio: 'ignore' });
        child.unref();
        return { ok: true, launched: true, path: resolvedPath };
      } catch (e) {
        try { await shell.openExternal(UPDATE_RELEASES_PAGE); } catch { }
        return { ok: false, launched: false, path: resolvedPath, error: e?.message || String(e) };
      }
    }
    if (extension === '.deb') {
      await shell.openPath(resolvedPath);
      return { ok: true, launched: true, path: resolvedPath };
    }
    if (basename.endsWith('.tar.gz') || basename.endsWith('.tar.xz')) {
      await shell.openPath(path.dirname(resolvedPath));
      return { ok: true, launched: true, path: resolvedPath };
    }
  }

  if (process.platform === 'darwin') {
    if (extension === '.dmg' || extension === '.zip') {
      await shell.openPath(resolvedPath);
      return { ok: true, launched: true, path: resolvedPath };
    }
  }

  if (process.platform === 'win32') {
    if (extension === '.zip') {
      await shell.openPath(resolvedPath);
      return { ok: true, launched: true, path: resolvedPath };
    }
    if (extension === '.exe') {
      const currentPid = process.pid;
      const portableTarget = process.env.PORTABLE_EXECUTABLE_FILE;
      const esc = (p) => String(p).replace(/'/g, "''");

      try {
        if (portableTarget && basename.includes('portable')) {
          // Portable build: wait for current process to exit, replace portable .exe with retry, then relaunch
          const psScriptPath = path.join(app.getPath('temp'), `spacelauncher-portable-${currentPid}.ps1`);
          const psLines = [
            `while (Get-Process -Id ${currentPid} -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 250 }`,
            `Start-Sleep -Milliseconds 500`,
            `$target = '${esc(portableTarget)}'`,
            `$staged = '${esc(resolvedPath)}'`,
            `$backup = '${esc(portableTarget)}.bak'`,
            `$replaced = $false`,
            `for ($i = 0; $i -lt 20; $i++) {`,
            `  try {`,
            `    if (Test-Path $target) { Copy-Item -Path $target -Destination $backup -Force -ErrorAction Stop }`,
            `    Copy-Item -Path $staged -Destination $target -Force -ErrorAction Stop`,
            `    Remove-Item -Path $staged -Force -ErrorAction SilentlyContinue`,
            `    Remove-Item -Path $backup -Force -ErrorAction SilentlyContinue`,
            `    $replaced = $true`,
            `    break`,
            `  } catch {`,
            `    Start-Sleep -Milliseconds 250`,
            `  }`,
            `}`,
            `if (-not $replaced -and (Test-Path $backup)) {`,
            `  Copy-Item -Path $backup -Destination $target -Force -ErrorAction SilentlyContinue`,
            `}`,
            `if ($replaced) { Start-Process -FilePath $target } else { Start-Process -FilePath $staged }`,
            `Remove-Item -Path $PSCommandPath -Force -ErrorAction SilentlyContinue`,
          ].join('\r\n');
          await fs.promises.writeFile(psScriptPath, psLines, 'utf8');
          const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', psScriptPath], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
          });
          child.unref();
          return { ok: true, launched: true, path: portableTarget };
        }

        // Installed NSIS / WebSetup: wait for app exit first so SpaceLauncher.exe is unlocked,
        // and elevate with RunAs if installed in a non-writable directory (e.g. Program Files).
        const needsElevation = !isAppAsarWritable();
        const psScriptPath = path.join(app.getPath('temp'), `spacelauncher-install-${currentPid}.ps1`);
        const startArgs = needsElevation
          ? `Start-Process -FilePath '${esc(resolvedPath)}' -ArgumentList '/S' -Verb RunAs`
          : `Start-Process -FilePath '${esc(resolvedPath)}' -ArgumentList '/S'`;
        const psLines = [
          `while (Get-Process -Id ${currentPid} -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 250 }`,
          `Start-Sleep -Milliseconds 500`,
          `try {`,
          `  ${startArgs}`,
          `} catch {`,
          `  Start-Process -FilePath '${esc(resolvedPath)}'`,
          `}`,
          `Remove-Item -Path $PSCommandPath -Force -ErrorAction SilentlyContinue`,
        ].join('\r\n');
        await fs.promises.writeFile(psScriptPath, psLines, 'utf8');
        const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', psScriptPath], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        });
        child.unref();
        return { ok: true, launched: true, path: resolvedPath };
      } catch (e) {
        try {
          const openErr = await shell.openPath(resolvedPath);
          if (!openErr) return { ok: true, launched: true, path: resolvedPath };
        } catch { }
        try { await shell.openExternal(UPDATE_RELEASES_PAGE); } catch { }
        return { ok: false, launched: false, path: resolvedPath, error: e?.message || String(e) };
      }
    }
  }

  if (isLaunchableUpdateAsset(resolvedPath)) {
    try {
      const child = spawn(resolvedPath, [], { detached: true, stdio: 'ignore', shell: process.platform === 'win32' });
      child.unref();
      return { ok: true, launched: true, path: resolvedPath };
    } catch (e) {
      try { await shell.openExternal(UPDATE_RELEASES_PAGE); } catch { }
      return { ok: false, launched: false, path: resolvedPath, error: e?.message || String(e) };
    }
  }

  await shell.openExternal(UPDATE_RELEASES_PAGE);
  return { ok: true, launched: false, path: resolvedPath };
}

function isAppAsarWritable() {
  try {
    if (!app.isPackaged || !process.resourcesPath) return false;
    // Portable builds (Windows Portable / Linux AppImage) extract to temp/FUSE; delta patching does not persist.
    if (process.platform === 'win32' && process.env.PORTABLE_EXECUTABLE_FILE) return false;
    if (process.platform === 'linux' && process.env.APPIMAGE) return false;
    const targetAsar = path.join(process.resourcesPath, 'app.asar');
    if (!fs.existsSync(targetAsar)) return false;
    fs.accessSync(process.resourcesPath, fs.constants.W_OK);
    fs.accessSync(targetAsar, fs.constants.W_OK);
    // On Windows, fs.accessSync(W_OK) only checks the read-only attribute, not NTFS ACLs (e.g. Program Files).
    if (process.platform === 'win32') {
      const probePath = path.join(process.resourcesPath, `.write-probe-${process.pid}.tmp`);
      const fd = fs.openSync(probePath, 'wx');
      fs.closeSync(fd);
      fs.unlinkSync(probePath);
    }
    return true;
  } catch {
    return false;
  }
}

async function applyDeltaAsarUpdate({ stagedAsarPath, expectedSha256 = '' }) {
  const targetAsar = path.join(process.resourcesPath, 'app.asar');
  if (expectedSha256) {
    const fileBuf = await fs.promises.readFile(stagedAsarPath);
    const actualHash = crypto.createHash('sha256').update(fileBuf).digest('hex').toLowerCase();
    if (actualHash !== String(expectedSha256).trim().toLowerCase()) {
      throw new Error('Delta update SHA-256 verification failed.');
    }
  }

  const currentPid = process.pid;
  const execPath = process.execPath;

  if (process.platform === 'win32') {
    const esc = (p) => String(p).replace(/'/g, "''");
    const psScriptPath = path.join(app.getPath('temp'), `spacelauncher-delta-${currentPid}.ps1`);
    const psLines = [
      `while (Get-Process -Id ${currentPid} -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 250 }`,
      `Start-Sleep -Milliseconds 600`,
      `$target = '${esc(targetAsar)}'`,
      `$staged = '${esc(stagedAsarPath)}'`,
      `$backup = '${esc(targetAsar)}.bak'`,
      `$updated = $false`,
      `for ($i = 0; $i -lt 20; $i++) {`,
      `  try {`,
      `    if (Test-Path $target) { Copy-Item -Path $target -Destination $backup -Force -ErrorAction Stop }`,
      `    Copy-Item -Path $staged -Destination $target -Force -ErrorAction Stop`,
      `    Remove-Item -Path $staged -Force -ErrorAction SilentlyContinue`,
      `    Remove-Item -Path $backup -Force -ErrorAction SilentlyContinue`,
      `    $updated = $true`,
      `    break`,
      `  } catch {`,
      `    Start-Sleep -Milliseconds 250`,
      `  }`,
      `}`,
      `if (-not $updated -and (Test-Path $backup)) {`,
      `  Copy-Item -Path $backup -Destination $target -Force -ErrorAction SilentlyContinue`,
      `}`,
      `Start-Process -FilePath '${esc(execPath)}'`,
      `Remove-Item -Path $PSCommandPath -Force -ErrorAction SilentlyContinue`,
    ].join('\r\n');
    await fs.promises.writeFile(psScriptPath, psLines, 'utf8');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', psScriptPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    return { ok: true, launched: true, delta: true, path: targetAsar };
  }

  const shPath = path.join(app.getPath('temp'), `spacelauncher-delta-${currentPid}.sh`);
  const shLines = [
    '#!/bin/sh',
    `while kill -0 ${currentPid} 2>/dev/null; do sleep 0.25; done`,
    'sleep 0.3',
    `TARGET="${targetAsar.replace(/"/g, '\\"')}"`,
    `STAGED="${stagedAsarPath.replace(/"/g, '\\"')}"`,
    'BACKUP="${TARGET}.bak"',
    'if [ -f "$TARGET" ]; then cp -f "$TARGET" "$BACKUP"; fi',
    'if mv -f "$STAGED" "$TARGET"; then rm -f "$BACKUP"; else [ -f "$BACKUP" ] && mv -f "$BACKUP" "$TARGET"; fi',
    process.platform === 'darwin' && execPath.includes('.app')
      ? `open "${execPath.split('.app')[0]}.app"`
      : `"${execPath.replace(/"/g, '\\"')}" &`,
    `rm -f "${shPath.replace(/"/g, '\\"')}"`,
  ].join('\n');
  await fs.promises.writeFile(shPath, shLines, { mode: 0o755 });
  const child = spawn('/bin/sh', [shPath], { detached: true, stdio: 'ignore' });
  child.unref();
  return { ok: true, launched: true, delta: true, path: targetAsar };
}

export async function downloadAndApplyUpdate(updatePayload = {}, { onEvent = null } = {}) {
  const currentVersion = String(app.getVersion() || '').trim();
  const latestVersion = updatePayload.latestVersion || '';
  const deltaAsset = updatePayload.isDelta ? updatePayload.deltaAsset : null;
  const asset = updatePayload.asset;
  const updaterStrings = await getUpdaterStrings(await getPreferredLanguage());

  if (deltaAsset?.browser_download_url && isAppAsarWritable()) {
    onEvent?.('minecraft:update-status', {
      phase: 'downloading',
      currentVersion,
      latestVersion,
      assetName: deltaAsset.name,
      isDelta: true,
      message: formatI18nMessage(updaterStrings.downloading, { assetName: `${deltaAsset.name} (Delta)` }),
    });

    const updatesDir = path.join(app.getPath('userData'), 'updates');
    await fs.promises.mkdir(updatesDir, { recursive: true });
    const stagedPath = path.join(updatesDir, `app-${latestVersion}.asar.next`);
    try { await fs.promises.rm(stagedPath, { force: true }).catch(() => { }); } catch { }

    await downloadFileToPath(deltaAsset.browser_download_url, stagedPath, {
      onProgress: ({ loaded, total, percent }) => {
        onEvent?.('minecraft:update-progress', { phase: 'downloading', loaded, total, percent, currentVersion, latestVersion, assetName: deltaAsset.name, isDelta: true });
      },
    });

    onEvent?.('minecraft:update-status', { phase: 'launching', currentVersion, latestVersion, assetName: deltaAsset.name, isDelta: true, message: updaterStrings.launching });
    const swapRes = await applyDeltaAsarUpdate({
      stagedAsarPath: stagedPath,
      expectedSha256: updatePayload.deltaSha256 || '',
    });
    onEvent?.('minecraft:update-complete', { phase: 'complete', currentVersion, latestVersion, assetName: deltaAsset.name, isDelta: true, path: swapRes.path });
    setTimeout(() => {
      app.quit();
      setTimeout(() => app.exit(0), 1500).unref();
    }, 300);
    return { ok: true, available: true, downloaded: true, isDelta: true, path: swapRes.path, currentVersion, latestVersion };
  }

  if (!asset || !asset.browser_download_url) {
    onEvent?.('minecraft:update-status', { phase: 'release-page', currentVersion, latestVersion, message: updaterStrings.openingReleasePage });
    await shell.openExternal(updatePayload.releaseUrl || UPDATE_RELEASES_PAGE);
    return { ok: true, available: true, openedReleasePage: true, currentVersion, latestVersion };
  }

  if (!isLaunchableUpdateAsset(asset.name)) {
    onEvent?.('minecraft:update-status', { phase: 'release-page', currentVersion, latestVersion, message: updaterStrings.openingReleasePage });
    await shell.openExternal(updatePayload.releaseUrl || UPDATE_RELEASES_PAGE);
    return { ok: true, available: true, openedReleasePage: true, currentVersion, latestVersion };
  }

  onEvent?.('minecraft:update-status', {
    phase: 'downloading',
    currentVersion,
    latestVersion,
    assetName: asset.name,
    message: formatI18nMessage(updaterStrings.downloading, { assetName: asset.name }),
  });

  const updatesDir = path.join(app.getPath('userData'), 'updates');
  await fs.promises.mkdir(updatesDir, { recursive: true });
  const downloadPath = path.join(updatesDir, String(asset.name || `SpaceLauncher-${latestVersion}`));
  try { await fs.promises.rm(downloadPath, { force: true }).catch(() => { }); } catch { }

  await downloadFileToPath(asset.browser_download_url, downloadPath, {
    onProgress: ({ loaded, total, percent }) => {
      onEvent?.('minecraft:update-progress', { phase: 'downloading', loaded, total, percent, currentVersion, latestVersion, assetName: asset.name });
    },
  });

  onEvent?.('minecraft:update-status', { phase: 'launching', currentVersion, latestVersion, assetName: asset.name, message: updaterStrings.launching });
  const launchResult = await launchDownloadedUpdate(downloadPath);
  onEvent?.('minecraft:update-complete', { phase: 'complete', currentVersion, latestVersion, assetName: asset.name, path: downloadPath });

  if (launchResult?.launched) {
    setTimeout(() => {
      app.quit();
      setTimeout(() => app.exit(0), 1500).unref();
    }, 300);
  }

  return { ok: true, available: true, downloaded: true, path: downloadPath, currentVersion, latestVersion };
}

export async function checkForLauncherUpdate({ onEvent = null } = {}) {
  const currentVersion = String(app.getVersion() || '').trim();
  const updaterStrings = await getUpdaterStrings(await getPreferredLanguage());
  onEvent?.('minecraft:update-status', { phase: 'checking', currentVersion, message: updaterStrings.checking });

  const response = await fetchWithRetry(
    UPDATE_RELEASES_API,
    { headers: { 'User-Agent': UPDATER_USER_AGENT, Accept: 'application/vnd.github+json' } },
    { retries: 1, timeoutMs: 12000 }
  );
  if (response.status === 404) {
    onEvent?.('minecraft:update-status', { phase: 'up-to-date', currentVersion, latestVersion: currentVersion, message: updaterStrings.upToDate });
    return { ok: true, available: false, upToDate: true, unavailable: true, currentVersion };
  }
  if (!response.ok) throw new Error(`Failed to check updates: ${response.status}`);
  const release = await response.json();
  const latestVersion = normalizeReleaseVersionTag(release);

  if (!latestVersion) return { error: 'InvalidRelease', message: 'Release metadata did not include a version tag.' };

  const currentTuple = versionToTuple(currentVersion);
  const latestTuple = versionToTuple(latestVersion);

  if (compareVersionTuples(latestTuple, currentTuple) <= 0) {
    onEvent?.('minecraft:update-status', { phase: 'up-to-date', currentVersion, latestVersion, message: updaterStrings.upToDate });
    return { ok: true, upToDate: true, currentVersion, latestVersion };
  }

  const asset = pickUpdateAsset(release);
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const deltaAsarAsset = assets.find(a => String(a?.name || '').toLowerCase() === 'spacelauncher-app.asar');
  const deltaManifestAsset = assets.find(a => String(a?.name || '').toLowerCase() === 'delta-manifest.json');

  let isDelta = false;
  let deltaSha256 = '';
  if (deltaAsarAsset?.browser_download_url && deltaManifestAsset?.browser_download_url && isAppAsarWritable()) {
    try {
      const mResp = await fetchWithRetry(
        deltaManifestAsset.browser_download_url,
        { headers: { 'User-Agent': UPDATER_USER_AGENT } },
        { retries: 1, timeoutMs: 8000 }
      );
      if (mResp.ok) {
        const manifest = await mResp.json();
        const currentElectronMajor = Number(String(process.versions.electron || '').split('.')[0] || 0);
        if (manifest?.electronMajor && Number(manifest.electronMajor) === currentElectronMajor) {
          isDelta = true;
          deltaSha256 = String(manifest.asarSha256 || '').trim();
        }
      }
    } catch { }
  }

  const updateInfo = {
    ok: true,
    available: true,
    currentVersion,
    latestVersion,
    releaseNotes: release.body || '',
    releaseUrl: release.html_url || UPDATE_RELEASES_PAGE,
    asset,
    isDelta,
    deltaAsset: isDelta ? deltaAsarAsset : null,
    deltaSha256,
  };

  onEvent?.('minecraft:update-available', updateInfo);
  return updateInfo;
}
