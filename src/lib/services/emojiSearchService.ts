import { get } from 'svelte/store';
import { emojiData } from './emojiService';

export interface SearchableEmoji {
  name: string;
  value: string;
  isCustom: boolean;
  aliases: string[];
  tags: string[];
  category?: string;
  frequency?: number;
}

export interface EmojiSearchResult extends SearchableEmoji {
  score: number;
  matchType: 'exact' | 'alias' | 'romaji' | 'english' | 'partial' | 'fuzzy';
  matchedOn?: string;
}

// Japanese to Romaji mapping for common emoji-related words
const JAPANESE_ROMAJI_MAP: Record<string, string[]> = {
  // Greetings
  'おはよう': ['ohayou', 'ohayo', 'oha'],
  'おはようございます': ['ohayougozaimasu', 'ohayou gozaimasu'],
  'こんにちは': ['konnichiha', 'konnichiwa', 'konnichi'],
  'こんばんは': ['konbanha', 'konbanwa', 'konban'],
  'おやすみ': ['oyasumi'],
  'おやすみなさい': ['oyasuminasai'],
  
  // Thanks and acknowledgments
  'ありがとう': ['arigatou', 'arigato', 'arigataya'],
  'ありがとうございます': ['arigatougozaimasu', 'arigato gozaimasu'],
  'どうも': ['doumo', 'domo'],
  'さすが': ['sasuga'],
  
  // Apologies
  'すみません': ['sumimasen', 'sumi'],
  'ごめんなさい': ['gomennasai', 'gomen'],
  'ごめん': ['gomen'],
  
  // Work-related
  'お疲れ': ['otsukare', 'otsu'],
  'お疲れ様': ['otsukaresama', 'otsukare sama'],
  'お疲れ様でした': ['otsukaresamadeshita', 'otsukare sama deshita'],
  'お疲れ様です': ['otsukaresamadesu', 'otsukare sama desu'],
  '確認': ['kakunin'],
  '確認します': ['kakuninshimasu', 'kakunin shimasu'],
  '助かります': ['tasukarimasu', 'tasukaru', 'tsukaru'],
  'よろしく': ['yoroshiku', 'yoro'],
  'よろしくお願いします': ['yoroshikuonegaishimasu', 'yoroshiku onegai shimasu'],
  
  // Reactions
  'なるほど': ['naruhodo', 'naru'],
  'わかりました': ['wakarimashita', 'wakari', 'wakatta'],
  'はい': ['hai'],
  'いいえ': ['iie'],
  'がんばって': ['ganbatte', 'ganba'],
  'がんばれ': ['ganbare'],
  'すごい': ['sugoi'],
  'すばらしい': ['subarashii'],
  
  // Actions
  'お辞儀': ['ojigi'],
  '男性': ['dansei', 'otoko'],
  '女性': ['josei', 'onna'],
  '拍手': ['hakushu'],
  '笑': ['warai', 'wara', 'emi'],
  '泣': ['naki', 'naku'],
  '怒': ['ikari', 'oko'],
  '喜': ['yorokobi'],
  '悲': ['kanashimi'],
};

// English aliases for common concepts
const ENGLISH_ALIASES: Record<string, string[]> = {
  // Greetings
  'ohayou': ['good morning', 'morning', 'gm'],
  'ohayougozaimasu': ['good morning', 'morning', 'gm'],
  'konnichiwa': ['hello', 'hi', 'good afternoon'],
  'konbanwa': ['good evening', 'evening'],
  'oyasumi': ['good night', 'night', 'gn'],
  
  // Thanks
  'arigatou': ['thank you', 'thanks', 'ty', 'thx'],
  'arigataya': ['thank you', 'thanks', 'grateful'],
  'sasuga': ['as expected', 'impressive', 'wow', 'amazing'],
  
  // Apologies
  'sumimasen': ['excuse me', 'sorry', 'pardon'],
  'gomennasai': ['sorry', 'apologies', 'my bad'],
  
  // Work
  'otsukare': ['good work', 'well done', 'tired', 'exhausted'],
  'otsukaresama': ['good work', 'thank you for your hard work'],
  'kakunin': ['confirm', 'check', 'verify', 'confirmation'],
  'tasukaru': ['helpful', 'saved', 'lifesaver', 'help'],
  'yoroshiku': ['please', 'regards', 'nice to meet you'],
  
  // Reactions
  'naruhodo': ['i see', 'understood', 'got it', 'aha'],
  'wakarimashita': ['understood', 'got it', 'roger', 'ok'],
  'hai': ['yes', 'yeah', 'yep', 'sure'],
  'iie': ['no', 'nope', 'nah'],
  'ganbatte': ['good luck', 'do your best', 'fighting'],
  'sugoi': ['amazing', 'awesome', 'great', 'wow'],
  
  // Actions
  'ojigi': ['bow', 'bowing', 'respect'],
  'ojigi_dansei': ['man bowing', 'male bow', 'bowing man'],
  'ojigi_josei': ['woman bowing', 'female bow', 'bowing woman'],
  'dansei': ['man', 'male', 'gentleman'],
  'josei': ['woman', 'female', 'lady'],
  'hakushu': ['clap', 'applause', 'clapping'],
};

// Category mappings for better organization
const EMOJI_CATEGORIES: Record<string, string[]> = {
  'greetings': ['ohayou', 'ohayo', 'konnichiwa', 'konbanwa', 'oyasumi', 'wave', 'hello'],
  'thanks': ['arigatou', 'arigato', 'arigataya', 'sasuga', 'pray', 'thanks'],
  'work': ['otsukare', 'otsukaresama', 'kakunin', 'tasukaru', 'yoroshiku'],
  'emotions': ['joy', 'smile', 'heart', 'cry', 'angry', 'confused', 'thinking'],
  'gestures': ['ojigi', 'hakushu', 'thumbsup', 'thumbsdown', 'ok_hand', 'clap', 'raised_hands'],
  'celebrations': ['tada', 'party', 'fire', 'sparkles', 'rocket', 'hundred'],
};

export class EmojiSearchService {
  private searchIndex: Map<string, SearchableEmoji[]> = new Map();
  private emojiCache: Map<string, SearchableEmoji> = new Map();
  private recentSearches: string[] = [];
  private frequencyMap: Map<string, number> = new Map();

  constructor() {
    this.buildSearchIndex();
    
    // Subscribe to emoji data changes to rebuild index
    emojiData.subscribe(() => {
      this.rebuildIndex();
    });
  }

  private buildSearchIndex() {
    const data = get(emojiData);
    if (!data) return;

    // Process custom emojis
    for (const [name, url] of Object.entries(data.custom)) {
      const searchable = this.createSearchableEmoji(name, url, true);
      this.emojiCache.set(name, searchable);
      this.indexEmoji(searchable);
    }

    // Process standard emojis
    for (const [name, unicode] of Object.entries(data.standard)) {
      const searchable = this.createSearchableEmoji(name, unicode, false);
      this.emojiCache.set(name, searchable);
      this.indexEmoji(searchable);
    }
  }

  private createSearchableEmoji(name: string, value: string, isCustom: boolean): SearchableEmoji {
    const aliases: string[] = [];
    const tags: string[] = [];
    let category: string | undefined;

    // Add romaji variations
    for (const [japanese, romajis] of Object.entries(JAPANESE_ROMAJI_MAP)) {
      if (name.includes(japanese)) {
        aliases.push(...romajis);
      }
      for (const romaji of romajis) {
        if (name.toLowerCase().includes(romaji.toLowerCase())) {
          aliases.push(japanese);
        }
      }
    }

    // Add English aliases
    if (ENGLISH_ALIASES[name]) {
      aliases.push(...ENGLISH_ALIASES[name]);
    }

    // Check for partial matches in English aliases
    for (const [emojiName, englishTerms] of Object.entries(ENGLISH_ALIASES)) {
      if (name.includes(emojiName) || emojiName.includes(name)) {
        aliases.push(...englishTerms);
      }
    }

    // Add category tags
    for (const [cat, keywords] of Object.entries(EMOJI_CATEGORIES)) {
      if (keywords.some(keyword => name.includes(keyword))) {
        category = cat;
        tags.push(cat);
      }
    }

    // Add name variations
    if (name.includes('_')) {
      aliases.push(name.replace(/_/g, ''));
      aliases.push(name.replace(/_/g, '-'));
      aliases.push(name.replace(/_/g, ' '));
    }

    // Add number variations
    if (!name.match(/\d/)) {
      aliases.push(name + '1', name + '2');
    } else {
      aliases.push(name.replace(/\d+/, ''));
    }

    // Add common suffixes/prefixes
    if (name.endsWith('desu')) {
      aliases.push(name.replace('desu', ''));
    }
    if (name.endsWith('shimasu')) {
      aliases.push(name.replace('shimasu', ''));
    }
    if (name.endsWith('masu')) {
      aliases.push(name.replace('masu', ''));
    }

    return {
      name,
      value,
      isCustom,
      aliases: [...new Set(aliases)], // Remove duplicates
      tags: [...new Set(tags)],
      category,
      frequency: this.frequencyMap.get(name) || 0
    };
  }

  private indexEmoji(emoji: SearchableEmoji) {
    // Index by name
    this.addToIndex(emoji.name.toLowerCase(), emoji);

    // Index by each alias
    for (const alias of emoji.aliases) {
      this.addToIndex(alias.toLowerCase(), emoji);
    }

    // Index by tags
    for (const tag of emoji.tags) {
      this.addToIndex(tag.toLowerCase(), emoji);
    }

    // Index by parts of the name
    const parts = emoji.name.split(/[_\-\s]+/);
    for (const part of parts) {
      if (part.length > 2) {
        this.addToIndex(part.toLowerCase(), emoji);
      }
    }
  }

  private addToIndex(key: string, emoji: SearchableEmoji) {
    if (!this.searchIndex.has(key)) {
      this.searchIndex.set(key, []);
    }
    const emojis = this.searchIndex.get(key)!;
    if (!emojis.some(e => e.name === emoji.name)) {
      emojis.push(emoji);
    }
  }

  search(query: string, limit: number = 50): EmojiSearchResult[] {
    if (!query) {
      return this.getPopularEmojis(limit);
    }

    const normalizedQuery = query.toLowerCase().trim();
    const results = new Map<string, EmojiSearchResult>();

    // Track this search
    this.recentSearches.unshift(normalizedQuery);
    this.recentSearches = this.recentSearches.slice(0, 10);

    // 1. Exact name match
    if (this.emojiCache.has(normalizedQuery)) {
      const emoji = this.emojiCache.get(normalizedQuery)!;
      results.set(emoji.name, {
        ...emoji,
        score: 100,
        matchType: 'exact',
        matchedOn: normalizedQuery
      });
    }
    
    // Also check with underscores if the query doesn't have them
    const queryWithUnderscore = normalizedQuery.replace(/\s+/g, '_');
    if (queryWithUnderscore !== normalizedQuery && this.emojiCache.has(queryWithUnderscore)) {
      const emoji = this.emojiCache.get(queryWithUnderscore)!;
      results.set(emoji.name, {
        ...emoji,
        score: 95,
        matchType: 'exact',
        matchedOn: queryWithUnderscore
      });
    }

    // 2. Exact index match (includes aliases)
    if (this.searchIndex.has(normalizedQuery)) {
      for (const emoji of this.searchIndex.get(normalizedQuery)!) {
        if (!results.has(emoji.name)) {
          results.set(emoji.name, {
            ...emoji,
            score: 90,
            matchType: emoji.aliases.includes(normalizedQuery) ? 'alias' : 'exact',
            matchedOn: normalizedQuery
          });
        }
      }
    }

    // 3. Check romaji/Japanese conversion
    for (const [japanese, romajis] of Object.entries(JAPANESE_ROMAJI_MAP)) {
      if (romajis.includes(normalizedQuery) || japanese === normalizedQuery) {
        // Search for emojis containing this Japanese word or romaji
        for (const searchTerm of [japanese, ...romajis]) {
          if (this.searchIndex.has(searchTerm.toLowerCase())) {
            for (const emoji of this.searchIndex.get(searchTerm.toLowerCase())!) {
              if (!results.has(emoji.name)) {
                results.set(emoji.name, {
                  ...emoji,
                  score: 85,
                  matchType: 'romaji',
                  matchedOn: searchTerm
                });
              }
            }
          }
        }
      }
    }

    // 4. Check English aliases
    for (const [emojiName, englishTerms] of Object.entries(ENGLISH_ALIASES)) {
      if (englishTerms.some(term => term.toLowerCase().includes(normalizedQuery))) {
        if (this.emojiCache.has(emojiName)) {
          const emoji = this.emojiCache.get(emojiName)!;
          if (!results.has(emoji.name)) {
            results.set(emoji.name, {
              ...emoji,
              score: 80,
              matchType: 'english',
              matchedOn: normalizedQuery
            });
          }
        }
      }
    }

    // 5. Partial matches
    for (const [key, emojis] of this.searchIndex.entries()) {
      if (key.includes(normalizedQuery) || normalizedQuery.includes(key)) {
        for (const emoji of emojis) {
          if (!results.has(emoji.name)) {
            const score = key === normalizedQuery ? 70 : 
                         key.startsWith(normalizedQuery) ? 65 : 
                         60;
            results.set(emoji.name, {
              ...emoji,
              score,
              matchType: 'partial',
              matchedOn: key
            });
          }
        }
      }
    }
    
    // 5b. Also check if query matches parts of underscore-separated names
    // This helps find "ojigi_dansei" when searching for "man" (via dansei -> man mapping)
    for (const emoji of this.emojiCache.values()) {
      if (!results.has(emoji.name)) {
        const nameParts = emoji.name.toLowerCase().split(/[_\-]/);
        for (const part of nameParts) {
          // Check if this part has an English alias that matches the query
          if (ENGLISH_ALIASES[part]) {
            const englishTerms = ENGLISH_ALIASES[part];
            if (englishTerms.some(term => term.toLowerCase().includes(normalizedQuery))) {
              results.set(emoji.name, {
                ...emoji,
                score: 75,
                matchType: 'english',
                matchedOn: `${part} -> ${normalizedQuery}`
              });
              break;
            }
          }
          // Direct partial match on the part
          if (part.includes(normalizedQuery)) {
            results.set(emoji.name, {
              ...emoji,
              score: 65,
              matchType: 'partial',
              matchedOn: part
            });
            break;
          }
        }
      }
    }

    // 6. Fuzzy matching for typos
    const fuzzyResults = this.fuzzySearch(normalizedQuery);
    for (const emoji of fuzzyResults) {
      if (!results.has(emoji.name)) {
        results.set(emoji.name, {
          ...emoji,
          score: 50,
          matchType: 'fuzzy',
          matchedOn: normalizedQuery
        });
      }
    }

    // Sort by score and frequency
    const sortedResults = Array.from(results.values()).sort((a, b) => {
      if (Math.abs(a.score - b.score) > 5) {
        return b.score - a.score;
      }
      return (b.frequency || 0) - (a.frequency || 0);
    });

    return sortedResults.slice(0, limit);
  }

  private fuzzySearch(query: string): SearchableEmoji[] {
    const results: SearchableEmoji[] = [];
    const maxDistance = Math.floor(query.length / 3) + 1;

    for (const emoji of this.emojiCache.values()) {
      const distance = this.levenshteinDistance(query, emoji.name.toLowerCase());
      if (distance <= maxDistance) {
        results.push(emoji);
      }
    }

    return results;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  private getPopularEmojis(limit: number): EmojiSearchResult[] {
    const popular = [
      'thumbsup', 'heart', 'eyes', 'fire', 'tada', 'clap', 'pray',
      'arigataya', 'kakunin', 'sasuga', 'otsukare', 'ohayou'
    ];

    const results: EmojiSearchResult[] = [];
    for (const name of popular) {
      if (this.emojiCache.has(name)) {
        const emoji = this.emojiCache.get(name)!;
        results.push({
          ...emoji,
          score: 100,
          matchType: 'exact'
        });
      }
    }

    return results.slice(0, limit);
  }

  updateFrequency(emojiName: string) {
    const current = this.frequencyMap.get(emojiName) || 0;
    this.frequencyMap.set(emojiName, current + 1);
    
    // Update the cache
    if (this.emojiCache.has(emojiName)) {
      const emoji = this.emojiCache.get(emojiName)!;
      emoji.frequency = current + 1;
    }
  }

  getSearchTips(): string[] {
    return [
      'Try searching in English: "bow" for おじぎ (ojigi)',
      'Use romaji for Japanese emojis: "arigatou" for ありがとう',
      'Common shortcuts: "gm" for good morning, "ty" for thank you',
      'Search by category: "greetings", "thanks", "work"',
      'Partial matches work: "tsuka" finds "tasukarimasu"',
      'Try variations: "otsukare" also finds "otsukaresama"'
    ];
  }

  getSuggestions(partial: string): string[] {
    const suggestions = new Set<string>();
    const normalized = partial.toLowerCase();

    // Add recent searches that match
    for (const recent of this.recentSearches) {
      if (recent.startsWith(normalized)) {
        suggestions.add(recent);
      }
    }

    // Add emoji names that match
    for (const name of this.emojiCache.keys()) {
      if (name.toLowerCase().startsWith(normalized)) {
        suggestions.add(name);
      }
    }

    // Add aliases that match
    for (const emoji of this.emojiCache.values()) {
      for (const alias of emoji.aliases) {
        if (alias.toLowerCase().startsWith(normalized)) {
          suggestions.add(alias);
        }
      }
    }

    return Array.from(suggestions).slice(0, 10);
  }

  rebuildIndex() {
    this.searchIndex.clear();
    this.emojiCache.clear();
    this.buildSearchIndex();
  }
}

// Export singleton instance
export const emojiSearchService = new EmojiSearchService();