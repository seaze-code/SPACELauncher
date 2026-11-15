import { useState, useMemo } from 'react';
import { ICONS } from '../../../constants/icons';
import { Icon } from '../../common/CommonComponents';
import { useI18n } from '../../../context/I18nContext';

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatDate(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function WorldsTab({
  active = false,
  worlds = [],
  loading = false,
  backingUpFolder = null,
  onRefresh,
  onBackupWorld,
  onOpenWorldFolder,
  onDeleteWorld,
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return worlds;
    return worlds.filter(w =>
      String(w.name || '').toLowerCase().includes(q) ||
      String(w.folderName || '').toLowerCase().includes(q)
    );
  }, [worlds, search]);

  if (!active) return null;

  return (
    <div className="tab-panel">
      <div className="toolbar">
        <div className="toolbar-search-wrap">
          <Icon d={ICONS.search} size={14} className="toolbar-search-icon" />
          <input
            className="toolbar-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('worlds.searchPlaceholder')}
          />
          {search && (
            <button type="button" className="toolbar-clear-btn" onClick={() => setSearch('')} aria-label="Clear">
              <Icon d={ICONS.x} size={12} />
            </button>
          )}
        </div>

        <div className="toolbar-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onRefresh}
            disabled={loading}
            title={t('common.refresh')}
          >
            <Icon d={ICONS.refresh} size={13} className={loading ? 'spin-infinite' : ''} />
            <span>{t('common.refresh')}</span>
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onOpenWorldFolder?.('')}
            title={t('instances.savesFolder')}
          >
            <Icon d={ICONS.folder} size={13} />
            <span>{t('instances.openFolder')}</span>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Icon d={ICONS.globe} size={24} />
          </div>
          <div className="empty-state-title">{t('worlds.emptyTitle')}</div>
          <div className="empty-state-desc">{t('worlds.emptyDesc')}</div>
        </div>
      ) : (
        <div className="worlds-list">
          {filtered.map(world => {
            const isBackingUp = backingUpFolder === world.folderName;
            return (
              <div key={world.folderName} className="world-row-card">
                <div className="world-row-left">
                  <div className="world-row-thumb">
                    {world.iconDataUri ? (
                      <img src={world.iconDataUri} alt={world.name} />
                    ) : (
                      <Icon d={ICONS.globe} size={22} />
                    )}
                  </div>
                  <div className="world-row-meta">
                    <div className="world-row-name">{world.name}</div>
                    <div className="world-row-sub">
                      <span>{world.folderName}</span>
                      <span>&middot;</span>
                      <span>{formatBytes(world.sizeBytes)}</span>
                      {world.lastPlayed ? (
                        <>
                          <span>&middot;</span>
                          <span>{formatDate(world.lastPlayed)}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="world-row-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => onBackupWorld?.(world)}
                    disabled={isBackingUp}
                    title={t('worlds.backupZip')}
                  >
                    <Icon d={isBackingUp ? ICONS.spinner : ICONS.download} size={13} className={isBackingUp ? 'spin-infinite' : ''} />
                    <span>{isBackingUp ? t('worlds.backingUp') : t('worlds.backupZip')}</span>
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-icon-square"
                    onClick={() => onOpenWorldFolder?.(world.folderName)}
                    title={t('instances.openFolder')}
                  >
                    <Icon d={ICONS.folder} size={13} />
                  </button>
                  <button
                    type="button"
                    className="btn-ghost-icon danger"
                    onClick={() => onDeleteWorld?.(world)}
                    title={t('common.delete')}
                  >
                    <Icon d={ICONS.trash} size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
