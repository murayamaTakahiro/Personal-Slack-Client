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
  // const combinedRegex = /<@([A-Z0-9]+)(?:\|([^>]+))?>/g; // Mentions - unused
  const urlRegex = /<(https?:\/\/[^|>]+)(?:\|([^>]+))?>/g; // URLs in Slack format
  const plainUrlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g; // Plain URLs - matches thread view pattern
  // Updated regex to properly handle emoji patterns
  // - Basic emoji: :emoji_name:
  // - With skin tone: :emoji_name::skin-tone-2:
  // - Numbered emoji: :emoji_name:1 (not part of the emoji name)
  const emojiRegex = /:([a-zA-Z0-9_+-]+)(?::skin-tone-\d)?:/g; // Emoji codes with optional skin tone modifier
  
  // Create a master list of all matches with their positions
  const allMatches: Array<{
    start: number;
    end: number;
    type: 'mention' | 'url' | 'emoji';
    match: RegExpExecArray;
  }> = [];
  
  // Find all mentions (both Slack format and simple @mentions)
  let match: RegExpExecArray | null;
  
  // First find Slack-formatted mentions <@U123|username>
  const slackMentionRegex = /<@([A-Z0-9]+)(?:\|([^>]+))?>/g;
  while ((match = slackMentionRegex.exec(text)) !== null) {
    allMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'mention',
      match
    });
  }
  
  // Then find simple @mentions (after text has been decoded from Slack format)
  // Updated regex to capture full display names including spaces
  // Matches @username or "@firstname lastname" patterns
  const simpleMentionRegex = /@([\w.-]+(?:\s+[\w.-]+)*)/g;
  while ((match = simpleMentionRegex.exec(text)) !== null) {
    // Check if this mention is inside a Slack-formatted mention
    const isInsideSlackMention = allMatches.some(m => 
      m.type === 'mention' && 
      match.index >= m.start && 
      match.index < m.end
    );
    
    if (!isInsideSlackMention) {
      allMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'mention',
        match
      });
    }
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
    
    // Check if the emoji pattern is within a URL
    // Look for any URL that contains this emoji pattern position
    let isInUrl = false;
    for (const urlMatch of allMatches.filter(m => m.type === 'url')) {
      // Check if the emoji position is within the URL's range
      if (match.index >= urlMatch.start && match.index < urlMatch.end) {
        isInUrl = true;
        break;
      }
    }
    
    // Also check for plain URLs that might contain emoji patterns
    // This handles cases where the URL wasn't detected by URL regex but contains :
    if (!isInUrl) {
      // Get broader context to check for URL patterns
      const beforeContext = text.substring(Math.max(0, match.index - 50), match.index);
      const afterContext = text.substring(match.index + match[0].length, Math.min(text.length, match.index + match[0].length + 50));
      const fullContext = beforeContext + match[0] + afterContext;
      
      // Check if we're in a URL context (has http:// or https:// before and continues without spaces)
      const urlPattern = /https?:\/\/[^\s]*/;
      const urlMatch = urlPattern.exec(fullContext);
      if (urlMatch) {
        // Check if our emoji pattern is within this URL
        const emojiPosInContext = beforeContext.length;
        const urlStartInContext = fullContext.indexOf(urlMatch[0]);
        const urlEndInContext = urlStartInContext + urlMatch[0].length;
        
        if (emojiPosInContext >= urlStartInContext && emojiPosInContext < urlEndInContext) {
          isInUrl = true;
        }
      }
    }
    
    if (!isInsideOther && !isInUrl) {
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
      // Check if it's a Slack-formatted mention or simple @mention
      if (matchInfo.match[0].startsWith('<@')) {
        // Slack format: <@U123|displayname>
        const userId = matchInfo.match[1];
        const displayName = matchInfo.match[2] || userId;
        segments.push({
          type: 'mention',
          content: `@${displayName}`,
          userId
        });
      } else {
        // Simple format: @username
        const username = matchInfo.match[1];
        segments.push({
          type: 'mention',
          content: `@${username}`,
          userId: username // Use username as userId for simple mentions
        });
      }
    } else if (matchInfo.type === 'url') {
      // Handle both Slack-formatted URLs and plain URLs
      let url: string;
      let displayText: string;
      
      if (matchInfo.match[0].startsWith('<')) {
        // Slack-formatted URL: <URL|display>
        url = matchInfo.match[1];
        displayText = matchInfo.match[2] || url;
      } else {
        // Plain URL: the entire match is the URL
        url = matchInfo.match[0];
        displayText = url;
      }
      
      segments.push({
        type: 'url',
        content: displayText,
        url
      });
    } else if (matchInfo.type === 'emoji') {
      const fullMatch = matchInfo.match[0];
      const emojiName = matchInfo.match[1];
      
      // Check if this is a valid emoji pattern
      // Reject patterns that are just numbers or too short
      if (emojiName.match(/^\d+$/) || emojiName.length < 2) {
        // Just numbers or too short - keep as text
        segments.push({
          type: 'text',
          content: fullMatch
        });
      } else {
        const emojiValue = emojiService.getEmoji(emojiName);
        
        if (emojiValue) {
          segments.push({
            type: 'emoji',
            content: fullMatch, // Original :emoji: text
            emoji: emojiValue // URL or Unicode
          });
        } else {
          // Keep as text if emoji not found
          segments.push({
            type: 'text',
            content: fullMatch
          });
        }
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
  // First check if this looks like an emoji name (any non-space characters between colons)
  // vs already being a Unicode emoji
  const isEmojiName = /^:?[^:\s]+:?$/.test(emojiCode);
  
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