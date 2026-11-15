import { useEffect, useState } from 'react';
import { ICONS } from '../../constants/icons';
import { Icon } from './CommonComponents';
import { useI18n } from '../../context/I18nContext';
import { launcher } from '../../services/launcherClient';

export function JavaRuntimePicker({ value = '', onChange, placeholder = '' }) {
  const { t } = useI18n();
  const [scanning, setScanning] = useState(false);
  const [runtimes, setRuntimes] = useState([]);
  const [scannedOnce, setScannedOnce] = useState(false);
  const [installingMajor, setInstallingMajor] = useState(null);
  const [installStatus, setInstallStatus] = useState(null);

  useEffect(() => {
    const off = launcher.on?.('java:install-progress', (p) => {
      if (!p) return;
      setInstallStatus(p);
    });
    return () => off?.();
  }, []);

  const handleScan = async (forceRefreshOverride = scannedOnce) => {
    if (scanning) return;
    setScanning(true);
    try {
      const res = await launcher.javaDetectAll?.({ forceRefresh: Boolean(forceRefreshOverride) });
      const list = Array.isArray(res?.installations) ? res.installations : [];
      setRuntimes(list);
      setScannedOnce(true);
      if (list.length > 0 && !value) {
        onChange(list[0].path);
      }
    } catch {
      setRuntimes([]);
      setScannedOnce(true);
    } finally {
      setScanning(false);
    }
  };

  const handleBrowse = async () => {
    try {
      const res = await launcher.javaPickExecutable?.();
      if (res && !res.canceled && res.path) {
        onChange(res.path);
      }
    } catch {
      // Dialog was cancelled or unavailable outside Electron.
    }
  };

  const handleInstallJava = async (major) => {
    if (installingMajor) return;
    setInstallingMajor(major);
    setInstallStatus({ major, phase: 'lookup', percent: 5, message: t('settings.installingJava', { major }) });
    try {
      const res = await launcher.javaInstall?.(major);
      if (res?.ok && res.path) {
        onChange(res.path);
        setInstallStatus({ major, phase: 'done', percent: 100, message: t('settings.javaInstalledSuccess', { major: res.major || major }) });
        await handleScan(true);
      } else {
        setInstallStatus({ major, phase: 'error', percent: 0, message: res?.message || t('settings.javaInstallError') });
      }
    } catch (err) {
      setInstallStatus({ major, phase: 'error', percent: 0, message: err?.message || t('settings.javaInstallError') });
    } finally {
      setInstallingMajor(null);
    }
  };

  return (
    <div className="java-picker-stack">
      <div className="settings-path-row">
        <input
          className="modal-input"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || t('settings.autoDetect')}
        />
        <button
          className="btn-secondary"
          type="button"
          onClick={() => handleScan(scannedOnce)}
          disabled={scanning}
          title={t('settings.scanJava')}
        >
          <Icon d={ICONS.refresh} size={12} className={scanning ? 'spin-infinite' : ''} />
          <span>{scanning ? t('settings.scanningJava') : t('settings.scanJava')}</span>
        </button>
        <button
          className="btn-secondary"
          type="button"
          onClick={handleBrowse}
          title={t('settings.browseJava')}
        >
          <Icon d={ICONS.folder} size={12} />
          <span>{t('settings.browseJava')}</span>
        </button>
      </div>

      <div className="java-install-row">
        <span className="java-install-label">{t('settings.autoInstallJavaLabel')}</span>
        <div className="java-install-btns">
          {[21, 17, 8].map(major => (
            <button
              key={major}
              type="button"
              className="btn-secondary java-install-chip"
              onClick={() => handleInstallJava(major)}
              disabled={Boolean(installingMajor)}
            >
              <Icon d={installingMajor === major ? ICONS.spinner : ICONS.download} size={11} className={installingMajor === major ? 'spin-infinite' : ''} />
              <span>Java {major}</span>
            </button>
          ))}
        </div>
      </div>

      {installStatus?.message && (
        <div className={`java-install-status ${installStatus.phase === 'error' ? 'error' : ''}`}>
          <span>{installStatus.message}</span>
          {installingMajor && typeof installStatus.percent === 'number' && (
            <div className="java-install-bar">
              <div className="java-install-bar-fill" style={{ width: `${Math.max(4, Math.min(100, installStatus.percent))}%` }} />
            </div>
          )}
        </div>
      )}

      {scannedOnce && runtimes.length === 0 && (
        <div className="java-picker-empty">{t('settings.noJavaFound')}</div>
      )}

      {runtimes.length > 0 && (
        <select
          className="modal-select java-runtime-select"
          value={runtimes.some(r => r.path === value) ? value : ''}
          onChange={e => {
            if (e.target.value) onChange(e.target.value);
          }}
        >
          <option value="">{t('settings.selectJavaRuntime')}</option>
          {runtimes.map(rt => (
            <option key={rt.path} value={rt.path}>
              Java {rt.major} ({rt.fullVersion}) — {rt.vendor} [{rt.arch}]
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
