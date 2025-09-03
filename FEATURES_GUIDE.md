# Personal Slack Client - Complete Features Guide

## Table of Contents
- [Core Features](#core-features)
- [Emoji Settings](#emoji-settings)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Realtime Mode](#realtime-mode)
- [Zoom Controls](#zoom-controls)
- [Workspace Management](#workspace-management)
- [Advanced Features](#advanced-features)

## Core Features

### Enhanced Search
- **No 10-item limit**: Search returns all matching messages, not just the first 10
- **Advanced Filters**: Filter by channel, user, date range
- **Multi-channel Search**: Search across multiple channels simultaneously
- **Thread Viewer**: View complete thread conversations
- **URL Parsing**: Paste a Slack URL to instantly view the thread

### Message Navigation
- **Keyboard Navigation**: Use `j`/`k` or arrow keys to navigate through messages
- **Jump to First/Last**: Press `h` to jump to first message, `e` to jump to last
- **Focus Management**: Use `Ctrl+1` for results panel, `Ctrl+2` for thread panel

## Emoji Settings

### Quick Reaction System
The application provides a customizable quick reaction system with number keys (1-9).

#### Features:
- **Number Key Shortcuts**: Press 1-9 to quickly add emoji reactions
- **Custom Emoji Support**: Supports both Unicode and custom workspace emojis
- **Visual Emoji Picker**: Interactive emoji selection interface
- **Advanced Search**: Fuzzy search with Japanese emoji support
- **Auto-Fix Function**: Automatically finds and fixes missing emojis

#### Configuration:
Settings are managed in `src/lib/services/reactionService.ts` in the `DEFAULT_REACTION_MAPPINGS` array.

Example configuration:
```typescript
export const DEFAULT_REACTION_MAPPINGS: ReactionMapping[] = [
  { shortcut: 1, emoji: 'thumbsup', display: '👍' },
  { shortcut: 2, emoji: 'heart', display: '❤️' },
  { shortcut: 3, emoji: 'smile', display: '😄' }
  // ... up to 9
];
```

#### Emoji Picker Navigation:
- **Tab**: Switch between sections (Search → Popular → Custom)
- **Shift+Tab**: Navigate backwards through sections
- **Arrow Keys** or **HJKL**: Navigate within emoji grid
- **Home/End**: Jump to first/last emoji in section
- **PageUp/PageDown**: Move 3 rows at a time
- **Escape**: Close emoji picker

#### Japanese Workspace Support:
The system automatically detects and displays Japanese custom emojis like:
- `arigataya` (ありがたや)
- `kakuninshimasu` (確認します)
- `sasuga` (さすが)
- `ohayougozaimasu` (おはようございます)

## Keyboard Shortcuts

### Customizable Shortcuts
All keyboard shortcuts can be customized in the Settings panel.

#### Default Shortcuts:

**Search & Navigation:**
- `Enter`: Execute search
- `Ctrl+Shift+F`: Toggle advanced search
- `Ctrl+K`: Focus search bar
- `Ctrl+N`: New search (refresh)
- `Escape`: Clear search

**Message Navigation:**
- `j` / `↓`: Next message
- `k` / `↑`: Previous message
- `h`: Jump to first message
- `e`: Jump to last message
- `Enter`: Open selected message

**Panel Focus:**
- `Ctrl+1`: Focus results panel
- `Ctrl+2`: Focus thread panel
- `Ctrl+U`: Focus URL input

**Channel Management:**
- `Ctrl+L`: Toggle channel selector / Live mode
- `Ctrl+M`: Toggle multi-select mode
- `Ctrl+R`: Select recent channels
- `Ctrl+Shift+A`: Apply selected channels

**Message Actions:**
- `p`: Post message to channel
- `t`: Reply in thread
- `r`: Open reaction picker
- `1-9`: Quick reactions
- `Alt+Enter`: Open URLs from message

**UI Controls:**
- `Ctrl+,`: Toggle settings
- `?`: Toggle keyboard help
- `Ctrl+=`: Zoom in
- `Ctrl+-`: Zoom out
- `Ctrl+0`: Reset zoom

### Customization:
1. Open Settings (Ctrl+,)
2. Navigate to "Keyboard Shortcuts"
3. Click "Edit" next to any shortcut
4. Press your desired key combination
5. Changes are saved automatically

## Realtime Mode

### Multi-Channel Monitoring
Monitor multiple channels in real-time with automatic updates.

#### Settings:
- **Update Interval**: Choose from 15s, 30s, 1m, 2m, or 5m
- **Auto-scroll**: Automatically scroll to new messages
- **Desktop Notifications**: Get notified when new messages arrive

#### How to Use:
1. Press `Ctrl+L` to enable channel selector/live mode
2. Select channels using `Ctrl+M` for multi-select
3. Configure update interval in Settings
4. Enable notifications if desired

#### Features:
- **Live Updates**: Messages update automatically at your chosen interval
- **Multi-Channel Support**: Monitor multiple channels simultaneously
- **Smart Scrolling**: Auto-scroll only when at the top of the message list
- **Notification Control**: Choose when to receive desktop notifications

## Zoom Controls

### Interface Scaling
Adjust the application's interface size for better readability.

#### Features:
- **Zoom Range**: 50% to 200%
- **Step Size**: 10% increments
- **Persistent Settings**: Zoom level is saved across sessions
- **Font-based Scaling**: Scales text and UI elements proportionally

#### Controls:
- `Ctrl+=`: Zoom in (increase by 10%)
- `Ctrl+-`: Zoom out (decrease by 10%)
- `Ctrl+0`: Reset to 100%

#### Technical Details:
- Zoom settings stored in persistent storage
- Applied via CSS root font-size scaling
- Affects all UI elements proportionally
- No viewport scaling (prevents layout issues)

## Workspace Management

### Multiple Workspace Support
Manage and switch between multiple Slack workspaces seamlessly.

#### Features:
- **Quick Switching**: Switch between workspaces from the dropdown
- **Color Coding**: Assign colors to workspaces for visual identification
- **Secure Token Storage**: Tokens are stored securely using Tauri's store
- **Last Used Tracking**: Workspaces are sorted by most recently used

#### Adding a Workspace:
1. Click on the workspace dropdown (top of sidebar)
2. Click "Add Workspace"
3. Enter:
   - Workspace name
   - Slack domain (e.g., `myteam`)
   - User token (starts with `xoxp-`)
   - Choose a color
4. Click "Add Workspace"

#### Switching Workspaces:
- Click the workspace dropdown
- Select the desired workspace
- The app will reload with the new workspace context

#### Managing Workspaces:
- **Edit**: Click edit icon next to workspace name
- **Delete**: Available in edit mode
- **Reorder**: Automatically sorted by last used

## Advanced Features

### Emoji Service Features
- **Automatic Caching**: Emojis are cached for 24 hours
- **Alias Resolution**: Automatically resolves emoji aliases
- **Fuzzy Search**: Find emojis with partial matches
- **Japanese Support**: Special support for Japanese custom emojis
- **Debug Tools**: Refresh button and status display in settings

### Performance Optimizations
- **Virtual Scrolling**: Large message lists are virtualized
- **Lazy Loading**: Messages load on-demand
- **Efficient Caching**: Smart caching reduces API calls
- **Debounced Search**: Prevents excessive API calls while typing

### Security Features
- **Secure Token Storage**: Tokens never exposed in UI
- **Masked Display**: Tokens shown as `xoxp-****` in settings
- **Workspace Isolation**: Each workspace has isolated storage
- **No Token Logging**: Tokens excluded from all debug logs

## Troubleshooting

### Common Issues

#### Emojis Not Displaying
1. Click "Refresh Emojis" in Emoji Settings
2. Check emoji counts (should show custom + standard counts)
3. Use "Auto-Fix" button to repair missing emojis
4. Verify token has `emoji:read` permission

#### Keyboard Shortcuts Not Working
1. Check for conflicts with browser/OS shortcuts
2. Reset to defaults if needed
3. Some shortcuts may not work in certain contexts (e.g., when input is focused)

#### Zoom Issues
1. Reset zoom with `Ctrl+0`
2. Check if zoom level is within 50-200% range
3. Restart app if display issues persist

#### Workspace Switching Problems
1. Verify token is valid for the workspace
2. Check token permissions
3. Try removing and re-adding the workspace

## Best Practices

### Emoji Configuration
- Keep frequently used emojis in slots 1-3
- Use memorable patterns (e.g., 1=👍, 2=❤️, 3=😄)
- Test custom emojis after workspace changes

### Keyboard Shortcuts
- Don't override system shortcuts
- Use consistent patterns (e.g., Ctrl for app, Alt for actions)
- Learn core shortcuts first (j/k navigation, Ctrl+K search)

### Performance
- Limit realtime updates to essential channels
- Use appropriate update intervals (longer = better performance)
- Clear cache periodically if experiencing issues

### Security
- Rotate tokens periodically
- Use dedicated Slack account for searching if possible
- Never share configuration files containing tokens

## Configuration Files

### Settings Storage
- **Location**: Tauri app data directory
- **Format**: JSON
- **Contents**: Workspace configs, keyboard shortcuts, emoji mappings, zoom level

### Cache Storage
- **Emoji Cache**: 24-hour TTL
- **Message Cache**: Session-based
- **Search History**: Stored locally

## Keyboard Reference Card

### Quick Reference
```
Navigation          Search              Actions
j/k  = up/down     Ctrl+K = search    r = reaction
h    = first       Enter  = execute   t = thread
e    = last        Escape = clear     p = post
                   Ctrl+N = refresh   1-9 = quick emoji

Focus              UI                  Zoom
Ctrl+1 = results   Ctrl+, = settings  Ctrl+= = zoom in
Ctrl+2 = thread    ? = help           Ctrl+- = zoom out
Ctrl+U = URL       Ctrl+L = channels  Ctrl+0 = reset
```

## Future Enhancements

Planned features for future releases:
- [ ] Message editing capability
- [ ] File upload support
- [ ] Voice/video call indicators
- [ ] Custom themes
- [ ] Export functionality
- [ ] Advanced search syntax
- [ ] Slash command support
- [ ] Plugin system

## Support

For issues or questions:
1. Check this guide first
2. Review troubleshooting section
3. Check console logs (F12)
4. Report issues with:
   - App version
   - OS version
   - Error messages
   - Steps to reproduce

## Version History

See [CHANGELOG.md](./CHANGELOG.md) for version history and updates.