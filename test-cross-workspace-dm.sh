#!/bin/bash

# Test script for cross-workspace DM issues
# Usage: ./test-cross-workspace-dm.sh <SLACK_USER_TOKEN> [DM_CHANNEL_ID]
#
# Example:
#   ./test-cross-workspace-dm.sh xoxp-xxxxx D0795MU9WBU
#   ./test-cross-workspace-dm.sh xoxp-xxxxx  # uses default channel D0795MU9WBU

# Check if token is provided
if [ $# -lt 1 ]; then
    echo "Error: Slack user token required"
    echo ""
    echo "Usage: ./test-cross-workspace-dm.sh <SLACK_USER_TOKEN> [DM_CHANNEL_ID]"
    echo ""
    echo "Example:"
    echo "  ./test-cross-workspace-dm.sh xoxp-123456789"
    echo "  ./test-cross-workspace-dm.sh xoxp-123456789 D0795MU9WBU"
    echo ""
    echo "Get your token from: https://api.slack.com/apps"
    exit 1
fi

# Set token from first argument
SLACK_USER_TOKEN="$1"

# Set channel ID (use second argument or default)
DM_CHANNEL_ID="${2:-D0795MU9WBU}"

echo "=== Testing Cross-Workspace DM Channel ==="
echo "Target DM Channel: $DM_CHANNEL_ID"
echo ""

echo "Step 1: Test conversations.info to check channel accessibility"
echo "----------------------------------------"
curl -s -H "Authorization: Bearer $SLACK_USER_TOKEN" \
    "https://slack.com/api/conversations.info?channel=$DM_CHANNEL_ID" | jq '.'

echo ""
echo "Step 2: Test conversations.history directly"
echo "----------------------------------------"
response=$(curl -s -H "Authorization: Bearer $SLACK_USER_TOKEN" \
    "https://slack.com/api/conversations.history?channel=$DM_CHANNEL_ID&limit=10")

echo "Response size: $(echo "$response" | wc -c) bytes"
echo "Response preview:"
echo "$response" | jq '.' | head -30

echo ""
echo "Step 3: Check if response contains error"
echo "----------------------------------------"
echo "$response" | jq '.error, .error_detail'

echo ""
echo "Step 4: Check number of messages returned"
echo "----------------------------------------"
echo "$response" | jq '.messages | length'

echo ""
echo "Step 5: Get user info for the DM partner"
echo "----------------------------------------"
# Extract user ID from DM (remove D prefix)
user_id="${DM_CHANNEL_ID:1}"
echo "Checking user: $user_id"

curl -s -H "Authorization: Bearer $SLACK_USER_TOKEN" \
    "https://slack.com/api/users.info?user=$user_id" | jq '.user.name, .user.real_name, .user.team_id, .error'

echo ""
echo "Step 6: Check conversations.members for this DM"
echo "----------------------------------------"
curl -s -H "Authorization: Bearer $SLACK_USER_TOKEN" \
    "https://slack.com/api/conversations.members?channel=$DM_CHANNEL_ID" | jq '.'

echo ""
echo "=== Diagnosis Complete ==="