#!/bin/bash

# Check specific user info from Slack API
# Usage: ./check-user.sh YOUR_SLACK_TOKEN

TOKEN="${1:-YOUR_SLACK_TOKEN}"
USER_ID="U04F9M6JX2M"

if [ "$TOKEN" == "YOUR_SLACK_TOKEN" ]; then
    echo "Please provide your Slack token as the first argument"
    echo "Usage: ./check-user.sh xoxp-..."
    exit 1
fi

echo "Fetching info for user: $USER_ID"
echo "================================"

# Get user info
echo "1. User info (users.info):"
curl -s -X GET "https://slack.com/api/users.info?user=$USER_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.'

echo ""
echo "2. User profile (users.profile.get):"
curl -s -X GET "https://slack.com/api/users.profile.get?user=$USER_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.'

echo ""
echo "3. All users (searching for murayama and yandt89):"
curl -s -X GET "https://slack.com/api/users.list" \
  -H "Authorization: Bearer $TOKEN" | jq '.members[] | select(.name == "murayama" or .name == "yandt89" or .id == "U04F9M6JX2M" or (.real_name // "" | contains("murayama")) or (.profile.display_name // "" | contains("murayama")))'

echo ""
echo "4. DM channels for this user:"
curl -s -X GET "https://slack.com/api/conversations.list?types=im&limit=100" \
  -H "Authorization: Bearer $TOKEN" | jq '.channels[] | select(.user == "U04F9M6JX2M")'