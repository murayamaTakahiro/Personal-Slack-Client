#!/bin/bash

echo "Testing DM user display fix..."
echo ""

# Build the Rust backend
echo "Building backend..."
cargo build --release 2>&1 | tail -5

# Test with specific user IDs from the screenshot
USER_IDS=("U01NH3ZB2TU" "U023E9KE6RX" "U04F9M6JX2M")

echo ""
echo "Testing user fetch for problematic IDs:"

for USER_ID in "${USER_IDS[@]}"; do
    echo ""
    echo "Testing $USER_ID..."

    # You can use this to call your debug command through Tauri if it's running
    # Or test the API directly
done

echo ""
echo "To fully test:"
echo "1. Run the app: npm run tauri dev"
echo "2. Go to the channel list"
echo "3. Enable 'Show DMs' toggle"
echo "4. Check if DM users now show names instead of IDs"
echo ""
echo "Expected: DMs should show as '@Username' or '@[Bot] BotName' or '@[Deleted] Username'"
echo "Instead of: '@U01NH3ZB2TU', etc."