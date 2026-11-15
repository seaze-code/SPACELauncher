import { useState } from 'react';
import { ICONS } from '../../constants/icons';
import { Icon } from './CommonComponents';
import { useI18n } from '../../context/I18nContext';
import { launcher } from '../../services/launcherClient';

export function JavaRuntimePicker({ value = '', onChange, placeholder = '' }) {
  const { t } = useI18n();
  const [scanning, setScanning] = useState(false);
  const [runtimes, setRuntimes] = useState([]);
  const [scannedOnce, setScannedOnce] = useState(false);

  const handleScan = async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const res = await launcher.javaDetectAll?.({ forceRefresh: scannedOnce });
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
          onClick={handleScan}
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
