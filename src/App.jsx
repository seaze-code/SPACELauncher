import { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';
import {
  INSTALL_TARGETS,
  getVersionById,
  loadLauncherCatalog,
  resolveMinecraftVersion,
} from './lib/minecraftLauncher';
import {
  searchModrinthProjects,
} from './lib/modrinth';
import { useI18n } from './context/I18nContext';
import { SpaceLogo } from './components/common/SpaceLogo';
import { launcher, minecraftLoginWithAbort } from './services/launcherClient';
import { ICONS } from './constants/icons';
import {
  Icon,
  MicrosoftLogo,
  SkinHeadAvatar,
  Toast,
} from './components/common/CommonComponents';
import {
  ProfileCardActions,
} from './components/cards/Cards';
import { ModConflictModal } from './components/modals/ModConflictModal';
import { ProjectDetailView } from './components/views/ProjectDetailView';
import { InstanceDetailView } from './components/views/InstanceDetailView';
import { HomeNewsSection } from './components/views/HomeNewsSection';
import { SettingsView } from './components/views/SettingsView';
import { ExploreTab } from './components/views/tabs/ExploreTab';
import { InstancesTab } from './components/views/tabs/InstancesTab';
import { SkinsTab } from './components/views/tabs/SkinsTab';
import { useToasts } from './hooks/useToasts';
import { useLauncherLogs } from './hooks/useLauncherLogs';
import {
  ProfileModal,
  LoginLoadingModal,
  UpdateModal,
} from './components/modals/LauncherModals';
import { InstanceModal } from './components/modals/InstanceModal';
import { AccountModal } from './components/modals/AccountModal';
import { AddContentSourceModal } from './components/modals/AddContentSourceModal';
import { CommandPaletteModal } from './components/modals/CommandPaletteModal';
import { MigrateInstanceModal } from './components/modals/MigrateInstanceModal';
import { ConfirmModal } from './components/modals/ConfirmModal';
import { getInstanceIconSrc } from './constants/instanceIcons';
import { SPACE_THEMES } from './constants/themes';
import {
  createOfflineSession,
  getMcHeadsAvatarUrl,
  findModInList,
} from './utils/formatters';

const APP_SOURCE_URL = 'https://github.com/seaze-code/SPACELauncher';
const APP_RELEASES_URL = 'https://github.com/seaze-code/SPACELauncher/releases/latest';

export default function App() {
  const { language, setLanguage, t } = useI18n();
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [stateHydrated, setStateHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [instanceWorkspaceOpen, setInstanceWorkspaceOpen] = useState(false);
  const [instanceSubTab, setInstanceSubTab] = useState('mods'); // 'mods' | 'shaders' | 'resourcepacks' | 'datapacks' | 'console'
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [exploreType, setExploreType] = useState('mods'); // 'mods' | 'shaders' | 'resourcepacks' | 'datapacks'
  const [modSearch, setModSearch] = useState('');
  const [shaderSearch, setShaderSearch] = useState('');
  const [resourcePackSearch, setResourcePackSearch] = useState('');
  const [datapackSearch, setDatapackSearch] = useState('');

  const [versionCatalog, setVersionCatalog] = useState([]);
  const [installedVersions, setInstalledVersions] = useState([]);
  const [installTargets, setInstallTargets] = useState(INSTALL_TARGETS);
  const [mods, setMods] = useState([]);
  const [shaders, setShaders] = useState([]);
  const [resourcePacks, setResourcePacks] = useState([]);
  const [datapacks, setDatapacks] = useState([]);
  const [modrinthQueries, setModrinthQueries] = useState({ mods: '', modpacks: '', shaders: '', resourcepacks: '', datapacks: '' });
  const [modrinthCategories, setModrinthCategories] = useState({ mods: 'all', modpacks: 'all', shaders: 'all', resourcepacks: 'all', datapacks: 'all' });

  const modrinthQuery = modrinthQueries[exploreType] || '';
  const modrinthCategory = modrinthCategories[exploreType] || 'all';

  const setModrinthQuery = (val) => {
    setModrinthQueries(prev => ({
      ...prev,
      [exploreType]: typeof val === 'function' ? val(prev[exploreType] || '') : val,
    }));
  };

  const setModrinthCategory = (val) => {
    setModrinthCategories(prev => ({
      ...prev,
      [exploreType]: typeof val === 'function' ? val(prev[exploreType] || 'all') : val,
    }));
  };

  const [modrinthSort, setModrinthSort] = useState('relevance');
  const [modrinthLoaderFilter, setModrinthLoaderFilter] = useState('auto');
  const [modrinthVersionFilter, setModrinthVersionFilter] = useState('auto');
  const [modrinthResults, setModrinthResults] = useState([]);
  const [modrinthTotalHits, setModrinthTotalHits] = useState(0);
  const [modrinthLoading, setModrinthLoading] = useState(false);
  const [modrinthLoadingMore, setModrinthLoadingMore] = useState(false);
  const [modrinthInstalling, setModrinthInstalling] = useState({});
  const [selectedModDetail, setSelectedModDetail] = useState(null); // null | { project, initialTab: 'overview' | 'versions' }
  const [installingVersionId, setInstallingVersionId] = useState(null);
  const [modUpdates, setModUpdates] = useState({});
  const [checkingModUpdates, setCheckingModUpdates] = useState(false);
  const [updatingMods, setUpdatingMods] = useState(new Set());
  const [modConflict, setModConflict] = useState(null);
  const {
    logs,
    setLogs,
    addLog,
    clearLogs,
    flushLogs,
    logFilter,
    setLogFilter,
    autoScroll,
    setAutoScroll,
  } = useLauncherLogs();
  const { toasts, pushToast, dismissToast } = useToasts();
  const [gameState, setGameState] = useState('idle'); // idle | loading | running
  const [progress, setProgress] = useState(0);
  const [runPid, setRunPid] = useState(null);
  const [installId, setInstallId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [updateState, setUpdateState] = useState({ phase: 'idle', progress: 0, message: '' });
  const [updateModalInfo, setUpdateModalInfo] = useState(null);
  const [instances, setInstances] = useState([]);
  const [activeInstanceId, setActiveInstanceId] = useState(null);
  const [instanceEditor, setInstanceEditor] = useState(null); // null | { mode: 'create' | 'edit', instance: null }
  const [migrateModalOpen, setMigrateModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [addContentChoice, setAddContentChoice] = useState(null); // null | 'mods' | 'shaders' | 'resourcepacks' | 'datapacks'
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState('general');
  const [systemTheme, setSystemTheme] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  ));
  const [confirmDialog, setConfirmDialog] = useState(null); // null | { title, message, confirmText, cancelText, danger, onConfirm }
  const [profileEditor, setProfileEditor] = useState(null); // null | { mode: 'new' | 'edit', profileId: number | null }
  const [account, setAccount] = useState({ name: '', loggedIn: false, profileKey: 'default', kind: 'none', session: null });
  const [authRefreshing, setAuthRefreshing] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [skinsLibrary, setSkinsLibrary] = useState([]);
  const [activeLocalSkinByProfile, setActiveLocalSkinByProfile] = useState({});
  const [microsoftSkinDataUri, setMicrosoftSkinDataUri] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [systemTotalRam, setSystemTotalRam] = useState(
    typeof launcher?.systemTotalRamGb === 'number' && launcher.systemTotalRamGb > 0
      ? launcher.systemTotalRamGb
      : null
  );
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [settings, setSettings] = useState({
    keepOpen: false,
    launchBehavior: 'hide',
    showConsole: true,
    autoUpdate: true,
    showSnapshots: false,
    javaPath: '',
    minecraftRoot: '',
    language,
    theme: 'system',
    compactMode: false,
    reduceMotion: false,
  });
  const consoleRef = useRef(null);
  const modrinthSentinelRef = useRef(null);
  const profileMenuRef = useRef(null);
  const gameTimerRef = useRef(null);
  const playSessionRef = useRef(null);
  const loginAbortControllerRef = useRef(null);

  useEffect(() => {
    let active = true;
    launcher.getSystemTheme?.().then((tMode) => {
      if (active && (tMode === 'light' || tMode === 'dark')) {
        setSystemTheme(tMode);
      }
    }).catch(() => {});

    const mql = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: light)') : null;
    const handleMediaChange = (e) => {
      setSystemTheme(e.matches ? 'light' : 'dark');
    };
    mql?.addEventListener?.('change', handleMediaChange);

    const unsubSystemTheme = launcher.on?.('app:system-theme-changed', (nextMode) => {
      if (nextMode === 'light' || nextMode === 'dark') {
        setSystemTheme(nextMode);
      }
    });

    const handleGlobalShortcut = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalShortcut);

    return () => {
      active = false;
      mql?.removeEventListener?.('change', handleMediaChange);
      if (typeof unsubSystemTheme === 'function') unsubSystemTheme();
      window.removeEventListener('keydown', handleGlobalShortcut);
    };
  }, []);

  const effectiveTheme = settings.theme === 'system' || !settings.theme
    ? systemTheme
    : settings.theme;

  useEffect(() => {
    const root = document.documentElement;
    if (!root) return;
    root.dataset.theme = effectiveTheme;
    root.dataset.density = settings.compactMode ? 'compact' : 'comfortable';
    root.dataset.motion = settings.reduceMotion ? 'reduced' : 'full';
    launcher.setWindowTheme?.(effectiveTheme);
  }, [effectiveTheme, settings.compactMode, settings.reduceMotion]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handleClickOutside = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setProfileMenuOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setProfileMenuOpen(false);
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [profileMenuOpen]);

  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0] || null;
  const activeProfileVersion = activeProfile?.version
    ? installedVersions.find(v => v.id === activeProfile.version) || getVersionById(activeProfile.version, versionCatalog)
    : null;
  const activeVersion = activeProfileVersion || installedVersions[0] || versionCatalog[0] || null;
  const selectedInstalledVersionId = activeProfile?.version
    || installedVersions[0]?.id
    || versionCatalog.find(v => v.type === 'vanilla')?.mcVer
    || versionCatalog[0]?.mcVer
    || versionCatalog[0]?.id
    || '';

  const stateRef = useRef({ profiles, activeProfileId, activeInstanceId, mods, shaders, resourcePacks, datapacks, logs, settings, versionCatalog, installTargets });
  useEffect(() => {
    stateRef.current = { profiles, activeProfileId, activeInstanceId, mods, shaders, resourcePacks, datapacks, logs, settings, versionCatalog, installTargets };
  }, [profiles, activeProfileId, activeInstanceId, mods, shaders, resourcePacks, datapacks, logs, settings, versionCatalog, installTargets]);



  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
      pushToast({
        tone: 'warning',
        title: t('offline.badge'),
        message: t('offline.noConnectionToast'),
      });
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [t, pushToast]);

  // Listen for the native macOS "About" menu item which sends this event
  // from the main process via mainWindow.webContents.send('app:show-about').
  useEffect(() => {
    if (typeof launcher?.on !== 'function') return;
    const unsub = launcher.on('app:show-about', () => {
      setSelectedModDetail(null);
      setSettingsSection('about');
      setActiveTab('settings');
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  useEffect(() => {
    if (autoScroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const persistState = useCallback((updates = {}) => {
    const currentState = stateRef.current;
    const nextState = {
      profiles: updates.profiles !== undefined ? updates.profiles : currentState.profiles,
      activeProfileId: updates.activeProfileId !== undefined ? updates.activeProfileId : currentState.activeProfileId,
      activeInstanceId: updates.activeInstanceId !== undefined ? updates.activeInstanceId : currentState.activeInstanceId,
      mods: updates.mods !== undefined ? updates.mods : currentState.mods,
      shaders: updates.shaders !== undefined ? updates.shaders : currentState.shaders,
      resourcePacks: updates.resourcePacks !== undefined ? updates.resourcePacks : currentState.resourcePacks,
      datapacks: updates.datapacks !== undefined ? updates.datapacks : currentState.datapacks,
      logs: updates.logs !== undefined ? updates.logs : currentState.logs,
      versions: updates.versions !== undefined ? updates.versions : currentState.versionCatalog,
      installTargets: updates.installTargets !== undefined ? updates.installTargets : currentState.installTargets,
      settings: updates.settings !== undefined ? updates.settings : currentState.settings,
    };
    stateRef.current = { ...currentState, ...nextState, versionCatalog: nextState.versions, logs: nextState.logs };
    if (nextState.activeInstanceId !== undefined) {
      try {
        if (nextState.activeInstanceId) {
          localStorage.setItem('spacelauncher_active_instance', nextState.activeInstanceId);
        } else {
          localStorage.removeItem('spacelauncher_active_instance');
        }
        localStorage.removeItem('openlauncher_active_instance');
      } catch { }
    }
    launcher.minecraftSaveState?.(nextState);
  }, []);

  // Event listeners for installation and launcher lifecycle + state hydration
  useEffect(() => {
    const installProgressOff = launcher.on?.('minecraft:install-progress', (p) => {
      if (typeof p?.percent === 'number' && Number.isFinite(p.percent)) setProgress(p.percent);
      if (p?.message) addLog('info', p.message);
      if (p?.installId) setInstallId(p.installId);
    });

    const installFileOff = launcher.on?.('minecraft:install-file-progress', (f) => {
      if (typeof f?.percent === 'number' && Number.isFinite(f.percent)) {
        setProgress(f.percent);
      }
    });

    const installCompleteOff = launcher.on?.('minecraft:install-complete', (r) => {
      addLog('success', `Installation completed: ${r?.version || r?.label || 'version'}`);
      setProgress(100);
      setInstallId(null);
      pushToast({
        tone: 'success',
        title: t('install.minecraft') || 'Install',
        message: `${r?.version || r?.label || 'Version'} installed`,
      });
      launcher.minecraftGetInstalledVersions?.().then((versions) => {
        if (Array.isArray(versions)) {
          setInstalledVersions(versions);
          const currentProfiles = stateRef.current.profiles;
          const curActiveId = stateRef.current.activeProfileId;
          const curActiveProfile = currentProfiles.find(p => p.id === curActiveId);
          if (versions.length > 0 && !curActiveProfile?.version) {
            const nextProfiles = currentProfiles.map(p => p.id === curActiveId ? { ...p, version: versions[0].id } : p);
            setProfiles(nextProfiles);
            persistState({ profiles: nextProfiles });
          }
        }
      });
    });

    const installErrorOff = launcher.on?.('minecraft:install-error', (e) => {
      addLog('error', `Installation error: ${e?.message || e}`);
      setInstallId(null);
      pushToast({
        tone: 'error',
        title: t('install.minecraft') || 'Install',
        message: String(e?.message || e || 'Installation failed'),
      });
    });

    const installCancelledOff = launcher.on?.('minecraft:install-cancelled', (e) => {
      addLog('info', `Installation cancelled: ${e?.message || 'user cancelled'}`);
      setInstallId(null);
    });

    const updateAvailableOff = launcher.on?.('minecraft:update-available', (info) => {
      if (info?.available) {
        setUpdateModalInfo(info);
      }
    });

    const updateStatusOff = launcher.on?.('minecraft:update-status', (u) => {
      if (u?.phase) {
        setUpdateState(prev => ({
          ...prev,
          phase: u.phase,
          message: u.message || '',
          currentVersion: u.currentVersion,
          latestVersion: u.latestVersion,
        }));
      }
    });

    const updateProgressOff = launcher.on?.('minecraft:update-progress', (u) => {
      if (typeof u?.percent === 'number') {
        setUpdateState(prev => ({
          ...prev,
          phase: u.phase || 'downloading',
          progress: u.percent,
          assetName: u.assetName,
        }));
      }
    });

    const updateCompleteOff = launcher.on?.('minecraft:update-complete', () => {
      setUpdateState(prev => ({
        ...prev,
        phase: 'complete',
        message: 'Update ready',
      }));
    });

    const runLogOff = launcher.on?.('minecraft:run-log', (l) => {
      const type = l?.type === 'stderr' || l?.type === 'error' ? 'error' : l?.type === 'warn' ? 'warn' : 'info';
      addLog(type, l?.msg || '');
    });

    const assetProgressOff = launcher.on?.('minecraft:asset-progress', (a) => {
      if (typeof a?.percent === 'number' && Number.isFinite(a.percent)) {
        setProgress(a.percent);
      }
    });

    const runExitOff = launcher.on?.('minecraft:run-exit', async (s) => {
      addLog('info', `Game process exited with code ${s?.code}`);
      setGameState('idle');
      setRunPid(null);
      const activeSession = playSessionRef.current;
      playSessionRef.current = null;
      if (activeSession?.instanceId && activeSession?.startedAt) {
        const elapsedMs = Math.max(0, Date.now() - activeSession.startedAt);
        try {
          const curList = await launcher.getInstances?.();
          const targetInst = Array.isArray(curList) ? curList.find(i => i.id === activeSession.instanceId) : null;
          if (targetInst) {
            const nextPlaytime = (Number(targetInst.playTimeMs) || 0) + elapsedMs;
            await launcher.updateInstance?.(targetInst.id, {
              lastPlayed: Date.now(),
              playTimeMs: nextPlaytime,
            });
            const refreshed = await launcher.getInstances?.();
            if (Array.isArray(refreshed)) setInstances(refreshed);
          }
        } catch { }
      }
    });

    const modConflictOff = launcher.on?.('minecraft:mod-conflict', (conflictData) => {
      setModConflict(conflictData);
    });

    const openAboutOff = launcher.on?.('app:open-about', () => {
      setSelectedModDetail(null);
      setSettingsSection('about');
      setActiveTab('settings');
    });

    const initializeLauncher = async () => {
      try {
        const state = await launcher.minecraftGetState();
        if (state?.profiles && Array.isArray(state.profiles) && state.profiles.length > 0) {
          setProfiles(state.profiles);
          const activeId = state.activeProfileId && state.profiles.some(p => p.id === state.activeProfileId)
            ? state.activeProfileId
            : state.profiles[0].id;
          setActiveProfileId(activeId);
        } else {
          const defaultProfile = {
            id: 'default',
            name: 'Default',
            localName: 'Player',
            version: null,
            ram: 4,
            jvmArguments: '',
            javaPath: '',
          };
          setProfiles([defaultProfile]);
          setActiveProfileId('default');
        }

        if (state?.settings) {
          setSettings(prev => ({
            ...prev,
            ...state.settings,
            language: state.settings.language || language,
          }));
        }

        if (state?.mods && Array.isArray(state.mods)) {
          setMods(state.mods);
        }

        if (state?.shaders && Array.isArray(state.shaders)) {
          setShaders(state.shaders);
        }

        if (state?.resourcePacks && Array.isArray(state.resourcePacks)) {
          setResourcePacks(state.resourcePacks);
        }

        if (state?.datapacks && Array.isArray(state.datapacks)) {
          setDatapacks(state.datapacks);
        }

        if (state?.logs && Array.isArray(state.logs)) {
          setLogs(state.logs);
        }

        const rootRes = await launcher.minecraftGetRoot?.();
        if (rootRes?.root) {
          setSettings(prev => ({ ...prev, minecraftRoot: rootRes.root }));
        }

        const [instVers, loadedInstances] = await Promise.all([
          launcher.minecraftGetInstalledVersions ? launcher.minecraftGetInstalledVersions().catch(() => []) : [],
          launcher.getInstances ? launcher.getInstances().catch(() => []) : [],
        ]);

        const targetInstanceIdCandidate = state?.activeInstanceId || (() => {
          try {
            return localStorage.getItem('spacelauncher_active_instance')
              || localStorage.getItem('openlauncher_active_instance');
          } catch { return null; }
        })();

        let resolvedActiveInstanceId = null;
        if (Array.isArray(loadedInstances)) {
          setInstances(loadedInstances);
          if (targetInstanceIdCandidate && loadedInstances.some(inst => inst.id === targetInstanceIdCandidate)) {
            resolvedActiveInstanceId = targetInstanceIdCandidate;
          } else {
            resolvedActiveInstanceId = loadedInstances[0]?.id || null;
          }
          setActiveInstanceId(resolvedActiveInstanceId);
        }

        if (launcher.skinGetLibrary) {
          launcher.skinGetLibrary()
            .then(lib => {
              if (Array.isArray(lib?.skins)) setSkinsLibrary(lib.skins);
              if (lib?.activeByProfile) setActiveLocalSkinByProfile(lib.activeByProfile);
            })
            .catch(() => { });
        }

        const [instMods, instShaders, instPacks, instDatapacks] = await Promise.all([
          launcher.minecraftGetInstalledMods ? launcher.minecraftGetInstalledMods(resolvedActiveInstanceId).catch(() => []) : [],
          launcher.minecraftGetInstalledShaders ? launcher.minecraftGetInstalledShaders(resolvedActiveInstanceId).catch(() => []) : [],
          launcher.minecraftGetInstalledResourcePacks ? launcher.minecraftGetInstalledResourcePacks(resolvedActiveInstanceId).catch(() => []) : [],
          launcher.minecraftGetInstalledDatapacks ? launcher.minecraftGetInstalledDatapacks(resolvedActiveInstanceId).catch(() => []) : [],
        ]);

        if (Array.isArray(instVers)) setInstalledVersions(instVers);
        if (Array.isArray(instMods)) setMods(instMods);
        if (Array.isArray(instShaders)) setShaders(instShaders);
        if (Array.isArray(instPacks)) setResourcePacks(instPacks);
        if (Array.isArray(instDatapacks)) setDatapacks(instDatapacks);

        persistState({
          activeInstanceId: resolvedActiveInstanceId,
          mods: Array.isArray(instMods) ? instMods : state?.mods || [],
          shaders: Array.isArray(instShaders) ? instShaders : state?.shaders || [],
          resourcePacks: Array.isArray(instPacks) ? instPacks : state?.resourcePacks || [],
          datapacks: Array.isArray(instDatapacks) ? instDatapacks : state?.datapacks || [],
        });

        let snapshot = null;
        if (launcher.minecraftGetCatalog) {
          snapshot = await launcher.minecraftGetCatalog({ includeSnapshots: state?.settings?.showSnapshots === true });
        }
        if (!snapshot || !snapshot.versions || snapshot.versions.length === 0) {
          snapshot = await loadLauncherCatalog({ includeSnapshots: state?.settings?.showSnapshots === true });
        }

        if (snapshot?.versions?.length > 0) {
          setVersionCatalog(snapshot.versions);
        }
        if (snapshot?.installTargets) {
          setInstallTargets(snapshot.installTargets);
        }

        if (state?.settings?.autoUpdate !== false) {
          launcher.minecraftCheckUpdate?.()
            .then(res => {
              if (res?.available) {
                setUpdateModalInfo(res);
              }
            })
            .catch(() => { });
        }
      } catch (err) {
        console.error('Failed to initialize launcher state:', err);
      } finally {
        setStateHydrated(true);
      }
    };

    launcher.getAppVersion?.()
      .then(ver => {
        if (ver) setAppVersion(String(ver));
      })
      .catch(() => { });

    launcher.getSystemInfo?.()
      .then(info => {
        if (info?.totalRamGb && info.totalRamGb > 0) {
          setSystemTotalRam(info.totalRamGb);
        }
      })
      .catch(() => { });

    initializeLauncher();

    return () => {
      installProgressOff?.();
      installFileOff?.();
      installCompleteOff?.();
      installErrorOff?.();
      installCancelledOff?.();
      updateAvailableOff?.();
      updateStatusOff?.();
      updateProgressOff?.();
      updateCompleteOff?.();
      runLogOff?.();
      assetProgressOff?.();
      runExitOff?.();
      modConflictOff?.();
      openAboutOff?.();
    };
  }, [addLog, language, persistState]);

  const handleOpenSourceCode = () => {
    launcher.openExternal?.(APP_SOURCE_URL).catch(() => { });
  };

  const handleOpenReleases = () => {
    launcher.openExternal?.(APP_RELEASES_URL).catch(() => { });
  };

  // Account sync with active profile
  useEffect(() => {
    if (!activeProfile) return;
    const profileKey = String(activeProfile.id || 'default');
    let isMounted = true;
    setAuthRefreshing(true);

    launcher.minecraftGetAuthState(profileKey)
      .then(auth => {
        if (!isMounted) return;
        if (auth?.loggedIn && auth.name) {
          setAccount({
            name: auth.name,
            loggedIn: true,
            profileKey,
            kind: 'microsoft',
            session: auth,
          });
          if (activeProfile.skinName !== auth.name || activeProfile.microsoftAccount !== auth.name) {
            setProfiles(prev => {
              const next = prev.map(p => p.id === profileKey ? { ...p, skinName: auth.name, microsoftAccount: auth.name, localName: auth.name } : p);
              persistState({ profiles: next, activeProfileId: profileKey });
              return next;
            });
          }
        } else if (auth?.hasStoredToken && (auth?.name || activeProfile.skinName || activeProfile.microsoftAccount)) {
          // Token is stored on disk but we had a transient error (e.g. offline) -> keep Microsoft identity
          const savedName = auth.name || activeProfile.skinName || activeProfile.microsoftAccount || 'Player';
          setAccount({
            name: savedName,
            loggedIn: true,
            profileKey,
            kind: 'microsoft',
            session: auth?.access_token ? auth : createOfflineSession(savedName),
          });
        } else {
          const fallbackName = String(activeProfile.skinName || activeProfile.localName || activeProfile.name || '').trim();
          if (fallbackName) {
            setAccount({
              name: fallbackName,
              loggedIn: true,
              profileKey,
              kind: 'local',
              session: createOfflineSession(fallbackName),
            });
          } else {
            setAccount({ name: '', loggedIn: false, profileKey, kind: 'none', session: null });
          }
        }
      })
      .catch(() => {
        if (!isMounted) return;
        const fallbackName = String(activeProfile.skinName || activeProfile.localName || activeProfile.name || '').trim();
        setAccount({
          name: fallbackName,
          loggedIn: Boolean(fallbackName),
          profileKey,
          kind: fallbackName ? 'local' : 'none',
          session: fallbackName ? createOfflineSession(fallbackName) : null,
        });
      })
      .finally(() => {
        if (isMounted) setAuthRefreshing(false);
      });

    return () => { isMounted = false; };
  }, [activeProfile?.id]);

  // Automatically fetch and cache Microsoft skin texture PNG whenever signed in
  useEffect(() => {
    let activeFlag = true;
    const syncSkinTexture = async () => {
      if (account?.loggedIn && account?.kind === 'microsoft' && account?.session?.skinUrl && launcher.skinFetchTexture) {
        const res = await launcher.skinFetchTexture(account.session.skinUrl).catch(() => null);
        if (activeFlag && res?.dataUri) {
          setMicrosoftSkinDataUri(res.dataUri);
          return;
        }
      }
      if (account?.loggedIn && account?.kind === 'microsoft' && account?.name && launcher.skinImportUsername) {
        const res = await launcher.skinImportUsername(account.name).catch(() => null);
        if (activeFlag && res?.dataUri) {
          setMicrosoftSkinDataUri(res.dataUri);
          return;
        }
      }
      if (activeFlag && account?.kind !== 'microsoft') {
        setMicrosoftSkinDataUri('');
      }
    };
    syncSkinTexture();
    return () => { activeFlag = false; };
  }, [account?.loggedIn, account?.kind, account?.name, account?.session?.skinUrl]);

  const handleSaveProfile = (profileData) => {
    setProfiles(prev => {
      let next;
      const targetId = profileData.id || `profile-${Date.now()}`;
      if (profileData.id) {
        next = prev.map(p => p.id === profileData.id ? { ...p, ...profileData } : p);
      } else {
        const newProfile = { ...profileData, id: targetId };
        next = [...prev, newProfile];
        setActiveProfileId(targetId);
      }
      persistState({
        profiles: next,
        activeProfileId: profileData.id ? activeProfileId : targetId,
      });
      return next;
    });
  };

  const handleDeleteProfile = (profileId) => {
    setProfiles(prev => {
      const next = prev.filter(p => p.id !== profileId);
      let nextActiveId = activeProfileId;
      if (next.length === 0) {
        const defaultProfile = {
          id: 'default',
          name: 'Default',
          localName: 'Player',
          version: null,
          ram: 4,
          jvmArguments: '',
          javaPath: '',
        };
        next.push(defaultProfile);
        nextActiveId = 'default';
      } else if (activeProfileId === profileId) {
        nextActiveId = next[0].id;
      }
      if (nextActiveId !== activeProfileId) {
        setActiveProfileId(nextActiveId);
      }
      persistState({
        profiles: next,
        activeProfileId: nextActiveId,
      });
      return next;
    });
  };

  const handleDuplicateProfile = (profileId, e) => {
    e?.stopPropagation();
    const sourceProfile = profiles.find(p => p.id === profileId);
    if (!sourceProfile) return;
    const newId = `profile-${Date.now()}`;
    const duplicatedProfile = {
      ...sourceProfile,
      id: newId,
      name: `${sourceProfile.name} (Copy)`,
    };
    setProfiles(prev => {
      const next = [...prev, duplicatedProfile];
      setActiveProfileId(newId);
      persistState({
        profiles: next,
        activeProfileId: newId,
      });
      return next;
    });
  };

  const handleInstall = async (type, opts) => {
    if (!isOnline) {
      pushToast({
        tone: 'error',
        title: t('install.minecraft') || 'Install',
        message: t('offline.installRequiresInternet'),
      });
      return;
    }
    setLogs([]);
    persistState({ logs: [] });
    const installPayload = typeof opts === 'string' ? { version: opts } : (opts || {});
    addLog('info', `Starting ${type} installation...`);
    pushToast({
      tone: 'info',
      title: t('install.minecraft') || 'Install',
      message: `Installing ${type}${installPayload.version ? ` (${installPayload.version})` : ''}...`,
    });
    setProgress(0);
    try {
      const res = await launcher.minecraftInstall({ type, ...installPayload });
      if (res?.error) {
        addLog('error', `Installation failed: ${res.message || res.error}`);
      }
    } catch (e) {
      addLog('error', `Install launch failed: ${e?.message || e}`);
    } finally {
      setInstallId(null);
    }
  };

  const handleCancelInstall = async () => {
    if (!installId) return;
    try {
      await launcher.minecraftInstallCancel({ installId });
    } catch (e) {
      addLog('error', `Failed to cancel install: ${e?.message || e}`);
    } finally {
      setInstallId(null);
    }
  };

  const handlePlay = async (overrideInstanceId = null) => {
    if (gameState === 'running') {
      if (runPid) {
        try {
          await launcher.minecraftStop({ pid: runPid });
          setGameState('idle');
          setRunPid(null);
        } catch (e) {
          addLog('error', `Failed to stop game: ${e?.message || e}`);
        }
      }
      return;
    }

    if (!activeProfile) return;
    const targetInstId = overrideInstanceId || activeInstanceId;
    const activeInst = instances.find(i => i.id === targetInstId) || null;
    if (!activeInst) {
      pushToast({
        tone: 'info',
        title: t('instances.title'),
        message: t('home.requireInstanceDesc'),
      });
      setInstanceEditor({ mode: 'create', instance: null });
      return;
    }

    setLogs([]);
    persistState({ logs: [] });
    setGameState('loading');
    setProgress(0);
    addLog('info', `Launching instance: ${activeInst.name} (Profile: ${activeProfile.name})`);

    try {
      let runSession = account.session;
      if (account.kind === 'microsoft' && launcher.minecraftGetAuthState) {
        try {
          const profileKey = String(activeProfile.id || 'default');
          const freshAuth = await launcher.minecraftGetAuthState(profileKey);
          if (freshAuth?.loggedIn && freshAuth?.access_token) {
            runSession = freshAuth;
            setAccount(prev => ({ ...prev, session: freshAuth }));
          }
        } catch {
          // Keep existing session if offline or transient error
        }
      }

      const targetVersion = activeInst.version
        ? (installedVersions.find(v => v.id === activeInst.version) || activeInst.version)
        : (activeVersion || activeProfile?.version);

      const runProfile = {
        ...activeProfile,
        ram: activeInst.ram || activeProfile.ram,
        jvmArguments: activeInst.jvmArguments || activeProfile.jvmArguments,
        javaPath: activeInst.javaPath || activeProfile.javaPath,
      };

      const runOpts = {
        profile: runProfile,
        version: targetVersion,
        instanceId: activeInst.id,
        session: runSession || createOfflineSession(activeProfile.localName || 'Player'),
      };
      const res = await launcher.minecraftRun(runOpts);
      if (res?.error) {
        addLog('error', `Launch failed: ${res.message || res.error}`);
        setGameState('idle');
        return;
      }
      if (res?.pid) {
        setRunPid(res.pid);
        setGameState('running');
        playSessionRef.current = activeInstanceId
          ? { instanceId: activeInstanceId, startedAt: Date.now() }
          : null;
        addLog('success', `Minecraft process started (PID: ${res.pid})`);
      }
    } catch (e) {
      addLog('error', `Launch exception: ${e?.message || e}`);
      setGameState('idle');
    }
  };

  const handleSettingChange = async (key, val) => {
    const nextSettings = { ...stateRef.current.settings, [key]: val };
    setSettings(prev => ({ ...prev, [key]: val }));
    stateRef.current = { ...stateRef.current, settings: nextSettings };

    if (key === 'showSnapshots') {
      persistState({ settings: nextSettings });
      try {
        const snapshotsFlag = Boolean(val);
        const catalog = launcher.minecraftGetCatalog
          ? await launcher.minecraftGetCatalog({ includeSnapshots: snapshotsFlag, showSnapshots: snapshotsFlag })
          : await loadLauncherCatalog({ includeSnapshots: snapshotsFlag });
        if (catalog?.versions) setVersionCatalog(catalog.versions);
        if (catalog?.installTargets) setInstallTargets(catalog.installTargets);
      } catch (err) {
        console.error('Failed to refresh catalog on setting change:', err);
      }
      return;
    }

    persistState({
      profiles,
      mods,
      logs,
      versions: versionCatalog,
      installTargets,
      settings: nextSettings,
    });
  };

  const handleLogin = async () => {
    if (!isOnline) {
      pushToast({
        tone: 'error',
        title: t('account.loginWithMicrosoft'),
        message: t('offline.loginRequiresInternet'),
      });
      return;
    }
    const profileKey = String(activeProfile?.id || 'default');
    setLoginLoading(true);
    addLog('info', t('account.loginWithMicrosoft') + '...');
    const abortController = new AbortController();
    loginAbortControllerRef.current = abortController;

    try {
      const accountInfo = await minecraftLoginWithAbort(profileKey, abortController.signal);
      if (accountInfo?.error) {
        if (accountInfo.cancelled) {
          addLog('info', t('account.loginCancelled'));
        } else {
          addLog('error', `Login failed: ${accountInfo.error}`);
          pushToast({
            tone: 'error',
            title: t('account.loginWithMicrosoft'),
            message: accountInfo.error,
          });
        }
        return;
      }

      if (accountInfo?.name) {
        setAccount({
          name: accountInfo.name,
          loggedIn: true,
          profileKey,
          kind: 'microsoft',
          session: accountInfo,
        });
        setProfiles(prev => {
          const next = prev.map(p => {
            if (p.id === profileKey) {
              return {
                ...p,
                skinName: accountInfo.name,
                microsoftAccount: accountInfo.name,
                localName: accountInfo.name,
              };
            }
            return p;
          });
          persistState({ profiles: next, activeProfileId: profileKey });
          return next;
        });
        addLog('success', `Logged in as ${accountInfo.name}`);
        pushToast({
          tone: 'success',
          title: t('account.loginWithMicrosoft'),
          message: t('messages.loginSuccess', { name: accountInfo.name }),
        });
      } else {
        addLog('error', 'Login did not return account information.');
      }
    } catch (error) {
      if (error?.name === 'AbortError' || error?.message?.includes('cancelled')) {
        addLog('info', t('account.loginCancelled'));
      } else {
        addLog('error', `Login failed: ${error?.message || error}`);
        pushToast({
          tone: 'error',
          title: t('account.loginWithMicrosoft'),
          message: error?.message || t('messages.loginFailed', { error: '' }),
        });
      }
    } finally {
      setLoginLoading(false);
      loginAbortControllerRef.current = null;
    }
  };

  const handleLogout = async () => {
    const profileKey = String(activeProfile?.id || 'default');
    try {
      await launcher.minecraftLogout(profileKey);
      const fallbackName = (activeProfile?.name && activeProfile?.name !== 'Default') ? activeProfile.name : 'Player';
      setProfiles(prev => {
        const next = prev.map(p => {
          if (p.id === profileKey) {
            return {
              ...p,
              microsoftAccount: '',
              skinName: '',
              localName: fallbackName,
            };
          }
          return p;
        });
        persistState({ profiles: next, activeProfileId: profileKey });
        return next;
      });
      setAccount({
        name: fallbackName,
        loggedIn: Boolean(fallbackName),
        profileKey,
        kind: fallbackName ? 'local' : 'none',
        session: fallbackName ? createOfflineSession(fallbackName) : null,
      });
      addLog('info', 'Logged out from Microsoft.');
      pushToast({
        tone: 'info',
        title: t('account.logout'),
        message: t('messages.logoutSuccess'),
      });
    } catch (e) {
      addLog('error', `Logout failed: ${e?.message || e}`);
    }
  };

  const handleModToggle = async (modId) => {
    const targetMod = mods.find(m => m.id === modId);
    if (!targetMod) return;
    const nextState = !targetMod.enabled;
    try {
      await launcher.minecraftToggleMod(modId, nextState, activeInstanceId);
      loadMods();
    } catch (e) {
      addLog('error', `Failed to toggle mod: ${e?.message || e}`);
    }
  };

  const handleSetAllModsEnabled = async (enable) => {
    try {
      await launcher.minecraftSetAllModsEnabled(enable, activeInstanceId);
      loadMods();
    } catch (e) {
      addLog('error', `Failed to set all mods enabled: ${e?.message || e}`);
    }
  };

  const handleModDelete = async (modId) => {
    try {
      await launcher.minecraftDeleteMod(modId, activeInstanceId);
      loadMods();
    } catch (e) {
      addLog('error', `Failed to delete mod: ${e?.message || e}`);
    }
  };

  const handleAddModClick = async () => {
    try {
      const picked = await launcher.minecraftPickModFiles?.();
      const filePaths = Array.isArray(picked) ? picked : (picked?.filePaths || []);
      if (filePaths.length > 0) {
        for (const filePath of filePaths) {
          await launcher.minecraftInstallModFile(filePath, activeInstanceId);
        }
        loadMods();
        pushToast({ tone: 'success', title: t('sidebar.modManager'), message: t('mods.modsImportedSuccess', { count: filePaths.length }) });
      }
    } catch (e) {
      addLog('error', `Failed to add mod: ${e?.message || e}`);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer?.files || []).filter(f =>
      f.name.endsWith('.jar') || f.name.endsWith('.slpkg') || f.name.endsWith('.olpkg') || f.name.endsWith('.zip')
    );
    if (files.length === 0) return;

    const currentContentView = (activeTab === 'instances' && instanceWorkspaceOpen) ? instanceSubTab : activeTab;
    const targetType = currentContentView === 'shaders' ? 'shaders' : currentContentView === 'resourcepacks' ? 'resourcepacks' : currentContentView === 'datapacks' ? 'datapacks' : (activeTab === 'explore' ? exploreType : 'mods');

    addLog('info', t('mods.importingCount', { count: files.length }));
    try {
      if (targetType === 'shaders') {
        let imported = 0;
        for (const file of files) {
          if (!file.name.toLowerCase().endsWith('.zip')) continue;
          const filePath = file.path || file.name;
          const res = await launcher.minecraftImportContentFile?.({ type: 'shader', sourcePath: filePath, fileName: file.name }, activeInstanceId);
          if (res?.ok) imported++;
        }
        if (imported > 0) {
          loadShaders();
          pushToast({ tone: 'success', title: t('mods.contentTypeShaders'), message: t('mods.shadersImportedSuccess', { count: imported }) });
        }
      } else if (targetType === 'resourcepacks') {
        let imported = 0;
        for (const file of files) {
          if (!file.name.toLowerCase().endsWith('.zip')) continue;
          const filePath = file.path || file.name;
          const res = await launcher.minecraftImportContentFile?.({ type: 'resourcepack', sourcePath: filePath, fileName: file.name }, activeInstanceId);
          if (res?.ok) imported++;
        }
        if (imported > 0) {
          loadResourcePacks();
          pushToast({ tone: 'success', title: t('mods.contentTypeResourcePacks'), message: t('mods.resourcePacksImportedSuccess', { count: imported }) });
        }
      } else if (targetType === 'datapacks') {
        let imported = 0;
        for (const file of files) {
          if (!file.name.toLowerCase().endsWith('.zip')) continue;
          const filePath = file.path || file.name;
          const res = await launcher.minecraftImportContentFile?.({ type: 'datapack', sourcePath: filePath, fileName: file.name }, activeInstanceId);
          if (res?.ok) imported++;
        }
        if (imported > 0) {
          loadDatapacks();
          pushToast({ tone: 'success', title: t('mods.contentTypeDatapacks'), message: t('mods.datapacksImportedSuccess', { count: imported }) });
        }
      } else {
        for (const file of files) {
          const filePath = file.path || file.name;
          await launcher.minecraftInstallModFile(filePath, activeInstanceId);
        }
        loadMods();
        pushToast({ tone: 'success', title: t('sidebar.modManager'), message: t('mods.modsImportedSuccess', { count: files.length }) });
      }
    } catch (err) {
      addLog('error', `Error importing files: ${err?.message || err}`);
    }
  };

  // ── Load installed content ──
  const loadMods = useCallback(async () => {
    try {
      const list = await launcher.minecraftGetInstalledMods?.(activeInstanceId);
      if (Array.isArray(list)) {
        setMods(list);
        persistState({ mods: list });
      }
    } catch { }
  }, [activeInstanceId, persistState]);

  const loadShaders = useCallback(async () => {
    try {
      const list = await launcher.minecraftGetInstalledShaders?.(activeInstanceId);
      if (Array.isArray(list)) {
        setShaders(list);
        persistState({ shaders: list });
      }
    } catch { }
  }, [activeInstanceId, persistState]);

  const loadResourcePacks = useCallback(async () => {
    try {
      const list = await launcher.minecraftGetInstalledResourcePacks?.(activeInstanceId);
      if (Array.isArray(list)) {
        setResourcePacks(list);
        persistState({ resourcePacks: list });
      }
    } catch { }
  }, [activeInstanceId, persistState]);

  const loadDatapacks = useCallback(async () => {
    try {
      const list = await launcher.minecraftGetInstalledDatapacks?.(activeInstanceId);
      if (Array.isArray(list)) {
        setDatapacks(list);
        persistState({ datapacks: list });
      }
    } catch { }
  }, [activeInstanceId, persistState]);

  // Synchronize content whenever activeInstanceId changes
  useEffect(() => {
    loadMods();
    loadShaders();
    loadResourcePacks();
    loadDatapacks();
  }, [activeInstanceId, loadMods, loadShaders, loadResourcePacks, loadDatapacks]);

  const handleDeleteShader = async (shader) => {
    try {
      const res = await launcher.minecraftDeleteShader?.(shader.fileName, activeInstanceId);
      if (res?.ok) {
        loadShaders();
        pushToast({ tone: 'success', title: t('mods.deleteShader'), message: `${shader.name || shader.fileName} removed.` });
      }
    } catch (err) {
      pushToast({ tone: 'error', title: t('mods.deleteShader'), message: err?.message || 'Delete failed.' });
    }
  };

  const handleDeleteResourcePack = async (pack) => {
    try {
      const res = await launcher.minecraftDeleteResourcePack?.(pack.fileName, activeInstanceId);
      if (res?.ok) {
        loadResourcePacks();
        pushToast({ tone: 'success', title: t('mods.deleteResourcePack'), message: `${pack.name || pack.fileName} removed.` });
      }
    } catch (err) {
      pushToast({ tone: 'error', title: t('mods.deleteResourcePack'), message: err?.message || 'Delete failed.' });
    }
  };

  const handleDeleteDatapack = async (pack) => {
    try {
      const res = await launcher.minecraftDeleteDatapack?.(pack.fileName, activeInstanceId);
      if (res?.ok) {
        loadDatapacks();
        pushToast({ tone: 'success', title: t('mods.deleteDatapack'), message: `${pack.name || pack.fileName} removed.` });
      }
    } catch (err) {
      pushToast({ tone: 'error', title: t('mods.deleteDatapack'), message: err?.message || 'Delete failed.' });
    }
  };

  const handleOpenContentFolder = async (type) => {
    try {
      const currentSub = activeTab === 'instances' && instanceWorkspaceOpen ? instanceSubTab : activeTab;
      const targetType = type || (currentSub === 'shaders' ? 'shaders' : currentSub === 'resourcepacks' ? 'resourcepacks' : currentSub === 'datapacks' ? 'datapacks' : 'mods');
      await launcher.minecraftOpenContentFolder?.(targetType, activeInstanceId);
    } catch { }
  };

  const handlePickLocalContent = async (targetType) => {
    if (targetType === 'shaders' || targetType === 'shader') {
      const res = await launcher.minecraftPickContentFiles?.('shader');
      if (res?.filePaths?.length > 0) {
        for (const fp of res.filePaths) {
          await launcher.minecraftImportContentFile?.({ type: 'shader', sourcePath: fp }, activeInstanceId);
        }
        loadShaders();
        pushToast({ tone: 'success', title: t('mods.contentTypeShaders'), message: t('mods.shadersImportedSuccess', { count: res.filePaths.length }) });
      }
    } else if (targetType === 'resourcepacks' || targetType === 'resourcepack') {
      const res = await launcher.minecraftPickContentFiles?.('resourcepack');
      if (res?.filePaths?.length > 0) {
        for (const fp of res.filePaths) {
          await launcher.minecraftImportContentFile?.({ type: 'resourcepack', sourcePath: fp }, activeInstanceId);
        }
        loadResourcePacks();
        pushToast({ tone: 'success', title: t('mods.contentTypeResourcePacks'), message: t('mods.resourcePacksImportedSuccess', { count: res.filePaths.length }) });
      }
    } else if (targetType === 'datapacks' || targetType === 'datapack') {
      const res = await launcher.minecraftPickContentFiles?.('datapack');
      if (res?.filePaths?.length > 0) {
        for (const fp of res.filePaths) {
          await launcher.minecraftImportContentFile?.({ type: 'datapack', sourcePath: fp }, activeInstanceId);
        }
        loadDatapacks();
        pushToast({ tone: 'success', title: t('mods.contentTypeDatapacks'), message: t('mods.datapacksImportedSuccess', { count: res.filePaths.length }) });
      }
    } else {
      handleAddModClick();
    }
  };

  const handleAddContentClick = (type) => {
    const currentSub = activeTab === 'instances' && instanceWorkspaceOpen ? instanceSubTab : activeTab;
    const targetType = type || (currentSub === 'shaders' ? 'shaders' : currentSub === 'resourcepacks' ? 'resourcepacks' : currentSub === 'datapacks' ? 'datapacks' : 'mods');
    setAddContentChoice(targetType);
  };

  const handleImportModpackClick = async () => {
    try {
      const picked = await launcher.minecraftPickModpackFile?.();
      if (!picked?.filePath) return;

      const label = picked.filePath.split(/[/\\]/).pop() || 'modpack.mrpack';
      setLogs([]);
      persistState({ logs: [] });
      addLog('info', `Importing modpack '${label}'...`);
      pushToast({
        tone: 'info',
        title: t('instances.importModpack'),
        message: t('instances.importingModpackToast', { name: label }),
      });

      const res = await launcher.minecraftInstallLocalModpack?.({
        mrpackPath: picked.filePath,
      });

      if (res?.ok && res.instance) {
        const updated = await launcher.getInstances();
        setInstances(updated);
        setActiveInstanceId(res.instance.id);
        persistState({ activeInstanceId: res.instance.id });
        addLog('success', `Imported modpack '${res.instance.name}' (${res.instance.version} ${res.instance.loader || ''}).`);
        pushToast({
          tone: 'success',
          title: t('instances.importModpack'),
          message: t('instances.modpackInstalledSuccess', { name: res.instance.name }),
        });
      } else {
        throw new Error(res?.error || 'Modpack import failed');
      }
    } catch (err) {
      addLog('error', `Modpack import failed: ${err?.message || err}`);
      pushToast({
        tone: 'error',
        title: t('instances.importModpack'),
        message: err?.message || 'Failed to import modpack',
      });
    }
  };

  // ── Modrinth Search & Install logic ──
  const activeInstance = instances.find(i => i.id === activeInstanceId) || null;
  const instanceLoader = String(activeInstance?.loader || '').toLowerCase();
  const profileLoader = String(activeProfileVersion?.type || activeVersion?.type || activeProfile?.version || '').toLowerCase();
  const currentLoader = instanceLoader || (profileLoader.includes('fabric') ? 'fabric' : profileLoader.includes('neoforge') ? 'neoforge' : profileLoader.includes('forge') ? 'forge' : profileLoader.includes('quilt') ? 'quilt' : '');
  const rawMcVer = activeInstance?.version || activeProfileVersion?.inheritsFrom || activeProfileVersion?.mcVer || activeVersion?.inheritsFrom || activeVersion?.mcVer || activeProfile?.version || activeVersion?.id || '';
  const currentMcVer = resolveMinecraftVersion(rawMcVer);

  const effectiveLoader = modrinthLoaderFilter === 'auto' ? currentLoader : (modrinthLoaderFilter === 'all' ? '' : modrinthLoaderFilter);
  const effectiveMcVer = modrinthVersionFilter === 'auto'
    ? currentMcVer
    : (modrinthVersionFilter === 'all' ? '' : modrinthVersionFilter);

  const executeModrinthSearch = useCallback(async (isLoadMore = false) => {
    if (!isOnline) {
      setModrinthLoading(false);
      setModrinthLoadingMore(false);
      return;
    }

    if (isLoadMore) {
      if (modrinthLoading || modrinthLoadingMore) return;
      setModrinthLoadingMore(true);
    } else {
      setModrinthLoading(true);
    }

    const currentOffset = isLoadMore ? modrinthResults.length : 0;
    const projectType = exploreType === 'modpacks' ? 'modpack' : exploreType === 'shaders' ? 'shader' : exploreType === 'resourcepacks' ? 'resourcepack' : exploreType === 'datapacks' ? 'datapack' : 'mod';

    try {
      let data;
      if (typeof window !== 'undefined' && window.launcher?.minecraftModrinthSearch) {
        data = await window.launcher.minecraftModrinthSearch({
          projectType,
          query: modrinthQuery,
          loader: (projectType === 'mod' || projectType === 'modpack') ? effectiveLoader : '',
          gameVersion: effectiveMcVer,
          category: modrinthCategory === 'all' ? '' : modrinthCategory,
          sortBy: modrinthSort,
          offset: currentOffset,
          limit: 60,
        });
      } else {
        data = await searchModrinthProjects({
          projectType,
          query: modrinthQuery,
          loader: (projectType === 'mod' || projectType === 'modpack') ? effectiveLoader : '',
          gameVersion: effectiveMcVer,
          category: modrinthCategory === 'all' ? '' : modrinthCategory,
          sortBy: modrinthSort,
          offset: currentOffset,
          limit: 60,
        });
      }
      if (data?.hits) {
        if (isLoadMore) {
          setModrinthResults(prev => {
            const existingIds = new Set(prev.map(p => p.project_id || p.slug));
            const freshHits = data.hits.filter(h => !existingIds.has(h.project_id || h.slug));
            return [...prev, ...freshHits];
          });
        } else {
          setModrinthResults(data.hits);
        }
        setModrinthTotalHits(data.total_hits || (isLoadMore ? modrinthResults.length + data.hits.length : data.hits.length));
      }
    } catch (e) {
      console.error('Modrinth search failed:', e);
      if (!isLoadMore) {
        pushToast({ tone: 'error', title: 'Modrinth', message: e?.message || 'Failed to search.' });
      }
    } finally {
      if (isLoadMore) {
        setModrinthLoadingMore(false);
      } else {
        setModrinthLoading(false);
      }
    }
  }, [isOnline, exploreType, modrinthQuery, effectiveLoader, effectiveMcVer, modrinthCategory, modrinthSort, modrinthLoading, modrinthLoadingMore, modrinthResults.length, pushToast]);

  useEffect(() => {
    setModrinthResults([]);
    setModrinthTotalHits(0);
    setModrinthLoading(true);
  }, [exploreType]);

  useEffect(() => {
    if (activeTab === 'explore') {
      if (!isOnline) {
        setModrinthLoading(false);
        return;
      }
      setModrinthLoading(true);
      const timer = setTimeout(() => {
        executeModrinthSearch(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [activeTab, exploreType, isOnline, modrinthQuery, effectiveLoader, effectiveMcVer, modrinthCategory, modrinthSort]);

  const hasMoreModrinth = modrinthResults.length < modrinthTotalHits;

  useEffect(() => {
    if (activeTab !== 'explore') return;
    if (!isOnline || !hasMoreModrinth || modrinthLoading || modrinthLoadingMore) return;

    const sentinel = modrinthSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        executeModrinthSearch(true);
      }
    }, { rootMargin: '250px' });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeTab, isOnline, hasMoreModrinth, modrinthLoading, modrinthLoadingMore, executeModrinthSearch]);

  const handleInstallModrinthMod = async (project) => {
    const projectId = project.project_id || project.slug;
    const projectType = project.project_type || (exploreType === 'modpacks' ? 'modpack' : exploreType === 'shaders' ? 'shader' : exploreType === 'resourcepacks' ? 'resourcepack' : exploreType === 'datapacks' ? 'datapack' : 'mod');

    if (projectType !== 'modpack' && !activeInstanceId) {
      pushToast({
        tone: 'info',
        title: t('instances.title'),
        message: t('home.requireInstanceDesc'),
      });
      setInstanceEditor({ mode: 'create', instance: null });
      return;
    }
    if (!isOnline) {
      pushToast({
        tone: 'error',
        title: 'Modrinth',
        message: t('offline.noConnectionToast'),
      });
      return;
    }
    setModrinthInstalling(prev => ({ ...prev, [projectId]: true }));
    setLogs([]);
    persistState({ logs: [] });
    addLog('info', `Installing ${projectType} '${project.title || projectId}' from Modrinth...`);

    try {
      if (projectType === 'modpack') {
        const res = await launcher.minecraftInstallModrinthModpack?.({
          projectId,
          projectTitle: project.title || projectId,
          iconUrl: project.icon_url || '',
        });
        if (res?.ok && res.instance) {
          const updated = await launcher.getInstances();
          setInstances(updated);
          setActiveInstanceId(res.instance.id);
          persistState({ activeInstanceId: res.instance.id });
          addLog('success', `Modpack '${res.instance.name}' installed as isolated instance.`);
          pushToast({
            tone: 'success',
            title: t('instances.importModpack'),
            message: t('instances.modpackInstalledSuccess', { name: res.instance.name }),
          });
          return;
        }
        throw new Error(res?.error || 'Modpack installation failed');
      }

      let res;
      if (typeof window !== 'undefined' && window.launcher?.minecraftModrinthInstall) {
        res = await window.launcher.minecraftModrinthInstall({
          projectId,
          projectType,
          gameVersion: effectiveMcVer || currentMcVer,
          loader: projectType === 'mod' ? (effectiveLoader || currentLoader) : undefined,
          instanceId: activeInstanceId,
        });
      } else {
        res = { ok: true, fileName: `${projectId}.zip` };
      }

      if (res?.ok) {
        if (projectType === 'shader') {
          if (Array.isArray(res.items)) setShaders(res.items);
          else loadShaders();
        } else if (projectType === 'resourcepack') {
          if (Array.isArray(res.items)) setResourcePacks(res.items);
          else loadResourcePacks();
        } else if (projectType === 'datapack') {
          if (Array.isArray(res.items)) setDatapacks(res.items);
          else loadDatapacks();
        } else {
          if (Array.isArray(res.mods || res.items)) setMods(res.mods || res.items);
          else loadMods();
        }
        addLog('success', `${projectType === 'shader' ? 'Shader' : projectType === 'resourcepack' ? 'Texture pack' : projectType === 'datapack' ? 'Data pack' : 'Mod'} '${project.title || projectId}' installed.`);
        pushToast({
          tone: 'success',
          title: t('mods.install'),
          message: t('mods.installedSuccess', { name: project.title || projectId }),
        });
      } else {
        throw new Error(res?.error || 'Installation failed');
      }
    } catch (err) {
      addLog('error', `Failed to install '${project.title || projectId}': ${err?.message || err}`);
      pushToast({
        tone: 'error',
        title: t('mods.install'),
        message: t('mods.installError', { name: project.title || projectId, error: err?.message || '' }),
      });
    } finally {
      setModrinthInstalling(prev => ({ ...prev, [projectId]: false }));
    }
  };

  const handleOpenModDetails = (project) => {
    setSelectedModDetail({ project, initialTab: 'overview' });
  };

  const handleOpenLocalModDetails = (mod) => {
    const fileKey = mod.fileName ? mod.fileName.replace(/\.jar(\.disabled)?$/i, '').toLowerCase() : '';
    const updateInfo = modUpdates[mod.fileName] || modUpdates[fileKey] || modUpdates[mod.name] || modUpdates[mod.id] || null;
    const knownProjectId = updateInfo?.projectId || mod.projectId || mod.modrinthId;
    const slugCandidate = knownProjectId || mod.modId || (mod.fileName ? mod.fileName.replace(/\.jar(\.disabled)?$/i, '').replace(/[-_]v?\d+.*$/i, '') : '') || mod.id;
    setSelectedModDetail({
      project: {
        project_id: knownProjectId || slugCandidate,
        slug: knownProjectId || slugCandidate,
        modId: mod.modId,
        title: mod.name || mod.fileName || mod.id,
        name: mod.name || mod.fileName || mod.id,
        author: mod.authors || '',
        authors: mod.authors || '',
        description: mod.description || '',
        icon_url: mod.iconUrl,
        project_type: 'mod',
        localItem: mod,
      },
      initialTab: 'overview',
    });
  };

  const handleOpenLocalShaderDetails = (shader) => {
    const slugCandidate = shader.projectId || shader.modrinthId || shader.id || (shader.fileName ? shader.fileName.replace(/\.zip$/i, '') : '');
    setSelectedModDetail({
      project: {
        project_id: slugCandidate,
        slug: slugCandidate,
        title: shader.name || shader.fileName,
        name: shader.name || shader.fileName,
        author: shader.authors || '',
        authors: shader.authors || '',
        description: shader.description || '',
        icon_url: shader.iconUrl,
        project_type: 'shader',
        localItem: shader,
      },
      initialTab: 'overview',
    });
  };

  const handleOpenLocalResourcePackDetails = (pack) => {
    const slugCandidate = pack.projectId || pack.modrinthId || pack.id || (pack.fileName ? pack.fileName.replace(/\.zip$/i, '') : '');
    setSelectedModDetail({
      project: {
        project_id: slugCandidate,
        slug: slugCandidate,
        title: pack.name || pack.fileName,
        name: pack.name || pack.fileName,
        author: pack.authors || '',
        authors: pack.authors || '',
        description: pack.description || '',
        icon_url: pack.iconUrl,
        project_type: 'resourcepack',
        localItem: pack,
      },
      initialTab: 'overview',
    });
  };

  const handleOpenLocalDatapackDetails = (pack) => {
    const slugCandidate = pack.projectId || pack.modrinthId || pack.id || (pack.fileName ? pack.fileName.replace(/\.zip$/i, '') : '');
    setSelectedModDetail({
      project: {
        project_id: slugCandidate,
        slug: slugCandidate,
        title: pack.name || pack.fileName,
        name: pack.name || pack.fileName,
        author: pack.authors || '',
        authors: pack.authors || '',
        description: pack.description || '',
        icon_url: pack.iconUrl,
        project_type: 'datapack',
        localItem: pack,
      },
      initialTab: 'overview',
    });
  };

  const handleInstallSpecificVersion = async (project, version) => {
    const projectId = project.project_id || project.slug || project.id;
    const projectType = project.project_type || (exploreType === 'modpacks' ? 'modpack' : exploreType === 'shaders' ? 'shader' : exploreType === 'resourcepacks' ? 'resourcepack' : exploreType === 'datapacks' ? 'datapack' : 'mod');

    if (projectType !== 'modpack' && !activeInstanceId) {
      pushToast({
        tone: 'info',
        title: t('instances.title'),
        message: t('home.requireInstanceDesc'),
      });
      setInstanceEditor({ mode: 'create', instance: null });
      return;
    }
    if (!isOnline) {
      pushToast({
        tone: 'error',
        title: 'Modrinth',
        message: t('offline.noConnectionToast'),
      });
      return;
    }
    setInstallingVersionId(version.id);
    const primaryFile = version.files?.find(f => f.primary) || version.files?.[0];
    const verNumber = version.version_number || version.name || '';
    setLogs([]);
    persistState({ logs: [] });
    addLog('info', `[Modrinth] Installing ${project.title || projectId} (v${verNumber})...`);

    try {
      if (projectType === 'modpack') {
        const res = await launcher.minecraftInstallModrinthModpack?.({
          projectId,
          versionId: version.id,
          fileUrl: primaryFile?.url,
          fileName: primaryFile?.filename,
          projectTitle: project.title || projectId,
          iconUrl: project.icon_url || '',
        });
        if (res?.ok && res.instance) {
          const updated = await launcher.getInstances();
          setInstances(updated);
          setActiveInstanceId(res.instance.id);
          persistState({ activeInstanceId: res.instance.id });
          addLog('success', `[Modrinth] Modpack '${res.instance.name}' (v${verNumber}) installed.`);
          pushToast({
            tone: 'success',
            title: t('instances.importModpack'),
            message: t('instances.modpackInstalledSuccess', { name: res.instance.name }),
          });
          return;
        }
        throw new Error(res?.error || 'Modpack installation failed');
      }

      let res;
      if (typeof window !== 'undefined' && window.launcher?.minecraftModrinthInstall) {
        res = await window.launcher.minecraftModrinthInstall({
          projectId,
          projectType,
          versionId: version.id,
          fileUrl: primaryFile?.url,
          fileName: primaryFile?.filename,
          gameVersion: version.game_versions?.[0] || effectiveMcVer || currentMcVer,
          loader: projectType === 'mod' ? (version.loaders?.[0] || effectiveLoader || currentLoader) : undefined,
          instanceId: activeInstanceId,
        });
      } else {
        res = { ok: true, fileName: primaryFile?.filename || `${projectId}.zip` };
      }

      if (res?.ok) {
        if (projectType === 'shader') {
          if (Array.isArray(res.items)) setShaders(res.items);
          else loadShaders();
        } else if (projectType === 'resourcepack') {
          if (Array.isArray(res.items)) setResourcePacks(res.items);
          else loadResourcePacks();
        } else if (projectType === 'datapack') {
          if (Array.isArray(res.items)) setDatapacks(res.items);
          else loadDatapacks();
        } else {
          if (Array.isArray(res.mods || res.items)) setMods(res.mods || res.items);
          else loadMods();
        }
        addLog('success', `[Modrinth] '${project.title || projectId}' (v${verNumber}) installed.`);
        pushToast({
          tone: 'success',
          title: t('mods.install'),
          message: t('mods.installedSuccess', { name: `${project.title || projectId} v${verNumber}` }),
        });
      } else {
        throw new Error(res?.error || 'Installation failed');
      }
    } catch (err) {
      addLog('error', `[Modrinth] Failed to install version: ${err?.message || err}`);
      pushToast({
        tone: 'error',
        title: t('mods.install'),
        message: t('mods.installError', { name: project.title || projectId, error: err?.message || '' }),
      });
    } finally {
      setInstallingVersionId(null);
    }
  };

  const isModInstalled = useCallback((project) => {
    if (!project) return false;
    const projectType = project.project_type || (exploreType === 'modpacks' ? 'modpack' : exploreType === 'shaders' ? 'shader' : exploreType === 'resourcepacks' ? 'resourcepack' : exploreType === 'datapacks' ? 'datapack' : 'mod');
    const slug = String(project.slug || '').toLowerCase().trim();
    const projId = String(project.project_id || project.id || '').toLowerCase().trim();
    const cleanTitle = String(project.title || '').toLowerCase().trim();

    if (projectType === 'modpack') {
      if (!Array.isArray(instances) || instances.length === 0) return false;
      return instances.some(inst => {
        const iName = String(inst.name || '').toLowerCase().trim();
        return (cleanTitle && (iName === cleanTitle || iName.startsWith(`${cleanTitle} (`)));
      });
    }

    if (projectType === 'shader') {
      if (!Array.isArray(shaders) || shaders.length === 0) return false;
      return shaders.some(s => {
        const sId = String(s.id || '').toLowerCase().trim();
        const sName = String(s.name || '').toLowerCase().trim();
        const sFile = String(s.fileName || '').toLowerCase().trim();
        return (slug && (sId === slug || sFile.startsWith(slug))) || (projId && sId === projId) || (cleanTitle && sName === cleanTitle);
      });
    }

    if (projectType === 'resourcepack') {
      if (!Array.isArray(resourcePacks) || resourcePacks.length === 0) return false;
      return resourcePacks.some(p => {
        const pId = String(p.id || '').toLowerCase().trim();
        const pName = String(p.name || '').toLowerCase().trim();
        const pFile = String(p.fileName || '').toLowerCase().trim();
        return (slug && (pId === slug || pFile.startsWith(slug))) || (projId && pId === projId) || (cleanTitle && pName === cleanTitle);
      });
    }

    if (projectType === 'datapack') {
      if (!Array.isArray(datapacks) || datapacks.length === 0) return false;
      return datapacks.some(p => {
        const pId = String(p.id || '').toLowerCase().trim();
        const pName = String(p.name || '').toLowerCase().trim();
        const pFile = String(p.fileName || '').toLowerCase().trim();
        return (slug && (pId === slug || pFile.startsWith(slug))) || (projId && pId === projId) || (cleanTitle && pName === cleanTitle);
      });
    }

    if (!Array.isArray(mods) || mods.length === 0) return false;

    return mods.some(m => {
      const mModId = String(m.modId || '').toLowerCase().trim();
      const mName = String(m.name || '').toLowerCase().trim();
      const mFile = String(m.fileName || m.id || '').toLowerCase().trim();

      // 1. Exact match by internal jar modId or project id
      if (mModId && (mModId === slug || mModId === projId)) return true;

      // 2. Exact match by mod title
      if (cleanTitle && mName === cleanTitle) return true;

      // 3. Exact filename prefix match
      if (slug) {
        if (slug === 'sodium' && (mFile.includes('extra') || mFile.includes('reeses') || mFile.includes('options'))) {
          return false;
        }
        if (slug === 'iris' && mFile.includes('flawless')) {
          return false;
        }
        if (mFile === `${slug}.jar` || mFile === `${slug}.olpkg`) return true;
        const slugPrefixRegex = new RegExp(`^${slug}(?:[-_+v0-9.mc]|fabric|neoforge|forge)`, 'i');
        if (slugPrefixRegex.test(mFile)) return true;
      }
      return false;
    });
  }, [exploreType, instances, mods, shaders, resourcePacks, datapacks]);

  const checkingModUpdatesRef = useRef(false);
  const hasCheckedModsOnTabOpenRef = useRef(false);

  const handleCheckModUpdates = useCallback(async (options = {}) => {
    const silent = options?.silent ?? false;
    if (checkingModUpdatesRef.current) return;
    checkingModUpdatesRef.current = true;
    setCheckingModUpdates(true);
    try {
      if (!isOnline) {
        if (!silent) {
          pushToast({
            tone: 'warning',
            title: t('mods.checkUpdates'),
            message: t('offline.noConnectionToast'),
          });
        }
        return;
      }
      const loader = effectiveLoader || currentLoader || 'fabric';
      const gameVersion = effectiveMcVer || currentMcVer || '';

      const res = await launcher.minecraftCheckModUpdates?.({ loader, gameVersion, instanceId: activeInstanceId });
      if (res?.updates) {
        setModUpdates(res.updates);
        const count = Object.keys(res.updates).filter(k => k.includes('.jar')).length;
        if (!silent) {
          if (count > 0) {
            pushToast({
              tone: 'success',
              title: t('mods.checkUpdates'),
              message: t('mods.updatesAvailable', { count }),
            });
          } else {
            pushToast({
              tone: 'info',
              title: t('mods.checkUpdates'),
              message: t('mods.upToDate'),
            });
          }
        }
      }
    } catch (e) {
      if (!silent) {
        pushToast({
          tone: 'error',
          title: t('mods.checkUpdates'),
          message: e?.message || String(e),
        });
      }
    } finally {
      checkingModUpdatesRef.current = false;
      setCheckingModUpdates(false);
    }
  }, [isOnline, effectiveLoader, currentLoader, effectiveMcVer, currentMcVer, activeInstanceId, pushToast, t]);

  const handleUpdateMod = async (updateInfo) => {
    if (!updateInfo) return;
    const key = updateInfo.fileName || updateInfo.fileKey;
    setUpdatingMods(prev => new Set(prev).add(key));
    try {
      const loader = effectiveLoader || currentLoader || 'fabric';
      const gameVersion = effectiveMcVer || currentMcVer || '';
      const res = await launcher.minecraftModrinthInstall?.({
        projectId: updateInfo.projectId,
        versionId: updateInfo.versionId,
        fileUrl: updateInfo.fileUrl,
        fileName: updateInfo.targetFileName || updateInfo.fileName,
        loader,
        gameVersion,
        instanceId: activeInstanceId,
      });

      if (res?.error) {
        pushToast({
          tone: 'error',
          title: t('mods.updateMod'),
          message: res.message || res.error,
        });
        return;
      }

      if (res?.mods && Array.isArray(res.mods)) {
        setMods(res.mods);
      } else {
        const loadedMods = await launcher.minecraftGetInstalledMods?.(activeInstanceId);
        if (Array.isArray(loadedMods)) setMods(loadedMods);
      }

      setModUpdates(prev => {
        const next = { ...prev };
        delete next[updateInfo.fileName];
        delete next[updateInfo.fileKey];
        return next;
      });

      pushToast({
        tone: 'success',
        title: t('mods.updateMod'),
        message: t('mods.installedSuccess', { name: updateInfo.newVersionName || updateInfo.fileName }),
      });
    } catch (e) {
      pushToast({
        tone: 'error',
        title: t('mods.updateMod'),
        message: e?.message || String(e),
      });
    } finally {
      setUpdatingMods(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleUpdateAllMods = async () => {
    const updateEntries = Object.values(modUpdates).filter((u, i, arr) => arr.findIndex(x => x.fileName === u.fileName) === i);
    if (updateEntries.length === 0) return;
    for (const updateInfo of updateEntries) {
      await handleUpdateMod(updateInfo);
    }
  };

  const handleResolveConflictUpdate = async (rec) => {
    if (!rec) return;
    setLogs([]);
    persistState({ logs: [] });
    try {
      pushToast({
        tone: 'info',
        title: t('mods.updating'),
        message: `${rec.displayName || rec.modId} -> v${rec.targetVersion}`,
      });
      const loader = currentLoader || 'fabric';
      const gameVersion = currentMcVer || '';
      const res = await launcher.minecraftModrinthInstall?.({
        projectId: rec.modId,
        versionId: null,
        versionNumber: rec.targetVersion,
        loader,
        gameVersion,
        instanceId: activeInstanceId,
      });
      if (res?.error) {
        pushToast({
          tone: 'error',
          title: t('mods.conflictTitle'),
          message: res.message || res.error,
        });
        return;
      }
      if (res?.mods && Array.isArray(res.mods)) {
        setMods(res.mods);
      } else {
        const loadedMods = await launcher.minecraftGetInstalledMods?.(activeInstanceId);
        if (Array.isArray(loadedMods)) setMods(loadedMods);
      }
      setModConflict(null);
      pushToast({
        tone: 'success',
        title: t('mods.installedSuccess', { name: rec.displayName || rec.modId }),
        message: t('mods.installedSuccess', { name: rec.displayName || rec.modId }),
      });
    } catch (e) {
      pushToast({
        tone: 'error',
        title: t('mods.conflictTitle'),
        message: e?.message || String(e),
      });
    }
  };

  const [fixingAllConflicts, setFixingAllConflicts] = useState(false);

  const handleAutoFixAllConflicts = async (compatFixes) => {
    if (!compatFixes || compatFixes.length === 0) return;
    setLogs([]);
    persistState({ logs: [] });
    setFixingAllConflicts(true);
    pushToast({
      tone: 'info',
      title: t('mods.conflictFixAllBtn'),
      message: t('mods.conflictFixing'),
    });
    try {
      const loader = currentLoader || 'fabric';
      const gameVersion = currentMcVer || '';

      for (const fix of compatFixes) {
        const mainMod = findModInList(mods, fix.modId, fix.displayName);

        const mainCurrent = String(mainMod?.version || '').replace(/^v/i, '').trim();
        const mainTarget = String(fix.targetVersion || '').replace(/^v/i, '').trim();

        // Install base compatible version only if needed
        if (!mainCurrent || mainCurrent !== mainTarget) {
          await launcher.minecraftModrinthInstall?.({
            projectId: fix.modId,
            versionNumber: fix.targetVersion,
            loader,
            gameVersion,
            instanceId: activeInstanceId,
          });
        }

        // Cascade updates/downgrades for companion mods
        if (Array.isArray(fix.cascade)) {
          for (const item of fix.cascade) {
            const cascadeMod = findModInList(mods, item.modId, item.displayName);
            if (cascadeMod) {
              const cCurrent = String(cascadeMod.version || '').replace(/^v/i, '').trim();
              const cTarget = String(item.targetVersion || '').replace(/^v/i, '').trim();
              if (!cCurrent || cCurrent !== cTarget) {
                await launcher.minecraftModrinthInstall?.({
                  projectId: item.modId,
                  versionNumber: item.targetVersion,
                  loader,
                  gameVersion,
                  instanceId: activeInstanceId,
                });
              }
            }
          }
        }
      }

      // Re-enable Iris if it was disabled
      const irisMod = mods.find(m => String(m.id || '').toLowerCase() === 'iris' || String(m.fileName || '').toLowerCase().includes('iris'));
      if (irisMod && !irisMod.enabled) {
        await launcher.minecraftToggleMod?.(irisMod.id || irisMod.fileName, true, activeInstanceId);
      }

      const refreshed = await launcher.minecraftGetInstalledMods?.(activeInstanceId);
      if (Array.isArray(refreshed)) setMods(refreshed);
      setModConflict(null);

      pushToast({
        tone: 'success',
        title: t('mods.conflictFixAllBtn'),
        message: t('mods.conflictFixedSuccess'),
      });
    } catch (e) {
      pushToast({
        tone: 'error',
        title: t('mods.conflictTitle'),
        message: e?.message || String(e),
      });
    } finally {
      setFixingAllConflicts(false);
    }
  };

  useEffect(() => {
    const viewingInstanceContent = activeTab === 'instances' && instanceWorkspaceOpen;
    if (viewingInstanceContent || activeTab === 'explore') {
      loadMods();
      loadShaders();
      loadResourcePacks();
      loadDatapacks();

      if (viewingInstanceContent && instanceSubTab === 'mods' && isOnline) {
        if (!hasCheckedModsOnTabOpenRef.current) {
          hasCheckedModsOnTabOpenRef.current = true;
          handleCheckModUpdates({ silent: true });
        }
      }
    } else {
      hasCheckedModsOnTabOpenRef.current = false;
    }
  }, [activeTab, instanceWorkspaceOpen, instanceSubTab, isOnline, loadMods, loadShaders, loadResourcePacks, loadDatapacks]);

  const handleCheckForUpdates = async () => {
    addLog('info', t('messages.checkingUpdates'));
    pushToast({ tone: 'info', title: t('update.launcherUpdate'), message: t('messages.checkingUpdates') });
    try {
      const res = await launcher.minecraftCheckUpdate?.();
      if (res?.available && res?.latestVersion) {
        setUpdateModalInfo(res);
      } else if (res?.upToDate) {
        pushToast({ tone: 'success', title: t('update.launcherUpdate'), message: t('messages.alreadyUpToDate') });
      }
    } catch (e) {
      addLog('error', `Update check failed: ${e?.message || e}`);
      pushToast({ tone: 'error', title: t('update.launcherUpdate'), message: t('messages.updateCheckFailed', { error: e?.message || '' }) });
    }
  };

  const handleApplyUpdate = async (updateInfo) => {
    setUpdateModalInfo(null);
    setUpdateState({
      phase: 'downloading',
      progress: 0,
      latestVersion: updateInfo?.latestVersion,
      message: t('updater.downloading', { assetName: updateInfo?.asset?.name || '' }),
    });
    try {
      await launcher.minecraftApplyUpdate(updateInfo);
    } catch (e) {
      addLog('error', `Failed to apply update: ${e?.message || e}`);
    }
  };

  const handleOpenMinecraftDirectory = async () => {
    try {
      if (activeInstanceId) {
        await launcher.minecraftOpenContentFolder?.('instance', activeInstanceId);
      } else {
        await launcher.minecraftOpenRootDirectory?.();
      }
    } catch (e) {
      addLog('error', `Failed to open directory: ${e?.message || e}`);
    }
  };

  const handleCopyConsole = () => {
    const text = logs.map(l => `[${l.time}] [${l.level.toUpperCase()}] ${l.msg}`).join('\n');
    navigator.clipboard?.writeText(text);
    pushToast({ tone: 'info', title: t('console.copy'), message: t('console.copiedToClipboard') });
  };

  const handleClearConsole = () => {
    setLogs([]);
    persistState({ logs: [] });
  };

  const handleDuplicateInstance = async (inst) => {
    if (!inst?.id) return;
    try {
      const res = await launcher.duplicateInstance?.(inst.id);
      if (res?.ok && res?.instance) {
        const updated = await launcher.getInstances();
        setInstances(updated);
        setActiveInstanceId(res.instance.id);
        persistState({ activeInstanceId: res.instance.id });
        pushToast({
          tone: 'success',
          title: t('instances.duplicateSuccessTitle'),
          message: t('instances.duplicateSuccessMessage', { name: res.instance.name }),
        });
      }
    } catch (e) {
      pushToast({
        tone: 'error',
        title: t('common.error') || 'Error',
        message: e?.message || 'Duplicate failed',
      });
    }
  };

  const modUpdatesCount = new Set(
    Object.values(modUpdates || {}).map(u => u?.fileName).filter(Boolean)
  ).size;

  // Avatar resolution helper
  const activeProfileKey = String(activeProfile?.id || 'default');
  const activeLocalSkinId = activeLocalSkinByProfile[activeProfileKey] || '';
  const activeLocalSkin = skinsLibrary.find(s => s.id === activeLocalSkinId) || null;
  const activeProfileSkinDataUri = activeLocalSkin?.dataUri || (account.kind === 'microsoft' ? microsoftSkinDataUri : '');
  const profileAvatarName = (account.loggedIn && account.name)
    ? account.name
    : (activeProfile?.skinName || activeProfile?.microsoftAccount || (activeProfile?.localName && activeProfile?.localName !== 'Player' ? activeProfile?.localName : '') || 'MHF_Steve');
  const profileAvatarUrl = getMcHeadsAvatarUrl(profileAvatarName, 64);

  const handleRefreshMicrosoftSkin = async () => {
    if (!launcher.minecraftGetAuthState) return '';
    try {
      const fresh = await launcher.minecraftGetAuthState(activeProfileKey, { forceRefresh: true });
      if (fresh?.loggedIn && fresh?.name) {
        setAccount(prev => ({
          ...prev,
          name: fresh.name,
          loggedIn: true,
          kind: 'microsoft',
          session: fresh,
        }));
        let fetchedUri = '';
        if (fresh.skinUrl && launcher.skinFetchTexture) {
          const texRes = await launcher.skinFetchTexture(fresh.skinUrl);
          if (texRes?.dataUri) fetchedUri = texRes.dataUri;
        }
        if (!fetchedUri && fresh.name && launcher.skinImportUsername) {
          const impRes = await launcher.skinImportUsername(fresh.name).catch(() => null);
          if (impRes?.dataUri) fetchedUri = impRes.dataUri;
        }
        if (fetchedUri) setMicrosoftSkinDataUri(fetchedUri);
        pushToast({ tone: 'success', title: t('skins.title'), message: t('skins.syncedToast') });
        return fetchedUri;
      }
    } catch (err) {
      pushToast({ tone: 'error', title: t('skins.title'), message: err?.message || 'Sync failed' });
    }
    return '';
  };

  const handleSaveLocalSkin = async ({ name, dataUri, variant, profileKey }) => {
    const res = await launcher.skinSaveLocal?.({ name, dataUri, variant, profileKey });
    if (res?.error) {
      pushToast({ tone: 'error', title: t('skins.title'), message: res.message || res.error });
      return;
    }
    const lib = await launcher.skinGetLibrary?.();
    if (Array.isArray(lib?.skins)) setSkinsLibrary(lib.skins);
    if (lib?.activeByProfile) setActiveLocalSkinByProfile(lib.activeByProfile);
    pushToast({ tone: 'success', title: t('skins.title'), message: t('skins.savedToast') });
  };

  const handleSelectLocalSkin = async ({ profileKey, skinId }) => {
    const res = await launcher.skinSetProfileLocal?.({ profileKey, skinId });
    if (res?.activeByProfile) {
      setActiveLocalSkinByProfile(res.activeByProfile);
    }
  };

  const handleDeleteLocalSkin = async (skinId) => {
    const res = await launcher.skinDeleteLocal?.(skinId);
    if (res?.ok) {
      setSkinsLibrary(prev => prev.filter(s => s.id !== skinId));
      if (res.activeByProfile) setActiveLocalSkinByProfile(res.activeByProfile);
    }
  };

  const handleApplyMicrosoftSkin = async ({ profileKey, dataUri, variant }) => {
    const res = await launcher.skinApplyMicrosoft?.({ profileKey, dataUri, variant });
    if (res?.error) {
      pushToast({ tone: 'error', title: t('skins.title'), message: res.message || res.error });
      return;
    }
    if (res?.account) {
      setAccount(prev => ({ ...prev, session: res.account }));
      await launcher.skinSetProfileLocal?.({ profileKey, skinId: '' });
      setActiveLocalSkinByProfile(prev => {
        const next = { ...prev };
        delete next[String(profileKey || 'default')];
        return next;
      });
      setMicrosoftSkinDataUri(dataUri);
      pushToast({ tone: 'success', title: t('skins.title'), message: t('skins.appliedToast') });
    }
  };

  const handleSetMicrosoftCape = async ({ profileKey, capeId }) => {
    const res = await launcher.skinSetMicrosoftCape?.({ profileKey, capeId });
    if (res?.error) {
      pushToast({ tone: 'error', title: t('skins.title'), message: res.message || res.error });
      return;
    }
    if (res?.account) {
      setAccount(prev => ({ ...prev, session: res.account }));
    }
  };

  const handleResetMicrosoftSkin = async (profileKey) => {
    const res = await launcher.skinResetMicrosoft?.(profileKey);
    if (res?.error) {
      pushToast({ tone: 'error', title: t('skins.title'), message: res.message || res.error });
      return;
    }
    if (res?.account) {
      setAccount(prev => ({ ...prev, session: res.account }));
      if (res.account.skinUrl && launcher.skinFetchTexture) {
        const tex = await launcher.skinFetchTexture(res.account.skinUrl).catch(() => null);
        if (tex?.dataUri) setMicrosoftSkinDataUri(tex.dataUri);
      }
      pushToast({ tone: 'success', title: t('skins.title'), message: t('skins.appliedToast') });
    }
  };

  const handleImportSkinByUsername = async (username) => {
    const res = await launcher.skinImportUsername?.(username);
    if (res?.error) {
      pushToast({ tone: 'error', title: t('skins.title'), message: res.message || res.error });
      return null;
    }
    return res;
  };

  const handlePickSkinFile = async () => {
    const res = await launcher.skinPickFile?.();
    if (res?.error) {
      pushToast({ tone: 'error', title: t('skins.title'), message: res.error });
      return null;
    }
    return res;
  };

  // Version Loader Type badge helper
  const launchTargetVersionId = activeInstance?.version || selectedInstalledVersionId;
  const launchTargetVersionObj = launchTargetVersionId
    ? installedVersions.find(v => v.id === launchTargetVersionId) || getVersionById(launchTargetVersionId, versionCatalog)
    : activeVersion;
  const loaderType = String(activeInstance?.loader || launchTargetVersionObj?.type || launchTargetVersionId || '').toLowerCase();
  const loaderBadgeLabel = loaderType.includes('fabric') ? 'Fabric' : loaderType.includes('neoforge') ? 'NeoForge' : loaderType.includes('forge') ? 'Forge' : loaderType.includes('quilt') ? 'Quilt' : 'Vanilla';
  const effectiveRamGb = activeInstance?.ram || activeProfile?.ram || 4;

  const profileToEdit = profileEditor?.mode === 'edit'
    ? profiles.find(p => p.id === profileEditor.profileId) || null
    : null;

  return (
    <>
      <div className="toast-stack" aria-live="polite">
        {toasts.map(toast => (
          <Toast key={toast.id} toast={toast} onClose={dismissToast} />
        ))}
      </div>

      {/* ── CLEAN MINIMAL TOPBAR ── */}
      <header className="titlebar">
        <div className="titlebar-left">
          <div className="titlebar-brand">
            <div className="titlebar-logo">
              <SpaceLogo size={18} />
            </div>
            <span className="titlebar-name">{t('app.name')}</span>
          </div>
        </div>

        <div className="titlebar-right">
          {!isOnline && (
            <div className="offline-pill" title={t('offline.noConnectionToast')}>
              <Icon d={ICONS.wifiOff} size={12} />
              <span>{t('offline.badge')}</span>
            </div>
          )}

          <button
            type="button"
            className="cmd-trigger-btn"
            onClick={() => setCmdPaletteOpen(true)}
            title={`${t('cmd.trigger')} (Ctrl+K)`}
          >
            <Icon d={ICONS.search} size={12} />
            <span>{t('cmd.trigger')}</span>
            <kbd>Ctrl K</kbd>
          </button>

          <button
            type="button"
            className="titlebar-icon-btn"
            onClick={() => {
              const cur = settings.theme || 'system';
              const nextTheme = cur === 'system' ? 'light' : cur === 'light' ? 'dark' : 'system';
              handleSettingChange('theme', nextTheme);
            }}
            title={
              settings.theme === 'light'
                ? t('settings.themeLight')
                : settings.theme === 'dark'
                  ? t('settings.themeDark')
                  : `${t('settings.themeSystem')} (${effectiveTheme === 'light' ? t('settings.systemDetectedLight') : t('settings.systemDetectedDark')})`
            }
          >
            <Icon
              d={
                settings.theme === 'light'
                  ? ICONS.sun
                  : settings.theme === 'dark'
                    ? ICONS.moon
                    : ICONS.monitor
              }
              size={13}
            />
          </button>

          <button
            type="button"
            className="titlebar-icon-btn"
            onClick={handleOpenMinecraftDirectory}
            title={t('settings.openMinecraftDirectory')}
          >
            <Icon d={ICONS.folder} size={13} />
          </button>

          {!launcher?.isMac && launcher?.platform !== 'darwin' && (
            <div className="titlebar-controls">
              <button className="win-btn" onClick={() => launcher.windowMinimize()} title={t('window.minimize')}>
                <Icon d={ICONS.minimize} size={11} />
              </button>
              <button className="win-btn" onClick={() => launcher.windowMaximize()} title={t('window.maximize')}>
                <Icon d={ICONS.maximize} size={10} />
              </button>
              <button className="win-btn close" onClick={() => launcher.windowClose()} title={t('window.close')}>
                <Icon d={ICONS.x} size={11} />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── LAUNCHER SHELL ── */}
      <div className="app-layout">
        {/* ── SLIM LEFT RAIL ── */}
        <aside className="sidebar">
          <nav className="sidebar-nav-main">
            <div className="sidebar-section-header">
              <span className="sidebar-title">{t('sidebar.navigation')}</span>
            </div>

            <button
              type="button"
              className={`nav-item ${activeTab === 'home' && !selectedModDetail ? 'active' : ''}`}
              onClick={() => { setSelectedModDetail(null); setActiveTab('home'); }}
            >
              <span className="nav-icon"><Icon d={ICONS.home} size={14} /></span>
              <span>{t('sidebar.home') || 'Home'}</span>
            </button>

            <button
              type="button"
              className={`nav-item ${activeTab === 'instances' && !selectedModDetail ? 'active' : ''}`}
              onClick={() => {
                setSelectedModDetail(null);
                if (activeTab === 'instances' && instanceWorkspaceOpen) {
                  setInstanceWorkspaceOpen(false);
                } else {
                  setActiveTab('instances');
                }
              }}
            >
              <span className="nav-icon"><Icon d={ICONS.layers} size={14} /></span>
              <span>{t('sidebar.instances') || 'Instances'}</span>
              <span className="nav-counter">
                {instances.length}
                {modUpdatesCount > 0 ? <span className="nav-update-dot" title={`${modUpdatesCount} updates`} /> : null}
              </span>
            </button>

            <button
              type="button"
              className={`nav-item ${activeTab === 'skins' && !selectedModDetail ? 'active' : ''}`}
              onClick={() => { setSelectedModDetail(null); setActiveTab('skins'); }}
            >
              <span className="nav-icon"><Icon d={ICONS.user} size={14} /></span>
              <span>{t('sidebar.skins') || 'Skins'}</span>
            </button>

            <div className="sidebar-section-header" style={{ marginTop: 10 }}>
              <span className="sidebar-title">{t('sidebar.discover')}</span>
            </div>

            <button
              type="button"
              className={`nav-item ${activeTab === 'explore' && exploreType !== 'modpacks' && !selectedModDetail ? 'active' : ''}`}
              onClick={() => {
                setSelectedModDetail(null);
                if (exploreType === 'modpacks') setExploreType('mods');
                setActiveTab('explore');
              }}
            >
              <span className="nav-icon"><Icon d={ICONS.compass} size={14} /></span>
              <span>{t('sidebar.explore')}</span>
            </button>

            <button
              type="button"
              className={`nav-item ${activeTab === 'explore' && exploreType === 'modpacks' && !selectedModDetail ? 'active' : ''}`}
              onClick={() => {
                setSelectedModDetail(null);
                setExploreType('modpacks');
                setActiveTab('explore');
              }}
            >
              <span className="nav-icon"><Icon d={ICONS.box} size={14} /></span>
              <span>{t('explore.tabModpacks')}</span>
            </button>
          </nav>

          {/* ── Quick Instances Switcher (Fills Sidebar Middle) ── */}
          <div className="sidebar-instances-section">
            <div className="sidebar-section-header">
              <span className="sidebar-title">{t('sidebar.quickInstances')}</span>
              <button
                type="button"
                className="sidebar-mini-add"
                onClick={() => setInstanceEditor({ mode: 'create', instance: null })}
                title={t('instances.newInstance')}
              >
                <Icon d={ICONS.plus} size={12} />
              </button>
            </div>

            {instances.length === 0 ? (
              <div className="sidebar-instances-empty">
                <button
                  type="button"
                  className="sidebar-empty-action"
                  onClick={() => setInstanceEditor({ mode: 'create', instance: null })}
                >
                  <Icon d={ICONS.plus} size={13} />
                  <span>{t('instances.newInstance')}</span>
                </button>
                <button
                  type="button"
                  className="sidebar-empty-action"
                  onClick={handleImportModpackClick}
                >
                  <Icon d={ICONS.box} size={13} />
                  <span>{t('instances.importModpack')}</span>
                </button>
              </div>
            ) : (
              <div className="sidebar-instances-list">
                {instances.slice(0, 6).map(inst => {
                  const isSelected = activeInstanceId === inst.id;
                  const isRunningThis = gameState === 'running' && isSelected;
                  return (
                    <div
                      key={inst.id}
                      className={`sidebar-instance-item ${isSelected ? 'active' : ''}`}
                      onClick={() => {
                        setActiveInstanceId(inst.id);
                        persistState({ activeInstanceId: inst.id });
                      }}
                      title={`${inst.name} (${inst.version} · ${inst.loader || 'Vanilla'})`}
                    >
                      <img
                        src={getInstanceIconSrc(inst.icon)}
                        alt={inst.name}
                        className="sidebar-instance-icon"
                      />
                      <div className="sidebar-instance-copy">
                        <span className="sidebar-instance-name">{inst.name}</span>
                        <span className="sidebar-instance-meta">
                          {inst.version} · {inst.loader || 'Vanilla'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="sidebar-instance-open"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedModDetail(null);
                          setActiveInstanceId(inst.id);
                          persistState({ activeInstanceId: inst.id });
                          setInstanceSubTab('mods');
                          setInstanceWorkspaceOpen(true);
                          setActiveTab('instances');
                        }}
                        title={t('instances.manageContent')}
                      >
                        <Icon d={isRunningThis ? ICONS.play : ICONS.cube} size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="sidebar-footer">
            <div className="sidebar-utils">
              <button
                type="button"
                className={`nav-item ${activeTab === 'settings' && !selectedModDetail ? 'active' : ''}`}
                onClick={() => {
                  setSelectedModDetail(null);
                  setSettingsSection('general');
                  setActiveTab('settings');
                }}
              >
                <span className="nav-icon"><Icon d={ICONS.settings} size={14} /></span>
                <span>{t('sidebar.settings')}</span>
              </button>
            </div>

            <div className="sidebar-account">
              <div
                className="account-card"
                onClick={() => setAccountModalOpen(true)}
                title={t('accountModal.manageTitle')}
              >
                <div className="account-avatar">
                  <SkinHeadAvatar
                    skinDataUri={activeProfileSkinDataUri}
                    fallbackUrl={profileAvatarUrl}
                    alt={profileAvatarName}
                    size={32}
                  />
                </div>
                <div className="account-info">
                  <span className="account-name">{account.name || t('account.loggedOut')}</span>
                  <span className="account-status-label">
                    <span className={`status-dot ${gameState === 'running' ? 'in-game' : account.loggedIn ? 'online' : ''}`} />
                    {authRefreshing ? (
                      <span>{t('account.refreshingAuth')}</span>
                    ) : gameState === 'running' ? (
                      <span>{t('account.inGame')}</span>
                    ) : account.kind === 'microsoft' ? (
                      <span>{t('account.microsoftBadge')}</span>
                    ) : account.loggedIn ? (
                      <span>{t('account.offline')}</span>
                    ) : (
                      <span>{t('account.guest')}</span>
                    )}
                  </span>
                </div>
                {account.kind === 'microsoft' ? (
                  <button
                    type="button"
                    className="account-auth-btn logout"
                    onClick={(e) => { e.stopPropagation(); handleLogout(); }}
                    title={t('account.logout')}
                  >
                    <Icon d={ICONS.logout} size={12} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="account-auth-btn"
                    onClick={(e) => { e.stopPropagation(); handleLogin(); }}
                    title={t('account.loginWithMicrosoft')}
                  >
                    <MicrosoftLogo />
                  </button>
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* ── MAIN WORKSPACE STAGE ── */}
        <main className="main-content">
          {selectedModDetail ? (
            <ProjectDetailView
              project={selectedModDetail.project}
              initialTab={selectedModDetail.initialTab || 'overview'}
              currentLoader={currentLoader}
              currentMcVer={currentMcVer}
              mods={
                selectedModDetail?.project?.project_type === 'shader' || exploreType === 'shaders' ? shaders :
                  selectedModDetail?.project?.project_type === 'resourcepack' || exploreType === 'resourcepacks' ? resourcePacks :
                    selectedModDetail?.project?.project_type === 'datapack' || exploreType === 'datapacks' ? datapacks : mods
              }
              installingVersionId={installingVersionId}
              onBack={() => setSelectedModDetail(null)}
              onInstallVersion={handleInstallSpecificVersion}
              parentTabTitle={
                selectedModDetail.parentTitle ||
                (activeTab === 'explore' ? t('sidebar.explore') :
                  activeTab === 'mods' ? t('sidebar.mods') :
                    activeTab === 'shaders' ? t('sidebar.shaders') :
                      activeTab === 'resourcepacks' ? t('sidebar.resourcePacks') :
                        activeTab === 'datapacks' ? t('sidebar.datapacks') : t('sidebar.explore'))
              }
            />
          ) : (
            <>
              {/* Update Notification Banner */}
              {updateState.phase === 'downloading' || updateState.phase === 'launching' || updateState.phase === 'complete' ? (
                <div className="update-banner">
                  <div className="update-banner-header">
                    <span className="update-banner-title">{t('update.launcherUpdate')} — {updateState.latestVersion || ''}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {updateState.phase === 'downloading' ? `${updateState.progress || 0}%` : updateState.phase}
                    </span>
                  </div>
                  <div className="update-banner-progress">
                    <div className="update-banner-fill" style={{ width: `${Math.max(0, Math.min(100, updateState.progress || 0))}%` }} />
                  </div>
                </div>
              ) : null}

              {/* ── LAUNCHER HOME TAB ── */}
              {activeTab === 'home' && (
                <div className="play-stage">
                  <div className="play-hero">
                    <div className="play-hero-eyebrow" ref={profileMenuRef}>
                      {activeInstance && (
                        <>
                          <span className="play-env-label">
                            <img
                              src={getInstanceIconSrc(activeInstance.icon)}
                              alt={activeInstance.name}
                              className="play-env-thumb"
                            />
                            <span>{activeInstance.name}</span>
                          </span>
                          <span className="spec-sep">·</span>
                        </>
                      )}

                      <button
                        type="button"
                        className="play-profile-pill"
                        onClick={() => setProfileMenuOpen(prev => !prev)}
                        title={t('sidebar.profiles')}
                      >
                        <span>{activeProfile?.name || 'Default'}</span>
                        <span className="play-profile-ram">{effectiveRamGb} GB</span>
                        <Icon d={ICONS.chevronDown} size={11} />
                      </button>

                      {profileMenuOpen && (
                        <div className="profile-popover play-profile-popover">
                          <div className="profile-popover-list">
                            {profiles.map(p => {
                              const installedProfileVersion = p.version
                                ? installedVersions.find(v => v.id === p.version) || getVersionById(p.version, versionCatalog)
                                : null;
                              const profileVersionLabel = resolveMinecraftVersion(installedProfileVersion?.inheritsFrom || installedProfileVersion?.mcVer || p.version) || 'Auto';
                              const isSelected = p.id === activeProfileId;
                              const avatarName = (account.loggedIn && account.profileKey === p.id && account.name)
                                ? account.name
                                : (p.skinName || p.microsoftAccount || (p.localName && p.localName !== 'Player' ? p.localName : '') || 'MHF_Steve');
                              const pLocalSkinId = activeLocalSkinByProfile[String(p.id || '')] || '';
                              const pLocalSkin = skinsLibrary.find(s => s.id === pLocalSkinId) || null;
                              const pSkinDataUri = pLocalSkin?.dataUri || ((account.loggedIn && account.profileKey === p.id && account.kind === 'microsoft') ? microsoftSkinDataUri : '');

                              return (
                                <div
                                  key={p.id}
                                  className={`profile-card ${isSelected ? 'active' : ''}`}
                                  onClick={() => {
                                    if (authRefreshing || gameState === 'running') return;
                                    setActiveProfileId(p.id);
                                    persistState({ activeProfileId: p.id });
                                    setProfileMenuOpen(false);
                                  }}
                                >
                                  <div className="profile-avatar">
                                    <SkinHeadAvatar
                                      skinDataUri={pSkinDataUri}
                                      fallbackUrl={getMcHeadsAvatarUrl(avatarName, 64)}
                                      alt={avatarName}
                                      size={32}
                                    />
                                  </div>
                                  <div className="profile-info">
                                    <div className="profile-name-row">
                                      <span className="profile-name">{p.name}</span>
                                      <ProfileCardActions
                                        active={isSelected}
                                        name={p.name}
                                        disabled={authRefreshing || gameState === 'running'}
                                        onEdit={(e) => {
                                          e.stopPropagation();
                                          setProfileMenuOpen(false);
                                          setProfileEditor({ mode: 'edit', profileId: p.id });
                                        }}
                                        onDuplicate={(e) => handleDuplicateProfile(p.id, e)}
                                        onDelete={(e) => {
                                          e.stopPropagation();
                                          handleDeleteProfile(p.id);
                                        }}
                                      />
                                    </div>
                                    <div className="profile-badges-row">
                                      <span className="profile-chip version">{profileVersionLabel}</span>
                                      <span className="profile-chip">{p.ram || 4} GB</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            className="add-profile-btn"
                            onClick={() => {
                              setProfileMenuOpen(false);
                              setProfileEditor({ mode: 'new', profileId: null });
                            }}
                            disabled={authRefreshing || gameState === 'running'}
                          >
                            <Icon d={ICONS.plus} size={13} />
                            <span>{t('sidebar.newProfile')}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {activeInstance ? (
                      <>
                        <h1 className="play-hero-title">{activeInstance.name}</h1>

                        <p className="play-hero-subtitle">
                          {`${currentMcVer || activeInstance.version || 'Vanilla'} · ${loaderBadgeLabel} · ${effectiveRamGb} ${t('game.ram')}`}
                          {typeof activeInstance.modsCount === 'number' && activeInstance.modsCount > 0
                            ? ` · ${t('instances.modsCount', { count: activeInstance.modsCount })}`
                            : ''}
                        </p>

                        <div className="play-actions-row">
                          <button
                            type="button"
                            className={`btn-primary play-cta-btn ${gameState === 'loading' || authRefreshing ? 'loading' : gameState === 'running' ? 'running' : ''}`}
                            onClick={() => handlePlay(activeInstance.id)}
                            disabled={gameState === 'loading' || authRefreshing}
                          >
                            {gameState === 'loading' || authRefreshing ? (
                              <>
                                <span className="spinning"><Icon d={ICONS.spinner} size={15} /></span>
                                <span>{authRefreshing ? t('game.authenticating') : `${t('game.loading')} ${Math.round(progress)}%`}</span>
                              </>
                            ) : gameState === 'running' ? (
                              <>
                                <Icon d={ICONS.stop} size={15} />
                                <span>{t('game.stop')}</span>
                              </>
                            ) : (
                              <>
                                <Icon d={ICONS.play} size={15} />
                                <span>{t('home.launchInstance') || t('game.play')}</span>
                              </>
                            )}
                          </button>

                          {installId && (
                            <button
                              type="button"
                              className="btn-secondary play-secondary-btn"
                              onClick={handleCancelInstall}
                              title={t('game.cancelInstall')}
                            >
                              <Icon d={ICONS.x} size={14} />
                            </button>
                          )}

                          <button
                            type="button"
                            className="btn-secondary play-secondary-btn"
                            onClick={() => {
                              setSelectedModDetail(null);
                              setActiveTab('instances');
                              setInstanceWorkspaceOpen(true);
                            }}
                          >
                            <Icon d={ICONS.cube} size={14} />
                            <span>{t('instances.manageContent')}</span>
                          </button>

                          <button
                            type="button"
                            className="btn-secondary play-secondary-btn"
                            onClick={() => setInstanceEditor({ mode: 'create', instance: null })}
                          >
                            <Icon d={ICONS.plus} size={14} />
                            <span>{t('instances.create') || t('instances.newInstance')}</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <h1 className="play-hero-title">
                          {instances.length === 0 ? t('home.noInstanceTitle') : t('home.selectInstanceTitle')}
                        </h1>
                        <p className="play-hero-subtitle">
                          {t('home.requireInstanceDesc')}
                        </p>
                        <div className="play-actions-row">
                          <button
                            type="button"
                            className="btn-primary play-cta-btn"
                            onClick={() => setInstanceEditor({ mode: 'create', instance: null })}
                          >
                            <Icon d={ICONS.plus} size={15} />
                            <span>{t('home.createInstanceCta')}</span>
                          </button>

                          {instances.length > 0 ? (
                            <button
                              type="button"
                              className="btn-secondary play-secondary-btn"
                              onClick={() => { setInstanceWorkspaceOpen(false); setActiveTab('instances'); }}
                            >
                              <Icon d={ICONS.layers} size={14} />
                              <span>{t('home.browseInstancesCta')}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-secondary play-secondary-btn"
                              onClick={() => setMigrateModalOpen(true)}
                            >
                              <Icon d={ICONS.folder} size={14} />
                              <span>{t('migration.buttonLabel')}</span>
                            </button>
                          )}
                        </div>
                      </>
                    )}

                    {gameState === 'loading' && (
                      <div className="play-progress-track">
                        <div className="play-progress-fill" style={{ width: `${progress}%` }} />
                      </div>
                    )}
                  </div>

                  {/* Clean Quick Instances Switcher (Created Instances Only) */}
                  {instances.length > 0 && (
                    <div className="play-instances-block">
                      <div className="play-section-head">
                        <span className="play-section-title">{t('sidebar.instances') || 'Instances'}</span>
                        <button
                          type="button"
                          className="play-section-link"
                          onClick={() => { setInstanceWorkspaceOpen(false); setActiveTab('instances'); }}
                        >
                          {t('home.viewAll') || 'View all →'}
                        </button>
                      </div>

                      <div className="play-quick-grid">
                        {instances.slice(0, 6).map(inst => (
                          <button
                            key={inst.id}
                            type="button"
                            className={`play-quick-card ${activeInstanceId === inst.id ? 'is-active' : ''}`}
                            onClick={() => {
                              setActiveInstanceId(inst.id);
                              persistState({ activeInstanceId: inst.id });
                            }}
                          >
                            <div className="play-quick-icon">
                              <img src={getInstanceIconSrc(inst.icon)} alt={inst.name} className="play-quick-img" />
                            </div>
                            <div className="play-quick-copy">
                              <span className="play-quick-name">{inst.name}</span>
                              <span className="play-quick-meta">{inst.version} · {inst.loader || 'Vanilla'}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <HomeNewsSection
                    isOnline={isOnline}
                    onCreateInstanceForVersion={(ver, isSnapshot) => {
                      if (isSnapshot && !settings.showSnapshots) {
                        handleSettingChange('showSnapshots', true);
                      }
                      setInstanceEditor({
                        mode: 'create',
                        instance: { version: ver, name: `Minecraft ${ver}` },
                      });
                    }}
                  />
                </div>
              )}

              {activeTab === 'instances' && instanceWorkspaceOpen ? (
                <InstanceDetailView
                  instance={activeInstance}
                  subTab={instanceSubTab}
                  onSubTabChange={setInstanceSubTab}
                  onBack={() => setInstanceWorkspaceOpen(false)}
                  onPlay={handlePlay}
                  gameState={gameState}
                  isRunningThisInstance={gameState === 'running'}
                  onEditInstance={(inst) => setInstanceEditor({ mode: 'edit', instance: inst })}
                  onDuplicateInstance={handleDuplicateInstance}
                  onOpenFolder={(id) => {
                    if (id) launcher.minecraftOpenContentFolder('instance', id);
                    else handleOpenMinecraftDirectory();
                  }}
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
                  modUpdates={modUpdates}
                  updatingMods={updatingMods}
                  handleModToggle={handleModToggle}
                  handleModDelete={handleModDelete}
                  handleUpdateMod={handleUpdateMod}
                  handleOpenLocalModDetails={handleOpenLocalModDetails}
                  shaderSearch={shaderSearch}
                  setShaderSearch={setShaderSearch}
                  shaders={shaders}
                  handleOpenLocalShaderDetails={handleOpenLocalShaderDetails}
                  handleDeleteShader={handleDeleteShader}
                  resourcePackSearch={resourcePackSearch}
                  setResourcePackSearch={setResourcePackSearch}
                  resourcePacks={resourcePacks}
                  handleOpenLocalResourcePackDetails={handleOpenLocalResourcePackDetails}
                  handleDeleteResourcePack={handleDeleteResourcePack}
                  datapackSearch={datapackSearch}
                  setDatapackSearch={setDatapackSearch}
                  datapacks={datapacks}
                  handleOpenLocalDatapackDetails={handleOpenLocalDatapackDetails}
                  handleDeleteDatapack={handleDeleteDatapack}
                  runPid={runPid}
                  logFilter={logFilter}
                  setLogFilter={setLogFilter}
                  autoScroll={autoScroll}
                  setAutoScroll={setAutoScroll}
                  handleCopyConsole={handleCopyConsole}
                  handleClearConsole={handleClearConsole}
                  consoleRef={consoleRef}
                  logs={logs}
                  handleOpenContentFolder={handleOpenContentFolder}
                  handleAddContentClick={handleAddContentClick}
                  setExploreType={setExploreType}
                  setActiveTab={setActiveTab}
                />
              ) : (
                <InstancesTab
                  active={activeTab === 'instances'}
                  instances={instances}
                  activeInstanceId={activeInstanceId}
                  onSelectInstance={(id) => {
                    setActiveInstanceId(id);
                    persistState({ activeInstanceId: id });
                  }}
                  onOpenInstance={(id) => {
                    setActiveInstanceId(id);
                    persistState({ activeInstanceId: id });
                    setInstanceSubTab('mods');
                    setInstanceWorkspaceOpen(true);
                  }}
                  onPlayInstance={(inst) => {
                    setActiveInstanceId(inst.id);
                    persistState({ activeInstanceId: inst.id });
                    handlePlay(inst.id);
                  }}
                  onCreateInstanceClick={() => {
                    setInstanceEditor({ mode: 'create', instance: null });
                  }}
                  onImportModpackClick={handleImportModpackClick}
                  onMigrateClick={() => {
                    setMigrateModalOpen(true);
                  }}
                  onEditInstanceClick={(inst) => {
                    setInstanceEditor({ mode: 'edit', instance: inst });
                  }}
                  onDuplicateInstanceClick={handleDuplicateInstance}
                  onDeleteInstanceClick={(inst) => {
                    setConfirmDialog({
                      title: t('instances.delete'),
                      message: t('instances.deleteConfirm', { name: inst.name }),
                      confirmText: t('common.delete') || 'Delete',
                      danger: true,
                      onConfirm: async () => {
                        setConfirmDialog(null);
                        await launcher.deleteInstance(inst.id);
                        const updated = await launcher.getInstances();
                        setInstances(updated);
                        if (activeInstanceId === inst.id) {
                          const fallbackId = updated[0]?.id || null;
                          setActiveInstanceId(fallbackId);
                          persistState({ activeInstanceId: fallbackId });
                        }
                        pushToast({
                          tone: 'info',
                          title: t('instances.deletedTitle'),
                          message: t('instances.deletedMessage', { name: inst.name }),
                        });
                      },
                    });
                  }}
                  onOpenFolderClick={(id) => {
                    launcher.minecraftOpenContentFolder('instance', id);
                  }}
                  runningInstanceId={gameState === 'running' ? activeInstanceId : null}
                />
              )}

              <SkinsTab
                active={activeTab === 'skins'}
                account={account}
                activeProfile={activeProfile}
                microsoftSkinDataUri={microsoftSkinDataUri}
                skinsLibrary={skinsLibrary}
                activeLocalSkinId={activeLocalSkinId}
                onRefreshMicrosoftProfile={handleRefreshMicrosoftSkin}
                onSaveLocalSkin={handleSaveLocalSkin}
                onSelectLocalSkin={handleSelectLocalSkin}
                onDeleteLocalSkin={handleDeleteLocalSkin}
                onApplyMicrosoftSkin={handleApplyMicrosoftSkin}
                onSetMicrosoftCape={handleSetMicrosoftCape}
                onResetMicrosoftSkin={handleResetMicrosoftSkin}
                onImportByUsername={handleImportSkinByUsername}
                onPickPngFile={handlePickSkinFile}
                onPushToast={pushToast}
              />

              <ExploreTab
                active={activeTab === 'explore'}
                isOnline={isOnline}
                exploreType={exploreType}
                setExploreType={setExploreType}
                activeInstance={activeInstance}
                modrinthQuery={modrinthQuery}
                setModrinthQuery={setModrinthQuery}
                modrinthSort={modrinthSort}
                setModrinthSort={setModrinthSort}
                modrinthLoaderFilter={modrinthLoaderFilter}
                setModrinthLoaderFilter={setModrinthLoaderFilter}
                currentLoader={currentLoader}
                modrinthVersionFilter={modrinthVersionFilter}
                setModrinthVersionFilter={setModrinthVersionFilter}
                currentMcVer={currentMcVer}
                versionCatalog={versionCatalog}
                modrinthCategory={modrinthCategory}
                setModrinthCategory={setModrinthCategory}
                modrinthLoading={modrinthLoading}
                modrinthResults={modrinthResults}
                modrinthTotalHits={modrinthTotalHits}
                isModInstalled={isModInstalled}
                modrinthInstalling={modrinthInstalling}
                handleInstallModrinthMod={handleInstallModrinthMod}
                handleOpenModDetails={handleOpenModDetails}
                modrinthSentinelRef={modrinthSentinelRef}
                modrinthLoadingMore={modrinthLoadingMore}
              />

              <SettingsView
                active={activeTab === 'settings'}
                section={settingsSection}
                onSectionChange={setSettingsSection}
                settings={settings}
                resolvedTheme={effectiveTheme}
                onChange={handleSettingChange}
                onCheckUpdates={handleCheckForUpdates}
                onOpenMinecraftDirectory={handleOpenMinecraftDirectory}
                onOpenLogsDirectory={() => handleOpenContentFolder('logs')}
                onClearLogs={handleClearConsole}
                onOpenSourceCode={handleOpenSourceCode}
                onOpenReleases={handleOpenReleases}
                language={language}
                onLanguageChange={setLanguage}
                appVersion={appVersion}
                installedVersions={installedVersions}
              />
            </>
          )}
        </main>
      </div>

      {/* ── MODALS ── */}
      {instanceEditor && (
        <InstanceModal
          mode={instanceEditor.mode}
          instance={instanceEditor.instance}
          availableVersions={installedVersions}
          versionCatalog={versionCatalog}
          installTargets={installTargets}
          showSnapshots={settings.showSnapshots}
          onToggleSnapshots={(val) => handleSettingChange('showSnapshots', val)}
          onCatalogLoaded={(catalog) => {
            if (catalog?.versions) setVersionCatalog(catalog.versions);
            if (catalog?.installTargets) setInstallTargets(catalog.installTargets);
          }}
          systemTotalRam={systemTotalRam}
          onClose={() => setInstanceEditor(null)}
          onSave={async (instanceData) => {
            const { autoInstallTarget, ...cleanInstanceData } = instanceData || {};
            let savedInstanceId = cleanInstanceData.id || null;

            if (instanceEditor.mode === 'create') {
              const res = await launcher.createInstance(cleanInstanceData);
              if (res?.ok && res?.instance) {
                savedInstanceId = res.instance.id;
                const updated = await launcher.getInstances();
                setInstances(updated);
                setActiveInstanceId(res.instance.id);
                pushToast({
                  tone: 'success',
                  title: t('instances.createdTitle'),
                  message: t('instances.createdMessage', { name: cleanInstanceData.name }),
                });
              }
            } else {
              const res = await launcher.updateInstance(cleanInstanceData.id, cleanInstanceData);
              if (res?.ok) {
                const updated = await launcher.getInstances();
                setInstances(updated);
                pushToast({
                  tone: 'success',
                  title: t('instances.savedTitle'),
                  message: t('instances.savedMessage'),
                });
              }
            }

            if (autoInstallTarget && savedInstanceId) {
              await handleInstall(autoInstallTarget.type, autoInstallTarget);
              if (autoInstallTarget.type !== 'minecraft' && launcher.minecraftGetInstalledVersions) {
                try {
                  const latestInstalled = await launcher.minecraftGetInstalledVersions();
                  if (Array.isArray(latestInstalled)) {
                    setInstalledVersions(latestInstalled);
                    const matched = latestInstalled.find(v =>
                      String(v.type || '').toLowerCase() === autoInstallTarget.type &&
                      (String(v.mcVer || '') === autoInstallTarget.gameVersion ||
                        String(v.inheritsFrom || '') === autoInstallTarget.gameVersion ||
                        String(v.id || '').includes(autoInstallTarget.gameVersion))
                    );
                    if (matched?.id) {
                      await launcher.updateInstance(savedInstanceId, {
                        version: matched.id,
                        loader: autoInstallTarget.type,
                      });
                      const refreshedInsts = await launcher.getInstances();
                      if (Array.isArray(refreshedInsts)) setInstances(refreshedInsts);
                    }
                  }
                } catch { }
              }
            }
          }}
        />
      )}
      {migrateModalOpen && (
        <MigrateInstanceModal
          availableVersions={installedVersions}
          versionCatalog={versionCatalog}
          systemTotalRam={systemTotalRam}
          onClose={() => setMigrateModalOpen(false)}
          onMigrate={async (migrateData) => {
            const res = await launcher.migrateBaseToInstance(migrateData);
            if (res?.ok && res?.instance) {
              const updated = await launcher.getInstances();
              setInstances(updated);
              setActiveInstanceId(res.instance.id);
              pushToast({
                tone: 'success',
                title: t('migration.successTitle'),
                message: t(res.mode === 'converted' ? 'migration.convertedMessage' : 'migration.copiedMessage', { name: res.instance.name }),
              });
            } else {
              pushToast({
                tone: 'critical',
                title: t('common.error') || 'Error',
                message: res?.message || 'Migration failed',
              });
            }
          }}
        />
      )}
      {accountModalOpen && (
        <AccountModal
          currentAccount={account}
          avatarDataUri={activeProfileSkinDataUri}
          avatarFallbackUrl={profileAvatarUrl}
          onOpenSkins={() => { setSelectedModDetail(null); setActiveTab('skins'); }}
          loginLoading={loginLoading}
          onClose={() => setAccountModalOpen(false)}
          onSaveOfflineName={(newName) => {
            if (!activeProfile) return;
            setProfiles(prev => {
              const next = prev.map(p => p.id === activeProfile.id ? { ...p, localName: newName, name: newName } : p);
              persistState({ profiles: next, activeProfileId: activeProfile.id });
              return next;
            });
            setAccount(prev => ({
              ...prev,
              name: newName,
              loggedIn: true,
              kind: 'local',
              session: createOfflineSession(newName),
            }));
            pushToast({
              tone: 'success',
              title: t('accountModal.accountUpdatedTitle'),
              message: t('accountModal.accountUpdatedMessage', { name: newName }),
            });
          }}
          onLoginMicrosoft={() => {
            setAccountModalOpen(false);
            handleLogin();
          }}
          onLogout={() => {
            setAccountModalOpen(false);
            handleLogout();
          }}
        />
      )}
      {profileEditor && (
        <ProfileModal
          mode={profileEditor.mode}
          profile={profileToEdit}
          versions={installedVersions}
          versionCatalog={versionCatalog}
          systemTotalRam={systemTotalRam}
          onClose={() => setProfileEditor(null)}
          onSave={handleSaveProfile}
        />
      )}
      {addContentChoice && (
        <AddContentSourceModal
          targetType={addContentChoice}
          onClose={() => setAddContentChoice(null)}
          onPickLocal={(kind) => handlePickLocalContent(kind)}
          onBrowseModrinth={(kind) => {
            setSelectedModDetail(null);
            setInstanceWorkspaceOpen(false);
            setExploreType(kind || 'mods');
            setActiveTab('explore');
          }}
        />
      )}
      {cmdPaletteOpen && (
        <CommandPaletteModal
          open={cmdPaletteOpen}
          onClose={() => setCmdPaletteOpen(false)}
          commands={[
            ...instances.map(inst => ({
              id: `play-${inst.id}`,
              group: t('cmd.groupInstances'),
              title: `${t('instances.play')} — ${inst.name}`,
              subtitle: `${inst.version} · ${inst.loader || 'Vanilla'}`,
              keywords: `launch start instance ${inst.name} ${inst.version}`,
              imageSrc: getInstanceIconSrc(inst.icon),
              action: () => {
                setSelectedModDetail(null);
                setActiveInstanceId(inst.id);
                persistState({ activeInstanceId: inst.id });
                handlePlay(inst.id);
              },
            })),
            ...instances.map(inst => ({
              id: `open-${inst.id}`,
              group: t('cmd.groupInstances'),
              title: `${t('instances.manageContent')} — ${inst.name}`,
              subtitle: `${inst.version} · ${inst.loader || 'Vanilla'}`,
              keywords: `mods shaders manage instance ${inst.name}`,
              imageSrc: getInstanceIconSrc(inst.icon),
              action: () => {
                setSelectedModDetail(null);
                setActiveInstanceId(inst.id);
                persistState({ activeInstanceId: inst.id });
                setInstanceSubTab('mods');
                setInstanceWorkspaceOpen(true);
                setActiveTab('instances');
              },
            })),
            {
              id: 'nav-home',
              group: t('cmd.groupNavigation'),
              title: t('sidebar.home'),
              icon: ICONS.home,
              action: () => { setSelectedModDetail(null); setActiveTab('home'); },
            },
            {
              id: 'nav-instances',
              group: t('cmd.groupNavigation'),
              title: t('sidebar.instances'),
              icon: ICONS.layers,
              action: () => { setSelectedModDetail(null); setInstanceWorkspaceOpen(false); setActiveTab('instances'); },
            },
            {
              id: 'nav-skins',
              group: t('cmd.groupNavigation'),
              title: t('sidebar.skins'),
              icon: ICONS.user,
              action: () => { setSelectedModDetail(null); setActiveTab('skins'); },
            },
            {
              id: 'nav-explore',
              group: t('cmd.groupNavigation'),
              title: t('sidebar.explore'),
              icon: ICONS.compass,
              action: () => { setSelectedModDetail(null); setExploreType('mods'); setActiveTab('explore'); },
            },
            {
              id: 'nav-modpacks',
              group: t('cmd.groupNavigation'),
              title: t('explore.tabModpacks'),
              icon: ICONS.box,
              action: () => { setSelectedModDetail(null); setExploreType('modpacks'); setActiveTab('explore'); },
            },
            {
              id: 'nav-settings',
              group: t('cmd.groupNavigation'),
              title: `${t('sidebar.settings')} · ${t('settings.tabAppearance')}`,
              icon: ICONS.palette,
              action: () => { setSelectedModDetail(null); setSettingsSection('appearance'); setActiveTab('settings'); },
            },
            {
              id: 'nav-about',
              group: t('cmd.groupNavigation'),
              title: `${t('sidebar.settings')} · ${t('settings.tabAbout')}`,
              subtitle: t('settings.developedByLabel', { developer: 'Sea' }),
              icon: ICONS.info,
              action: () => { setSelectedModDetail(null); setSettingsSection('about'); setActiveTab('settings'); },
            },
            {
              id: 'act-new-instance',
              group: t('cmd.groupActions'),
              title: t('instances.newInstance'),
              icon: ICONS.plus,
              action: () => setInstanceEditor({ mode: 'create', instance: null }),
            },
            {
              id: 'act-import-modpack',
              group: t('cmd.groupActions'),
              title: t('instances.importModpack'),
              icon: ICONS.box,
              action: () => handleImportModpackClick(),
            },
            {
              id: 'act-open-dir',
              group: t('cmd.groupActions'),
              title: t('settings.openMinecraftDirectory'),
              icon: ICONS.folder,
              action: () => handleOpenMinecraftDirectory(),
            },
            ...SPACE_THEMES.map(themeItem => ({
              id: `theme-${themeItem.id}`,
              group: t('cmd.groupThemes'),
              title: `${t('settings.theme')}: ${t(themeItem.nameKey) || themeItem.fallbackName}`,
              subtitle: settings.theme === themeItem.id ? t('instances.selectedInstance') : undefined,
              icon: themeItem.id === 'light' ? ICONS.sun : themeItem.id === 'system' ? ICONS.monitor : ICONS.moon,
              action: () => handleSettingChange('theme', themeItem.id),
            })),
          ]}
        />
      )}
      {modConflict && (
        <ModConflictModal
          conflict={modConflict}
          mods={mods}
          onClose={() => setModConflict(null)}
          onResolveUpdate={handleResolveConflictUpdate}
          onAutoFixAll={handleAutoFixAllConflicts}
          fixingAll={fixingAllConflicts}
          onOpenModsFolder={() => handleOpenContentFolder('mods')}
        />
      )}
      {loginLoading && (
        <LoginLoadingModal
          onCancel={() => {
            if (loginAbortControllerRef.current) {
              loginAbortControllerRef.current.abort();
            }
            launcher.minecraftLoginCancel?.();
            setLoginLoading(false);
            addLog('info', t('account.loginCancelled'));
          }}
        />
      )}
      {updateModalInfo && (
        <UpdateModal
          updateInfo={updateModalInfo}
          onClose={() => setUpdateModalInfo(null)}
          onInstall={handleApplyUpdate}
        />
      )}
      {confirmDialog && (
        <ConfirmModal
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText}
          cancelText={confirmDialog.cancelText}
          danger={confirmDialog.danger}
          onConfirm={confirmDialog.onConfirm}
          onClose={() => setConfirmDialog(null)}
        />
      )}
    </>
  );
}

// Microsoft official 4-color square logo SVG
