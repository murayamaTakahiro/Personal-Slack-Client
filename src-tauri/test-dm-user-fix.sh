#!/bin/bash

# Test script to verify that DM users are properly resolved
# This script will check if users that were showing as @U... IDs are now showing with proper names

set -e

TOKEN=$(cat ~/.slack_token 2>/dev/null || echo "")
if [ -z "$TOKEN" ]; then
    echo "Error: No Slack token found in ~/.slack_token"
    exit 1
fi

echo "===== Testing DM User Resolution Fix ====="
echo "This will check if problematic users are now properly resolved"
echo ""

# API endpoint for get_user_channels
API_ENDPOINT="http://localhost:8080/api"

echo "1. Starting Tauri development server in background..."
cd /mnt/c/Users/tmura/tools/personal-slack-client/personal-slack-client/src-tauri
cargo tauri dev &
TAURI_PID=$!

# Wait for server to start
echo "   Waiting for server to start..."
sleep 10

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Cleaning up..."
    kill $TAURI_PID 2>/dev/null || true
    exit
}
trap cleanup EXIT INT TERM

echo ""
echo "2. Testing connection..."
curl -s -X POST "$API_ENDPOINT/test_connection" \
    -H "Content-Type: application/json" \
    -d "{\"token\": \"$TOKEN\"}" | jq '.ok' || {
    echo "Failed to connect to Slack"
    exit 1
}

echo ""
echo "3. Fetching DM channels (with debug output enabled)..."
echo "   Looking for these problematic users:"
echo "   - @U2R5VHFND"
echo "   - @U2R5VKH1P"
echo "   - @U2UAC7Q3S"
echo "   - @U6FTNV0CE"
echo "   - @UBZ931BR8"
echo "   - @UCK5KGMME"
echo "   - @UDUJSB4SJ"
echo ""

# Fetch channels including DMs
RESULT=$(curl -s -X POST "$API_ENDPOINT/get_user_channels" \
    -H "Content-Type: application/json" \
    -d '{"include_dms": true}' 2>/dev/null)

if [ -z "$RESULT" ]; then
    echo "Error: Failed to fetch channels"
    exit 1
fi

echo "4. Analyzing DM channels..."
echo ""

# Check for channels that still show user IDs
PROBLEMATIC_CHANNELS=$(echo "$RESULT" | jq -r '.[] | select(.[1] | test("^@U[A-Z0-9]{9}$")) | .[1]' 2>/dev/null | sort -u)

if [ -z "$PROBLEMATIC_CHANNELS" ]; then
    echo "✅ SUCCESS: No DM channels showing raw user IDs!"
    echo ""
    echo "Sample of resolved DM channels:"
    echo "$RESULT" | jq -r '.[] | select(.[1] | startswith("@")) | .[1]' 2>/dev/null | head -10
else
    echo "❌ ISSUE: Found DM channels still showing user IDs:"
    echo "$PROBLEMATIC_CHANNELS"
    echo ""
    echo "Total problematic channels: $(echo "$PROBLEMATIC_CHANNELS" | wc -l)"
fi

echo ""
echo "5. Checking server logs for debug output..."
echo "   (Look for '[DEBUG]' messages about user resolution)"
echo ""

# Show recent debug logs
tail -50 ~/.config/personal-slack-client/logs/*.log 2>/dev/null | grep -E "\[DEBUG\].*[Uu]ser.*not.*map|individual fetch|Problem user" || echo "No relevant debug logs found"

echo ""
echo "===== Test Complete ====="