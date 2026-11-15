import { ICONS } from '../../../constants/icons';
import { ContentPacksTab } from './ContentPacksTab';

export function ResourcePacksTab(props) {
  return (
    <ContentPacksTab
      active={props.active}
      folderType="resourcepacks"
      exploreTypeValue="resourcepacks"
      itemIcon={ICONS.layers}
      searchPlaceholderKey="mods.searchResourcePacksPlaceholder"
      countLabelKey="sidebar.resourcePacks"
      openFolderTitleKey="mods.openResourcePacksFolder"
      addButtonKey="mods.addResourcePack"
      emptyTitleKey="mods.emptyResourcePacksTitle"
      emptyTextKey="mods.emptyResourcePacksText"
      browseButtonKey="explore.browseResourcePacks"
      noMatchTitleKey="mods.noResourcePacksMatchTitle"
      noMatchTextKey="mods.noResourcePacksMatchText"
      deleteTitleKey="mods.deleteResourcePack"
      isDragging={props.isDragging}
      handleDragOver={props.handleDragOver}
      handleDragLeave={props.handleDragLeave}
      handleDrop={props.handleDrop}
      searchValue={props.resourcePackSearch}
      setSearchValue={props.setResourcePackSearch}
      items={props.resourcePacks}
      handleOpenContentFolder={props.handleOpenContentFolder}
      handleAddContentClick={props.handleAddContentClick}
      setExploreType={props.setExploreType}
      setActiveTab={props.setActiveTab}
      handleOpenItemDetails={props.handleOpenLocalResourcePackDetails}
      handleDeleteItem={props.handleDeleteResourcePack}
    />
  );
}
