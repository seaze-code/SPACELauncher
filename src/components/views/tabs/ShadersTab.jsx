import { ICONS } from '../../../constants/icons';
import { ContentPacksTab } from './ContentPacksTab';

export function ShadersTab(props) {
  return (
    <ContentPacksTab
      active={props.active}
      folderType="shaders"
      exploreTypeValue="shaders"
      itemIcon={ICONS.sun}
      searchPlaceholderKey="mods.searchShadersPlaceholder"
      countLabelKey="sidebar.shaders"
      openFolderTitleKey="mods.openShadersFolder"
      addButtonKey="mods.addShader"
      emptyTitleKey="mods.emptyShadersTitle"
      emptyTextKey="mods.emptyShadersText"
      browseButtonKey="explore.browseShaders"
      noMatchTitleKey="mods.noShadersMatchTitle"
      noMatchTextKey="mods.noShadersMatchText"
      deleteTitleKey="mods.deleteShader"
      isDragging={props.isDragging}
      handleDragOver={props.handleDragOver}
      handleDragLeave={props.handleDragLeave}
      handleDrop={props.handleDrop}
      searchValue={props.shaderSearch}
      setSearchValue={props.setShaderSearch}
      items={props.shaders}
      handleOpenContentFolder={props.handleOpenContentFolder}
      handleAddContentClick={props.handleAddContentClick}
      setExploreType={props.setExploreType}
      setActiveTab={props.setActiveTab}
      handleOpenItemDetails={props.handleOpenLocalShaderDetails}
      handleDeleteItem={props.handleDeleteShader}
    />
  );
}
