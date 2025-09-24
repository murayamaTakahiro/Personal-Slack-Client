#!/bin/bash

# Debug script for cross-workspace DM issue
# This script tests the conversations.history API directly for a DM channel

echo "========================================="
echo "Cross-Workspace DM Debug Script"
echo "========================================="

# Get the token from environment or prompt
if [ -z "$SLACK_TOKEN" ]; then
    echo "Please enter your Slack token (or set SLACK_TOKEN environment variable):"
    read -s SLACK_TOKEN
fi

# The problematic DM channel ID from the logs
CHANNEL_ID="D0795MU9WBU"

echo ""
echo "Testing DM channel: $CHANNEL_ID"
echo ""

# Test 1: Basic conversations.history call
echo "Test 1: Basic conversations.history API call"
echo "----------------------------------------"
RESPONSE=$(curl -s -X GET "https://slack.com/api/conversations.history" \
  -H "Authorization: Bearer $SLACK_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "channel=$CHANNEL_ID" \
  --data-urlencode "limit=5")

# Check response size
RESPONSE_SIZE=${#RESPONSE}
echo "Response size: $RESPONSE_SIZE bytes"

# Extract and display the ok status
OK_STATUS=$(echo "$RESPONSE" | jq -r '.ok')
echo "API Response OK: $OK_STATUS"

# Check for errors
ERROR=$(echo "$RESPONSE" | jq -r '.error // "none"')
if [ "$ERROR" != "none" ]; then
    echo "ERROR: $ERROR"
    ERROR_DETAIL=$(echo "$RESPONSE" | jq -r '.error_detail // "no details"')
    echo "Error Details: $ERROR_DETAIL"

    # Check for specific error types
    if [[ "$ERROR" == *"not_in_channel"* ]]; then
        echo ""
        echo "DIAGNOSIS: User is not a member of this DM channel"
        echo "This typically happens with:"
        echo "1. Cross-workspace DMs (Slack Connect)"
        echo "2. DMs with users who left the workspace"
        echo "3. DMs from shared channels"
    elif [[ "$ERROR" == *"channel_not_found"* ]]; then
        echo ""
        echo "DIAGNOSIS: Channel not found"
        echo "The channel ID might be from a different workspace"
    fi
else
    # Count messages
    MESSAGE_COUNT=$(echo "$RESPONSE" | jq '.messages | length')
    echo "Messages retrieved: $MESSAGE_COUNT"

    # Show first message preview if available
    if [ "$MESSAGE_COUNT" -gt 0 ]; then
        echo ""
        echo "First message preview:"
        echo "$RESPONSE" | jq -r '.messages[0] | "  User: \(.user // "unknown"), Text: \(.text[0:100])"'
    fi
fi

echo ""
echo "Test 2: Check conversations.info for the channel"
echo "----------------------------------------"
INFO_RESPONSE=$(curl -s -X GET "https://slack.com/api/conversations.info" \
  -H "Authorization: Bearer $SLACK_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "channel=$CHANNEL_ID")

INFO_OK=$(echo "$INFO_RESPONSE" | jq -r '.ok')
echo "conversations.info OK: $INFO_OK"

if [ "$INFO_OK" == "true" ]; then
    IS_IM=$(echo "$INFO_RESPONSE" | jq -r '.channel.is_im // false')
    IS_MPIM=$(echo "$INFO_RESPONSE" | jq -r '.channel.is_mpim // false')
    IS_EXTERNAL=$(echo "$INFO_RESPONSE" | jq -r '.channel.is_ext_shared // false')
    IS_ORG_SHARED=$(echo "$INFO_RESPONSE" | jq -r '.channel.is_org_shared // false')
    USER=$(echo "$INFO_RESPONSE" | jq -r '.channel.user // "none"')

    echo "Channel type:"
    echo "  is_im: $IS_IM"
    echo "  is_mpim: $IS_MPIM"
    echo "  is_ext_shared: $IS_EXTERNAL (External/Slack Connect)"
    echo "  is_org_shared: $IS_ORG_SHARED (Org-wide shared)"
    echo "  user: $USER"

    if [ "$IS_EXTERNAL" == "true" ] || [ "$IS_ORG_SHARED" == "true" ]; then
        echo ""
        echo "⚠️  This is a shared/external channel!"
        echo "These channels may require additional permissions or handling."
    fi
else
    INFO_ERROR=$(echo "$INFO_RESPONSE" | jq -r '.error // "none"')
    echo "Error: $INFO_ERROR"
fi

echo ""
echo "Test 3: Try to get user info for the DM partner"
echo "----------------------------------------"
if [ "$USER" != "none" ] && [ "$USER" != "null" ]; then
    USER_RESPONSE=$(curl -s -X GET "https://slack.com/api/users.info" \
      -H "Authorization: Bearer $SLACK_TOKEN" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      --data-urlencode "user=$USER")

    USER_OK=$(echo "$USER_RESPONSE" | jq -r '.ok')
    echo "users.info OK: $USER_OK"

    if [ "$USER_OK" == "true" ]; then
        USER_NAME=$(echo "$USER_RESPONSE" | jq -r '.user.name // "unknown"')
        REAL_NAME=$(echo "$USER_RESPONSE" | jq -r '.user.real_name // "unknown"')
        IS_BOT=$(echo "$USER_RESPONSE" | jq -r '.user.is_bot // false')
        IS_RESTRICTED=$(echo "$USER_RESPONSE" | jq -r '.user.is_restricted // false')
        IS_ULTRA_RESTRICTED=$(echo "$USER_RESPONSE" | jq -r '.user.is_ultra_restricted // false')
        TEAM_ID=$(echo "$USER_RESPONSE" | jq -r '.user.team_id // "unknown"')

        echo "User details:"
        echo "  Username: $USER_NAME"
        echo "  Real name: $REAL_NAME"
        echo "  Team ID: $TEAM_ID"
        echo "  is_bot: $IS_BOT"
        echo "  is_restricted: $IS_RESTRICTED"
        echo "  is_ultra_restricted: $IS_ULTRA_RESTRICTED"

        # Check if user is from a different workspace
        if [ "$IS_RESTRICTED" == "true" ] || [ "$IS_ULTRA_RESTRICTED" == "true" ]; then
            echo ""
            echo "⚠️  This user has restricted access!"
            echo "They might be a guest or from an external organization."
        fi
    else
        USER_ERROR=$(echo "$USER_RESPONSE" | jq -r '.error // "none"')
        echo "Error getting user info: $USER_ERROR"

        if [[ "$USER_ERROR" == *"user_not_found"* ]]; then
            echo "User is not in this workspace (likely external/Slack Connect user)"
        fi
    fi
fi

echo ""
echo "========================================="
echo "Summary:"
echo "========================================="
if [ "$ERROR" != "none" ]; then
    echo "❌ Cannot access DM channel $CHANNEL_ID"
    echo "   Error: $ERROR"

    if [[ "$ERROR" == *"not_in_channel"* ]] || [[ "$ERROR" == *"channel_not_found"* ]]; then
        echo ""
        echo "Possible solutions:"
        echo "1. This might be a Slack Connect DM that requires special handling"
        echo "2. The app should gracefully handle these errors"
        echo "3. Consider showing 'External DM - Access Limited' in the UI"
    fi
else
    echo "✅ DM channel $CHANNEL_ID is accessible"
    echo "   Messages found: $MESSAGE_COUNT"
fi

echo ""
echo "Raw API response saved to: /tmp/dm-debug-response.json"
echo "$RESPONSE" | jq '.' > /tmp/dm-debug-response.json 2>/dev/null || echo "$RESPONSE" > /tmp/dm-debug-response.json