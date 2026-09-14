; Candidate installer extensions. Tauri's native NSIS template retains the
; directory page, visible progress, uninstaller and finish-page launch action.
; This link exposes the selected install directory without changing installMode.
!define MUI_FINISHPAGE_LINK "インストール先を開く"
!define MUI_FINISHPAGE_LINK_LOCATION "$INSTDIR"

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "SAKU Builder installed to: $INSTDIR"
  DetailPrint "Getting Started is available in the application Help screen."
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Application files will be removed. User workspaces are preserved."
!macroend
