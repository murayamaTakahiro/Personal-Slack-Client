export interface ParsedSegment {
  type: 'text' | 'mention' | 'url';
  content: string;
  url?: string; // Clean URL for links (without angle brackets)
}

export function parseMessageWithMentions(text: string): ParsedSegment[] {
  // Combined regex to match mentions (both Slack format and display format), URLs with/without angle brackets
  // Matches: <@USERID>, <@USERID|username>, @mentions (bounded), <http(s)://...>, and plain http(s):// URLs
  // For @mentions, use word boundary or specific terminators to prevent over-matching
  const combinedRegex = /(<@[A-Z0-9]+(?:\|[^>]+)?>)|(@[\w.-]+)(?=\s|$|[,.:;!?])|<(https?:\/\/[^>]+)>|(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g;
  const segments: ParsedSegment[] = [];
  let lastIndex = 0;
  let match;

  while ((match = combinedRegex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      const textContent = text.slice(lastIndex, match.index);
      // Only add non-empty text segments
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
      // Extract the display name if present, otherwise use the full match
      const slackMention = match[1];
      const pipeIndex = slackMention.indexOf('|');
      let displayName: string;

      if (pipeIndex !== -1) {
        // Has display name: <@USERID|username>
        displayName = '@' + slackMention.substring(pipeIndex + 1, slackMention.length - 1);
      } else {
        // No display name, just show the Slack format (will be resolved by the component)
        displayName = slackMention;
      }

      segments.push({
        type: 'mention',
        content: displayName
      });
    } else if (match[2]) {
      // Regular @mention
      segments.push({
        type: 'mention',
        content: match[2]
      });
    } else if (match[3]) {
      // URL wrapped in angle brackets <URL>
      segments.push({
        type: 'url',
        content: match[3], // Display without brackets
        url: match[3] // Clean URL for href
      });
    } else if (match[4]) {
      // Plain URL without brackets
      segments.push({
        type: 'url',
        content: match[4],
        url: match[4]
      });
    }
    
    lastIndex = match.index + match[0].length;
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