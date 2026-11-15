import { useState, useMemo } from 'react';
import { ICONS } from '../../../constants/icons';
import { Icon } from '../../common/CommonComponents';
import { useI18n } from '../../../context/I18nContext';

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function ScreenshotsTab({
  active = false,
  screenshots = [],
  loading = false,
  onRefresh,
  onOpenFolder,
  onLoadFull,
  onCopyScreenshot,
  onDeleteScreenshot,
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [previewItem, setPreviewItem] = useState(null);
  const [previewFullSrc, setPreviewFullSrc] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return screenshots;
    return screenshots.filter(s => String(s.fileName || '').toLowerCase().includes(q));
  }, [screenshots, search]);

  if (!active) return null;

  const openPreview = async (item) => {
    setPreviewItem(item);
    setPreviewFullSrc(item.dataUri || null);
    if (onLoadFull) {
      const fullUri = await onLoadFull(item.fileName);
      if (fullUri) setPreviewFullSrc(fullUri);
    }
  };

  return (
    <div className="tab-panel">
      <div className="toolbar">
        <div className="toolbar-search-wrap">
          <Icon d={ICONS.search} size={14} className="toolbar-search-icon" />
          <input
            className="toolbar-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('screenshots.searchPlaceholder')}
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
            onClick={() => onOpenFolder?.('screenshots')}
            title={t('instances.screenshotsFolder')}
          >
            <Icon d={ICONS.folder} size={13} />
            <span>{t('instances.openFolder')}</span>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Icon d={ICONS.image} size={24} />
          </div>
          <div className="empty-state-title">{t('screenshots.emptyTitle')}</div>
          <div className="empty-state-desc">{t('screenshots.emptyDesc')}</div>
        </div>
      ) : (
        <div className="screenshots-grid">
          {filtered.map(shot => (
            <div key={shot.fileName} className="screenshot-card">
              <button
                type="button"
                className="screenshot-thumb-btn"
                onClick={() => openPreview(shot)}
                title={shot.fileName}
              >
                {shot.dataUri ? (
                  <img src={shot.dataUri} alt={shot.fileName} loading="lazy" />
                ) : (
                  <div className="screenshot-thumb-fallback">
                    <Icon d={ICONS.image} size={24} />
                  </div>
                )}
              </button>

              <div className="screenshot-card-footer">
                <div className="screenshot-card-meta">
                  <div className="screenshot-card-name" title={shot.fileName}>{shot.fileName}</div>
                  {shot.sizeBytes ? (
                    <div className="screenshot-card-size">{formatBytes(shot.sizeBytes)}</div>
                  ) : null}
                </div>
                <div className="screenshot-card-actions">
                  <button
                    type="button"
                    className="btn-ghost-icon"
                    onClick={() => onCopyScreenshot?.(shot)}
                    title={t('screenshots.copy')}
                  >
                    <Icon d={ICONS.copy} size={13} />
                  </button>
                  <button
                    type="button"
                    className="btn-ghost-icon danger"
                    onClick={() => onDeleteScreenshot?.(shot)}
                    title={t('common.delete')}
                  >
                    <Icon d={ICONS.trash} size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {previewItem && (
        <div className="modal-backdrop" onClick={() => setPreviewItem(null)}>
          <div className="modal screenshot-lightbox-modal" onClick={e => e.stopPropagation()}>
            <div className="screenshot-lightbox-header">
              <span className="screenshot-lightbox-title">{previewItem.fileName}</span>
              <div className="screenshot-lightbox-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => onCopyScreenshot?.(previewItem)}
                >
                  <Icon d={ICONS.copy} size={13} />
                  <span>{t('screenshots.copy')}</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => onOpenFolder?.('screenshots')}
                >
                  <Icon d={ICONS.folder} size={13} />
                  <span>{t('instances.openFolder')}</span>
                </button>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setPreviewItem(null)}
                >
                  <Icon d={ICONS.x} size={14} />
                </button>
              </div>
            </div>

            <div className="screenshot-lightbox-body">
              {previewFullSrc ? (
                <img src={previewFullSrc} alt={previewItem.fileName} />
              ) : (
                <Icon d={ICONS.spinner} size={28} className="spin-infinite" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
