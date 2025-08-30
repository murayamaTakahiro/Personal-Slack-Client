import type { SlackUser } from '../types/slack';

export interface MentionContext {
  triggerPosition: number;
  searchQuery: string;
  cursorCoordinates: { x: number; y: number };
}

export class MentionService {
  private static instance: MentionService;

  private constructor() {}

  static getInstance(): MentionService {
    if (!MentionService.instance) {
      MentionService.instance = new MentionService();
    }
    return MentionService.instance;
  }

  detectMentionTrigger(text: string, cursorPos: number): MentionContext | null {
    console.log('detectMentionTrigger called:', { text, cursorPos, textAtCursor: text.substring(Math.max(0, cursorPos - 5), cursorPos) });
    
    if (cursorPos === 0) return null;

    // Look backwards from cursor to find @ mention
    let searchStart = cursorPos - 1;
    
    // Search backwards for @
    while (searchStart >= 0) {
      const char = text[searchStart];
      
      // Found @ character
      if (char === '@') {
        // Check if it's at the beginning or preceded by whitespace
        const prevChar = searchStart > 0 ? text[searchStart - 1] : null;
        const isValidPosition = prevChar === null || prevChar === ' ' || prevChar === '\n' || prevChar === '\r' || prevChar === '\t';
        
        console.log('Found @ at position', searchStart, { prevChar, isValidPosition });
        
        if (isValidPosition) {
          const searchQuery = text.substring(searchStart + 1, cursorPos);
          
          // Only trigger if we're not in a code block
          if (this.isInCodeBlock(text, searchStart)) {
            console.log('@ is in code block, ignoring');
            return null;
          }
          
          console.log('Returning mention context with query:', searchQuery);
          
          // Return context for autocomplete
          return {
            triggerPosition: searchStart,
            searchQuery,
            cursorCoordinates: { x: 0, y: 0 } // Will be calculated by the component
          };
        }
        // @ is not at a valid position
        console.log('@ not at valid position');
        return null;
      }
      
      // Check if we're still in a valid mention context
      // Allow alphanumeric, dash, underscore, and dot
      const isValidChar = /^[\w.-]$/.test(char);
      
      // If we hit whitespace or invalid char, stop searching
      if (!isValidChar && char !== '@') {
        console.log('Hit invalid char:', char, 'stopping search');
        return null;
      }
      
      searchStart--;
    }
    
    console.log('No @ found');
    return null;
  }

  private isInCodeBlock(text: string, position: number): boolean {
    // Count backticks before position
    const beforeText = text.substring(0, position);
    const tripleBackticks = (beforeText.match(/```/g) || []).length;
    const singleBackticks = (beforeText.match(/`(?!``)/g) || []).length;
    
    // If odd number of triple backticks, we're in a code block
    if (tripleBackticks % 2 === 1) return true;
    
    // Check for inline code (single backticks)
    // This is simplified - a more robust solution would track pairs
    if (singleBackticks % 2 === 1) return true;
    
    return false;
  }

  convertToSlackFormat(text: string, userMap: Map<string, SlackUser>): string {
    // Convert @username to <@USERID>
    return text.replace(/@([\w.-]+)/g, (match, username) => {
      // Find user by username, display name, or real name
      for (const [_, user] of userMap) {
        if (user.name === username || 
            user.displayName === username || 
            user.realName === username) {
          return `<@${user.id}>`;
        }
      }
      return match; // Keep original if user not found
    });
  }

  convertFromSlackFormat(text: string, userMap: Map<string, SlackUser>): string {
    // Convert <@USERID> or <@USERID|username> to @username
    return text.replace(/<@([A-Z0-9]+)(?:\|([^>]+))?>/g, (match, userId, username) => {
      if (username) {
        return `@${username}`;
      }
      
      const user = userMap.get(userId);
      if (user) {
        return `@${user.displayName || user.realName || user.name}`;
      }
      
      return match; // Keep original if user not found
    });
  }

  getCursorCoordinates(textarea: HTMLTextAreaElement): { x: number; y: number } {
    // Simple implementation - show below textarea
    const rect = textarea.getBoundingClientRect();
    
    // Position the dropdown below the textarea with some offset
    return {
      x: rect.left + 20,
      y: rect.bottom + 5
    };
  }
}

export const mentionService = MentionService.getInstance();