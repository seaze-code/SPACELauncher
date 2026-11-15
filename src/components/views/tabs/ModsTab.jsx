import { useMemo, useState } from 'react';
import { ICONS } from '../../../constants/icons';
import { Icon, EmptyState } from '../../common/CommonComponents';
import { ModCard } from '../../cards/Cards';
import { useI18n } from '../../../context/I18nContext';

function stripModExt(fileName) {
  return String(fileName || '').replace(/\.(jar(\.disabled)?|slpkg|olpkg)$/i, '').toLowerCase();
}

export function ModsTab({
  active,
  isDragging,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  modSearch,
  setModSearch,
  mods = [],
  handleSetAllModsEnabled,
  handleCheckModUpdates,
  checkingModUpdates,
  handleUpdateAllMods,
  modUpdatesCount = 0,
  handleOpenContentFolder,
  handleAddContentClick,
  modUpdates = {},
  updatingMods,
  handleModToggle,
  handleModDelete,
  handleUpdateMod,
  handleOpenLocalModDetails,
}) {
  const { t } = useI18n();
  const [statusFilter, setStatusFilter] = useState('all');

  const counts = useMemo(() => {
    let enabled = 0;
    let disabled = 0;
    let updates = 0;
    for (const mod of mods) {
      if (mod.enabled) enabled++;
      else disabled++;
      const fileKey = stripModExt(mod.fileName);
      if (modUpdates[mod.fileName] || modUpdates[fileKey] || modUpdates[mod.name] || modUpdates[mod.id]) {
        updates++;
      }
    }
    return { all: mods.length, enabled, disabled, updates };
  }, [mods, modUpdates]);

  const filteredMods = useMemo(() => {
    const q = modSearch.trim().toLowerCase();
    return mods.filter(m => {
      if (statusFilter === 'enabled' && !m.enabled) return false;
      if (statusFilter === 'disabled' && m.enabled) return false;
      if (statusFilter === 'updates') {
        const fk = stripModExt(m.fileName);
        if (!modUpdates[m.fileName] && !modUpdates[fk] && !modUpdates[m.name] && !modUpdates[m.id]) {
          return false;
        }
      }
      if (q) {
        const matchesName = String(m.name || '').toLowerCase().includes(q);
        const matchesFile = String(m.fileName || '').toLowerCase().includes(q);
        if (!matchesName && !matchesFile) return false;
      }
      return true;
    });
  }, [mods, modSearch, statusFilter, modUpdates]);

  const anyEnabled = mods.some(m => m.enabled);

  return (
    <div
      className={`tab-panel ${isDragging ? 'dragging-over' : ''}`}
      style={{ display: active ? 'flex' : 'none', position: 'relative' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="dropzone-overlay">
          <div className="dropzone-content">
            <Icon d={ICONS.download} size={32} />
            <span className="dropzone-title">{t('mods.dropzone')}</span>
            <span className="dropzone-sub">{t('mods.dropzoneSub')}</span>
          </div>
        </div>
      )}

      <div className="mods-toolbar">
        <div className="mods-search-box">
          <Icon d={ICONS.search} size={13} />
          <input
            type="text"
            className="mods-search-input"
            placeholder={t('mods.searchPlaceholder')}
            value={modSearch}
            onChange={e => setModSearch(e.target.value)}
          />
          {modSearch && (
            <button className="search-clear-btn" onClick={() => setModSearch('')}>
              <Icon d={ICONS.x} size={11} />
            </button>
          )}
        </div>

        {mods.length > 0 && (
          <div className="segmented-pills">
            {['all', 'enabled', 'disabled', ...(counts.updates > 0 ? ['updates'] : [])].map(key => (
              <button
                key={key}
                className={`segmented-pill ${statusFilter === key ? 'active' : ''}`}
                onClick={() => setStatusFilter(key)}
              >
                <span>{t(`mods.filter${key.charAt(0).toUpperCase() + key.slice(1)}`)}</span>
                <span className="segmented-count">{counts[key]}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mods-toolbar-actions">
          {modUpdatesCount > 0 && handleUpdateAllMods && (
            <button
              className="btn-accent"
              onClick={handleUpdateAllMods}
              disabled={updatingMods?.size > 0}
            >
              <Icon d={ICONS.download} size={12} className={updatingMods?.size > 0 ? 'spin-infinite' : ''} />
              <span>{t('mods.updateAllCount', { count: modUpdatesCount })}</span>
            </button>
          )}
          {mods.length > 0 && (
            <button
              className="btn-secondary"
              onClick={() => handleSetAllModsEnabled(!anyEnabled)}
              title={anyEnabled ? t('mods.disableAll') : t('mods.enableAll')}
            >
              <Icon d={anyEnabled ? ICONS.stop : ICONS.check} size={12} />
              <span>{anyEnabled ? t('mods.disableAll') : t('mods.enableAll')}</span>
            </button>
          )}
          <button
            className="btn-secondary"
            onClick={() => handleCheckModUpdates({ silent: false })}
            disabled={checkingModUpdates}
            title={t('mods.checkUpdates')}
          >
            <Icon d={ICONS.refresh} size={12} className={checkingModUpdates ? 'spin-infinite' : ''} />
            <span>{t('mods.checkUpdates')}</span>
          </button>
          <button className="btn-secondary" onClick={() => handleOpenContentFolder('mods')} title={t('mods.openModsFolder')}>
            <Icon d={ICONS.folder} size={12} />
            <span>{t('mods.openFolder')}</span>
          </button>
          <button className="btn-primary" onClick={() => handleAddContentClick('mods')}>
            <Icon d={ICONS.plus} size={12} />
            <span>{t('mods.addMod')}</span>
          </button>
        </div>
      </div>

      {mods.length === 0 ? (
        <EmptyState
          icon={ICONS.cube}
          title={t('mods.emptyTitle')}
          description={t('mods.emptyText')}
          actionText={t('mods.addMod')}
          actionIcon={ICONS.plus}
          onAction={() => handleAddContentClick('mods')}
          secondaryText={t('mods.openModsFolder')}
          onSecondary={() => handleOpenContentFolder('mods')}
        />
      ) : filteredMods.length === 0 ? (
        <EmptyState
          icon={ICONS.search}
          title={t('mods.noMatchTitle')}
          description={t('mods.noMatchText')}
          actionText={t('common.clearSearch')}
          onAction={() => {
            setModSearch('');
            setStatusFilter('all');
          }}
        />
      ) : (
        <div className="mods-grid">
          {filteredMods.map(mod => {
            const fileKey = stripModExt(mod.fileName);
            const updateInfo = modUpdates[mod.fileName] || modUpdates[fileKey] || modUpdates[mod.name] || modUpdates[mod.id] || null;
            const isUpdating = updatingMods.has(mod.fileName) || updatingMods.has(fileKey);
            return (
              <ModCard
                key={mod.id}
                mod={mod}
                updateInfo={updateInfo}
                updating={isUpdating}
                onToggle={handleModToggle}
                onDelete={handleModDelete}
                onUpdate={handleUpdateMod}
                onOpenDetails={handleOpenLocalModDetails}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
