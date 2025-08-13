# Slack Token Setup Guide

## Required Token Type

This application requires a **User Token** (starts with `xoxp-`), NOT a Bot Token (xoxb-).

## Why User Token?

User tokens are required because:
- They can search messages across all channels you have access to
- They can access private channels and DMs you're a member of
- They provide search capabilities that bot tokens don't have

## How to Get Your User Token

### Method 1: From Slack Web App (Recommended)

1. Open Slack in your web browser: https://app.slack.com
2. Open Developer Tools (F12 or right-click → Inspect)
3. Go to the Network tab
4. Type any message in Slack
5. Look for a request to `chat.postMessage` or similar API calls
6. In the request headers, find the `Authorization` header
7. Copy the token value (starts with `xoxp-`)

### Method 2: Legacy Test Token (If Available)

1. Go to https://api.slack.com/legacy/custom-integrations/legacy-tokens
2. Find your workspace
3. Copy the token (if available)

**Note**: Slack has deprecated legacy tokens, so this method may not work for newer workspaces.

## Required Permissions (Scopes)

Your User Token needs these permissions:
- `channels:read` - List public channels
- `channels:history` - Read public channel messages
- `groups:read` - List private channels
- `groups:history` - Read private channel messages
- `im:read` - List direct messages
- `im:history` - Read direct messages
- `mpim:read` - List group DMs
- `mpim:history` - Read group DMs
- `search:read` - Search messages
- `users:read` - Get user information

## Troubleshooting

### "Channel not found" Error

**Possible causes:**
1. **Wrong token type**: Make sure you're using a User Token (`xoxp-`), not a Bot Token (`xoxb-`)
2. **Insufficient permissions**: The token may not have access to private channels
3. **Expired token**: The token may have expired or been revoked

**Solutions:**
1. Verify your token starts with `xoxp-`
2. Try searching in a public channel first
3. Make sure you're a member of the channel you're searching
4. Get a fresh token from the Slack web app

### "Authentication failed" Error

**Possible causes:**
1. Invalid token format
2. Token has been revoked
3. Token is for a different workspace

**Solutions:**
1. Get a new token following Method 1 above
2. Ensure you're using the token for the correct workspace
3. Check that the token hasn't been revoked in your Slack security settings

### "No results found" but you know messages exist

**Possible causes:**
1. Token doesn't have search permissions
2. Messages are in channels the token can't access
3. Search index hasn't updated yet

**Solutions:**
1. Try searching for recent messages first
2. Verify you can see the messages in the Slack app
3. Wait a few minutes for Slack's search index to update

## Security Notes

⚠️ **IMPORTANT**: Your User Token has the same permissions as your Slack account. 

- Never share your token with others
- The token is stored securely in this application
- If you suspect your token has been compromised, revoke it immediately in Slack's security settings
- Consider using a dedicated Slack account for searching if security is a concern

## Alternative: Create a Slack App (Advanced)

If you can't get a User Token, you can create a Slack App with User Token:

1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. Choose your workspace
4. Go to "OAuth & Permissions"
5. Add the required User Token Scopes (listed above)
6. Install the app to your workspace
7. Copy the "User OAuth Token" (starts with `xoxp-`)

This method gives you more control over permissions but requires admin approval in some workspaces.