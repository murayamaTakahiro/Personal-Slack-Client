#!/bin/bash

# Test script to debug Group DM name resolution issue

echo "Testing Group DM name resolution..."
echo "=================================="
echo ""

# First, get the users list to see what's in the API response
echo "1. Getting users list to check U04F9M6JX2M (yandt89/murayama)..."
curl -s -X GET "https://slack.com/api/users.info?user=U04F9M6JX2M" \
  -H "Authorization: Bearer $SLACK_TOKEN" | jq '.'

echo ""
echo "2. Getting all DM channels to see Group DM names..."
curl -s -X GET "https://slack.com/api/conversations.list?types=mpim&limit=100" \
  -H "Authorization: Bearer $SLACK_TOKEN" | jq '.channels[] | select(.name | contains("yandt89") or contains("murayama")) | {id: .id, name: .name, name_normalized: .name_normalized}'

echo ""
echo "3. Getting users.list to check how API returns user info..."
curl -s -X GET "https://slack.com/api/users.list" \
  -H "Authorization: Bearer $SLACK_TOKEN" | jq '.members[] | select(.id == "U04F9M6JX2M") | {id: .id, name: .name, real_name: .real_name, profile: .profile}'