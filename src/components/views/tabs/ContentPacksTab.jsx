import { ICONS } from '../../../constants/icons';
import { Icon, EmptyState } from '../../common/CommonComponents';
import { formatFileSize, cleanMinecraftText } from '../../../utils/formatters';
import { useI18n } from '../../../context/I18nContext';

/**
 * Shared content pack view used by ShadersTab, ResourcePacksTab, and DatapacksTab.
 */
export function ContentPacksTab({
  active,
  folderType,
  itemIcon,
  searchPlaceholderKey,
  countLabelKey,
  openFolderTitleKey,
  addButtonKey,
  emptyTitleKey,
  emptyTextKey,
  noMatchTitleKey,
  noMatchTextKey,
  deleteTitleKey,
  isDragging,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  searchValue,
  setSearchValue,
  items = [],
  handleOpenContentFolder,
  handleAddContentClick,
  handleOpenItemDetails,
  handleDeleteItem,
}) {
  const { t } = useI18n();

  const filtered = items.filter(item =>
    String(item.name || '').toLowerCase().includes(searchValue.toLowerCase()) ||
    String(item.fileName || '').toLowerCase().includes(searchValue.toLowerCase())
  );

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
            placeholder={t(searchPlaceholderKey)}
            value={searchValue}
            onChange={e => setSearchValue(e.target.value)}
          />
          {searchValue && (
            <button className="search-clear-btn" onClick={() => setSearchValue('')}>
              <Icon d={ICONS.x} size={11} />
            </button>
          )}
        </div>

        {items.length > 0 && (
          <span className="mods-count-badge">
            {items.length} {t(countLabelKey)}
          </span>
        )}

        <div className="mods-toolbar-actions">
          <button
            className="btn-secondary"
            onClick={() => handleOpenContentFolder(folderType)}
            title={t(openFolderTitleKey)}
          >
            <Icon d={ICONS.folder} size={12} />
            <span>{t('mods.openFolder')}</span>
          </button>
          <button
            className="btn-primary"
            onClick={() => handleAddContentClick(folderType)}
          >
            <Icon d={ICONS.plus} size={12} />
            <span>{t(addButtonKey)}</span>
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={itemIcon}
          title={t(emptyTitleKey)}
          description={t(emptyTextKey)}
          actionText={t(addButtonKey)}
          actionIcon={ICONS.plus}
          onAction={() => handleAddContentClick(folderType)}
          secondaryText={t(openFolderTitleKey)}
          onSecondary={() => handleOpenContentFolder(folderType)}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ICONS.search}
          title={t(noMatchTitleKey)}
          description={t(noMatchTextKey)}
          actionText={t('common.clearSearch')}
          onAction={() => setSearchValue('')}
        />
      ) : (
        <div className="mods-grid">
          {filtered.map(item => (
            <div
              key={item.id}
              className="mod-card pack-item-card"
              style={{ cursor: 'pointer' }}
              onClick={() => handleOpenItemDetails(item)}
            >
              <div className="mod-icon">
                {item.iconUrl ? (
                  <img
                    src={item.iconUrl}
                    alt={item.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}
                  />
                ) : (
                  <Icon d={itemIcon} size={18} />
                )}
              </div>
              <div className="mod-info">
                <div className="mod-name">
                  {item.name}
                  <span className="version-tag" style={{ fontSize: 10, padding: '1px 6px' }}>
                    {item.isDirectory ? 'Folder' : formatFileSize(item.size)}
                  </span>
                </div>
                <div className="mod-desc">
                  {item.description ? cleanMinecraftText(item.description) : item.fileName}
                </div>
              </div>
              <div className="mod-actions" onClick={e => e.stopPropagation()}>
                <button
                  className="mod-action-btn delete"
                  title={t(deleteTitleKey)}
                  onClick={() => handleDeleteItem(item)}
                >
                  <Icon d={ICONS.trash} size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
