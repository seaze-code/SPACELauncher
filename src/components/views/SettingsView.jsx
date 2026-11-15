import { useI18n } from '../../context/I18nContext';
import { ICONS } from '../../constants/icons';
import { SPACE_THEMES } from '../../constants/themes';
import { Icon, Toggle } from '../common/CommonComponents';
import { JavaRuntimePicker } from '../common/JavaRuntimePicker';
import { SpaceLogo } from '../common/SpaceLogo';

const SETTINGS_TABS = [
  { id: 'general', labelKey: 'settings.tabGeneral', icon: ICONS.settings },
  { id: 'versions', labelKey: 'settings.tabVersions', icon: ICONS.cube },
  { id: 'java', labelKey: 'settings.tabJava', icon: ICONS.code },
  { id: 'appearance', labelKey: 'settings.tabAppearance', icon: ICONS.palette },
  { id: 'about', labelKey: 'settings.tabAbout', icon: ICONS.info },
];

export function SettingsView({
  active = false,
  section = 'general',
  onSectionChange,
  settings,
  resolvedTheme = 'obsidian',
  onChange,
  onCheckUpdates,
  onOpenMinecraftDirectory,
  onOpenLogsDirectory,
  onClearLogs,
  onOpenSourceCode,
  onOpenReleases,
  language,
  onLanguageChange,
  appVersion,
  installedVersions = [],
}) {
  const { t } = useI18n();

  if (!active) return null;

  const activeTheme = settings.theme || 'obsidian';
  const versionLabel = appVersion || '1.0.0';

  return (
    <div className="tab-panel settings-page">
      {/* Minecraft-Launcher-style Page Header + Horizontal Navigation Tabs */}
      <div className="settings-page-header">
        <div className="settings-page-heading">
          <h1 className="settings-page-title">{t('settings.title')}</h1>
          <p className="settings-page-subtitle">{t('settings.subtitle')}</p>
        </div>

        <nav className="settings-page-tabs" aria-label={t('settings.title')}>
          {SETTINGS_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`settings-page-tab ${section === tab.id ? 'active' : ''}`}
              onClick={() => onSectionChange?.(tab.id)}
            >
              <Icon d={tab.icon} size={14} />
              <span>{t(tab.labelKey)}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="settings-page-body">
        <div className="settings-page-content">
          {section === 'general' && (
            <div className="settings-section-stack">
              <div className="settings-section-group">
                <div className="settings-section-label">{t('settings.generalSectionTitle')}</div>

                <div className="settings-option">
                  <div className="settings-option-copy">
                    <div className="settings-option-title">{t('settings.language')}</div>
                    <div className="settings-option-description">{t('settings.languageDesc')}</div>
                  </div>
                  <select
                    className="modal-select settings-option-control settings-language-select"
                    value={language}
                    onChange={e => onLanguageChange(e.target.value)}
                  >
                    <option value="en">{t('settings.english')}</option>
                    <option value="th">{t('settings.thai')}</option>
                    <option value="es">{t('settings.spanish')}</option>
                    <option value="fr">{t('settings.french')}</option>
                  </select>
                </div>

                <div className="settings-option">
                  <div className="settings-option-copy">
                    <div className="settings-option-title">{t('settings.launchBehavior')}</div>
                    <div className="settings-option-description">{t('settings.launchBehaviorDesc')}</div>
                  </div>
                  <select
                    className="modal-select settings-select"
                    style={{ width: 'auto', minWidth: 210, fontSize: 12 }}
                    value={settings.launchBehavior || (settings.keepOpen ? 'keepOpen' : 'hide')}
                    onChange={e => {
                      const val = e.target.value;
                      onChange('launchBehavior', val);
                      onChange('keepOpen', val === 'keepOpen');
                    }}
                  >
                    <option value="keepOpen">{t('settings.launchBehaviorKeepOpen')}</option>
                    <option value="hide">{t('settings.launchBehaviorHide')}</option>
                    <option value="close">{t('settings.launchBehaviorClose')}</option>
                  </select>
                </div>

                <div className="settings-option">
                  <div className="settings-option-copy">
                    <div className="settings-option-title">{t('settings.showConsoleOutput')}</div>
                    <div className="settings-option-description">{t('settings.showConsoleOutputDesc')}</div>
                  </div>
                  <Toggle on={settings.showConsole} onToggle={() => onChange('showConsole', !settings.showConsole)} />
                </div>
              </div>

              <div className="settings-section-group">
                <div className="settings-section-label">{t('settings.updatesSectionTitle')}</div>

                <div className="settings-option">
                  <div className="settings-option-copy">
                    <div className="settings-option-title">{t('settings.autoUpdateLauncher')}</div>
                    <div className="settings-option-description">{t('settings.autoUpdateLauncherDesc')}</div>
                  </div>
                  <Toggle on={settings.autoUpdate} onToggle={() => onChange('autoUpdate', !settings.autoUpdate)} />
                </div>

                <div className="settings-option">
                  <div className="settings-option-copy">
                    <div className="settings-option-title">{t('settings.checkForUpdates')}</div>
                    <div className="settings-option-description">{t('settings.checkUpdatesDesc')}</div>
                  </div>
                  <button className="btn-secondary" type="button" onClick={onCheckUpdates}>
                    <Icon d={ICONS.refresh} size={13} />
                    <span>{t('settings.checkForUpdates')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {section === 'versions' && (
            <div className="settings-section-stack">
              <div className="settings-section-group">
                <div className="settings-section-label">{t('settings.versionsSectionTitle')}</div>

                <div className="settings-option">
                  <div className="settings-option-copy">
                    <div className="settings-option-title">{t('settings.showSnapshots')}</div>
                    <div className="settings-option-description">{t('settings.showSnapshotsDesc')}</div>
                  </div>
                  <Toggle on={settings.showSnapshots} onToggle={() => onChange('showSnapshots', !settings.showSnapshots)} />
                </div>
              </div>

              <div className="settings-section-group">
                <div className="settings-section-label">
                  {t('settings.installedVersionsTitle', { count: installedVersions.length })}
                </div>
                {installedVersions.length === 0 ? (
                  <div className="settings-empty-note">
                    {t('settings.noInstalledVersionsNote')}
                  </div>
                ) : (
                  <div className="settings-versions-list">
                    {installedVersions.slice(0, 30).map(v => (
                      <div key={v.id} className="settings-version-row">
                        <span className="settings-version-id">{v.id}</span>
                        <span className="settings-version-type">{v.type || 'release'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {section === 'java' && (
            <div className="settings-section-stack">
              <div className="settings-section-group">
                <div className="settings-section-label">{t('settings.storageSectionTitle')}</div>

                <div className="settings-field">
                  <label className="modal-label">{t('settings.minecraftDirectory')}</label>
                  <div className="settings-row-sub">{t('settings.minecraftDirectoryDesc')}</div>
                  <div className="settings-path-row">
                    <input
                      className="modal-input"
                      value={settings.minecraftRoot || ''}
                      readOnly
                      placeholder="~/.minecraft"
                    />
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={onOpenMinecraftDirectory}
                      title={t('settings.openMinecraftDirectory')}
                    >
                      <Icon d={ICONS.folder} size={13} />
                      <span>{t('settings.openMinecraftDirectory')}</span>
                    </button>
                  </div>
                </div>

                <div className="settings-field">
                  <label className="modal-label">{t('settings.javaPath')}</label>
                  <div className="settings-row-sub">{t('settings.javaPathDesc')}</div>
                  <JavaRuntimePicker
                    value={settings.javaPath || ''}
                    onChange={nextPath => onChange('javaPath', nextPath)}
                    placeholder={t('settings.autoDetect')}
                  />
                </div>
              </div>

              <div className="settings-section-group">
                <div className="settings-section-label">{t('settings.diagnosticsSectionTitle')}</div>
                <div className="settings-option">
                  <div className="settings-option-copy">
                    <div className="settings-option-title">{t('settings.logsToolsTitle')}</div>
                    <div className="settings-option-description">{t('settings.logsToolsDesc')}</div>
                  </div>
                  <div className="settings-action-group">
                    {onOpenLogsDirectory && (
                      <button className="btn-secondary" type="button" onClick={onOpenLogsDirectory}>
                        <Icon d={ICONS.folder} size={13} />
                        <span>{t('settings.openLogsDirectory')}</span>
                      </button>
                    )}
                    {onClearLogs && (
                      <button className="btn-ghost" type="button" onClick={onClearLogs}>
                        <Icon d={ICONS.trash} size={13} />
                        <span>{t('settings.clearLogs')}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {section === 'appearance' && (
            <div className="settings-section-stack">
              <div className="settings-section-group">
                <div className="settings-section-label">{t('settings.appearanceSectionTitle')}</div>

                <div className="settings-field">
                  <label className="modal-label">{t('settings.theme')}</label>
                  <div className="settings-row-sub">{t('settings.themeDesc')}</div>
                  <div className="theme-swatch-grid">
                    {SPACE_THEMES.map(themeItem => {
                      const isSelected = activeTheme === themeItem.id;
                      const isAuto = themeItem.id === 'system';
                      return (
                        <button
                          key={themeItem.id}
                          type="button"
                          className={`theme-swatch-card ${isSelected ? 'active' : ''}`}
                          onClick={() => onChange('theme', themeItem.id)}
                        >
                          <span
                            className="theme-swatch-dot"
                            style={{
                              background: themeItem.accent,
                              border: '1px solid var(--border-medium)',
                              boxShadow: themeItem.glow === 'none' ? 'none' : `0 0 12px ${themeItem.accent}66`,
                            }}
                          />
                          <span className="theme-swatch-name">
                            {t(themeItem.nameKey) || themeItem.fallbackName}
                            {isAuto && isSelected ? ` (${resolvedTheme === 'light' ? t('settings.systemDetectedLight') : t('settings.systemDetectedDark')})` : ''}
                          </span>
                          {isSelected && <Icon d={ICONS.check} size={13} />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="settings-option">
                  <div className="settings-option-copy">
                    <div className="settings-option-title">{t('settings.compactMode')}</div>
                    <div className="settings-option-description">{t('settings.compactModeDesc')}</div>
                  </div>
                  <Toggle on={Boolean(settings.compactMode)} onToggle={() => onChange('compactMode', !settings.compactMode)} />
                </div>

                <div className="settings-option">
                  <div className="settings-option-copy">
                    <div className="settings-option-title">{t('settings.reduceMotion')}</div>
                    <div className="settings-option-description">{t('settings.reduceMotionDesc')}</div>
                  </div>
                  <Toggle on={Boolean(settings.reduceMotion)} onToggle={() => onChange('reduceMotion', !settings.reduceMotion)} />
                </div>
              </div>
            </div>
          )}

          {section === 'about' && (
            <div className="settings-section-stack">
              <div className="settings-about-card">
                <div className="about-hero">
                  <div className="about-logo-wrapper">
                    <SpaceLogo size={48} className="about-app-logo" />
                  </div>
                  <div className="about-hero-details">
                    <div className="about-hero-title-row">
                      <h2 className="about-app-name">{t('app.name')}</h2>
                      <span className="about-version-badge">v{versionLabel}</span>
                      <span className="about-credit-badge">{t('settings.developedByLabel', { developer: 'Sea' })}</span>
                    </div>
                    <p className="about-app-desc">{t('settings.aboutDescription')}</p>
                  </div>
                </div>

                <div className="about-meta-box">
                  <div className="about-meta-row">
                    <span className="about-meta-label">{t('settings.aboutPlatform')}</span>
                    <div className="about-meta-pills">
                      <span className="about-meta-pill">{t('settings.developedByLabel', { developer: 'Sea' })}</span>
                      <span className="about-meta-pill">{t('settings.licenseLabel', { license: 'GPL-2.0' })}</span>
                    </div>
                  </div>
                </div>

                <div className="settings-about-actions">
                  <button className="btn-secondary about-btn-link" type="button" onClick={onOpenSourceCode}>
                    <Icon d={ICONS.code} size={13} />
                    <span>{t('settings.openSourceCode')}</span>
                  </button>
                  <button className="btn-secondary about-btn-link" type="button" onClick={onOpenReleases}>
                    <Icon d={ICONS.external} size={13} />
                    <span>{t('settings.openReleases')}</span>
                  </button>
                  <button className="btn-primary" type="button" onClick={onCheckUpdates}>
                    <Icon d={ICONS.refresh} size={13} />
                    <span>{t('settings.checkForUpdates')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
