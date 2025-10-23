# Emoji Reaction Configuration Guide

## Configuration Method

Emoji reaction settings are managed in the `public/config.json` file.

### 1. Creating the Configuration File

```bash
# Copy the sample file
cp public/config.example.json public/config.json
```

### 2. Editing the Configuration File

Edit `public/config.json` to configure your preferred emojis:

```json
{
  "reactionMappings": [
    {
      "shortcut": 1,           // Number key
      "emoji": "thumbsup",     // Slack emoji name (without colons)
      "display": "👍"          // Display emoji
    },
    { "shortcut": 2, "emoji": "arigataya", "display": "🙏" },
    { "shortcut": 3, "emoji": "smile", "display": "😄" }
    // ... You can configure up to 9 reactions
  ]
}
```

### 3. Applying the Configuration

- **Development Environment**: The configuration file is automatically reloaded every 5 seconds after saving
- **Production Environment**: Restart the application to apply the configuration

## How to Find Slack Emoji Names

1. Hover your mouse over a message in Slack
2. Click the emoji reaction button (😊)
3. Hover over the emoji you want to use
4. The displayed `:emoji_name:` without the `:` symbols is the emoji name

Examples:
- `:thumbsup:` → `"emoji": "thumbsup"`
- `:+1:` → `"emoji": "+1"`
- `:white_check_mark:` → `"emoji": "white_check_mark"`

## Custom Emojis

You can also use custom emojis from your Slack workspace:

```json
{
  "shortcut": 2,
  "emoji": "arigataya",      // Custom emoji name
  "display": "🙏"             // Suitable alternative display
}
```

## Troubleshooting

### If Configuration is Not Applied

1. Open the browser console (F12)
2. Check logs with `[ConfigService]`
3. Verify that `config.json` is in valid JSON format (check with [JSONLint](https://jsonlint.com/))

### If Errors Occur

- Check for JSON syntax errors (missing commas, missing quotes, etc.)
- Verify there's no comma after the last element

## Configuration Examples

### Settings for Japanese Workspaces

```json
{
  "reactionMappings": [
    { "shortcut": 1, "emoji": "ok", "display": "👌" },
    { "shortcut": 2, "emoji": "arigatou", "display": "🙏" },
    { "shortcut": 3, "emoji": "otukare", "display": "💪" },
    { "shortcut": 4, "emoji": "iine", "display": "👍" },
    { "shortcut": 5, "emoji": "eyes", "display": "👀" },
    { "shortcut": 6, "emoji": "kanryou", "display": "✅" },
    { "shortcut": 7, "emoji": "onegai", "display": "🙇" },
    { "shortcut": 8, "emoji": "thinking_face", "display": "🤔" },
    { "shortcut": 9, "emoji": "sweat", "display": "😅" }
  ]
}
```

### Settings for Development Teams

```json
{
  "reactionMappings": [
    { "shortcut": 1, "emoji": "shipit", "display": "🚢" },
    { "shortcut": 2, "emoji": "lgtm", "display": "✅" },
    { "shortcut": 3, "emoji": "bug", "display": "🐛" },
    { "shortcut": 4, "emoji": "fire", "display": "🔥" },
    { "shortcut": 5, "emoji": "eyes", "display": "👀" },
    { "shortcut": 6, "emoji": "rocket", "display": "🚀" },
    { "shortcut": 7, "emoji": "question", "display": "❓" },
    { "shortcut": 8, "emoji": "thinking_face", "display": "🤔" },
    { "shortcut": 9, "emoji": "x", "display": "❌" }
  ]
}
```
