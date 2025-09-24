#!/bin/bash

# Test script to verify Group DM name resolution fix
# This tests the specific issue where yandt89 should be resolved to murayama

echo "Testing Group DM name resolution fix..."
echo "======================================="
echo ""

# First, get the Slack token from the configuration
TOKEN=$(cat ~/.config/com.tauri.personal-slack-client/settings.dat 2>/dev/null | grep '"slack_token"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "Error: No Slack token found in settings."
    echo "Please configure your Slack token in the application first."
    exit 1
fi

echo "✓ Found Slack token"
echo ""

# Test 1: Fetch all users to verify U04F9M6JX2M mapping
echo "Test 1: Fetching user info for U04F9M6JX2M..."
echo "----------------------------------------------"
USER_INFO=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "https://slack.com/api/users.info?user=U04F9M6JX2M" | \
    jq -r '.user | {id: .id, name: .name, real_name: .real_name, display_name: .profile.display_name}')

if [ $? -eq 0 ]; then
    echo "$USER_INFO" | jq .
    echo ""

    # Extract the values
    USERNAME=$(echo "$USER_INFO" | jq -r '.name')
    DISPLAY_NAME=$(echo "$USER_INFO" | jq -r '.display_name')

    if [ "$USERNAME" = "yandt89" ] && [ "$DISPLAY_NAME" = "murayama" ]; then
        echo "✓ User mapping confirmed: yandt89 -> murayama"
    else
        echo "⚠ Unexpected user mapping:"
        echo "  Username: $USERNAME"
        echo "  Display name: $DISPLAY_NAME"
    fi
else
    echo "✗ Failed to fetch user info"
fi

echo ""

# Test 2: Fetch Group DM channels and check their names
echo "Test 2: Fetching Group DM channels..."
echo "-------------------------------------"
CHANNELS=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "https://slack.com/api/conversations.list?types=mpim&limit=100" | \
    jq -r '.channels[] | {id: .id, name: .name, is_mpim: .is_mpim}')

if [ $? -eq 0 ]; then
    echo "Group DM channels found:"
    echo "$CHANNELS" | jq -s '.' | jq -c '.[]' | while read channel; do
        ID=$(echo "$channel" | jq -r '.id')
        NAME=$(echo "$channel" | jq -r '.name')

        echo "  - $ID: $NAME"

        # Check if the name contains yandt89
        if echo "$NAME" | grep -q "yandt89"; then
            echo "    ⚠ WARNING: Channel name still contains 'yandt89' instead of 'murayama'"
            echo "    This needs to be resolved in the application's get_user_channels function"
        fi
    done
else
    echo "✗ Failed to fetch Group DM channels"
fi

echo ""
echo "Test complete!"
echo ""
echo "Expected behavior after fix:"
echo "- Group DM names should show 'murayama' instead of 'yandt89'"
echo "- The fix handles both mpdm-userid--userid format and username-username format"