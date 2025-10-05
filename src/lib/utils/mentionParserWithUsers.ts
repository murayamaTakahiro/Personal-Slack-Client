import { get } from 'svelte/store';
import userStore from '../stores/users';
import type { ParsedSegment } from './mentionParser';

/**
 * Smart mention parser that uses the user store to accurately identify mentions
 * This handles cases like "@a.ogawa_9/29-30夏休み" by checking against actual usernames
 */
export function parseMessageWithMentionsUsingUserStore(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  const users = get(userStore);

  // Build a map of usernames for quick lookup and sort by length (longest first)
  // to handle cases where one username is a prefix of another
  const usernames = users
    .map(u => u.name)
    .filter(name => name && name.length > 0)
    .sort((a, b) => b.length - a.length);

  // Combined regex to match all potential patterns
  // Priority order is crucial:
  // 1. Slack format mentions: <@USERID> or <@USERID|username>
  // 2. Generic angle bracket links: <...> (including mailto:, http://, etc.)
  // 3. Email addresses (to exclude from mention matching)
  // 4. Regular mentions starting with @
  // 5. Plain URLs without brackets
  const combinedRegex = /(<@[A-Z0-9]+(?:\|[^>]+)?>)|<([^>]+)>|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})|(@[^\s@<]*)|(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g;

  let lastIndex = 0;
  let match;

  while ((match = combinedRegex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      const textContent = text.slice(lastIndex, match.index);
      if (textContent) {
        segments.push({
          type: 'text',
          content: textContent
        });
      }
    }

    // Determine match type
    if (match[1]) {
      // Slack-formatted mention <@USERID> or <@USERID|username>
      const slackMention = match[1];
      const pipeIndex = slackMention.indexOf('|');
      let displayName: string;

      if (pipeIndex !== -1) {
        // Has display name: <@USERID|username>
        displayName = '@' + slackMention.substring(pipeIndex + 1, slackMention.length - 1);
      } else {
        // No display name, try to resolve from user store
        const userId = slackMention.substring(2, slackMention.length - 1);
        const user = userStore.getUserById(userId);
        displayName = user ? '@' + user.name : slackMention;
      }

      segments.push({
        type: 'mention',
        content: displayName
      });

      lastIndex = match.index + match[0].length;
    } else if (match[2]) {
      // Generic angle bracket link <...> (http://, https://, mailto:, etc.)
      // Parse the link to extract display text and URL
      const linkContent = match[2];
      let displayText: string;
      let linkUrl: string;

      // Check for Slack format with pipe: <URL|display_text>
      const pipeIndex = linkContent.indexOf('|');
      if (pipeIndex !== -1) {
        // Has display text after pipe
        linkUrl = linkContent.substring(0, pipeIndex);
        displayText = linkContent.substring(pipeIndex + 1);
      } else {
        // No pipe, use the link as both URL and display
        linkUrl = linkContent;
        displayText = linkContent;
      }

      // Special handling for mailto links: remove "mailto:" prefix from display
      if (displayText.startsWith('mailto:')) {
        displayText = displayText.substring(7); // Remove "mailto:" prefix
      }

      segments.push({
        type: 'url',
        content: displayText,
        url: linkUrl
      });
      lastIndex = match.index + match[0].length;
    } else if (match[3]) {
      // Email address - treat as plain text, not a mention
      segments.push({
        type: 'text',
        content: match[3]
      });
      lastIndex = match.index + match[0].length;
    } else if (match[4]) {
      // Regular @mention - need to find the exact username
      const atMention = match[4];
      const remainingText = text.substring(match.index);

      // Remove the @ for comparison
      const mentionWithoutAt = atMention.substring(1);

      // Find the longest matching username
      let matchedUsername = '';
      for (const username of usernames) {
        // Check if the text starts with this username after the @
        if (remainingText.substring(1).startsWith(username)) {
          matchedUsername = username;
          break; // We already sorted by length, so first match is the longest
        }
      }

      if (matchedUsername) {
        // Found a matching username
        segments.push({
          type: 'mention',
          content: '@' + matchedUsername
        });
        lastIndex = match.index + 1 + matchedUsername.length; // +1 for @
      } else {
        // No matching username found, treat the whole matched pattern as a mention
        // This handles cases where the username might not be in our store yet
        segments.push({
          type: 'mention',
          content: atMention
        });
        lastIndex = match.index + match[0].length;
      }
    } else if (match[5]) {
      // Plain URL without brackets
      segments.push({
        type: 'url',
        content: match[5],
        url: match[5]
      });
      lastIndex = match.index + match[0].length;
    }
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const textContent = text.slice(lastIndex);
    if (textContent) {
      segments.push({
        type: 'text',
        content: textContent
      });
    }
  }

  return segments;
}