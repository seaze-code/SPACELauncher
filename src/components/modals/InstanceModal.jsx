import { useState, useRef, useEffect, useMemo } from 'react';
import { useI18n } from '../../context/I18nContext';
import { ICONS } from '../../constants/icons';
import { Icon } from '../common/CommonComponents';
import { JavaRuntimePicker } from '../common/JavaRuntimePicker';
import { MINECRAFT_INSTANCE_ICONS } from '../../constants/instanceIcons';
import { JVM_PRESETS } from '../../constants/jvmPresets';
import { loadLauncherCatalog } from '../../lib/minecraftLauncher';
import { launcher } from '../../services/launcherClient';

export function InstanceModal({
  mode = 'create', // 'create' | 'edit'
  instance = null,
  availableVersions = [],
  versionCatalog = [],
  installTargets = null,
  showSnapshots = false,
  onToggleSnapshots,
  onCatalogLoaded,
  systemTotalRam = 8,
  onClose,
  onSave,
}) {
  const { t } = useI18n();
  const fileInputRef = useRef(null);

  const detectLoader = (verId) => {
    if (!verId) return 'vanilla';
    const lower = verId.toLowerCase();
    if (lower.includes('fabric')) return 'fabric';
    if (lower.includes('neoforge')) return 'neoforge';
    if (lower.includes('forge')) return 'forge';
    if (lower.includes('quilt')) return 'quilt';
    return 'vanilla';
  };

  const [localCatalog, setLocalCatalog] = useState(versionCatalog);
  const [localTargets, setLocalTargets] = useState(installTargets);
  const [fetchingMojang, setFetchingMojang] = useState(versionCatalog.length === 0);
  const [versionFilter, setVersionFilter] = useState('');

  const hasSnapshotsInParent = versionCatalog.some(v => v.type === 'snapshot');
  const hasSnapshotsInLocal = localCatalog.some(v => v.type === 'snapshot');
  const effectiveCatalog = (versionCatalog.length > 0 && (!showSnapshots || hasSnapshotsInParent || !hasSnapshotsInLocal))
    ? versionCatalog
    : (localCatalog.length > 0 ? localCatalog : versionCatalog);
  const effectiveTargets = installTargets || localTargets;
  const hasSnapshotEntries = effectiveCatalog.some(v => v.type === 'snapshot');
  const snapshotFetchAttemptRef = useRef(false);

  const initialMojangRelease = effectiveCatalog.find(v => v.type === 'vanilla');
  const initialVersion = instance?.version
    || availableVersions[0]?.id
    || initialMojangRelease?.mcVer
    || initialMojangRelease?.id
    || effectiveCatalog[0]?.mcVer
    || effectiveCatalog[0]?.id
    || '1.21.4';
  const [name, setName] = useState(instance?.name || '');
  const [version, setVersion] = useState(initialVersion);
  const userPickedVersionRef = useRef(Boolean(instance?.version || availableVersions[0]?.id));
  const [loader, setLoader] = useState(instance?.loader || detectLoader(initialVersion));
  const [loaderVersion, setLoaderVersion] = useState('');
  const [autoInstallMissing, setAutoInstallMissing] = useState(true);
  const [icon, setIcon] = useState(instance?.icon || 'grass_block');
  const [customIconData, setCustomIconData] = useState(
    instance?.icon && (instance.icon === 'custom' || instance.icon.startsWith('data:image/'))
      ? instance.icon
      : null
  );
  const [ram, setRam] = useState(instance?.ram || 4);
  const [jvmArguments, setJvmArguments] = useState(instance?.jvmArguments || '');
  const [javaPath, setJavaPath] = useState(instance?.javaPath || '');
  const [serverAddress, setServerAddress] = useState(instance?.serverAddress || '');
  const [showAdvanced, setShowAdvanced] = useState(Boolean(instance?.serverAddress));

  useEffect(() => {
    if (!showSnapshots) {
      snapshotFetchAttemptRef.current = false;
    }
    const needsInitial = effectiveCatalog.length === 0;
    const needsSnapshots = Boolean(showSnapshots) && !hasSnapshotEntries && !snapshotFetchAttemptRef.current;
    if (!needsInitial && !needsSnapshots) {
      setFetchingMojang(false);
      return;
    }
    if (needsSnapshots) {
      snapshotFetchAttemptRef.current = true;
    }
    let cancelled = false;
    setFetchingMojang(true);
    const fetchFn = launcher.minecraftGetCatalog
      ? () => launcher.minecraftGetCatalog({ includeSnapshots: showSnapshots, showSnapshots })
      : () => loadLauncherCatalog({ includeSnapshots: showSnapshots });
    fetchFn()
      .then((catalog) => {
        if (cancelled || !catalog) return;
        if (Array.isArray(catalog.versions)) {
          setLocalCatalog(catalog.versions);
          if (!userPickedVersionRef.current) {
            const firstRelease = catalog.versions.find(v => v.type === 'vanilla');
            if (firstRelease) {
              setVersion(firstRelease.mcVer || firstRelease.id);
            }
          }
        }
        if (catalog.installTargets) setLocalTargets(catalog.installTargets);
        onCatalogLoaded?.(catalog);
      })
      .catch(() => { })
      .finally(() => {
        if (!cancelled) setFetchingMojang(false);
      });
    return () => { cancelled = true; };
  }, [effectiveCatalog.length, showSnapshots, hasSnapshotEntries, onCatalogLoaded]);

  const handleRefreshMojang = async (snapshotsFlag = showSnapshots) => {
    setFetchingMojang(true);
    try {
      const fetchFn = launcher.minecraftGetCatalog
        ? () => launcher.minecraftGetCatalog({ includeSnapshots: snapshotsFlag, showSnapshots: snapshotsFlag })
        : () => loadLauncherCatalog({ includeSnapshots: snapshotsFlag });
      const catalog = await fetchFn();
      if (catalog) {
        if (Array.isArray(catalog.versions)) setLocalCatalog(catalog.versions);
        if (catalog.installTargets) setLocalTargets(catalog.installTargets);
        onCatalogLoaded?.(catalog);
      }
    } catch (err) {
      console.warn('Failed to refresh Mojang catalog:', err);
    } finally {
      setFetchingMojang(false);
    }
  };

  const detectedFromVersion = detectLoader(version);
  const effectiveLoader = detectedFromVersion !== 'vanilla' ? detectedFromVersion : loader;

  const installedIdSet = useMemo(
    () => new Set(availableVersions.map(v => v.id)),
    [availableVersions]
  );

  const filteredInstalled = useMemo(() => {
    const q = versionFilter.trim().toLowerCase();
    if (!q) return availableVersions;
    return availableVersions.filter(v =>
      String(v.id || '').toLowerCase().includes(q) || String(v.label || '').toLowerCase().includes(q)
    );
  }, [availableVersions, versionFilter]);

  const mojangReleases = useMemo(() => {
    const q = versionFilter.trim().toLowerCase();
    return effectiveCatalog.filter(v => {
      if (v.type !== 'vanilla') return false;
      const mcVer = v.mcVer || v.id;
      if (installedIdSet.has(mcVer) || installedIdSet.has(v.id)) return false;
      if (!q) return true;
      return String(mcVer || '').toLowerCase().includes(q) || String(v.label || '').toLowerCase().includes(q);
    });
  }, [effectiveCatalog, installedIdSet, versionFilter]);

  const mojangSnapshots = useMemo(() => {
    if (!showSnapshots) return [];
    const q = versionFilter.trim().toLowerCase();
    return effectiveCatalog.filter(v => {
      if (v.type !== 'snapshot') return false;
      const mcVer = v.mcVer || v.id;
      if (installedIdSet.has(mcVer) || installedIdSet.has(v.id)) return false;
      if (!q) return true;
      return String(mcVer || '').toLowerCase().includes(q) || String(v.label || '').toLowerCase().includes(q);
    });
  }, [effectiveCatalog, installedIdSet, showSnapshots, versionFilter]);

  const loaderVersionOptions = useMemo(() => {
    if (detectedFromVersion !== 'vanilla' || effectiveLoader === 'vanilla') return [];
    const targetEntry = effectiveTargets?.[effectiveLoader];
    return targetEntry?.loadersByGameVersion?.[version] || [];
  }, [detectedFromVersion, effectiveLoader, effectiveTargets, version]);

  const resolvedLoaderVersion = loaderVersionOptions.includes(loaderVersion)
    ? loaderVersion
    : (loaderVersionOptions[0] || '');

  const needsInstall = useMemo(() => {
    if (!version) return false;
    if (detectedFromVersion !== 'vanilla') return false;
    if (effectiveLoader === 'vanilla') return !installedIdSet.has(version);
    const matchesInstalledLoader = availableVersions.some(v =>
      String(v.type || '').toLowerCase() === effectiveLoader &&
      (String(v.mcVer || '') === version || String(v.inheritsFrom || '') === version || String(v.id || '').includes(version))
    );
    return !matchesInstalledLoader;
  }, [version, detectedFromVersion, effectiveLoader, installedIdSet, availableVersions]);

  const handleVersionChange = (newVer) => {
    userPickedVersionRef.current = true;
    setVersion(newVer);
    const detected = detectLoader(newVer);
    setLoader(detected);
    setLoaderVersion('');
  };

  const handlePickCustomImage = async () => {
    // If running in Electron with native file picker available
    if (typeof window !== 'undefined' && window.launcher?.pickInstanceImage) {
      try {
        const res = await launcher.pickInstanceImage();
        if (!res?.canceled && res?.dataUri) {
          setCustomIconData(res.dataUri);
          setIcon('custom');
        }
        return;
      } catch (err) {
        console.warn('Native dialog error, falling back to file input:', err);
      }
    }
    // Fallback only if native picker is not available or throws
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUri = event.target?.result;
      if (dataUri && typeof dataUri === 'string') {
        setCustomIconData(dataUri);
        setIcon('custom');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveCustomIcon = () => {
    setCustomIconData(null);
    setIcon('grass_block');
  };

  const canSubmit = Boolean(name.trim());

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    let autoInstallTarget = null;
    if (needsInstall && autoInstallMissing) {
      if (effectiveLoader === 'vanilla') {
        autoInstallTarget = { type: 'minecraft', version: version.trim() };
      } else if (resolvedLoaderVersion) {
        autoInstallTarget = {
          type: effectiveLoader,
          gameVersion: version.trim(),
          loaderVersion: resolvedLoaderVersion,
        };
      }
    }

    onSave({
      id: instance?.id,
      name: name.trim(),
      version: version.trim(),
      loader: effectiveLoader,
      icon,
      customIconData: icon === 'custom' ? customIconData : null,
      ram: Number(ram) || 4,
      jvmArguments: jvmArguments.trim(),
      javaPath: javaPath.trim(),
      serverAddress: serverAddress.trim(),
      autoInstallTarget,
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 540 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
        />
        <div className="modal-title">
          {mode === 'edit'
            ? t('instances.editTitle')
            : t('instances.createTitle')}
        </div>
        <div className="modal-subtitle">
          {mode === 'edit'
            ? t('instances.editSubtitle')
            : t('instances.createSubtitle')}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Nombre */}
          <div className="modal-field" style={{ margin: 0 }}>
            <label className="modal-label">
              <span>{t('instances.nameLabel')}</span>
              <span style={{ color: 'var(--accent)', fontSize: 10 }}>{t('common.required')}</span>
            </label>
            <input
              className="modal-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('instances.namePlaceholder')}
              autoFocus
            />
          </div>

          {/* Selector de Icono de Bloques / Items de Minecraft */}
          <div className="modal-field" style={{ margin: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="modal-label" style={{ margin: 0 }}>
                <span>{t('instances.iconLabel')}</span>
              </label>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handlePickCustomImage}
                style={{ padding: '4px 10px', fontSize: 11, gap: 5 }}
              >
                <Icon d={ICONS.download} size={12} />
                <span>{t('instances.chooseCustomIcon')}</span>
              </button>
            </div>

            {/* Custom Icon Preview if active */}
            {customIconData && icon === 'custom' && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                background: 'rgba(74, 158, 255, 0.1)',
                border: '1px solid var(--accent)',
                borderRadius: 8,
                marginBottom: 10
              }}>
                <img
                  src={customIconData}
                  alt="Custom icon"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 6,
                    objectFit: 'cover',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.2)'
                  }}
                />
                <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-main)', fontWeight: 600 }}>
                  {t('instances.chooseCustomIcon')}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleRemoveCustomIcon}
                  style={{ padding: '5px 8px', fontSize: 11, color: 'var(--danger)' }}
                  title={t('instances.removeCustomIcon')}
                >
                  <Icon d={ICONS.trash} size={12} />
                </button>
              </div>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))',
              gap: 8,
              maxHeight: 140,
              overflowY: 'auto',
              padding: '6px',
              background: 'rgba(0, 0, 0, 0.25)',
              borderRadius: 8,
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              {/* If custom icon exists, render it as selectable first item */}
              {customIconData && (
                <button
                  type="button"
                  onClick={() => setIcon('custom')}
                  title="Custom Icon"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    border: icon === 'custom' ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.06)',
                    background: icon === 'custom' ? 'rgba(74, 158, 255, 0.2)' : 'rgba(255,255,255,0.03)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 4,
                    transition: 'all 0.1s ease',
                    boxShadow: icon === 'custom' ? '0 0 10px rgba(74, 158, 255, 0.35)' : 'none'
                  }}
                >
                  <img
                    src={customIconData}
                    alt="Custom"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 4,
                      objectFit: 'cover'
                    }}
                  />
                </button>
              )}
              {MINECRAFT_INSTANCE_ICONS.map(item => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => {
                    setIcon(item.id);
                  }}
                  title={item.name}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    border: icon === item.id ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.06)',
                    background: icon === item.id ? 'rgba(74, 158, 255, 0.2)' : 'rgba(255,255,255,0.03)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 6,
                    transition: 'all 0.1s ease',
                    boxShadow: icon === item.id ? '0 0 10px rgba(74, 158, 255, 0.35)' : 'none'
                  }}
                >
                  <img
                    src={item.src}
                    alt={item.name}
                    style={{
                      width: 28,
                      height: 28,
                      imageRendering: 'pixelated',
                      objectFit: 'contain'
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Version (from Mojang & Local) and Modloader */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                className="modal-input"
                style={{ flex: 1, fontSize: 12, padding: '6px 10px' }}
                value={versionFilter}
                onChange={e => setVersionFilter(e.target.value)}
                placeholder={t('instances.versionSearchPlaceholder')}
              />
              <button
                type="button"
                className="btn-secondary btn-icon-square"
                onClick={() => handleRefreshMojang(showSnapshots)}
                disabled={fetchingMojang}
                title={t('instances.refreshMojang')}
              >
                <Icon d={ICONS.refresh} size={13} className={fetchingMojang ? 'spin-infinite' : ''} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="modal-field" style={{ margin: 0 }}>
                <label className="modal-label">
                  <span>{t('instances.versionLabel')}</span>
                </label>
                {filteredInstalled.length > 0 || mojangReleases.length > 0 || mojangSnapshots.length > 0 ? (
                  <select className="modal-select" value={version} onChange={e => handleVersionChange(e.target.value)}>
                    {version &&
                      !installedIdSet.has(version) &&
                      !effectiveCatalog.some(v => (v.type === 'vanilla' || v.type === 'snapshot') && (v.mcVer || v.id) === version) && (
                        <option value={version}>{version}</option>
                    )}
                    {filteredInstalled.length > 0 && (
                      <optgroup label={t('instances.installedGroup')}>
                        {filteredInstalled.map(v => (
                          <option key={`inst-${v.id}`} value={v.id}>
                            {v.label || v.id}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {mojangSnapshots.length > 0 && (
                      <optgroup label={t('instances.snapshotsGroup')}>
                        {mojangSnapshots.map(v => {
                          const mcVer = v.mcVer || v.id;
                          return (
                            <option key={`snap-${v.id}`} value={mcVer}>
                              {mcVer} ({v.type})
                            </option>
                          );
                        })}
                      </optgroup>
                    )}
                    {mojangReleases.length > 0 && (
                      <optgroup label={t('instances.mojangGroup')}>
                        {mojangReleases.map(v => {
                          const mcVer = v.mcVer || v.id;
                          return (
                            <option key={`moj-${v.id}`} value={mcVer}>
                              {mcVer}
                            </option>
                          );
                        })}
                      </optgroup>
                    )}
                  </select>
                ) : fetchingMojang ? (
                  <div className="modal-input" style={{ display: 'flex', alignItems: 'center', minHeight: 34, fontSize: 12, color: 'var(--text-muted)' }}>
                    {t('instances.loadingMojang')}
                  </div>
                ) : (
                  <input
                    className="modal-input"
                    value={version}
                    onChange={e => handleVersionChange(e.target.value)}
                    placeholder="1.21.4"
                  />
                )}
              </div>

              <div className="modal-field" style={{ margin: 0 }}>
                <label className="modal-label">
                  <span>{t('instances.loaderLabel')}</span>
                  {detectedFromVersion !== 'vanilla' && (
                    <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>
                      {t('instances.autoDetected')}
                    </span>
                  )}
                </label>
                <select
                  className="modal-select"
                  value={effectiveLoader}
                  onChange={e => {
                    setLoader(e.target.value);
                    setLoaderVersion('');
                  }}
                  disabled={detectedFromVersion !== 'vanilla'}
                  style={{ opacity: detectedFromVersion !== 'vanilla' ? 0.75 : 1 }}
                >
                  <option value="vanilla">Vanilla</option>
                  <option value="fabric">Fabric</option>
                  <option value="forge">Forge</option>
                  <option value="neoforge">NeoForge</option>
                  <option value="quilt">Quilt</option>
                </select>
              </div>
            </div>

            {loaderVersionOptions.length > 0 && (
              <div className="modal-field" style={{ margin: 0 }}>
                <label className="modal-label">
                  <span>{t('instances.loaderVersionLabel')}</span>
                </label>
                <select
                  className="modal-select"
                  value={resolvedLoaderVersion}
                  onChange={e => setLoaderVersion(e.target.value)}
                >
                  {loaderVersionOptions.map(lv => (
                    <option key={lv} value={lv}>{lv}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              {onToggleSnapshots && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(showSnapshots)}
                    onChange={() => {
                      const nextSnap = !showSnapshots;
                      snapshotFetchAttemptRef.current = false;
                      setFetchingMojang(true);
                      if (onToggleSnapshots) {
                        onToggleSnapshots(nextSnap);
                      } else {
                        handleRefreshMojang(nextSnap);
                      }
                    }}
                  />
                  <span>{t('install.showSnapshots')}</span>
                </label>
              )}

              {needsInstall && (effectiveLoader === 'vanilla' || resolvedLoaderVersion) && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--accent-bright)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={autoInstallMissing}
                    onChange={e => setAutoInstallMissing(e.target.checked)}
                  />
                  <span>{t('instances.autoInstallVersion')}</span>
                </label>
              )}
            </div>
          </div>

          {/* RAM Asignada */}
          <div className="modal-field" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-main)' }}>
                {t('instances.allocatedRam', { ram })}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {systemTotalRam ? t('instances.systemRam', { total: systemTotalRam }) : ''}
              </span>
            </div>
            <input
              type="range"
              min="2"
              max={systemTotalRam ? Math.max(8, systemTotalRam) : 16}
              step="1"
              value={ram}
              onChange={e => setRam(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
          </div>

          {/* Toggle de opciones avanzadas */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: 0
              }}
            >
              <Icon d={showAdvanced ? ICONS.chevronUp : ICONS.chevronDown} size={14} />
              <span>{showAdvanced ? t('instances.hideAdvanced') : t('instances.showAdvanced')}</span>
            </button>

            {showAdvanced && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="modal-field" style={{ margin: 0 }}>
                  <label className="modal-label">
                    <span>{t('instances.jvmArgs')}</span>
                  </label>
                  <div className="jvm-preset-row">
                    {JVM_PRESETS.map(preset => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`jvm-preset-chip ${jvmArguments.trim() === preset.args ? 'active' : ''}`}
                        onClick={() => setJvmArguments(preset.args)}
                      >
                        {t(preset.labelKey) || preset.fallbackLabel}
                      </button>
                    ))}
                  </div>
                  <input
                    className="modal-input"
                    value={jvmArguments}
                    onChange={e => setJvmArguments(e.target.value)}
                    placeholder={t('instances.jvmArgsPlaceholder')}
                  />
                </div>

                <div className="modal-field" style={{ margin: 0 }}>
                  <label className="modal-label">
                    <span>{t('instances.quickJoinLabel')}</span>
                  </label>
                  <input
                    className="modal-input"
                    value={serverAddress}
                    onChange={e => setServerAddress(e.target.value)}
                    placeholder="play.example.com:25565"
                  />
                </div>

                <div className="modal-field" style={{ margin: 0 }}>
                  <label className="modal-label">
                    <span>{t('instances.javaPath')}</span>
                  </label>
                  <JavaRuntimePicker
                    value={javaPath}
                    onChange={setJavaPath}
                    placeholder={t('instances.javaPathPlaceholder')}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Botones de acción */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('common.cancel') || t('accountModal.close')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
              {mode === 'edit'
                ? t('common.save')
                : t('instances.createSubmit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
