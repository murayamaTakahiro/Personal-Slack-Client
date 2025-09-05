/**
 * Fallback search implementation for when Web Workers are not available
 * These functions run on the main thread
 */

/**
 * Performs text search on messages
 */
export function performSearch({ messages, query, options = {} }: {
  messages: any[];
  query: string;
  options?: {
    caseSensitive?: boolean;
    wholeWord?: boolean;
    regex?: boolean;
  };
}) {
  if (!query) return messages;
  
  const { caseSensitive = false, wholeWord = false, regex = false } = options;
  
  let searchFn: (text: string) => boolean;
  
  if (regex) {
    try {
      const re = new RegExp(query, caseSensitive ? 'g' : 'gi');
      searchFn = (text: string) => re.test(text);
    } catch {
      // Invalid regex, fall back to simple search
      searchFn = createSimpleSearchFn(query, caseSensitive, wholeWord);
    }
  } else {
    searchFn = createSimpleSearchFn(query, caseSensitive, wholeWord);
  }
  
  return messages.filter(message => {
    const searchableText = [
      message.text || '',
      message.userName || '',
      message.channelName || ''
    ].join(' ');
    
    return searchFn(searchableText);
  });
}

/**
 * Creates a simple search function
 */
function createSimpleSearchFn(query: string, caseSensitive: boolean, wholeWord: boolean) {
  const normalizedQuery = caseSensitive ? query : query.toLowerCase();
  
  return (text: string) => {
    const normalizedText = caseSensitive ? text : text.toLowerCase();
    
    if (wholeWord) {
      const wordBoundary = `\\b${escapeRegex(normalizedQuery)}\\b`;
      const re = new RegExp(wordBoundary, 'g');
      return re.test(normalizedText);
    }
    
    return normalizedText.includes(normalizedQuery);
  };
}

/**
 * Escapes special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Filters messages based on criteria
 */
export function performFilter({ messages, filters }: {
  messages: any[];
  filters: {
    channel?: string;
    user?: string;
    dateFrom?: string;
    dateTo?: string;
    hasThread?: boolean;
    hasReactions?: boolean;
  };
}) {
  return messages.filter(message => {
    // Channel filter
    if (filters.channel) {
      const channels = filters.channel.split(',').map(c => c.trim());
      if (!channels.includes(message.channel) && !channels.includes(message.channelName)) {
        return false;
      }
    }
    
    // User filter
    if (filters.user) {
      if (message.user !== filters.user && message.userName !== filters.user) {
        return false;
      }
    }
    
    // Date range filter
    if (filters.dateFrom || filters.dateTo) {
      const messageDate = parseFloat(message.ts) * 1000;
      
      if (filters.dateFrom) {
        const fromDate = new Date(filters.dateFrom).getTime();
        if (messageDate < fromDate) return false;
      }
      
      if (filters.dateTo) {
        const toDate = new Date(filters.dateTo).getTime() + (24 * 60 * 60 * 1000 - 1); // End of day
        if (messageDate > toDate) return false;
      }
    }
    
    // Thread filter
    if (filters.hasThread !== undefined) {
      const hasThread = message.isThreadParent || message.threadTs;
      if (filters.hasThread !== hasThread) return false;
    }
    
    // Reactions filter
    if (filters.hasReactions !== undefined) {
      const hasReactions = message.reactions && message.reactions.length > 0;
      if (filters.hasReactions !== hasReactions) return false;
    }
    
    return true;
  });
}

/**
 * Sorts messages based on criteria
 */
export function performSort({ messages, sortBy, order = 'desc' }: {
  messages: any[];
  sortBy: 'date' | 'user' | 'channel' | 'reactions';
  order?: 'asc' | 'desc';
}) {
  const sorted = [...messages].sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'date':
        comparison = parseFloat(a.ts) - parseFloat(b.ts);
        break;
      case 'user':
        comparison = (a.userName || '').localeCompare(b.userName || '');
        break;
      case 'channel':
        comparison = (a.channelName || '').localeCompare(b.channelName || '');
        break;
      case 'reactions':
        const aReactions = a.reactions?.length || 0;
        const bReactions = b.reactions?.length || 0;
        comparison = aReactions - bReactions;
        break;
    }
    
    return order === 'asc' ? comparison : -comparison;
  });
  
  return sorted;
}