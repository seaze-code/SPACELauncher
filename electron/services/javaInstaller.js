import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { downloadFileAtomic, fetchWithRetry } from './utils.js';
import { clearJavaCache, inspectJavaExecutableAsync } from './javaDetector.js';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');

const USER_AGENT = 'SpaceLauncher/1.2.0 (desktop)';

export function getManagedJavaRoot() {
  return path.join(app.getPath('userData'), 'java-runtimes');
}

function getAdoptiumOs() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'mac';
  return 'linux';
}

function getAdoptiumArch() {
  if (process.arch === 'arm64') return 'aarch64';
  if (process.arch === 'ia32') return 'x86';
  return 'x64';
}

async function findJavaBinaryRecursive(dir, maxDepth = 5) {
  if (!dir || maxDepth < 0) return null;
  const exeName = process.platform === 'win32' ? 'java.exe' : 'java';
  const directBin = path.join(dir, 'bin', exeName);
  if (fs.existsSync(directBin)) return directBin;
  const macHomeBin = path.join(dir, 'Contents', 'Home', 'bin', exeName);
  if (fs.existsSync(macHomeBin)) return macHomeBin;

  const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await findJavaBinaryRecursive(path.join(dir, entry.name), maxDepth - 1);
    if (found) return found;
  }
  return null;
}

function extractTarGz(archivePath, destDir) {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-xzf', archivePath, '-C', destDir], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', chunk => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`tar exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

export async function installJavaRuntime(majorVersion = 21, { onProgress = null, onLog = null } = {}) {
  const major = Number(majorVersion) || 21;
  const osName = getAdoptiumOs();
  const archName = getAdoptiumArch();

  onLog?.('info', `[Java] Looking up Eclipse Temurin Java ${major} (${osName}/${archName})...`);
  onProgress?.({ major, phase: 'lookup', percent: 5, message: `Checking Adoptium Java ${major}...` });

  const apiUrl = `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=${archName}&image_type=jre&os=${osName}&vendor=eclipse`;
  const resp = await fetchWithRetry(
    apiUrl,
    { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
    { retries: 2, timeoutMs: 15000 }
  );
  if (!resp.ok) {
    throw new Error(`Adoptium API returned HTTP ${resp.status} for Java ${major}`);
  }

  const assets = await resp.json();
  const pkg = assets?.[0]?.binary?.package;
  if (!pkg?.link) {
    throw new Error(`No Temurin JRE package found for Java ${major} (${osName}/${archName}).`);
  }

  const runtimeRoot = getManagedJavaRoot();
  const targetDir = path.join(runtimeRoot, `temurin-${major}`);
  const tempDir = await fs.promises.mkdtemp(path.join(app.getPath('temp'), `spacelauncher-java-${major}-`));

  try {
    const archiveName = pkg.name || `temurin-${major}.${osName === 'windows' ? 'zip' : 'tar.gz'}`;
    const archivePath = path.join(tempDir, archiveName);

    onLog?.('info', `[Java] Downloading ${archiveName}...`);
    onProgress?.({ major, phase: 'downloading', percent: 15, message: `Downloading Java ${major}...` });

    await downloadFileAtomic(pkg.link, archivePath, {
      headers: { 'User-Agent': USER_AGENT },
      expectedSha256: pkg.checksum || null,
      timeoutMs: 180000,
      retries: 2,
      onProgress: (loaded, total) => {
        if (total > 0) {
          const pct = Math.min(82, Math.round(15 + (loaded / total) * 67));
          onProgress?.({ major, phase: 'downloading', percent: pct, loaded, total, message: `Downloading Java ${major}... ${Math.round((loaded / total) * 100)}%` });
        }
      },
    });

    onLog?.('info', `[Java] Extracting Java ${major}...`);
    onProgress?.({ major, phase: 'extracting', percent: 88, message: `Extracting Java ${major}...` });

    await fs.promises.rm(targetDir, { recursive: true, force: true }).catch(() => {});
    await fs.promises.mkdir(targetDir, { recursive: true });

    if (archiveName.toLowerCase().endsWith('.zip')) {
      const zip = new AdmZip(archivePath);
      zip.extractAllTo(targetDir, true);
    } else {
      await extractTarGz(archivePath, targetDir);
    }

    const javaBin = await findJavaBinaryRecursive(targetDir);
    if (!javaBin) {
      throw new Error(`Extracted Java ${major} archive, but java binary was not found.`);
    }

    if (process.platform !== 'win32') {
      await fs.promises.chmod(javaBin, 0o755).catch(() => {});
    }

    clearJavaCache();
    const meta = await inspectJavaExecutableAsync(javaBin);
    onProgress?.({ major, phase: 'done', percent: 100, message: `Java ${meta?.major || major} installed.` });
    onLog?.('success', `[Java] Installed Eclipse Temurin Java ${meta?.major || major} at ${javaBin}`);

    return {
      ok: true,
      path: javaBin,
      major: meta?.major || major,
      fullVersion: meta?.fullVersion || String(major),
      vendor: meta?.vendor || 'Eclipse Temurin',
      arch: meta?.arch || archName,
    };
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
