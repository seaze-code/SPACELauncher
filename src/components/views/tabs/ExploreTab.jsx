import { ICONS } from '../../../constants/icons';
import { Icon, EmptyState } from '../../common/CommonComponents';
import { ModrinthCard, ModrinthCardSkeleton } from '../../cards/Cards';
import { useI18n } from '../../../context/I18nContext';

export function ExploreTab({
  active,
  isOnline,
  exploreType,
  setExploreType,
  activeInstance = null,
  modrinthQuery,
  setModrinthQuery,
  modrinthSort,
  setModrinthSort,
  modrinthLoaderFilter,
  setModrinthLoaderFilter,
  currentLoader,
  modrinthVersionFilter,
  setModrinthVersionFilter,
  currentMcVer,
  versionCatalog = [],
  modrinthCategory,
  setModrinthCategory,
  modrinthLoading,
  modrinthResults,
  modrinthTotalHits = 0,
  isModInstalled,
  modrinthInstalling,
  handleInstallModrinthMod,
  handleOpenModDetails,
  modrinthSentinelRef,
  modrinthLoadingMore,
}) {
  const { t } = useI18n();
  const hasCustomFilter = Boolean(
    modrinthQuery ||
    modrinthCategory !== 'all' ||
    modrinthLoaderFilter !== 'auto' ||
    modrinthVersionFilter !== 'auto' ||
    modrinthSort !== 'relevance'
  );
  const targetName = activeInstance ? activeInstance.name : t('home.noInstanceSelected');

  return (
    <div
      className="tab-panel"
      style={{ display: active ? 'flex' : 'none', position: 'relative' }}
    >
      <div className="explore-header">
        <div>
          <div className="explore-title-row">
            <h2 className="explore-title">{t('explore.title')}</h2>
            <span className="explore-target-chip">
              {t('explore.installingTo', { name: targetName })}
            </span>
            {modrinthTotalHits > 0 && !modrinthLoading && (
              <span className="explore-count-chip">
                {t('explore.resultsCount', { count: modrinthTotalHits.toLocaleString() })}
              </span>
            )}
          </div>
          <div className="explore-subtitle">{t('explore.subtitle')}</div>
        </div>
        <div className="explore-type-selector">
          <button
            type="button"
            className={`explore-type-pill ${exploreType === 'mods' ? 'active' : ''}`}
            onClick={() => setExploreType('mods')}
          >
            <Icon d={ICONS.cube} size={15} />
            <span>{t('explore.tabMods')}</span>
          </button>
          <button
            type="button"
            className={`explore-type-pill ${exploreType === 'modpacks' ? 'active' : ''}`}
            onClick={() => setExploreType('modpacks')}
          >
            <Icon d={ICONS.box} size={15} />
            <span>{t('explore.tabModpacks')}</span>
          </button>
          <button
            type="button"
            className={`explore-type-pill ${exploreType === 'shaders' ? 'active' : ''}`}
            onClick={() => setExploreType('shaders')}
          >
            <Icon d={ICONS.sun} size={15} />
            <span>{t('explore.tabShaders')}</span>
          </button>
          <button
            type="button"
            className={`explore-type-pill ${exploreType === 'resourcepacks' ? 'active' : ''}`}
            onClick={() => setExploreType('resourcepacks')}
          >
            <Icon d={ICONS.layers} size={15} />
            <span>{t('explore.tabResourcePacks')}</span>
          </button>
          <button
            type="button"
            className={`explore-type-pill ${exploreType === 'datapacks' ? 'active' : ''}`}
            onClick={() => setExploreType('datapacks')}
          >
            <Icon d={ICONS.datapack} size={15} />
            <span>{t('explore.tabDatapacks')}</span>
          </button>
        </div>
      </div>

      <div className="modrinth-browser">
        <div className="modrinth-controls-bar">
          <div className="mods-search-box modrinth-search-box">
            <Icon d={ICONS.search} size={14} />
            <input
              type="text"
              className="mods-search-input"
              placeholder={
                exploreType === 'modpacks'
                  ? t('mods.searchModrinthModpacksPlaceholder')
                  : exploreType === 'shaders'
                    ? t('mods.searchModrinthShadersPlaceholder')
                    : exploreType === 'resourcepacks'
                      ? t('mods.searchModrinthResourcePacksPlaceholder')
                      : exploreType === 'datapacks'
                        ? t('mods.searchModrinthDatapacksPlaceholder')
                        : t('mods.searchModrinthPlaceholder')
              }
              value={modrinthQuery}
              onChange={e => setModrinthQuery(e.target.value)}
            />
            {modrinthQuery && (
              <button className="search-clear-btn" onClick={() => setModrinthQuery('')}>
                <Icon d={ICONS.x} size={11} />
              </button>
            )}
          </div>

          <div className="modrinth-filters-row">
            <div className="modrinth-filter-select-wrapper">
              <span className="modrinth-filter-label">{t('mods.filterSort')}:</span>
              <select
                className="select-input modrinth-filter-select"
                value={modrinthSort}
                onChange={e => setModrinthSort(e.target.value)}
              >
                <option value="relevance">{t('mods.sortRelevance')}</option>
                <option value="downloads">{t('mods.sortDownloads')}</option>
                <option value="follows">{t('mods.sortFollows')}</option>
                <option value="newest">{t('mods.sortNewest')}</option>
                <option value="updated">{t('mods.sortUpdated')}</option>
              </select>
            </div>

            {(exploreType === 'mods' || exploreType === 'modpacks') && (
              <div className="modrinth-filter-select-wrapper">
                <span className="modrinth-filter-label">{t('mods.filterLoader')}:</span>
                <select
                  className="select-input modrinth-filter-select"
                  value={modrinthLoaderFilter}
                  onChange={e => setModrinthLoaderFilter(e.target.value)}
                >
                  {currentLoader && (
                    <option value="auto">
                      Auto ({currentLoader.toUpperCase()})
                    </option>
                  )}
                  <option value="all">{t('mods.allLoaders')}</option>
                  <option value="fabric">Fabric</option>
                  <option value="forge">Forge</option>
                  <option value="neoforge">NeoForge</option>
                  <option value="quilt">Quilt</option>
                </select>
              </div>
            )}

            <div className="modrinth-filter-select-wrapper">
              <span className="modrinth-filter-label">{t('mods.filterVersion')}:</span>
              <select
                className="select-input modrinth-filter-select"
                value={modrinthVersionFilter}
                onChange={e => setModrinthVersionFilter(e.target.value)}
              >
                <option value="auto">
                  {currentMcVer ? `Auto (${currentMcVer})` : t('mods.allVersions')}
                </option>
                <option value="all">{t('mods.allVersions')}</option>
                {versionCatalog.length > 0 && (
                  <optgroup label={t('instances.mojangGroup')}>
                    {versionCatalog
                      .filter(v => v.type === 'vanilla')
                      .slice(0, 45)
                      .map(v => {
                        const mcVer = v.mcVer || v.id;
                        return (
                          <option key={v.id} value={mcVer}>
                            {mcVer}
                          </option>
                        );
                      })}
                  </optgroup>
                )}
              </select>
            </div>

            {hasCustomFilter && (
              <button
                type="button"
                className="btn-ghost explore-reset-btn"
                onClick={() => {
                  setModrinthQuery('');
                  setModrinthCategory('all');
                  setModrinthLoaderFilter('auto');
                  setModrinthVersionFilter('auto');
                  setModrinthSort('relevance');
                }}
              >
                <Icon d={ICONS.x} size={11} />
                <span>{t('explore.resetFilters')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Category Pills */}
        <div className="modrinth-category-pills">
          {(exploreType === 'shaders' ? [
            { id: 'all', label: t('mods.allCategories') },
            { id: 'fantasy', label: 'Fantasy' },
            { id: 'realistic', label: 'Realistic' },
            { id: 'performance', label: 'Performance' },
            { id: 'semi-realistic', label: 'Semi-Realistic' },
            { id: 'cinematic', label: 'Cinematic' },
            { id: 'vanilla-like', label: 'Vanilla-like' },
          ] : exploreType === 'resourcepacks' ? [
            { id: 'all', label: t('mods.allCategories') },
            { id: '16x', label: '16x' },
            { id: '32x', label: '32x' },
            { id: '64x', label: '64x' },
            { id: '128x', label: '128x' },
            { id: '512x', label: '512x' },
            { id: 'realistic', label: 'Realistic' },
            { id: 'medieval', label: 'Medieval' },
            { id: 'vanilla-like', label: 'Vanilla-like' },
          ] : exploreType === 'datapacks' ? [
            { id: 'all', label: t('mods.allCategories') },
            { id: 'adventure', label: 'Adventure' },
            { id: 'magic', label: 'Magic' },
            { id: 'technology', label: 'Technology' },
            { id: 'worldgen', label: 'World Gen' },
            { id: 'survival', label: 'Survival' },
            { id: 'utility', label: 'Utility' },
            { id: 'minigames', label: 'Minigames' },
            { id: 'vanilla-like', label: 'Vanilla-like' },
          ] : exploreType === 'modpacks' ? [
            { id: 'all', label: t('mods.allCategories') },
            { id: 'optimization', label: 'Optimization' },
            { id: 'adventure', label: 'Adventure' },
            { id: 'technology', label: 'Technology' },
            { id: 'magic', label: 'Magic' },
            { id: 'quests', label: 'Quests' },
            { id: 'lightweight', label: 'Lightweight' },
            { id: 'multiplayer', label: 'Multiplayer' },
            { id: 'kitchen-sink', label: 'Kitchen Sink' },
          ] : [
            { id: 'all', label: t('mods.allCategories') },
            { id: 'optimization', label: 'Optimization' },
            { id: 'technology', label: 'Technology' },
            { id: 'adventure', label: 'Adventure' },
            { id: 'decoration', label: 'Decoration' },
            { id: 'utility', label: 'Utility' },
            { id: 'magic', label: 'Magic' },
            { id: 'worldgen', label: 'World Gen' },
          ]).map(cat => (
            <button
              key={cat.id}
              className={`category-pill ${modrinthCategory === cat.id ? 'active' : ''}`}
              onClick={() => setModrinthCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Modrinth Grid */}
        {!isOnline ? (
          <EmptyState
            icon={ICONS.wifiOff}
            title={t('offline.modrinthTitle')}
            description={t('offline.modrinthDesc')}
          />
        ) : modrinthLoading ? (
          <div className="modrinth-grid">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => (
              <ModrinthCardSkeleton key={i} />
            ))}
          </div>
        ) : modrinthResults.length === 0 ? (
          <EmptyState
            icon={ICONS.search}
            title={
              exploreType === 'modpacks'
                ? t('mods.noModpacksMatchTitle')
                : exploreType === 'shaders'
                  ? t('mods.noShadersMatchTitle')
                  : exploreType === 'resourcepacks'
                    ? t('mods.noResourcePacksMatchTitle')
                    : exploreType === 'datapacks'
                      ? t('mods.noDatapacksMatchTitle')
                      : t('mods.noMatchTitle')
            }
            description={
              exploreType === 'modpacks'
                ? t('mods.noModrinthModpacksResults')
                : exploreType === 'shaders'
                  ? t('mods.noModrinthShadersResults')
                  : exploreType === 'resourcepacks'
                    ? t('mods.noModrinthResourcePacksResults')
                    : exploreType === 'datapacks'
                      ? t('mods.noModrinthDatapacksResults')
                      : t('mods.noModrinthResults')
            }
            actionText={t('common.clearSearch')}
            onAction={() => {
              setModrinthQuery('');
              setModrinthCategory('all');
              setModrinthLoaderFilter('auto');
              setModrinthVersionFilter('auto');
            }}
          />
        ) : (
          <>
            <div className="modrinth-grid">
              {modrinthResults.map(proj => (
                <ModrinthCard
                  key={proj.project_id || proj.slug}
                  project={proj}
                  installed={isModInstalled(proj)}
                  installing={Boolean(modrinthInstalling[proj.project_id || proj.slug])}
                  onInstall={handleInstallModrinthMod}
                  onOpenDetails={handleOpenModDetails}
                />
              ))}
            </div>
            <div ref={modrinthSentinelRef} className="modrinth-sentinel">
              {modrinthLoadingMore && (
                <div className="modrinth-load-more">
                  <span className="modrinth-spinner small" />
                  <span>{t('account.loading')}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
