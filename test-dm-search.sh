#!/bin/bash

# Test script for Group DM search functionality

echo "Testing Group DM search functionality..."
echo "========================================="

# Build the Rust backend
echo "Building Rust backend..."
cargo build --manifest-path=src-tauri/Cargo.toml

# Check for compilation errors
if [ $? -ne 0 ]; then
    echo "❌ Rust compilation failed"
    exit 1
fi

echo "✅ Rust compilation successful"

# Run the application in development mode
echo "Starting application in development mode..."
echo "Instructions for testing:"
echo "1. Open the application"
echo "2. Enable DM channels in Settings > Experimental Features"
echo "3. Reload channels (Ctrl+R)"
echo "4. Select a Group DM channel from the channel selector"
echo "5. Perform a search"
echo "6. Verify that:"
echo "   - Group DM names show actual user names instead of IDs"
echo "   - Search uses the channel ID (G...) not the display name"
echo "   - Messages are retrieved correctly"

npm run tauri dev