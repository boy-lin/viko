#!/bin/bash
# Script to reinstall rustup natively for ARM64 macOS

echo "This script will reinstall rustup natively for ARM64."
echo "Current rustup status:"
rustup show

echo ""
echo "Uninstalling current rustup..."
rustup self uninstall -y

echo ""
echo "Reinstalling rustup natively..."
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

echo ""
echo "Verifying installation..."
source ~/.cargo/env
rustup show

echo ""
echo "Adding required targets..."
rustup target add aarch64-apple-darwin

echo ""
echo "Done! Please restart your IDE/editor for changes to take effect."

