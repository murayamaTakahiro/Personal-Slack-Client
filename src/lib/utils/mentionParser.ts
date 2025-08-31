export interface ParsedSegment {
  type: 'text' | 'mention';
  content: string;
}

export function parseMessageWithMentions(text: string): ParsedSegment[] {
  const mentionRegex = /@[\w.-]+/g;
  const segments: ParsedSegment[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, match.index)
      });
    }
    
    segments.push({
      type: 'mention',
      content: match[0]
    });
    
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex)
    });
  }

  return segments;
}