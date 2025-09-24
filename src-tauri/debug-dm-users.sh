#!/bin/bash

# Debug script to identify why some DM users show as IDs instead of names

echo "=== Debugging DM User Display Issue ==="
echo ""

# Get the API token from the config file
TOKEN=$(grep '"token"' ~/.config/personal-slack-client/settings.json 2>/dev/null | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "Error: No token found in settings.json"
    exit 1
fi

echo "Token found (first 10 chars): ${TOKEN:0:10}..."
echo ""

# Call our new debug endpoint
echo "Calling debug_missing_users command..."
echo ""

# Use curl to call the Tauri backend directly (if it's running)
# Or alternatively, we can use the slack API directly

# Test the debug endpoint
curl -X POST http://localhost:1420/debug_missing_users \
     -H "Content-Type: application/json" \
     2>/dev/null || echo "Note: Backend may not be running on localhost:1420"

# Let's check the Slack API directly
echo ""
echo "=== Checking Slack API directly ==="
echo ""

# Get users list (including deleted and bots)
echo "Fetching all users from Slack API..."
USERS_RESPONSE=$(curl -s -X GET "https://slack.com/api/users.list?limit=1000" \
     -H "Authorization: Bearer $TOKEN")

USERS_OK=$(echo "$USERS_RESPONSE" | jq -r '.ok')
if [ "$USERS_OK" != "true" ]; then
    echo "Error fetching users:"
    echo "$USERS_RESPONSE" | jq -r '.error'
    exit 1
fi

TOTAL_USERS=$(echo "$USERS_RESPONSE" | jq '.members | length')
BOT_USERS=$(echo "$USERS_RESPONSE" | jq '.members | map(select(.is_bot == true)) | length')
DELETED_USERS=$(echo "$USERS_RESPONSE" | jq '.members | map(select(.deleted == true)) | length')

echo "Total users: $TOTAL_USERS"
echo "Bot users: $BOT_USERS"
echo "Deleted users: $DELETED_USERS"
echo ""

# Get DM channels
echo "Fetching DM channels..."
DM_RESPONSE=$(curl -s -X GET "https://slack.com/api/conversations.list?types=im,mpim&limit=1000" \
     -H "Authorization: Bearer $TOKEN")

DM_OK=$(echo "$DM_RESPONSE" | jq -r '.ok')
if [ "$DM_OK" != "true" ]; then
    echo "Error fetching DM channels:"
    echo "$DM_RESPONSE" | jq -r '.error'
    exit 1
fi

TOTAL_DMS=$(echo "$DM_RESPONSE" | jq '.channels | map(select(.is_im == true)) | length')
echo "Total DM channels: $TOTAL_DMS"
echo ""

# Check for specific problematic user IDs from the screenshot
PROBLEMATIC_IDS=("U01NH3ZB2TU" "U023E9KE6RX" "U04F9M6JX2M")

echo "=== Checking specific user IDs from screenshot ==="
for USER_ID in "${PROBLEMATIC_IDS[@]}"; do
    echo ""
    echo "Checking user: $USER_ID"

    # Check if user exists in users.list
    USER_INFO=$(echo "$USERS_RESPONSE" | jq -r ".members[] | select(.id == \"$USER_ID\")")

    if [ -z "$USER_INFO" ]; then
        echo "  ❌ NOT found in users.list"

        # Try to fetch individually using users.info
        echo "  Trying users.info API..."
        USER_INFO_RESPONSE=$(curl -s -X GET "https://slack.com/api/users.info?user=$USER_ID" \
             -H "Authorization: Bearer $TOKEN")

        USER_INFO_OK=$(echo "$USER_INFO_RESPONSE" | jq -r '.ok')
        if [ "$USER_INFO_OK" == "true" ]; then
            echo "  ✓ Found via users.info:"
            echo "$USER_INFO_RESPONSE" | jq -r '.user | "    Name: \(.name), Real name: \(.real_name // "N/A"), Bot: \(.is_bot // false), Deleted: \(.deleted // false)"'
        else
            echo "  ❌ Also not found via users.info"
            echo "    Error: $(echo "$USER_INFO_RESPONSE" | jq -r '.error')"
        fi
    else
        echo "  ✓ Found in users.list:"
        echo "$USER_INFO" | jq -r '"    Name: \(.name), Real name: \(.real_name // "N/A"), Bot: \(.is_bot // false), Deleted: \(.deleted // false)"'

        # Check display name
        DISPLAY_NAME=$(echo "$USER_INFO" | jq -r '.profile.display_name // .profile.real_name // .real_name // .name')
        echo "    Display name would be: $DISPLAY_NAME"
    fi

    # Check if they have a DM channel
    DM_CHANNEL=$(echo "$DM_RESPONSE" | jq -r ".channels[] | select(.user == \"$USER_ID\")")
    if [ -n "$DM_CHANNEL" ]; then
        CHANNEL_ID=$(echo "$DM_CHANNEL" | jq -r '.id')
        echo "    Has DM channel: $CHANNEL_ID"
    else
        echo "    No DM channel found"
    fi
done

echo ""
echo "=== Summary ==="
echo "The issue appears to be that these users are either:"
echo "1. Bot users that need special handling"
echo "2. Deleted users that are no longer in the workspace"
echo "3. Users from shared channels or external organizations"
echo "4. Missing from the users.list API response (pagination issue or permissions)"
echo ""
echo "To fix this, the application should:"
echo "1. Include bot and deleted users when fetching the user list"
echo "2. Handle these special cases with appropriate display names"
echo "3. Use users.info as a fallback for missing users"