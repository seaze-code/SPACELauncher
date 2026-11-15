import { useI18n } from '../../context/I18nContext';
import { ICONS } from '../../constants/icons';
import { Icon } from '../common/CommonComponents';

export function AddContentSourceModal({
  targetType,
  onClose,
  onPickLocal,
  onBrowseModrinth,
}) {
  const { t } = useI18n();
  if (!targetType) return null;

  const titleKey = targetType === 'shaders'
    ? 'mods.addShader'
    : targetType === 'resourcepacks'
      ? 'mods.addResourcePack'
      : targetType === 'datapacks'
        ? 'mods.addDatapack'
        : 'mods.addMod';

  const localDescKey = targetType === 'mods'
    ? 'mods.addSourceLocalModsDesc'
    : 'mods.addSourceLocalPacksDesc';

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal add-choice-modal">
        <div className="modal-title-row">
          <div>
            <div className="modal-title">{t(titleKey)}</div>
            <div className="modal-subtitle">{t('mods.addSourceSubtitle')}</div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} title={t('window.close')}>
            <Icon d={ICONS.x} size={14} />
          </button>
        </div>

        <div className="add-choice-grid">
          <button
            type="button"
            className="add-choice-card"
            onClick={() => {
              onClose();
              onPickLocal(targetType);
            }}
          >
            <div className="add-choice-icon">
              <Icon d={ICONS.folder} size={20} />
            </div>
            <div className="add-choice-copy">
              <div className="add-choice-title">{t('mods.addSourceLocalTitle')}</div>
              <div className="add-choice-desc">{t(localDescKey)}</div>
            </div>
          </button>

          <button
            type="button"
            className="add-choice-card"
            onClick={() => {
              onClose();
              onBrowseModrinth(targetType);
            }}
          >
            <div className="add-choice-icon">
              <Icon d={ICONS.compass} size={20} />
            </div>
            <div className="add-choice-copy">
              <div className="add-choice-title">{t('mods.addSourceModrinthTitle')}</div>
              <div className="add-choice-desc">{t('mods.addSourceModrinthDesc')}</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
