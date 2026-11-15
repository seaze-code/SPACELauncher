import { useCallback, useEffect, useRef, useState } from 'react';
import { ICONS } from '../../../constants/icons';
import { Icon, SkinHeadAvatar } from '../../common/CommonComponents';
import { useI18n } from '../../../context/I18nContext';
import {
  BUILTIN_SKIN_PRESETS,
  createPresetSkinDataUri,
  drawSkinCharacter,
  mapPreviewPointToTexturePixel,
} from '../../../utils/skinRenderer';

const PALETTE_SWATCHES = [
  '#ffffff', '#d4d4d8', '#71717a', '#18181b', '#09090b',
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#c69072', '#8c5a3c',
];

const PREVIEW_W = 192;
const PREVIEW_H = 280;
const PREVIEW_SCALE = 8;
const PREVIEW_OFF_X = 32;
const PREVIEW_OFF_Y = 12;

export function SkinsTab({
  active,
  account,
  activeProfile,
  microsoftSkinDataUri,
  skinsLibrary = [],
  activeLocalSkinId = '',
  onRefreshMicrosoftProfile,
  onSaveLocalSkin,
  onSelectLocalSkin,
  onDeleteLocalSkin,
  onApplyMicrosoftSkin,
  onSetMicrosoftCape,
  onResetMicrosoftSkin,
  onImportByUsername,
  onPickPngFile,
  onPushToast,
}) {
  const { t } = useI18n();
  const isMicrosoft = account?.loggedIn && account?.kind === 'microsoft';

  const activeLibrarySkin = skinsLibrary.find(s => s.id === activeLocalSkinId) || null;
  const fallbackSourceUri = activeLibrarySkin?.dataUri || microsoftSkinDataUri || createPresetSkinDataUri('steve');
  const fallbackSourceVariant = activeLibrarySkin?.variant || account?.session?.skinVariant || 'classic';
  const fallbackSourceName = activeLibrarySkin?.name || account?.name || 'Custom Skin';

  const [draftSkinName, setDraftSkinName] = useState(null);
  const [draftDataUri, setDraftDataUri] = useState('');
  const [draftVariant, setDraftVariant] = useState(null);
  const [view, setView] = useState('front');
  const [showOuterLayer, setShowOuterLayer] = useState(true);
  const [paintMode, setPaintMode] = useState(false);
  const [editOuterLayer, setEditOuterLayer] = useState(false);
  const [tool, setTool] = useState('brush'); // 'brush' | 'eraser' | 'eyedropper'
  const [brushColor, setBrushColor] = useState('#ffffff');
  const [undoStack, setUndoStack] = useState([]);

  const [importName, setImportName] = useState('');
  const [busyAction, setBusyAction] = useState(''); // 'sync' | 'import' | 'upload' | 'apply' | 'save'

  const editingDataUri = draftDataUri || fallbackSourceUri;
  const variant = draftVariant || fallbackSourceVariant;
  const skinName = draftSkinName !== null ? draftSkinName : fallbackSourceName;

  const previewCanvasRef = useRef(null);
  const textureCanvasRef = useRef(null);
  const isPaintingRef = useRef(false);

  const drawCanvasFromUri = useCallback((uri) => {
    const src = uri || createPresetSkinDataUri('steve');
    const img = new Image();
    img.onload = () => {
      // Ensure 64x64 mutable offscreen texture canvas
      let texCanvas = textureCanvasRef.current;
      if (!texCanvas) {
        texCanvas = document.createElement('canvas');
        textureCanvasRef.current = texCanvas;
      }
      texCanvas.width = 64;
      texCanvas.height = 64;
      const tCtx = texCanvas.getContext('2d');
      tCtx.clearRect(0, 0, 64, 64);
      tCtx.imageSmoothingEnabled = false;
      tCtx.drawImage(img, 0, 0);

      const pCanvas = previewCanvasRef.current;
      if (!pCanvas) return;
      const pCtx = pCanvas.getContext('2d');
      pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
      drawSkinCharacter(pCtx, img, {
        view,
        variant,
        showOuterLayer: paintMode ? (editOuterLayer || showOuterLayer) : showOuterLayer,
        scale: PREVIEW_SCALE,
        offsetX: PREVIEW_OFF_X,
        offsetY: PREVIEW_OFF_Y,
      });
    };
    img.src = src;
  }, [view, variant, showOuterLayer, paintMode, editOuterLayer]);

  useEffect(() => {
    drawCanvasFromUri(editingDataUri);
  }, [editingDataUri, drawCanvasFromUri, active]);

  const pushUndoSnapshot = useCallback((uri) => {
    setUndoStack(prev => [...prev.slice(-19), uri]);
  }, []);

  const loadIntoEditor = useCallback((uri, nextVariant, nextName) => {
    if (!uri) return;
    pushUndoSnapshot(editingDataUri);
    setDraftDataUri(uri);
    if (nextVariant) setDraftVariant(nextVariant);
    if (nextName) setDraftSkinName(nextName);
  }, [editingDataUri, pushUndoSnapshot]);

  const paintAtClientCoords = useCallback((clientX, clientY, saveHistoryOnStart = false) => {
    if (!paintMode) return;
    const pCanvas = previewCanvasRef.current;
    const tCanvas = textureCanvasRef.current;
    if (!pCanvas || !tCanvas) return;

    const rect = pCanvas.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * pCanvas.width;
    const py = ((clientY - rect.top) / rect.height) * pCanvas.height;

    const hit = mapPreviewPointToTexturePixel(px, py, {
      view,
      variant,
      editOuterLayer,
      scale: PREVIEW_SCALE,
      offsetX: PREVIEW_OFF_X,
      offsetY: PREVIEW_OFF_Y,
    });
    if (!hit) return;

    const tCtx = tCanvas.getContext('2d');
    if (tool === 'eyedropper') {
      const pixel = tCtx.getImageData(hit.tx, hit.ty, 1, 1).data;
      if (pixel[3] > 0) {
        const hex = `#${[pixel[0], pixel[1], pixel[2]].map(v => v.toString(16).padStart(2, '0')).join('')}`;
        setBrushColor(hex);
        setTool('brush');
      }
      return;
    }

    if (saveHistoryOnStart) {
      pushUndoSnapshot(editingDataUri);
    }

    if (tool === 'eraser') {
      tCtx.clearRect(hit.tx, hit.ty, 1, 1);
    } else {
      tCtx.fillStyle = brushColor;
      tCtx.fillRect(hit.tx, hit.ty, 1, 1);
    }

    const updatedUri = tCanvas.toDataURL('image/png');
    setDraftDataUri(updatedUri);
  }, [paintMode, view, variant, editOuterLayer, tool, brushColor, editingDataUri, pushUndoSnapshot]);

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    setDraftDataUri(prev);
  };

  const handleSyncMicrosoft = async () => {
    if (!isMicrosoft || !onRefreshMicrosoftProfile) return;
    setBusyAction('sync');
    try {
      const syncedUri = await onRefreshMicrosoftProfile();
      if (syncedUri) {
        loadIntoEditor(syncedUri, account?.session?.skinVariant || 'classic', account?.name || 'Microsoft Skin');
      }
    } finally {
      setBusyAction('');
    }
  };

  const handlePickFile = async () => {
    if (!onPickPngFile) return;
    setBusyAction('upload');
    try {
      const res = await onPickPngFile();
      if (res && !res.canceled && res.dataUri) {
        loadIntoEditor(res.dataUri, variant, res.fileName || 'Custom Skin');
      }
    } finally {
      setBusyAction('');
    }
  };

  const handleImportUsername = async (e) => {
    e?.preventDefault?.();
    if (!importName.trim() || !onImportByUsername) return;
    setBusyAction('import');
    try {
      const res = await onImportByUsername(importName.trim());
      if (res?.dataUri) {
        loadIntoEditor(res.dataUri, res.variant || 'classic', res.username || importName.trim());
        setImportName('');
      }
    } finally {
      setBusyAction('');
    }
  };

  const handleSaveLocal = async () => {
    if (!onSaveLocalSkin) return;
    setBusyAction('save');
    try {
      await onSaveLocalSkin({
        name: skinName.trim() || 'Custom Skin',
        dataUri: editingDataUri,
        variant,
        profileKey: activeProfile?.id || 'default',
      });
    } finally {
      setBusyAction('');
    }
  };

  const handleApplyToMicrosoft = async () => {
    if (!isMicrosoft || !onApplyMicrosoftSkin) {
      onPushToast?.({
        tone: 'error',
        title: t('skins.title'),
        message: t('skins.microsoftRequired'),
      });
      return;
    }
    setBusyAction('apply');
    try {
      await onApplyMicrosoftSkin({
        profileKey: activeProfile?.id || 'default',
        dataUri: editingDataUri,
        variant,
      });
    } finally {
      setBusyAction('');
    }
  };

  const microsoftCapes = Array.isArray(account?.session?.capes) ? account.session.capes : [];
  const activeCapeId = account?.session?.capeId || '';

  return (
    <div
      className="tab-panel skins-stage"
      style={{ display: active ? 'flex' : 'none' }}
    >
      <div className="skins-header">
        <div>
          <h2 className="explore-title">{t('skins.title')}</h2>
          <p className="explore-subtitle">{t('skins.subtitle')}</p>
        </div>

        <div className="skins-header-actions">
          {isMicrosoft && (
            <button
              type="button"
              className="btn-secondary btn-compact"
              onClick={handleSyncMicrosoft}
              disabled={busyAction !== ''}
            >
              <Icon d={ICONS.refresh} size={13} className={busyAction === 'sync' ? 'spin-infinite' : ''} />
              <span>{t('skins.syncMicrosoft')}</span>
            </button>
          )}
          <button
            type="button"
            className="btn-secondary btn-compact"
            onClick={handlePickFile}
            disabled={busyAction !== ''}
          >
            <Icon d={ICONS.folder} size={13} />
            <span>{t('skins.uploadPng')}</span>
          </button>
        </div>
      </div>

      <div className="skins-workspace">
        {/* ── LEFT: 2D CHARACTER PREVIEW + PIXEL EDITOR ── */}
        <div className="skin-stage-card">
          <div className="skin-stage-toolbar">
            <div className="skin-seg-group">
              <button
                type="button"
                className={`skin-seg-btn ${view === 'front' ? 'active' : ''}`}
                onClick={() => setView('front')}
              >
                {t('skins.front')}
              </button>
              <button
                type="button"
                className={`skin-seg-btn ${view === 'back' ? 'active' : ''}`}
                onClick={() => setView('back')}
              >
                {t('skins.back')}
              </button>
            </div>

            <button
              type="button"
              className={`skin-seg-btn ${showOuterLayer ? 'active' : ''}`}
              onClick={() => setShowOuterLayer(v => !v)}
              title={t('skins.toggleOuter')}
            >
              {t('skins.outerLayer')}
            </button>

            <button
              type="button"
              className={`skin-seg-btn ${paintMode ? 'active' : ''}`}
              onClick={() => setPaintMode(v => !v)}
            >
              <Icon d={ICONS.palette} size={12} />
              <span>{t('skins.customize')}</span>
            </button>
          </div>

          <div className={`skin-canvas-wrap ${paintMode ? 'is-painting' : ''}`}>
            <canvas
              ref={previewCanvasRef}
              width={PREVIEW_W}
              height={PREVIEW_H}
              className="skin-preview-canvas"
              onMouseDown={(e) => {
                if (!paintMode) return;
                isPaintingRef.current = true;
                paintAtClientCoords(e.clientX, e.clientY, true);
              }}
              onMouseMove={(e) => {
                if (!paintMode || !isPaintingRef.current) return;
                paintAtClientCoords(e.clientX, e.clientY, false);
              }}
              onMouseUp={() => { isPaintingRef.current = false; }}
              onMouseLeave={() => { isPaintingRef.current = false; }}
            />
          </div>

          {paintMode && (
            <div className="skin-painter-bar">
              <div className="skin-painter-tools">
                <button
                  type="button"
                  className={`skin-seg-btn ${tool === 'brush' ? 'active' : ''}`}
                  onClick={() => setTool('brush')}
                >
                  {t('skins.brush')}
                </button>
                <button
                  type="button"
                  className={`skin-seg-btn ${tool === 'eraser' ? 'active' : ''}`}
                  onClick={() => setTool('eraser')}
                >
                  {t('skins.eraser')}
                </button>
                <button
                  type="button"
                  className={`skin-seg-btn ${tool === 'eyedropper' ? 'active' : ''}`}
                  onClick={() => setTool('eyedropper')}
                >
                  {t('skins.picker')}
                </button>
                <button
                  type="button"
                  className={`skin-seg-btn ${editOuterLayer ? 'active' : ''}`}
                  onClick={() => setEditOuterLayer(v => !v)}
                  title={t('skins.paintLayerHint')}
                >
                  {editOuterLayer ? t('skins.layerOuter') : t('skins.layerBase')}
                </button>
                <button
                  type="button"
                  className="skin-seg-btn"
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                >
                  {t('skins.undo')}
                </button>
              </div>

              <div className="skin-palette-row">
                <input
                  type="color"
                  className="skin-color-picker"
                  value={brushColor}
                  onChange={(e) => { setBrushColor(e.target.value); setTool('brush'); }}
                  title={t('skins.pickColor')}
                />
                {PALETTE_SWATCHES.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`skin-color-dot ${brushColor.toLowerCase() === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => { setBrushColor(c); setTool('brush'); }}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="skin-stage-meta">
            <div className="skin-variant-toggle">
              <button
                type="button"
                className={`skin-seg-btn ${variant === 'classic' ? 'active' : ''}`}
                onClick={() => setDraftVariant('classic')}
              >
                {t('skins.classicModel')}
              </button>
              <button
                type="button"
                className={`skin-seg-btn ${variant === 'slim' ? 'active' : ''}`}
                onClick={() => setDraftVariant('slim')}
              >
                {t('skins.slimModel')}
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT: CONTROLS, IMPORT, APPLY & LIBRARY ── */}
        <div className="skin-controls-col">
          <div className="skin-panel-box">
            <div className="skin-panel-title">{t('skins.activeSettings')}</div>
            <div className="skin-save-row">
              <input
                type="text"
                className="modal-input"
                value={skinName}
                onChange={e => setDraftSkinName(e.target.value)}
                placeholder={t('skins.skinNamePlaceholder')}
              />
            </div>

            <div className="skin-apply-buttons">
              {isMicrosoft && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleApplyToMicrosoft}
                  disabled={busyAction !== ''}
                >
                  {busyAction === 'apply' ? <span className="btn-spinner" /> : <Icon d={ICONS.check} size={13} />}
                  <span>{t('skins.applyMicrosoft')}</span>
                </button>
              )}

              <button
                type="button"
                className={isMicrosoft ? 'btn-secondary' : 'btn-primary'}
                onClick={handleSaveLocal}
                disabled={busyAction !== ''}
              >
                {busyAction === 'save' ? <span className="btn-spinner" /> : <Icon d={ICONS.download} size={13} />}
                <span>{t('skins.saveLocal')}</span>
              </button>

              {isMicrosoft && onResetMicrosoftSkin && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={async () => {
                    setBusyAction('apply');
                    try { await onResetMicrosoftSkin(activeProfile?.id || 'default'); } finally { setBusyAction(''); }
                  }}
                  disabled={busyAction !== ''}
                >
                  <span>{t('skins.resetMicrosoft')}</span>
                </button>
              )}
            </div>
          </div>

          <form className="skin-panel-box" onSubmit={handleImportUsername}>
            <div className="skin-panel-title">{t('skins.importTitle')}</div>
            <div className="skin-import-row">
              <input
                type="text"
                className="modal-input"
                value={importName}
                onChange={e => setImportName(e.target.value)}
                placeholder={t('skins.importPlaceholder')}
              />
              <button
                type="submit"
                className="btn-secondary"
                disabled={!importName.trim() || busyAction !== ''}
              >
                {busyAction === 'import' ? <span className="btn-spinner" /> : <Icon d={ICONS.search} size={13} />}
                <span>{t('skins.importBtn')}</span>
              </button>
            </div>
          </form>

          {isMicrosoft && microsoftCapes.length > 0 && (
            <div className="skin-panel-box">
              <div className="skin-panel-title">{t('skins.capes')}</div>
              <div className="skin-capes-row">
                <button
                  type="button"
                  className={`skin-cape-chip ${!activeCapeId ? 'active' : ''}`}
                  onClick={() => onSetMicrosoftCape?.({ profileKey: activeProfile?.id || 'default', capeId: '' })}
                >
                  {t('skins.noCape')}
                </button>
                {microsoftCapes.map(cape => (
                  <button
                    key={cape.id}
                    type="button"
                    className={`skin-cape-chip ${activeCapeId === cape.id ? 'active' : ''}`}
                    onClick={() => onSetMicrosoftCape?.({ profileKey: activeProfile?.id || 'default', capeId: cape.id })}
                  >
                    {cape.alias || 'Cape'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="skin-panel-box">
            <div className="skin-panel-title">{t('skins.presetsAndSaved')}</div>
            <div className="skin-library-grid">
              {microsoftSkinDataUri && (
                <div
                  className={`skin-lib-card ${!activeLocalSkinId ? 'active' : ''}`}
                  onClick={() => {
                    onSelectLocalSkin?.({ profileKey: activeProfile?.id || 'default', skinId: '' });
                    loadIntoEditor(microsoftSkinDataUri, account?.session?.skinVariant || 'classic', account?.name || 'Microsoft Skin');
                  }}
                >
                  <div className="skin-lib-head">
                    <SkinHeadAvatar skinDataUri={microsoftSkinDataUri} size={32} />
                  </div>
                  <div className="skin-lib-info">
                    <span className="skin-lib-name">{account?.name || 'Microsoft'}</span>
                    <span className="skin-lib-meta">Microsoft</span>
                  </div>
                </div>
              )}

              {skinsLibrary.map(skin => (
                <div
                  key={skin.id}
                  className={`skin-lib-card ${activeLocalSkinId === skin.id ? 'active' : ''}`}
                  onClick={() => {
                    onSelectLocalSkin?.({ profileKey: activeProfile?.id || 'default', skinId: skin.id });
                    loadIntoEditor(skin.dataUri, skin.variant, skin.name);
                  }}
                >
                  <div className="skin-lib-head">
                    <SkinHeadAvatar skinDataUri={skin.dataUri} size={32} />
                  </div>
                  <div className="skin-lib-info">
                    <span className="skin-lib-name">{skin.name}</span>
                    <span className="skin-lib-meta">{skin.variant === 'slim' ? 'Slim' : 'Classic'}</span>
                  </div>
                  <button
                    type="button"
                    className="skin-lib-del"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteLocalSkin?.(skin.id);
                    }}
                    title={t('common.delete')}
                  >
                    <Icon d={ICONS.x} size={11} />
                  </button>
                </div>
              ))}

              {BUILTIN_SKIN_PRESETS.map(preset => {
                const presetUri = createPresetSkinDataUri(preset.id);
                return (
                  <div
                    key={preset.id}
                    className="skin-lib-card"
                    onClick={() => loadIntoEditor(presetUri, preset.variant, preset.name)}
                  >
                    <div className="skin-lib-head">
                      <SkinHeadAvatar skinDataUri={presetUri} size={32} />
                    </div>
                    <div className="skin-lib-info">
                      <span className="skin-lib-name">{preset.name}</span>
                      <span className="skin-lib-meta">{preset.variant === 'slim' ? 'Slim' : 'Classic'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
