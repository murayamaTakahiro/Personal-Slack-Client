import { emojiService } from '../services/emojiService';

export interface MessageSegment {
  type: 'text' | 'emoji' | 'mention' | 'url';
  content: string;
  emoji?: string; // URL or Unicode for emoji
  url?: string; // For URL segments
  userId?: string; // For mention segments
}

/**
 * Parse message text and identify emojis, mentions, and URLs
 */
export function parseMessageWithEmojis(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  
  // Combined regex for all patterns
  // Priority order: mentions, URLs, then emojis
  const combinedRegex = /<@([A-Z0-9]+)(?:\|([^>]+))?>/g; // Mentions
  const urlRegex = /<(https?:\/\/[^|>]+)(?:\|([^>]+))?>/g; // URLs in Slack format
  const plainUrlRegex = /(?<![<"])(https?:\/\/[^\s<>"]+)/g; // Plain URLs
  const emojiRegex = /:([a-zA-Z0-9_+-]+):/g; // Emoji codes
  
  // Create a master list of all matches with their positions
  const allMatches: Array<{
    start: number;
    end: number;
    type: 'mention' | 'url' | 'emoji';
    match: RegExpExecArray;
  }> = [];
  
  // Find all mentions
  let match;
  const mentionRegex = /<@([A-Z0-9]+)(?:\|([^>]+))?>/g;
  while ((match = mentionRegex.exec(text)) !== null) {
    allMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'mention',
      match
    });
  }
  
  // Find all Slack-formatted URLs
  while ((match = urlRegex.exec(text)) !== null) {
    allMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'url',
      match
    });
  }
  
  // Find all plain URLs (but not if they're already in Slack format)
  while ((match = plainUrlRegex.exec(text)) !== null) {
    // Check if this URL is already captured as a Slack-formatted URL
    const isSlackFormatted = allMatches.some(m => 
      m.type === 'url' && 
      match.index >= m.start && 
      match.index < m.end
    );
    
    if (!isSlackFormatted) {
      allMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'url',
        match
      });
    }
  }
  
  // Find all emojis
  while ((match = emojiRegex.exec(text)) !== null) {
    // Check if this emoji is inside a URL or mention
    const isInsideOther = allMatches.some(m => 
      match.index >= m.start && 
      match.index < m.end
    );
    
    if (!isInsideOther) {
      allMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'emoji',
        match
      });
    }
  }
  
  // Sort matches by position
  allMatches.sort((a, b) => a.start - b.start);
  
  // Build segments
  let lastIndex = 0;
  
  for (const matchInfo of allMatches) {
    // Add text before this match
    if (matchInfo.start > lastIndex) {
      const textContent = text.substring(lastIndex, matchInfo.start);
      if (textContent) {
        segments.push({
          type: 'text',
          content: textContent
        });
      }
    }
    
    // Add the matched segment
    if (matchInfo.type === 'mention') {
      const userId = matchInfo.match[1];
      const displayName = matchInfo.match[2] || `@${userId}`;
      segments.push({
        type: 'mention',
        content: `@${displayName}`,
        userId
      });
    } else if (matchInfo.type === 'url') {
      const url = matchInfo.match[1];
      const displayText = matchInfo.match[2] || url;
      segments.push({
        type: 'url',
        content: displayText,
        url
      });
    } else if (matchInfo.type === 'emoji') {
      const emojiName = matchInfo.match[1];
      const emojiValue = emojiService.getEmoji(emojiName);
      
      if (emojiValue) {
        segments.push({
          type: 'emoji',
          content: matchInfo.match[0], // Original :emoji: text
          emoji: emojiValue // URL or Unicode
        });
      } else {
        // Keep as text if emoji not found
        segments.push({
          type: 'text',
          content: matchInfo.match[0]
        });
      }
    }
    
    lastIndex = matchInfo.end;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    if (remainingText) {
      segments.push({
        type: 'text',
        content: remainingText
      });
    }
  }
  
  return segments;
}

/**
 * Parse emojis only (for reaction display)
 */
export function parseEmoji(emojiCode: string): { isCustom: boolean; value: string } {
  // First check if this looks like an emoji name (alphanumeric with underscores/dashes)
  // vs already being a Unicode emoji
  const isEmojiName = /^:?[a-zA-Z0-9_+-]+:?$/.test(emojiCode);
  
  if (!isEmojiName) {
    // If it doesn't look like an emoji name, it's probably already a Unicode emoji
    // Just return it as-is
    return {
      isCustom: false,
      value: emojiCode
    };
  }
  
  // It looks like an emoji name, try to look it up
  const cleanName = emojiCode.replace(/^:/, '').replace(/:$/, '');
  const emojiValue = emojiService.getEmoji(cleanName);
  
  if (emojiValue) {
    return {
      isCustom: emojiValue.startsWith('http'),
      value: emojiValue
    };
  }
  
  // Return the original code with colons if not found
  return {
    isCustom: false,
    value: `:${cleanName}:`
  };
}