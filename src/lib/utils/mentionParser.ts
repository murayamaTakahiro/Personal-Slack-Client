export interface ParsedSegment {
  type: 'text' | 'mention' | 'url';
  content: string;
  url?: string; // Clean URL for links (without angle brackets)
}

export function parseMessageWithMentions(text: string): ParsedSegment[] {
  // Combined regex to match mentions, URLs with/without angle brackets
  // Matches: @mentions, <http(s)://...>, and plain http(s):// URLs
  const combinedRegex = /(@[\w.-]+)|<(https?:\/\/[^>]+)>|(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g;
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
      // @mention
      segments.push({
        type: 'mention',
        content: match[1]
      });
    } else if (match[2]) {
      // URL wrapped in angle brackets <URL>
      segments.push({
        type: 'url',
        content: match[2], // Display without brackets
        url: match[2] // Clean URL for href
      });
    } else if (match[3]) {
      // Plain URL without brackets
      segments.push({
        type: 'url',
        content: match[3],
        url: match[3]
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