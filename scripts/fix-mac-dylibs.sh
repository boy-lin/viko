#!/usr/bin/env bash
set -e

if [ "$(uname -s)" != "Darwin" ]; then
    echo "Not on macOS, skipping dylib fix."
    exit 0
fi

# Find the built executable
EXECUTABLES=$(find src-tauri/target -maxdepth 3 -type f -path "*/release/viko" ! -path "*/deps/*" ! -path "*/build/*")

if [ -z "$EXECUTABLES" ]; then
    echo "No viko executable found. Skipping."
    exit 0
fi

for EXE in $EXECUTABLES; do
    echo "Fixing dylibs for executable: $EXE"
    
    ARCH_DIR_NAME="aarch64"
    if [[ "$EXE" == *"x86_64"* ]]; then
        ARCH_DIR_NAME="x86_64"
    elif [[ "$EXE" == *"aarch64"* ]]; then
        ARCH_DIR_NAME="aarch64"
    else
        if [ "$(uname -m)" == "arm64" ]; then
            ARCH_DIR_NAME="aarch64"
        else
            ARCH_DIR_NAME="x86_64"
        fi
    fi

    RESOURCES_DIR="src-tauri/resources/ffmpeg/macos/$ARCH_DIR_NAME"
    mkdir -p "$RESOURCES_DIR"

    # We will use an array of binaries to process
    # Bash 3 compatibility: use indices
    BINARIES_TO_PROCESS=("$EXE")
    PROCESSED_LIST="|"
    
    i=0
    while [ $i -lt ${#BINARIES_TO_PROCESS[@]} ]; do
        CURRENT_BIN="${BINARIES_TO_PROCESS[$i]}"
        # Ensure it has write permissions
        chmod +w "$CURRENT_BIN" 2>/dev/null || true
        
        # Get all non-system dependencies
        DEPS=$(otool -L "$CURRENT_BIN" | grep -v "$CURRENT_BIN:" | grep -E '/opt/homebrew/|/usr/local/|@rpath/|@loader_path/' | awk '{print $1}')
        
        for DEP in $DEPS; do
            DEP_BASENAME=$(basename "$DEP")
            TARGET_DYLIB="$RESOURCES_DIR/$DEP_BASENAME"
            
            ACTUAL_DEP_PATH="$DEP"
            # Resolve actual path if it starts with @rpath or @loader_path
            if [[ "$DEP" == "@rpath/"* ]] || [[ "$DEP" == "@loader_path/"* ]]; then
                if [ -f "/opt/homebrew/lib/$DEP_BASENAME" ]; then
                    ACTUAL_DEP_PATH="/opt/homebrew/lib/$DEP_BASENAME"
                elif [ -f "/usr/local/lib/$DEP_BASENAME" ]; then
                    ACTUAL_DEP_PATH="/usr/local/lib/$DEP_BASENAME"
                else
                    echo "Warning: Could not resolve relative dependency $DEP"
                    continue
                fi
            fi
            
            # Change the reference in the current binary
            # We must pass the EXACT original string ($DEP) that otool found
            install_name_tool -change "$DEP" "@executable_path/../Resources/resources/ffmpeg/macos/$ARCH_DIR_NAME/$DEP_BASENAME" "$CURRENT_BIN"
            
            # Delete LC_RPATH from the binary if it relies on nested structures like ../lib
            rpaths=$(otool -l "$CURRENT_BIN" | grep -A 2 LC_RPATH | grep path | awk '{print $2}')
            for rp in $rpaths; do
                if echo "$rp" | grep -q "loader_path"; then
                    install_name_tool -delete_rpath "$rp" "$CURRENT_BIN" 2>/dev/null || true
                fi
            done
            
            # If we haven't processed this dependency yet, copy and queue it
            if [[ "$PROCESSED_LIST" != *"|$DEP_BASENAME|"* ]]; then
                if [ ! -f "$TARGET_DYLIB" ]; then
                    echo "Copying missing dependency: $ACTUAL_DEP_PATH"
                    cp "$ACTUAL_DEP_PATH" "$TARGET_DYLIB"
                    chmod +w "$TARGET_DYLIB"
                    
                    # Update its ID
                    install_name_tool -id "@executable_path/../Resources/resources/ffmpeg/macos/$ARCH_DIR_NAME/$DEP_BASENAME" "$TARGET_DYLIB"
                fi
                BINARIES_TO_PROCESS+=("$TARGET_DYLIB")
                PROCESSED_LIST="${PROCESSED_LIST}${DEP_BASENAME}|"
            fi
        done
        
        # Codesign the binary with ad-hoc signature to prevent macOS killing it
        codesign --force --sign - "$CURRENT_BIN"
        
        i=$((i+1))
    done
done

echo "macOS dylib fix complete!"
