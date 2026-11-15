; SpaceLauncher Lightweight Web Installer (~200 KB)
; Downloads the latest Windows x64 archive from GitHub Releases on demand.
; Output: ..\release\SpaceLauncher-WebSetup.exe

SetCompressor /SOLID lzma
Name "SpaceLauncher"

!define APPNAME "SpaceLauncher"
!define APP_EXE "SpaceLauncher.exe"
!define OUT_FILE "..\release\SpaceLauncher-WebSetup.exe"
!define DOWNLOAD_URL "https://github.com/seaze-code/SPACELauncher/releases/latest/download/SpaceLauncher-Windows-x64.zip"
!define DEVELOPER "Sea"
!define HELPURL "https://github.com/seaze-code/SPACELauncher"
!define ABOUTURL "https://github.com/seaze-code/SPACELauncher"

!define ICON_FILE "icon.ico"
!define HEADER_IMG_FILE "header.bmp"
!define LICENSE_TEXT_FILE "LICENSE.txt"

OutFile "${OUT_FILE}"

!include "MUI2.nsh"
!include "LogicLib.nsh"

!define MUI_ICON "${ICON_FILE}"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "${HEADER_IMG_FILE}"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"

InstallDir "$LOCALAPPDATA\${APPNAME}"
InstallDirRegKey HKCU "Software\${APPNAME}" "InstallLocation"
RequestExecutionLevel user

Var StartMenuFolder

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${LICENSE_TEXT_FILE}"
!insertmacro MUI_PAGE_DIRECTORY
!define MUI_STARTMENUPAGE_REGISTRY_ROOT "HKCU"
!define MUI_STARTMENUPAGE_REGISTRY_KEY "Software\${APPNAME}"
!define MUI_STARTMENUPAGE_REGISTRY_VALUENAME "Start Menu Folder"
!insertmacro MUI_PAGE_STARTMENU Application $StartMenuFolder
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

Section "install"
  InitPluginsDir
  SetOutPath "$INSTDIR"

  DetailPrint "Preparing web installer script..."
  FileOpen $R0 "$PLUGINSDIR\install.ps1" w
  FileWrite $R0 "param([string]$$ZipPath, [string]$$DestDir, [string]$$DownloadUrl)$\r$\n"
  FileWrite $R0 "$$ErrorActionPreference = 'Stop'$\r$\n"
  FileWrite $R0 "$$ProgressPreference = 'SilentlyContinue'$\r$\n"
  FileWrite $R0 "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12$\r$\n"
  FileWrite $R0 "Write-Host 'Downloading SpaceLauncher package...'$\r$\n"
  FileWrite $R0 "if (Get-Command curl.exe -ErrorAction SilentlyContinue) {$\r$\n"
  FileWrite $R0 "  & curl.exe -fL --retry 3 --connect-timeout 20 -o $$ZipPath $$DownloadUrl$\r$\n"
  FileWrite $R0 "  if ($$LASTEXITCODE -ne 0) { throw ('curl failed with exit code ' + $$LASTEXITCODE) }$\r$\n"
  FileWrite $R0 "} else {$\r$\n"
  FileWrite $R0 "  Invoke-WebRequest -UseBasicParsing -Uri $$DownloadUrl -OutFile $$ZipPath$\r$\n"
  FileWrite $R0 "}$\r$\n"
  FileWrite $R0 "Write-Host 'Closing running instances if any...'$\r$\n"
  FileWrite $R0 "Get-Process -Name SpaceLauncher -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue$\r$\n"
  FileWrite $R0 "Start-Sleep -Milliseconds 600$\r$\n"
  FileWrite $R0 "New-Item -ItemType Directory -Force -Path $$DestDir | Out-Null$\r$\n"
  FileWrite $R0 "Write-Host 'Extracting SpaceLauncher...'$\r$\n"
  FileWrite $R0 "if (Get-Command tar.exe -ErrorAction SilentlyContinue) {$\r$\n"
  FileWrite $R0 "  & tar.exe -xf $$ZipPath -C $$DestDir$\r$\n"
  FileWrite $R0 "  if ($$LASTEXITCODE -ne 0) { Expand-Archive -Path $$ZipPath -DestinationPath $$DestDir -Force }$\r$\n"
  FileWrite $R0 "} else {$\r$\n"
  FileWrite $R0 "  Expand-Archive -Path $$ZipPath -DestinationPath $$DestDir -Force$\r$\n"
  FileWrite $R0 "}$\r$\n"
  FileWrite $R0 "Remove-Item -Force -ErrorAction SilentlyContinue $$ZipPath$\r$\n"
  FileClose $R0

  DetailPrint "Downloading and installing ${APPNAME} from GitHub Releases..."
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\install.ps1" -ZipPath "$PLUGINSDIR\SpaceLauncher.zip" -DestDir "$INSTDIR" -DownloadUrl "${DOWNLOAD_URL}"'
  Pop $0

  ${If} $0 != 0
    ${IfNot} ${Silent}
      MessageBox MB_ICONSTOP|MB_OK "Failed to download or install ${APPNAME}. Please check your internet connection or download manually from:$\r$\n${HELPURL}/releases"
    ${EndIf}
    Abort "Web install failed ($0)"
  ${EndIf}

  ${IfNot} ${FileExists} "$INSTDIR\${APP_EXE}"
    ${IfNot} ${Silent}
      MessageBox MB_ICONSTOP|MB_OK "Installation finished but ${APP_EXE} was not found in $INSTDIR."
    ${EndIf}
    Abort "Missing executable"
  ${EndIf}

  File "${ICON_FILE}"
  File "${HEADER_IMG_FILE}"
  File "${LICENSE_TEXT_FILE}"

  WriteUninstaller "$INSTDIR\uninstall.exe"

  !insertmacro MUI_STARTMENU_WRITE_BEGIN Application
    CreateDirectory "$SMPROGRAMS\$StartMenuFolder"
    CreateShortcut "$SMPROGRAMS\$StartMenuFolder\${APPNAME}.lnk" "$INSTDIR\${APP_EXE}"
    CreateShortcut "$SMPROGRAMS\$StartMenuFolder\Uninstall ${APPNAME}.lnk" "$INSTDIR\uninstall.exe"
  !insertmacro MUI_STARTMENU_WRITE_END

  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${APP_EXE}"

  WriteRegStr HKCU "Software\${APPNAME}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "Publisher" "${DEVELOPER}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "UninstallString" "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "HelpLink" "${HELPURL}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "URLInfoAbout" "${ABOUTURL}"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "NoRepair" 1

  ${If} ${Silent}
    Exec "$INSTDIR\${APP_EXE}"
  ${EndIf}
SectionEnd

Function .onInit
  ${If} ${Silent}
    Sleep 800
  ${EndIf}
FunctionEnd

Function un.onInit
  MessageBox MB_OKCANCEL "Permanently remove ${APPNAME}?" IDOK next
    Abort
  next:
FunctionEnd

Section "uninstall"
  ReadRegStr $StartMenuFolder HKCU "Software\${APPNAME}" "Start Menu Folder"
  ${If} $StartMenuFolder != ""
    Delete "$SMPROGRAMS\$StartMenuFolder\${APPNAME}.lnk"
    Delete "$SMPROGRAMS\$StartMenuFolder\Uninstall ${APPNAME}.lnk"
    RMDir "$SMPROGRAMS\$StartMenuFolder"
  ${EndIf}

  Delete "$DESKTOP\${APPNAME}.lnk"
  Delete "$INSTDIR\uninstall.exe"
  RMDir /r "$INSTDIR"

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
  DeleteRegKey /ifempty HKCU "Software\${APPNAME}"
SectionEnd
