#!/bin/bash

# Test script for specific DM channel D0795MU9WBU

echo "Testing DM channel D0795MU9WBU..."

# Get token
if [ -z "$SLACK_TOKEN" ]; then
    echo "Reading token from token.txt..."
    if [ -f "token.txt" ]; then
        SLACK_TOKEN=$(cat token.txt | tr -d '\n\r')
    else
        echo "Error: token.txt not found"
        exit 1
    fi
fi

# Test the conversations.history API
echo ""
echo "1. Testing conversations.history API..."
echo "========================================"

curl -s -X GET "https://slack.com/api/conversations.history" \
  -H "Authorization: Bearer $SLACK_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "channel=D0795MU9WBU" \
  --data-urlencode "limit=3" | jq '{
    ok: .ok,
    error: .error,
    error_detail: .error_detail,
    message_count: (.messages | length),
    first_message_preview: (if .messages[0] then .messages[0].text[0:100] else null end)
  }'

echo ""
echo "2. Testing conversations.info API..."
echo "====================================="

curl -s -X GET "https://slack.com/api/conversations.info" \
  -H "Authorization: Bearer $SLACK_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "channel=D0795MU9WBU" | jq '{
    ok: .ok,
    error: .error,
    channel_type: {
      is_im: .channel.is_im,
      is_mpim: .channel.is_mpim,
      is_ext_shared: .channel.is_ext_shared,
      is_org_shared: .channel.is_org_shared
    },
    user: .channel.user
  }'

echo ""
echo "3. Full raw response (saved to dm-test-output.json)..."
echo "======================================================="

curl -s -X GET "https://slack.com/api/conversations.history" \
  -H "Authorization: Bearer $SLACK_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "channel=D0795MU9WBU" \
  --data-urlencode "limit=1" > dm-test-output.json

echo "Response saved. Checking structure..."
jq 'keys' dm-test-output.json