; FFmpeg is linked at load time — DLLs must sit next to viko.exe ($INSTDIR).
; Fallback: copy from resources\ffmpeg\windows if an older bundle layout is used.

!macro NSIS_HOOK_POSTINSTALL
  IfFileExists "$INSTDIR\resources\ffmpeg\windows\*.dll" 0 +2
    CopyFiles /SILENT "$INSTDIR\resources\ffmpeg\windows\*.dll" "$INSTDIR\"
!macroend
