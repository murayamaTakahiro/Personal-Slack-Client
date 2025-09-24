#!/bin/bash

# Test script to check what the Slack API returns for user U04F9M6JX2M
# You need to set your SLACK_TOKEN environment variable first

if [ -z "$SLACK_TOKEN" ]; then
    echo "Please set SLACK_TOKEN environment variable"
    exit 1
fi

echo "Fetching user info for U04F9M6JX2M..."
curl -s -H "Authorization: Bearer $SLACK_TOKEN" \
    "https://slack.com/api/users.info?user=U04F9M6JX2M" | jq '.'

echo -e "\n\nSearching for users with 'murayama' in their profiles..."
curl -s -H "Authorization: Bearer $SLACK_TOKEN" \
    "https://slack.com/api/users.list" | \
    jq '.members[] | select(.name == "murayama" or .real_name == "murayama" or .profile.display_name == "murayama" or .profile.real_name == "murayama") | {id: .id, name: .name, real_name: .real_name, display_name: .profile.display_name, profile_real_name: .profile.real_name}'

echo -e "\n\nSearching for users with 'yandt89' in their profiles..."
curl -s -H "Authorization: Bearer $SLACK_TOKEN" \
    "https://slack.com/api/users.list" | \
    jq '.members[] | select(.name == "yandt89" or .real_name == "yandt89" or .profile.display_name == "yandt89" or .profile.real_name == "yandt89") | {id: .id, name: .name, real_name: .real_name, display_name: .profile.display_name, profile_real_name: .profile.real_name}'