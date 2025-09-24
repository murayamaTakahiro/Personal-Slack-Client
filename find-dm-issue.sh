#!/bin/bash

# Script to help find the DM issue between murayama and yandt89

echo "Finding DM mapping issue..."
echo "========================="

# Look for any occurrence of yandt89 in the codebase
echo -e "\n1. Searching for 'yandt89' in source code:"
grep -r "yandt89" /mnt/c/Users/tmura/tools/personal-slack-client/personal-slack-client/src-tauri --include="*.rs" 2>/dev/null || echo "Not found in source code"

# Look for any hardcoded user mappings
echo -e "\n2. Searching for hardcoded user mappings:"
grep -r "U04F9M6JX2M" /mnt/c/Users/tmura/tools/personal-slack-client/personal-slack-client/src-tauri --include="*.rs" | head -5

# Check logs for the issue
echo -e "\n3. Recent log entries with yandt89:"
grep "yandt89" ~/.config/personal-slack-client/logs/*.log 2>/dev/null | tail -10 || echo "No logs found"

echo -e "\n4. Recent log entries with murayama:"
grep "murayama" ~/.config/personal-slack-client/logs/*.log 2>/dev/null | tail -10 || echo "No logs found"

echo -e "\n5. User mapping debug logs:"
grep "\[DEBUG\] User" ~/.config/personal-slack-client/logs/*.log 2>/dev/null | grep -E "(murayama|yandt89|U04F9M6JX2M)" | tail -20 || echo "No debug logs found"

echo -e "\n========================="
echo "To diagnose further:"
echo "1. Run the app with the new debug logging"
echo "2. Navigate to DM channels"
echo "3. Look for the @yandt89 channel that should be @murayama"
echo "4. Check the logs again with this script"