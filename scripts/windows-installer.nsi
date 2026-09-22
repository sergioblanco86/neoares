Unicode True
ManifestDPIAware True
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64

!ifndef APP_VERSION
  !define APP_VERSION "0.1.0"
!endif
!ifndef PACKAGE_DIR
  !error "PACKAGE_DIR es obligatorio"
!endif
!ifndef OUTPUT_FILE
  !error "OUTPUT_FILE es obligatorio"
!endif
!ifndef APP_ICON
  !error "APP_ICON es obligatorio"
!endif
!ifndef INSTALL_SIZE_KB
  !define INSTALL_SIZE_KB 0
!endif

!define APP_NAME "NeoAres"
!define APP_EXE "NeoAres.exe"
!define APP_ID "NeoAres"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"

Name "${APP_NAME}"
Caption "$(CaptionInstall)"
BrandingText "${APP_NAME}"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\${APP_NAME}"
InstallDirRegKey HKCU "Software\${APP_ID}" "InstallLocation"
Icon "${APP_ICON}"
UninstallIcon "${APP_ICON}"
ShowInstDetails show
ShowUninstDetails show

VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "${APP_NAME}"
VIAddVersionKey /LANG=1033 "CompanyName" "${APP_NAME}"
VIAddVersionKey /LANG=1033 "FileDescription" "${APP_NAME} Installer"
VIAddVersionKey /LANG=1033 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1033 "ProductVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Copyright 2026 ${APP_NAME}"
VIAddVersionKey /LANG=1034 "ProductName" "${APP_NAME}"
VIAddVersionKey /LANG=1034 "CompanyName" "${APP_NAME}"
VIAddVersionKey /LANG=1034 "FileDescription" "Instalador de ${APP_NAME}"
VIAddVersionKey /LANG=1034 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1034 "ProductVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1034 "LegalCopyright" "Copyright 2026 ${APP_NAME}"

!include "MUI2.nsh"

!define MUI_ABORTWARNING
!define MUI_ICON "${APP_ICON}"
!define MUI_UNICON "${APP_ICON}"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "$(FinishRun)"
!define MUI_FINISHPAGE_LINK "$(FinishLink)"
!define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/sergioblanco86/neoares"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Spanish"

LangString CaptionInstall ${LANG_ENGLISH} "Install ${APP_NAME}"
LangString CaptionInstall ${LANG_SPANISH} "Instalar ${APP_NAME}"
LangString FinishRun ${LANG_ENGLISH} "Open ${APP_NAME}"
LangString FinishRun ${LANG_SPANISH} "Abrir ${APP_NAME}"
LangString FinishLink ${LANG_ENGLISH} "${APP_NAME} on GitHub"
LangString FinishLink ${LANG_SPANISH} "${APP_NAME} en GitHub"
LangString AppIsOpenInstall ${LANG_ENGLISH} "${APP_NAME} is open. Close it and click Retry to continue."
LangString AppIsOpenInstall ${LANG_SPANISH} "${APP_NAME} está abierto. Ciérralo y presiona Reintentar para continuar."
LangString AppIsOpenUninstall ${LANG_ENGLISH} "${APP_NAME} is open. Close it and click Retry to continue."
LangString AppIsOpenUninstall ${LANG_SPANISH} "${APP_NAME} está abierto. Ciérralo y presiona Reintentar para continuar."
LangString MainSectionName ${LANG_ENGLISH} "${APP_NAME}"
LangString MainSectionName ${LANG_SPANISH} "${APP_NAME}"

Function .onInit
  SetRegView 64
FunctionEnd

Function EnsureNeoAresIsClosed
  check_running:
    FindWindow $0 "" "${APP_NAME}"
    StrCmp $0 0 app_closed
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION \
      "$(AppIsOpenInstall)" \
      IDRETRY check_running IDCANCEL cancel_install
  cancel_install:
    Abort
  app_closed:
FunctionEnd

Section "$(MainSectionName)" MainSection
  Call EnsureNeoAresIsClosed
  SetShellVarContext current

  RMDir /r "$INSTDIR"
  SetOutPath "$INSTDIR"
  File /r "${PACKAGE_DIR}\*"

  WriteUninstaller "$INSTDIR\Uninstall ${APP_NAME}.exe"
  WriteRegStr HKCU "Software\${APP_ID}" "InstallLocation" "$INSTDIR"

  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\Uninstall ${APP_NAME}.exe"
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0

  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "${APP_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" "$\"$INSTDIR\Uninstall ${APP_NAME}.exe$\""
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" "$\"$INSTDIR\Uninstall ${APP_NAME}.exe$\" /S"
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "EstimatedSize" ${INSTALL_SIZE_KB}
SectionEnd

Function un.onInit
  SetRegView 64
FunctionEnd

Function un.EnsureNeoAresIsClosed
  check_running:
    FindWindow $0 "" "${APP_NAME}"
    StrCmp $0 0 app_closed
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION \
      "$(AppIsOpenUninstall)" \
      IDRETRY check_running IDCANCEL cancel_uninstall
  cancel_uninstall:
    Abort
  app_closed:
FunctionEnd

Section "Uninstall"
  Call un.EnsureNeoAresIsClosed
  SetShellVarContext current

  Delete "$DESKTOP\${APP_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APP_NAME}"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  DeleteRegKey HKCU "Software\${APP_ID}"
  RMDir /r "$INSTDIR"
SectionEnd
