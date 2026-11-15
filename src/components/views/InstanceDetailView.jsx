import { ICONS } from '../../constants/icons';
import { Icon } from '../common/CommonComponents';
import { getInstanceIconSrc } from '../../constants/instanceIcons';
import { formatPlaytime } from '../../utils/formatters';
import { ModsTab } from './tabs/ModsTab';
import { ShadersTab } from './tabs/ShadersTab';
import { ResourcePacksTab } from './tabs/ResourcePacksTab';
import { DatapacksTab } from './tabs/DatapacksTab';
import { ConsoleTab } from './tabs/ConsoleTab';
import { useI18n } from '../../context/I18nContext';

export function InstanceDetailView({
  instance = null,
  subTab = 'mods',
  onSubTabChange,
  onBack,
  onPlay,
  gameState = 'idle',
  isRunningThisInstance = false,
  onEditInstance,
  onDuplicateInstance,
  onOpenFolder,
  // Shared drag & content props
  isDragging,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  // Mods
  modSearch,
  setModSearch,
  mods = [],
  handleSetAllModsEnabled,
  handleCheckModUpdates,
  checkingModUpdates,
  handleUpdateAllMods,
  modUpdatesCount = 0,
  modUpdates = {},
  updatingMods,
  handleModToggle,
  handleModDelete,
  handleUpdateMod,
  handleOpenLocalModDetails,
  // Shaders
  shaderSearch,
  setShaderSearch,
  shaders = [],
  handleOpenLocalShaderDetails,
  handleDeleteShader,
  // Resource Packs
  resourcePackSearch,
  setResourcePackSearch,
  resourcePacks = [],
  handleOpenLocalResourcePackDetails,
  handleDeleteResourcePack,
  // Datapacks
  datapackSearch,
  setDatapackSearch,
  datapacks = [],
  handleOpenLocalDatapackDetails,
  handleDeleteDatapack,
  // Console
  runPid = null,
  logFilter = 'all',
  setLogFilter,
  autoScroll = true,
  setAutoScroll,
  handleCopyConsole,
  handleClearConsole,
  consoleRef,
  logs = [],
  // Shared actions
  handleOpenContentFolder,
  handleAddContentClick,
  setExploreType,
  setActiveTab,
}) {
  const { t } = useI18n();
  const isGlobal = !instance;
  const loaderLabel = instance?.loader || 'Vanilla';
  const loaderClass = String(loaderLabel).toLowerCase();
  const enabledModsCount = mods.filter(m => m.enabled).length;
  const formattedPlaytime = formatPlaytime(instance?.playTimeMs);

  const subTabs = [
    { id: 'mods', label: t('sidebar.mods'), icon: ICONS.cube, count: enabledModsCount, total: mods.length },
    { id: 'shaders', label: t('sidebar.shaders'), icon: ICONS.sun, count: shaders.length },
    { id: 'resourcepacks', label: t('sidebar.resourcePacks'), icon: ICONS.layers, count: resourcePacks.length },
    { id: 'datapacks', label: t('sidebar.datapacks'), icon: ICONS.datapack, count: datapacks.length },
    { id: 'console', label: t('sidebar.console'), icon: ICONS.console, count: logs.length },
  ];

  return (
    <div className="instance-workspace">
      {/* Instance Header Strip */}
      <div className="instance-workspace-hero">
        <div className="instance-workspace-left">
          <button
            type="button"
            className="btn-secondary instance-back-btn"
            onClick={onBack}
            title={t('mods.back')}
          >
            <Icon d={ICONS.arrowLeft} size={14} />
            <span>{t('sidebar.instances') || 'Instances'}</span>
          </button>

          <div className="instance-workspace-identity">
            <div className="instance-card-icon-wrapper">
              {instance ? (
                <img
                  src={getInstanceIconSrc(instance.icon)}
                  alt={instance.name}
                  className="instance-card-icon-img"
                />
              ) : (
                <Icon d={ICONS.folder} size={20} />
              )}
            </div>

            <div className="instance-workspace-meta">
              <div className="instance-workspace-title-row">
                <h2 className="instance-workspace-title">
                  {instance ? instance.name : t('instances.globalInstallation')}
                </h2>
                <span className="instance-active-badge">
                  {instance ? t('instances.environmentBadgeInstance') : t('instances.environmentBadgeGlobal')}
                </span>
              </div>

              <div className="instance-workspace-chips">
                {instance ? (
                  <>
                    <span className="instance-tag-version">{instance.version}</span>
                    <span className={`instance-tag-loader ${loaderClass}`}>{loaderLabel}</span>
                    <span className="instance-ram-chip">{instance.ram || 4} {t('game.ram')}</span>
                    {formattedPlaytime && (
                      <span className="instance-ram-chip">
                        {t('instances.playtime', { time: formattedPlaytime })}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="instance-workspace-sub">{t('instances.globalInstallationDesc')}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="instance-workspace-actions">
          <button
            type="button"
            className={`btn-secondary ${isRunningThisInstance ? 'btn-danger-soft' : 'btn-play-soft'}`}
            onClick={onPlay}
            disabled={gameState === 'loading'}
          >
            <Icon d={isRunningThisInstance ? ICONS.stop : ICONS.play} size={13} />
            <span>{isRunningThisInstance ? t('game.stop') : t('instances.play')}</span>
          </button>

          <button
            type="button"
            className="btn-secondary btn-icon-square"
            onClick={() => onOpenFolder?.(instance?.id || null)}
            title={t('instances.openFolder')}
          >
            <Icon d={ICONS.folder} size={13} />
          </button>

          {!isGlobal && onDuplicateInstance && (
            <button
              type="button"
              className="btn-secondary btn-icon-square"
              onClick={() => onDuplicateInstance(instance)}
              title={t('instances.duplicate')}
            >
              <Icon d={ICONS.copy} size={13} />
            </button>
          )}

          {!isGlobal && onEditInstance && (
            <button
              type="button"
              className="btn-secondary btn-icon-square"
              onClick={() => onEditInstance(instance)}
              title={t('instances.settings')}
            >
              <Icon d={ICONS.settings} size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Embedded Content Sub-Tabs inside the Instance */}
      <div className="instance-subnav-row">
        <div className="instance-subnav" role="tablist">
          {subTabs.map(tab => {
            const isCurrent = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isCurrent}
                className={`instance-subtab ${isCurrent ? 'active' : ''}`}
                onClick={() => onSubTabChange(tab.id)}
              >
                <Icon d={tab.icon} size={14} />
                <span>{tab.label}</span>
                <span className="instance-subtab-count">
                  {typeof tab.total === 'number' && tab.total !== tab.count
                    ? `${tab.count}/${tab.total}`
                    : tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="instance-quick-folders">
          {[
            { id: 'saves', label: t('instances.savesFolder') },
            { id: 'screenshots', label: t('instances.screenshotsFolder') },
            { id: 'logs', label: t('instances.logsFolder') },
            { id: 'config', label: t('instances.configFolder') },
          ].map(folder => (
            <button
              key={folder.id}
              type="button"
              className="instance-folder-pill"
              onClick={() => handleOpenContentFolder?.(folder.id)}
              title={`${t('instances.openFolder')}: ${folder.label}`}
            >
              <Icon d={ICONS.folder} size={11} />
              <span>{folder.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Scoped Content Area */}
      <div className="instance-workspace-body">
        {subTab === 'mods' && (
          <ModsTab
            active
            isDragging={isDragging}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleDrop={handleDrop}
            modSearch={modSearch}
            setModSearch={setModSearch}
            mods={mods}
            handleSetAllModsEnabled={handleSetAllModsEnabled}
            handleCheckModUpdates={handleCheckModUpdates}
            checkingModUpdates={checkingModUpdates}
            handleUpdateAllMods={handleUpdateAllMods}
            modUpdatesCount={modUpdatesCount}
            handleOpenContentFolder={handleOpenContentFolder}
            handleAddContentClick={handleAddContentClick}
            setExploreType={setExploreType}
            setActiveTab={setActiveTab}
            modUpdates={modUpdates}
            updatingMods={updatingMods}
            handleModToggle={handleModToggle}
            handleModDelete={handleModDelete}
            handleUpdateMod={handleUpdateMod}
            handleOpenLocalModDetails={handleOpenLocalModDetails}
          />
        )}

        {subTab === 'shaders' && (
          <ShadersTab
            active
            isDragging={isDragging}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleDrop={handleDrop}
            shaderSearch={shaderSearch}
            setShaderSearch={setShaderSearch}
            shaders={shaders}
            handleOpenContentFolder={handleOpenContentFolder}
            handleAddContentClick={handleAddContentClick}
            setExploreType={setExploreType}
            setActiveTab={setActiveTab}
            handleOpenLocalShaderDetails={handleOpenLocalShaderDetails}
            handleDeleteShader={handleDeleteShader}
          />
        )}

        {subTab === 'resourcepacks' && (
          <ResourcePacksTab
            active
            isDragging={isDragging}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleDrop={handleDrop}
            resourcePackSearch={resourcePackSearch}
            setResourcePackSearch={setResourcePackSearch}
            resourcePacks={resourcePacks}
            handleOpenContentFolder={handleOpenContentFolder}
            handleAddContentClick={handleAddContentClick}
            setExploreType={setExploreType}
            setActiveTab={setActiveTab}
            handleOpenLocalResourcePackDetails={handleOpenLocalResourcePackDetails}
            handleDeleteResourcePack={handleDeleteResourcePack}
          />
        )}

        {subTab === 'datapacks' && (
          <DatapacksTab
            active
            isDragging={isDragging}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleDrop={handleDrop}
            datapackSearch={datapackSearch}
            setDatapackSearch={setDatapackSearch}
            datapacks={datapacks}
            handleOpenContentFolder={handleOpenContentFolder}
            handleAddContentClick={handleAddContentClick}
            setExploreType={setExploreType}
            setActiveTab={setActiveTab}
            handleOpenLocalDatapackDetails={handleOpenLocalDatapackDetails}
            handleDeleteDatapack={handleDeleteDatapack}
          />
        )}

        {subTab === 'console' && (
          <ConsoleTab
            active
            gameState={gameState}
            runPid={runPid}
            logFilter={logFilter}
            setLogFilter={setLogFilter}
            autoScroll={autoScroll}
            setAutoScroll={setAutoScroll}
            handleCopyConsole={handleCopyConsole}
            handleClearConsole={handleClearConsole}
            consoleRef={consoleRef}
            logs={logs}
          />
        )}
      </div>
    </div>
  );
}
