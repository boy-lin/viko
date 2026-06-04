# #!/usr/bin/env bash
# set -euo pipefail
# TAURI_SIGNING_PRIVATE_KEY_PASSWORD=llll
# KEY_PATH="${TAURI_KEY_PATH:-/Users/haolin/Developer/luke-simth/keys/tauri_private_1.key}"
# DMG_PATH="${1:-/Users/haolin/Downloads/viko_0.1.0-1_aarch64.dmg}"

# if [[ ! -f "$KEY_PATH" ]]; then
#   echo "Private key file not found: $KEY_PATH" >&2
#   exit 1
# fi

# if [[ ! -f "$DMG_PATH" ]]; then
#   echo "Installer file not found: $DMG_PATH" >&2
#   exit 1
# fi

# export TAURI_PRIVATE_KEY_PATH="$KEY_PATH"

# if [[ -n "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" ]]; then
#   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD
# elif [[ -n "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" ]]; then
#   # Backward-compatible fallback if old env var name is used by CI/local shell.
#   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
# fi

# pnpm tauri signer sign "$DMG_PATH"
