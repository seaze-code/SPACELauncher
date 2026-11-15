import { app } from 'electron';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { spawnSync, execFile } from 'child_process';
import { promisify } from 'util';
import { runWithConcurrency } from './utils.js';

const execFileAsync = promisify(execFile);

const javaVersionCache = new Map();
const javaMetadataCache = new Map();
let cachedJavaList = null;
let cachedJavaListAt = 0;

function getSafeHomeDir() {
  try {
    return app?.getPath?.('home') || os.homedir();
  } catch {
    return os.homedir();
  }
}

export function parseJavaMajorVersion(output) {
  const text = `${output || ''}`;
  const match = text.match(/version\s+"(?:(\d+)\.(\d+)\.|(\d+))(?:[^"]*)"/i);
  if (!match) return null;
  if (match[3]) return Number(match[3]);
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major === 1 && Number.isFinite(minor)) return minor;
  return Number.isFinite(major) ? major : null;
}

export function parseJavaMetadata(output) {
  const text = `${output || ''}`;
  const major = parseJavaMajorVersion(text);
  const fullVersionMatch = text.match(/version\s+"([^"]+)"/i);
  const fullVersion = fullVersionMatch ? fullVersionMatch[1] : (major ? String(major) : '');
  const lower = text.toLowerCase();

  let vendor = 'Java';
  if (lower.includes('temurin') || lower.includes('adoptium')) vendor = 'Eclipse Temurin';
  else if (lower.includes('microsoft')) vendor = 'Microsoft OpenJDK';
  else if (lower.includes('zulu') || lower.includes('azul')) vendor = 'Azul Zulu';
  else if (lower.includes('corretto')) vendor = 'Amazon Corretto';
  else if (lower.includes('graalvm')) vendor = 'GraalVM';
  else if (lower.includes('liberica') || lower.includes('bellsoft')) vendor = 'BellSoft Liberica';
  else if (lower.includes('oracle') || lower.includes('hotspot')) vendor = 'HotSpot / OpenJDK';

  const arch = lower.includes('aarch64') || lower.includes('arm64') ? 'arm64'
    : (lower.includes('64-bit') || lower.includes('amd64') || lower.includes('x86_64')) ? 'x64'
      : 'x86';

  return { major, fullVersion, vendor, arch };
}

export function clearJavaCache() {
  javaVersionCache.clear();
  javaMetadataCache.clear();
  cachedJavaList = null;
  cachedJavaListAt = 0;
}

export function resolveJavaCommand(javaPath) {
  if (javaPath && String(javaPath).trim()) return String(javaPath).trim();
  if (process.env.JAVA_HOME) {
    const ext = process.platform === 'win32' ? '.exe' : '';
    return path.join(process.env.JAVA_HOME, 'bin', `java${ext}`);
  }
  return process.platform === 'win32' ? 'java.exe' : 'java';
}

export function detectJavaMajor(javaCmd) {
  if (!javaCmd) return null;
  const normalized = String(javaCmd).trim();
  if (javaVersionCache.has(normalized)) {
    return javaVersionCache.get(normalized);
  }
  let result;
  try {
    result = spawnSync(normalized, ['-version'], { encoding: 'utf8', timeout: 4000, windowsHide: true });
  } catch {
    javaVersionCache.set(normalized, null);
    return null;
  }
  if (result.error) {
    javaVersionCache.set(normalized, null);
    return null;
  }
  const meta = parseJavaMetadata(`${result.stderr || ''}\n${result.stdout || ''}`);
  javaVersionCache.set(normalized, meta.major);
  if (meta.major) javaMetadataCache.set(normalized, meta);
  return meta.major;
}

export async function inspectJavaExecutableAsync(javaCmd) {
  const normalized = String(javaCmd || '').trim();
  if (!normalized) return null;
  if (javaMetadataCache.has(normalized)) {
    return { path: normalized, ...javaMetadataCache.get(normalized) };
  }

  try {
    const { stdout, stderr } = await execFileAsync(normalized, ['-version'], {
      encoding: 'utf8',
      timeout: 3500,
      windowsHide: true,
    });
    const meta = parseJavaMetadata(`${stderr || ''}\n${stdout || ''}`);
    javaVersionCache.set(normalized, meta.major);
    if (!meta.major) return null;
    javaMetadataCache.set(normalized, meta);
    return { path: normalized, ...meta };
  } catch {
    javaVersionCache.set(normalized, null);
    return null;
  }
}

export function expandJavaExecutableCandidate(candidate) {
  if (!candidate) return [];
  const value = String(candidate).trim();
  if (!value) return [];
  const normalized = value.replace(/\/+$/g, '');
  const candidates = [normalized];
  const baseName = path.basename(normalized).toLowerCase();
  if (!baseName.endsWith('java') && !baseName.endsWith('java.exe')) {
    candidates.push(path.join(normalized, 'bin', `java${process.platform === 'win32' ? '.exe' : ''}`));
  }
  return candidates;
}

export function collectCommonJavaCandidates() {
  const candidates = [];
  const add = (value) => {
    if (!value) return;
    const normalized = String(value).trim();
    if (normalized) candidates.push(normalized);
  };
  const home = getSafeHomeDir();

  const pathCandidates = process.platform === 'win32' ? ['java.exe', 'java'] : ['java'];
  for (const executable of pathCandidates) {
    const lookup = spawnSync(process.platform === 'win32' ? 'where' : 'which', [executable], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (!lookup.error && lookup.status === 0) {
      for (const line of String(lookup.stdout || '').split(/\r?\n/)) add(line);
    }
  }

  if (process.platform === 'darwin') {
    try {
      const jhLookup = spawnSync('/usr/libexec/java_home', ['-V'], { encoding: 'utf8' });
      const text = `${jhLookup.stderr || ''}\n${jhLookup.stdout || ''}`;
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/(\/[^\s]+(?:\/Contents\/Home)?)/);
        if (match && match[1]) {
          add(path.join(match[1].trim(), 'bin', 'java'));
        }
      }
    } catch { }

    const macJvmRoots = [
      '/Library/Java/JavaVirtualMachines',
      path.join(home, 'Library', 'Java', 'JavaVirtualMachines'),
      '/opt/homebrew/opt',
      '/usr/local/opt',
    ];
    for (const root of macJvmRoots) {
      try {
        if (!fs.existsSync(root)) continue;
        const entries = fs.readdirSync(root, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const entryPath = path.join(root, entry.name);
          const standardJava = path.join(entryPath, 'Contents', 'Home', 'bin', 'java');
          if (fs.existsSync(standardJava)) add(standardJava);
          const directJava = path.join(entryPath, 'bin', 'java');
          if (fs.existsSync(directJava)) add(directJava);
          const brewJvmJava = path.join(entryPath, 'libexec', 'openjdk.jdk', 'Contents', 'Home', 'bin', 'java');
          if (fs.existsSync(brewJvmJava)) add(brewJvmJava);
        }
      } catch { }
    }

    for (const managerDir of [path.join(home, '.sdkman', 'candidates', 'java'), path.join(home, '.asdf', 'installs', 'java')]) {
      try {
        if (fs.existsSync(managerDir)) {
          for (const entry of fs.readdirSync(managerDir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
              add(path.join(managerDir, entry.name, 'bin', 'java'));
              add(path.join(managerDir, entry.name, 'Contents', 'Home', 'bin', 'java'));
            }
          }
        }
      } catch { }
    }
  } else if (process.platform === 'linux') {
    for (const root of ['/usr/lib/jvm', '/usr/java', path.join(home, '.sdkman', 'candidates', 'java'), path.join(home, '.jdks')]) {
      try {
        if (!fs.existsSync(root)) continue;
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
          if (entry.isDirectory() || entry.isSymbolicLink()) {
            const javaBin = path.join(root, entry.name, 'bin', 'java');
            if (fs.existsSync(javaBin)) add(javaBin);
          }
        }
      } catch { }
    }
  } else if (process.platform === 'win32') {
    if (process.env.JAVA_HOME) add(process.env.JAVA_HOME);
    const roots = [
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Java',
      'C:\\Program Files\\Microsoft',
      'C:\\Program Files\\Zulu',
      'C:\\Program Files\\Amazon Corretto',
      'C:\\Program Files\\BellSoft',
      'C:\\Program Files\\OpenLogic',
      'C:\\Program Files\\AdoptOpenJDK',
      'C:\\Program Files (x86)\\Eclipse Adoptium',
      'C:\\Program Files (x86)\\Java',
      path.join(home, '.jdks'),
      path.join(home, 'scoop', 'apps'),
    ].filter(Boolean);
    for (const root of roots) {
      try {
        if (!fs.existsSync(root)) continue;
        const entries = fs.readdirSync(root, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const lower = entry.name.toLowerCase();
          if (!/(jdk|jre|java|temurin|adoptium|corretto|zulu|bellsoft|openlogic|microsoft|graal)/.test(lower)) continue;
          const binExe = path.join(root, entry.name, 'bin', 'java.exe');
          if (fs.existsSync(binExe)) add(binExe);
          const currentExe = path.join(root, entry.name, 'current', 'bin', 'java.exe');
          if (fs.existsSync(currentExe)) add(currentExe);
        }
      } catch { }
    }

    // Official Minecraft Launcher bundled Java runtimes
    const mcRuntimeRoots = [
      'C:\\Program Files (x86)\\Minecraft Launcher\\runtime',
      path.join(process.env.LOCALAPPDATA || '', 'Packages', 'Microsoft.4297127D64EC6_8wekyb3d8bbwe', 'LocalCache', 'Local', 'runtime'),
    ].filter(Boolean);
    for (const rtRoot of mcRuntimeRoots) {
      try {
        if (!fs.existsSync(rtRoot)) continue;
        for (const component of fs.readdirSync(rtRoot, { withFileTypes: true })) {
          if (!component.isDirectory()) continue;
          const compDir = path.join(rtRoot, component.name);
          for (const sub of fs.readdirSync(compDir, { withFileTypes: true })) {
            if (!sub.isDirectory()) continue;
            const nested = path.join(compDir, sub.name, component.name, 'bin', 'java.exe');
            if (fs.existsSync(nested)) add(nested);
            const direct = path.join(compDir, sub.name, 'bin', 'java.exe');
            if (fs.existsSync(direct)) add(direct);
          }
        }
      } catch { }
    }
  }

  return Array.from(new Set(candidates.flatMap(expandJavaExecutableCandidate)));
}

/**
 * Finds the best Java executable matching `requiredMajor`.
 * Prefers `preferredPath`, otherwise picks the closest compatible major version >= requiredMajor
 * (or highest available if none meets requiredMajor).
 */
export function findJavaCommand(requiredMajor, preferredPath = '') {
  const preferredCandidates = expandJavaExecutableCandidate(preferredPath);
  const fallbackCandidates = collectCommonJavaCandidates();
  const allCandidates = Array.from(new Set([...preferredCandidates, ...fallbackCandidates]));

  for (const candidate of preferredCandidates) {
    const major = detectJavaMajor(candidate);
    if (major && (!requiredMajor || major >= requiredMajor)) {
      return { javaCmd: candidate, javaMajor: major };
    }
  }

  const compatible = [];
  let bestCandidate = null;
  let bestMajor = null;

  for (const candidate of allCandidates) {
    const major = detectJavaMajor(candidate);
    if (!major) continue;
    if (!bestCandidate || major > bestMajor) {
      bestCandidate = candidate;
      bestMajor = major;
    }
    if (!requiredMajor || major >= requiredMajor) {
      compatible.push({ candidate, major });
    }
  }

  if (compatible.length > 0) {
    // Prefer exact or closest compatible major (e.g. Java 21 for MC 1.21, Java 17 for 1.18-1.20)
    compatible.sort((a, b) => a.major - b.major);
    const chosen = requiredMajor ? compatible[0] : compatible[compatible.length - 1];
    return { javaCmd: chosen.candidate, javaMajor: chosen.major };
  }

  return { javaCmd: bestCandidate || resolveJavaCommand(preferredPath), javaMajor: bestMajor };
}

/**
 * Non-blocking discovery of all Java runtimes on the machine for UI selectors.
 */
export async function detectAllJavaInstallations({ forceRefresh = false } = {}) {
  if (!forceRefresh && cachedJavaList && Date.now() - cachedJavaListAt < 60000) {
    return cachedJavaList;
  }
  if (forceRefresh) clearJavaCache();

  const rawCandidates = collectCommonJavaCandidates().filter((p) => {
    try {
      return path.isAbsolute(p) ? fs.existsSync(p) : true;
    } catch {
      return false;
    }
  });

  const inspected = await runWithConcurrency(rawCandidates, 6, inspectJavaExecutableAsync);
  const seen = new Map();
  for (const item of inspected) {
    if (!item || !item.major) continue;
    let canonical = item.path;
    try {
      canonical = fs.realpathSync(item.path);
    } catch { }
    const key = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
    if (!seen.has(key)) {
      seen.set(key, { ...item, path: canonical });
    }
  }

  const list = Array.from(seen.values()).sort((a, b) => b.major - a.major);
  cachedJavaList = list;
  cachedJavaListAt = Date.now();
  return list;
}
