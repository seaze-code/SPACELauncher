import { ICONS } from '../../../constants/icons';
import { ContentPacksTab } from './ContentPacksTab';

export function DatapacksTab(props) {
  return (
    <ContentPacksTab
      active={props.active}
      folderType="datapacks"
      exploreTypeValue="datapacks"
      itemIcon={ICONS.datapack}
      searchPlaceholderKey="mods.searchDatapacksPlaceholder"
      countLabelKey="sidebar.datapacks"
      openFolderTitleKey="mods.openDatapacksFolder"
      addButtonKey="mods.addDatapack"
      emptyTitleKey="mods.emptyDatapacksTitle"
      emptyTextKey="mods.emptyDatapacksText"
      browseButtonKey="explore.browseDatapacks"
      noMatchTitleKey="mods.noDatapacksMatchTitle"
      noMatchTextKey="mods.noDatapacksMatchText"
      deleteTitleKey="mods.deleteDatapack"
      isDragging={props.isDragging}
      handleDragOver={props.handleDragOver}
      handleDragLeave={props.handleDragLeave}
      handleDrop={props.handleDrop}
      searchValue={props.datapackSearch}
      setSearchValue={props.setDatapackSearch}
      items={props.datapacks}
      handleOpenContentFolder={props.handleOpenContentFolder}
      handleAddContentClick={props.handleAddContentClick}
      setExploreType={props.setExploreType}
      setActiveTab={props.setActiveTab}
      handleOpenItemDetails={props.handleOpenLocalDatapackDetails}
      handleDeleteItem={props.handleDeleteDatapack}
    />
  );
}
