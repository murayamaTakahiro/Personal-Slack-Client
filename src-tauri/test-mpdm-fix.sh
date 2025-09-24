#!/bin/bash

# Test script to verify Group DM (MPIM) name resolution fix

echo "Testing Group DM name resolution with mpdm- prefix..."
echo "This should resolve 'yandt89' to 'murayama'"
echo ""

# Set the auth token
export SLACK_USER_TOKEN=$(cat ~/.config/slack/user_token.txt)

# Test searching in a Group DM with mpdm- prefix
curl -s -X POST http://localhost:3001/search_messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SLACK_USER_TOKEN" \
  -d '{
    "query": "test",
    "channel_ids": ["G07DC5WNQJ5"],
    "limit": 1
  }' | jq '.' > mpdm-test-result.json

echo "Response saved to mpdm-test-result.json"
echo ""
echo "Checking if 'yandt89' was resolved to 'murayama':"
grep -E "(yandt89|murayama)" mpdm-test-result.json || echo "No matches found"

echo ""
echo "Full channel info from response:"
jq '.channels[] | select(.id == "G07DC5WNQJ5") | {id, name}' mpdm-test-result.json 2>/dev/null || echo "Channel not found in response"