import { useState, useMemo } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { ICONS } from '../../../constants/icons';
import { Icon } from '../../common/CommonComponents';
import { getInstanceIconSrc } from '../../../constants/instanceIcons';
import { formatPlaytime } from '../../../utils/formatters';

function formatRelativeTime(timestamp, neverLabel) {
  if (!timestamp) return neverLabel;
  const diffSec = Math.max(0, Math.floor((Date.now() - Number(timestamp)) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function InstancesTab({
  active = false,
  instances = [],
  activeInstanceId = null,
  onSelectInstance,
  onOpenInstance,
  onPlayInstance,
  onCreateInstanceClick,
  onImportModpackClick,
  onMigrateClick,
  onEditInstanceClick,
  onDuplicateInstanceClick,
  onDeleteInstanceClick,
  onOpenFolderClick,
  runningInstanceId = null,
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [viewMode, setViewMode] = useState('grid');

  const filteredInstances = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? instances.filter(inst =>
        inst.name.toLowerCase().includes(q) ||
        inst.version.toLowerCase().includes(q) ||
        (inst.loader && inst.loader.toLowerCase().includes(q))
      )
      : [...instances];

    if (sortBy === 'name') {
      list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    } else if (sortBy === 'mods') {
      list.sort((a, b) => (b.modsCount || 0) - (a.modsCount || 0));
    } else {
      list.sort((a, b) => (b.lastPlayed || b.created || 0) - (a.lastPlayed || a.created || 0));
    }
    return list;
  }, [instances, search, sortBy]);

  const openDetail = (id) => {
    if (onOpenInstance) onOpenInstance(id);
    else onSelectInstance(id);
  };

  return (
    <div className="tab-panel" style={{ display: active ? 'flex' : 'none', flexDirection: 'column', height: '100%', gap: 14 }}>
      {/* Command Action Toolbar */}
      <div className="instances-toolbar">
        <div className="instances-toolbar-left">
          <button className="btn-primary" onClick={onCreateInstanceClick}>
            <Icon d={ICONS.plus} size={13} />
            <span>{t('instances.create') || t('instances.newInstance')}</span>
          </button>
          <button
            className="btn-secondary"
            onClick={onImportModpackClick}
            title={t('instances.importModpackTooltip')}
          >
            <Icon d={ICONS.box} size={13} />
            <span>{t('instances.importModpack')}</span>
          </button>
          <button
            className="btn-secondary"
            onClick={onMigrateClick}
            title={t('migration.buttonTooltip')}
          >
            <Icon d={ICONS.folder} size={13} />
            <span>{t('migration.buttonLabel')}</span>
          </button>
          <span className="instances-total-count">
            {instances.length === 1
              ? t('instances.instancesCount_one')
              : t('instances.instancesCount_other', { count: instances.length })}
          </span>
        </div>

        <div className="instances-toolbar-right">
          <div className="instances-view-switch" role="group" aria-label="View mode">
            <button
              type="button"
              className={`instances-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid"
            >
              <Icon d={ICONS.grid} size={13} />
            </button>
            <button
              type="button"
              className={`instances-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List"
            >
              <Icon d={ICONS.list} size={13} />
            </button>
          </div>

          <div className="segmented-pills">
            {[
              { id: 'recent', label: t('instances.sortRecent') },
              { id: 'name', label: t('instances.sortName') },
              { id: 'mods', label: t('instances.sortMods') },
            ].map(opt => (
              <button
                key={opt.id}
                type="button"
                className={`segmented-pill ${sortBy === opt.id ? 'active' : ''}`}
                onClick={() => setSortBy(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="mods-search-box" style={{ minWidth: 200 }}>
            <Icon d={ICONS.search} size={13} />
            <input
              type="text"
              className="mods-search-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('instances.searchPlaceholder')}
            />
            {search && (
              <button className="search-clear-btn" onClick={() => setSearch('')}>
                <Icon d={ICONS.x} size={11} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Instances Collection (User-created instances only) */}
      {filteredInstances.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Icon d={ICONS.layers} size={24} />
          </div>
          <h3 className="empty-state-title">
            {instances.length === 0 ? t('instances.noInstancesTitle') : t('instances.noResultsTitle')}
          </h3>
          <p className="empty-state-desc">
            {instances.length === 0 ? t('instances.noInstancesDesc') : t('instances.noResultsDesc')}
          </p>
          {instances.length === 0 && (
            <div className="empty-state-actions">
              <button className="btn-primary" onClick={onCreateInstanceClick}>
                <Icon d={ICONS.plus} size={14} />
                <span>{t('instances.createFirst')}</span>
              </button>
              <button className="btn-secondary" onClick={onImportModpackClick}>
                <Icon d={ICONS.box} size={14} />
                <span>{t('instances.importModpack')}</span>
              </button>
              <button className="btn-secondary" onClick={onMigrateClick}>
                <Icon d={ICONS.folder} size={14} />
                <span>{t('migration.buttonLabel')}</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className={viewMode === 'list' ? 'instances-list' : 'instances-grid'}>
          {filteredInstances.map(inst => {
            const isActive = inst.id === activeInstanceId;
            const isRunning = runningInstanceId === inst.id;
            const loaderKey = inst.loader ? String(inst.loader).toLowerCase() : 'vanilla';
            const loaderLabel = inst.loader || 'Vanilla';
            const playtimeText = formatPlaytime(inst.playTimeMs) || formatRelativeTime(inst.lastPlayed, t('instances.neverPlayed'));

            return (
              <div
                key={inst.id}
                onClick={() => openDetail(inst.id)}
                className={`instance-card ${viewMode === 'list' ? 'instance-card-list' : ''} ${isActive ? 'is-active' : ''}`}
              >
                <div className="instance-card-main">
                  <div className="instance-card-icon-wrapper">
                    <img
                      src={getInstanceIconSrc(inst.icon)}
                      alt={inst.name}
                      className="instance-card-icon-img"
                    />
                  </div>

                  <div className="instance-card-title-col">
                    <div className="instance-card-name-row">
                      <span className="instance-card-name" title={inst.name}>
                        {inst.name}
                      </span>
                    </div>

                    <div className="instance-card-spec-line">
                      <span className="instance-spec-ver" title={inst.version}>{inst.version}</span>
                      <span className="spec-sep">·</span>
                      <span className={`instance-spec-loader loader-${loaderKey}`}>{loaderLabel}</span>
                      <span className="spec-sep">·</span>
                      <span className="instance-spec-meta">
                        {inst.modsCount > 0 ? t('instances.modsCount', { count: inst.modsCount }) : t('instances.noMods')}
                      </span>
                      <span className="spec-sep">·</span>
                      <span className="instance-spec-meta">{inst.ram || 4} {t('game.ram')}</span>
                    </div>
                  </div>
                </div>

                <div className="instance-card-footer">
                  <span className="instance-card-lastplayed">{playtimeText}</span>

                  <div className="instance-card-actions" onClick={e => e.stopPropagation()}>
                    <div className="instance-secondary-actions">
                      <button
                        type="button"
                        className="btn-ghost-icon"
                        title={t('instances.openFolder')}
                        onClick={() => onOpenFolderClick(inst.id)}
                      >
                        <Icon d={ICONS.folder} size={13} />
                      </button>

                      {onDuplicateInstanceClick && (
                        <button
                          type="button"
                          className="btn-ghost-icon"
                          title={t('instances.duplicate')}
                          onClick={() => onDuplicateInstanceClick(inst)}
                        >
                          <Icon d={ICONS.copy} size={13} />
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn-ghost-icon"
                        title={t('instances.settings')}
                        onClick={() => onEditInstanceClick(inst)}
                      >
                        <Icon d={ICONS.settings} size={13} />
                      </button>

                      <button
                        type="button"
                        className="btn-ghost-icon btn-danger-hover"
                        title={t('instances.delete')}
                        onClick={() => onDeleteInstanceClick(inst)}
                      >
                        <Icon d={ICONS.trash} size={13} />
                      </button>
                    </div>

                    <button
                      type="button"
                      className={`instance-play-btn ${isRunning ? 'is-running' : ''}`}
                      onClick={() => onPlayInstance(inst)}
                      disabled={isRunning}
                      title={t('instances.play')}
                    >
                      <Icon d={isRunning ? ICONS.stop : ICONS.play} size={12} />
                      <span>{isRunning ? t('instances.playing') : t('instances.play')}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
