#!/bin/bash

echo "Building and running debug session for DM user mapping issue..."
echo "=========================================================="

# Build the app
echo "Building the application..."
cd /mnt/c/Users/tmura/tools/personal-slack-client/personal-slack-client/src-tauri
cargo build 2>&1 | tail -5

# Instructions
echo ""
echo "Build complete. Now:"
echo "1. Run: npm run tauri dev"
echo "2. Open Developer Tools (F12)"
echo "3. In the console, run:"
echo "   await __TAURI__.invoke('debug_user_info', { userId: 'U04F9M6JX2M' })"
echo "4. Also run:"
echo "   await __TAURI__.invoke('debug_dm_channels', {})"
echo "5. Check the terminal output for [DEBUG] logs"
echo ""
echo "Or load the debug page:"
echo "   Open debug-dm-issue.html in the app"