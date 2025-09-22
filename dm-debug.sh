#!/bin/bash

# Debug Slack DM Search
# Requires jq for JSON parsing

# Configuration
SLACK_TOKEN="${SLACK_TOKEN:-}"  # Set your Slack token
CHANNEL_ID="D04EGFW8PDM"
QUERY="after:2025-08-31"

# Validate inputs
if [ -z "$SLACK_TOKEN" ]; then
    echo "Error: SLACK_TOKEN environment variable must be set"
    exit 1
fi

echo "=== Testing DM Channel Search ==="

# 1. Test basic channel info
echo "--- Channel Info ---"
curl -X GET \
    "https://slack.com/api/conversations.info?channel=$CHANNEL_ID" \
    -H "Authorization: Bearer $SLACK_TOKEN" \
    | jq .

# 2. Test conversations.history
echo -e "\n--- Conversations History ---"
curl -X GET \
    "https://slack.com/api/conversations.history?channel=$CHANNEL_ID&limit=10" \
    -H "Authorization: Bearer $SLACK_TOKEN" \
    | jq .

# 3. Test search.messages
echo -e "\n--- Search Messages ---"
curl -X GET \
    "https://slack.com/api/search.messages?query=in:$CHANNEL_ID $QUERY&count=10" \
    -H "Authorization: Bearer $SLACK_TOKEN" \
    | jq .

# 4. Auth test for permissions
echo -e "\n--- Auth Test ---"
curl -X GET \
    "https://slack.com/api/auth.test" \
    -H "Authorization: Bearer $SLACK_TOKEN" \
    | jq .