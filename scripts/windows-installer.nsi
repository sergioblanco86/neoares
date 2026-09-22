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
Caption "Instalar ${APP_NAME}"
BrandingText "${APP_NAME}"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\${APP_NAME}"
InstallDirRegKey HKCU "Software\${APP_ID}" "InstallLocation"
Icon "${APP_ICON}"
UninstallIcon "${APP_ICON}"
ShowInstDetails show
ShowUninstDetails show

VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey /LANG=0 "ProductName" "${APP_NAME}"
VIAddVersionKey /LANG=0 "CompanyName" "${APP_NAME}"
VIAddVersionKey /LANG=0 "FileDescription" "Instalador de ${APP_NAME}"
VIAddVersionKey /LANG=0 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=0 "ProductVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=0 "LegalCopyright" "Copyright 2026 ${APP_NAME}"

!include "MUI2.nsh"

!define MUI_ABORTWARNING
!define MUI_ICON "${APP_ICON}"
!define MUI_UNICON "${APP_ICON}"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir ${APP_NAME}"
!define MUI_FINISHPAGE_LINK "${APP_NAME} en GitHub"
!define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/sergioblanco86/neoares"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "Spanish"

Function .onInit
  SetRegView 64
FunctionEnd

Function EnsureNeoAresIsClosed
  check_running:
    FindWindow $0 "" "${APP_NAME}"
    StrCmp $0 0 app_closed
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION \
      "${APP_NAME} está abierto. Ciérralo y presiona Reintentar para continuar." \
      IDRETRY check_running IDCANCEL cancel_install
  cancel_install:
    Abort
  app_closed:
FunctionEnd

Section "${APP_NAME}" MainSection
  Call EnsureNeoAresIsClosed
  SetShellVarContext current

  RMDir /r "$INSTDIR"
  SetOutPath "$INSTDIR"
  File /r "${PACKAGE_DIR}\*"

  WriteUninstaller "$INSTDIR\Desinstalar ${APP_NAME}.exe"
  WriteRegStr HKCU "Software\${APP_ID}" "InstallLocation" "$INSTDIR"

  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\Desinstalar ${APP_NAME}.lnk" "$INSTDIR\Desinstalar ${APP_NAME}.exe"
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0

  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "${APP_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" "$\"$INSTDIR\Desinstalar ${APP_NAME}.exe$\""
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" "$\"$INSTDIR\Desinstalar ${APP_NAME}.exe$\" /S"
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
      "${APP_NAME} está abierto. Ciérralo y presiona Reintentar para continuar." \
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
