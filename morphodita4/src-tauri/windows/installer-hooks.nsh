!macro NSIS_HOOK_POSTINSTALL
  ; Read choice from registry (set by custom page or default)
  ReadRegStr $0 HKCU "Software\${PRODUCT_NAME}" "InstallOfflineDicts"
  ${If} $0 != "1"
    RMDir /r "$INSTDIR\models"
  ${EndIf}
!macroend
