#!/bin/bash

# Debug script to test user mapping for U04F9M6JX2M
echo "Testing user ID mapping for U04F9M6JX2M (murayama)..."

# Search for the user ID in logs
echo -e "\n=== Searching for user ID in recent logs ==="
grep -n "U04F9M6JX2M" ~/.config/personal-slack-client/logs/*.log 2>/dev/null | tail -20 || echo "No logs found with this user ID"

# Search for murayama in logs
echo -e "\n=== Searching for 'murayama' in recent logs ==="
grep -n "murayama" ~/.config/personal-slack-client/logs/*.log 2>/dev/null | tail -20 || echo "No logs found with 'murayama'"

# Search for yandt89 in logs
echo -e "\n=== Searching for 'yandt89' in recent logs ==="
grep -n "yandt89" ~/.config/personal-slack-client/logs/*.log 2>/dev/null | tail -20 || echo "No logs found with 'yandt89'"

# Look for user mapping debug logs
echo -e "\n=== User mapping debug logs ==="
grep -n "\[DEBUG\] User mapping:" ~/.config/personal-slack-client/logs/*.log 2>/dev/null | tail -10 || echo "No user mapping debug logs found"

# Look for DM channel mapping logs
echo -e "\n=== DM channel mapping logs ==="
grep -n "\[DEBUG\] DM channel.*mapped to user" ~/.config/personal-slack-client/logs/*.log 2>/dev/null | tail -10 || echo "No DM channel mapping logs found"

echo -e "\n=== Instructions ==="
echo "1. Open the app and go to DM channels"
echo "2. Look for the channel that should be 'murayama' but shows as 'yandt89'"
echo "3. Run a search in that channel"
echo "4. Check the logs again with this script"