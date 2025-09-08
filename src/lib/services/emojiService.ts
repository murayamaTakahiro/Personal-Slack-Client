import { invoke } from '@tauri-apps/api/core';
import { writable, get } from 'svelte/store';
import { loadFromStore, saveToStore } from '../stores/persistentStore';

export interface SlackEmoji {
  name: string;
  url?: string;
  unicode?: string;
  alias?: string;
}

export interface EmojiData {
  custom: Record<string, string>;  // name -> URL mapping for custom emojis
  standard: Record<string, string>; // name -> unicode mapping for standard emojis
  lastFetched?: number;
}

// Cache duration: 24 hours
const CACHE_DURATION = 24 * 60 * 60 * 1000;

// Standard Slack emojis mapped to Unicode (common ones)
const STANDARD_EMOJIS: Record<string, string> = {
  '+1': '👍',
  'thumbsup': '👍',
  '-1': '👎',
  'thumbsdown': '👎',
  'heart': '❤️',
  'eyes': '👀',
  'raised_hands': '🙌',
  'clap': '👏',
  'wave': '👋',
  'ok_hand': '👌',
  'pray': '🙏',
  'fire': '🔥',
  'tada': '🎉',
  'rocket': '🚀',
  'white_check_mark': '✅',
  'x': '❌',
  'joy': '😂',
  'smile': '😊',
  'sweat_smile': '😅',
  'laughing': '😆',
  'wink': '😉',
  'heart_eyes': '😍',
  'sob': '😭',
  'thinking_face': '🤔',
  'confused': '😕',
  'neutral_face': '😐',
  'expressionless': '😑',
  'no_mouth': '😶',
  'rolling_eyes': '🙄',
  'grimacing': '😬',
  'lying_face': '🤥',
  'relieved': '😌',
  'pensive': '😔',
  'sleepy': '😪',
  'drooling_face': '🤤',
  'sleeping': '😴',
  'mask': '😷',
  'face_with_thermometer': '🤒',
  'face_with_head_bandage': '🤕',
  'nauseated_face': '🤢',
  'face_vomiting': '🤮',
  'sneezing_face': '🤧',
  'hot_face': '🥵',
  'cold_face': '🥶',
  'woozy_face': '🥴',
  'dizzy_face': '😵',
  'exploding_head': '🤯',
  'cowboy_hat_face': '🤠',
  'party': '🥳',
  'partying_face': '🥳',
  'sunglasses': '😎',
  'nerd_face': '🤓',
  'monocle': '🧐',
  'face_with_monocle': '🧐',
  'worried': '😟',
  'slightly_frowning_face': '🙁',
  'frowning_face': '☹️',
  'face_with_open_mouth': '😮',
  'hushed': '😯',
  'astonished': '😲',
  'flushed': '😳',
  'pleading_face': '🥺',
  'frowning': '😦',
  'anguished': '😧',
  'fearful': '😨',
  'cold_sweat': '😰',
  'disappointed_relieved': '😥',
  'cry': '😢',
  'scream': '😱',
  'confounded': '😖',
  'persevere': '😣',
  'disappointed': '😞',
  'sweat': '😓',
  'weary': '😩',
  'tired_face': '😫',
  'yawning_face': '🥱',
  'triumph': '😤',
  'rage': '😡',
  'angry': '😠',
  'symbols_over_mouth': '🤬',
  'smiling_imp': '😈',
  'imp': '👿',
  'skull': '💀',
  'skull_and_crossbones': '☠️',
  'hankey': '💩',
  'poop': '💩',
  'shit': '💩',
  'clown_face': '🤡',
  'japanese_ogre': '👹',
  'japanese_goblin': '👺',
  'ghost': '👻',
  'alien': '👽',
  'space_invader': '👾',
  'robot': '🤖',
  'robot_face': '🤖',
  'smiley_cat': '😺',
  'smile_cat': '😸',
  'joy_cat': '😹',
  'heart_eyes_cat': '😻',
  'smirk_cat': '😼',
  'kissing_cat': '😽',
  'scream_cat': '🙀',
  'crying_cat_face': '😿',
  'pouting_cat': '😾',
  'palms_up_together': '🤲',
  'open_hands': '👐',
  'handshake': '🤝',
  'fist': '👊',
  'oncoming_fist': '👊',
  'punch': '👊',
  'left_facing_fist': '🤛',
  'right_facing_fist': '🤜',
  'crossed_fingers': '🤞',
  'v': '✌️',
  'victory': '✌️',
  'love_you_gesture': '🤟',
  'metal': '🤘',
  'pinched_fingers': '🤌',
  'pinching_hand': '🤏',
  'point_left': '👈',
  'point_right': '👉',
  'point_up_2': '👆',
  'point_down': '👇',
  'point_up': '☝️',
  'hand': '✋',
  'raised_hand': '✋',
  'raised_back_of_hand': '🤚',
  'raised_hand_with_fingers_splayed': '🖐️',
  'vulcan_salute': '🖖',
  'call_me_hand': '🤙',
  'muscle': '💪',
  'middle_finger': '🖕',
  'writing_hand': '✍️',
  'sparkles': '✨',
  'star': '⭐',
  'star2': '🌟',
  'zap': '⚡',
  'boom': '💥',
  'collision': '💥',
  'hundred': '💯',
  '100': '💯',
  
  // People & Body
  'man': '👨',
  'woman': '👩', 
  'person': '🧑',
  'child': '🧒',
  'boy': '👦',
  'girl': '👧',
  'baby': '👶',
  'older_man': '👴',
  'older_woman': '👵',
  'person_red_hair': '🧑‍🦰',
  'person_curly_hair': '🧑‍🦱',
  'person_white_hair': '🧑‍🦳',
  'person_bald': '🧑‍🦲',
  'bearded_person': '🧔',
  
  // Gestures & Activities
  'person_bowing': '🙇',
  'man_bowing': '🙇‍♂️',
  'woman_bowing': '🙇‍♀️',
  'person_facepalming': '🤦',
  'man_facepalming': '🤦‍♂️',
  'woman_facepalming': '🤦‍♀️',
  'person_shrugging': '🤷',
  'man_shrugging': '🤷‍♂️',
  'woman_shrugging': '🤷‍♀️',
  'person_raising_hand': '🙋',
  'man_raising_hand': '🙋‍♂️',
  'woman_raising_hand': '🙋‍♀️',
  'woman-raising-hand': '🙋‍♀️',  // Hyphenated version
  'woman_raising_hand': '🙋‍♀️',  // Underscore version
  '挙手_女性': '🙋‍♀️',  // Japanese alias for woman_raising_hand
  '挙手': '🙋',  // Japanese alias for person_raising_hand
  'raising_hand': '🙋',  // Common alias
  'raising-hand': '🙋',  // Common alias hyphenated
  'deaf_person': '🧏',
  'person_gesturing_no': '🙅',
  'person_gesturing_ok': '🙆',
  'person_tipping_hand': '💁',
  
  // Professions
  'health_worker': '🧑‍⚕️',
  'student': '🧑‍🎓',
  'teacher': '🧑‍🏫',
  'judge': '🧑‍⚖️',
  'farmer': '🧑‍🌾',
  'cook': '🧑‍🍳',
  'mechanic': '🧑‍🔧',
  'factory_worker': '🧑‍🏭',
  'office_worker': '🧑‍💼',
  'scientist': '🧑‍🔬',
  'technologist': '🧑‍💻',
  'singer': '🧑‍🎤',
  'artist': '🧑‍🎨',
  'pilot': '🧑‍✈️',
  'astronaut': '🧑‍🚀',
  'firefighter': '🧑‍🚒',
  'police_officer': '👮',
  'detective': '🕵️',
  'guard': '💂',
  'construction_worker': '👷',
  'prince': '🤴',
  'princess': '👸',
  'person_with_turban': '👳',
  'person_with_veil': '👰',
  'person_in_tuxedo': '🤵',
  'pregnant_woman': '🤰',
  'breast_feeding': '🤱',
  
  // Fantasy
  'angel': '👼',
  'santa': '🎅',
  'mrs_claus': '🤶',
  'superhero': '🦸',
  'supervillain': '🦹',
  'mage': '🧙',
  'fairy': '🧚',
  'vampire': '🧛',
  'merperson': '🧜',
  'elf': '🧝',
  'genie': '🧞',
  'zombie': '🧟',
  
  // Activities
  'person_walking': '🚶',
  'person_running': '🏃',
  'dancer': '💃',
  'man_dancing': '🕺',
  'people_with_bunny_ears': '👯',
  'bicyclist': '🚴',  // Added bicyclist
  'person_biking': '🚴',  // Alternative name
  'cyclist': '🚴',  // Alternative name
  'person_in_steamy_room': '🧖',
  'person_climbing': '🧗',
  'person_in_lotus_position': '🧘',
  'bath': '🛀',
  'sleeping_bed': '🛌',
  'speaking_head': '🗣️',
  'bust_in_silhouette': '👤',
  'busts_in_silhouette': '👥',
  
  // Family
  'family': '👪',
  'couple': '💑',
  'couple_with_heart': '💑',
  'couple_kiss': '💏',
  'holding_hands': '🧑‍🤝‍🧑',
  
  // Body parts
  'brain': '🧠',
  'eye': '👁️',
  'tongue': '👅',
  'mouth': '👄',
  'tooth': '🦷',
  'bone': '🦴',
  'heart_organ': '🫶',
  'lungs': '🫁',
  'ear': '👂',
  'nose': '👃',
  'footprints': '👣',
  'leg': '🦵',
  'foot': '🦶',
  
  // Animals
  'monkey_face': '🐵',
  'monkey': '🐒',
  'gorilla': '🦍',
  'orangutan': '🦧',
  'dog': '🐕',
  'dog_face': '🐶',
  'cat': '🐈',
  'cat_face': '🐱',
  'tiger': '🐯',
  'tiger_face': '🐅',
  'leopard': '🐆',
  'horse': '🐴',
  'horse_face': '🐎',
  'unicorn': '🦄',
  'zebra': '🦓',
  'cow': '🐮',
  'cow_face': '🐄',
  'pig': '🐷',
  'pig_face': '🐖',
  'boar': '🐗',
  'pig_nose': '🐽',
  'ram': '🐏',
  'sheep': '🐑',
  'goat': '🐐',
  'camel': '🐪',
  'llama': '🦙',
  'giraffe': '🦒',
  'elephant': '🐘',
  'mammoth': '🦣',
  'rhinoceros': '🦏',
  'hippopotamus': '🦛',
  'mouse': '🐭',
  'mouse_face': '🐁',
  'rat': '🐀',
  'hamster': '🐹',
  'rabbit': '🐰',
  'rabbit_face': '🐇',
  'chipmunk': '🐿️',
  'beaver': '🦫',
  'hedgehog': '🦔',
  'bat': '🦇',
  'bear': '🐻',
  'koala': '🐨',
  'panda': '🐼',
  'sloth': '🦥',
  'otter': '🦦',
  'skunk': '🦨',
  'kangaroo': '🦘',
  'badger': '🦡',
  'paw_prints': '🐾'
};

// Store for emoji data - initialize with standard emojis
export const emojiData = writable<EmojiData>({
  custom: {},
  standard: STANDARD_EMOJIS
});

// Store for loading state
export const emojiLoading = writable<boolean>(false);

export class EmojiService {
  private static instance: EmojiService;
  private fetchPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): EmojiService {
    if (!EmojiService.instance) {
      EmojiService.instance = new EmojiService();
    }
    return EmojiService.instance;
  }

  /**
   * Initialize emoji service and load cached data
   */
  async initialize(): Promise<void> {
    console.log('[EmojiService] Starting initialization...');
    try {
      // Load cached emoji data
      const cached = await loadFromStore<EmojiData | null>('emojiData', null);
      console.log('[EmojiService] Cached data loaded:', {
        hasCached: !!cached,
        customCount: cached?.custom ? Object.keys(cached.custom).length : 0,
        lastFetched: cached?.lastFetched ? new Date(cached.lastFetched).toISOString() : 'never'
      });
      
      if (cached && cached.lastFetched) {
        const now = Date.now();
        const age = now - cached.lastFetched;
        
        if (age < CACHE_DURATION) {
          console.log('[EmojiService] Using cached emoji data (age:', Math.round(age / 1000 / 60), 'minutes)');
          // Ensure standard emojis are always included
          const mergedData = {
            ...cached,
            standard: { ...STANDARD_EMOJIS, ...cached.standard }
          };
          emojiData.set(mergedData);
          
          // Auto-detect correct emoji names for quick reactions
          this.autoDetectQuickReactionEmojis(mergedData);
          return;
        } else {
          console.log('[EmojiService] Cache is stale (age:', Math.round(age / 1000 / 60), 'minutes), fetching fresh data...');
        }
      } else {
        console.log('[EmojiService] No valid cache found, fetching fresh data...');
      }
      
      // Fetch fresh data if cache is stale or missing
      await this.fetchEmojis();
      
      // Auto-detect after fresh fetch
      const currentData = get(emojiData);
      this.autoDetectQuickReactionEmojis(currentData);
    } catch (error) {
      console.error('[EmojiService] Failed to initialize:', error);
      // Use standard emojis as fallback
      console.log('[EmojiService] Using fallback standard emojis only');
      emojiData.set({
        custom: {},
        standard: STANDARD_EMOJIS
      });
    }
  }

  /**
   * Fetch emoji list from Slack API
   */
  async fetchEmojis(): Promise<void> {
    // Prevent duplicate fetches
    if (this.fetchPromise) {
      console.log('[EmojiService] Fetch already in progress, waiting...');
      return this.fetchPromise;
    }

    this.fetchPromise = (async () => {
      emojiLoading.set(true);
      try {
        console.log('[EmojiService] Fetching emoji list from Slack API...');
        
        // Call Rust backend to get emoji list
        const response = await invoke<{
          ok: boolean;
          emoji?: Record<string, string>;
          error?: string;
        }>('get_emoji_list');

        console.log('[EmojiService] API Response:', {
          ok: response.ok,
          hasEmoji: !!response.emoji,
          emojiCount: response.emoji ? Object.keys(response.emoji).length : 0,
          error: response.error
        });

        if (!response.ok || !response.emoji) {
          throw new Error(response.error || 'Failed to fetch emoji list');
        }

        // Process emoji data
        const customEmojis: Record<string, string> = {};
        const aliasMap: Record<string, string> = {};
        let standardCount = 0;
        let customCount = 0;
        let aliasCount = 0;
        
        console.log('[EmojiService] Processing emoji data...');
        
        // Log all emoji names for debugging quick reactions
        const quickReactionNames = [
          'kakuninshimasu', 'kakunin', 
          'sasuga', 'sasuga2',
          'tasukarimasu', 'tasukaru', 'tsukaru',
          'otsukaresamadesu', 'otsukaresama', 'otsukare',
          'ohayougozaimasu', 'ohayou', 'oha',
          'arigataya'
        ];
        
        console.log('[EmojiService] 🔍 Looking for quick reaction emojis in response:');
        for (const name of quickReactionNames) {
          if (response.emoji[name]) {
            const value = response.emoji[name];
            if (value.startsWith('alias:')) {
              console.log(`  📎 Found "${name}" as alias to: ${value}`);
            } else if (value.startsWith('http')) {
              console.log(`  ✅ Found "${name}": ${value.substring(0, 60)}...`);
            } else {
              console.log(`  ⚠️ Found "${name}" with unexpected value: ${value}`);
            }
          }
        }
        
        // Also check for variations
        console.log('[EmojiService] 🔍 All emoji names containing relevant keywords:');
        const keywords = ['kakunin', 'sasuga', 'tsuka', 'oha', 'arigataya', 'otsukare'];
        for (const [name, value] of Object.entries(response.emoji)) {
          for (const keyword of keywords) {
            if (name.toLowerCase().includes(keyword)) {
              const valuePreview = value.startsWith('http') ? value.substring(0, 50) + '...' : value;
              console.log(`  - "${name}": ${valuePreview}`);
              break;
            }
          }
        }
        
        for (const [name, value] of Object.entries(response.emoji)) {
          if (value.startsWith('alias:')) {
            // This is an alias to another emoji
            aliasMap[name] = value.replace('alias:', '');
            aliasCount++;
          } else if (value.startsWith('http')) {
            // This is a custom emoji with URL
            customEmojis[name] = value;
            customCount++;
          } else {
            // Might be a unicode emoji
            standardCount++;
          }
        }

        console.log('[EmojiService] Initial processing:', {
          custom: customCount,
          aliases: aliasCount,
          standard: standardCount
        });

        // Resolve aliases
        let resolvedAliases = 0;
        for (const [alias, target] of Object.entries(aliasMap)) {
          if (customEmojis[target]) {
            customEmojis[alias] = customEmojis[target];
            resolvedAliases++;
          } else if (STANDARD_EMOJIS[target]) {
            // Alias points to a standard emoji
            customEmojis[alias] = STANDARD_EMOJIS[target];
            resolvedAliases++;
          }
        }

        console.log('[EmojiService] Resolved', resolvedAliases, 'aliases');

        const data: EmojiData = {
          custom: customEmojis,
          standard: STANDARD_EMOJIS,
          lastFetched: Date.now()
        };

        emojiData.set(data);
        
        // Cache the data
        await saveToStore('emojiData', data);
        
        console.log('[EmojiService] Successfully loaded emojis:', {
          customEmojis: Object.keys(customEmojis).length,
          standardEmojis: Object.keys(STANDARD_EMOJIS).length,
          cachedAt: data.lastFetched ? new Date(data.lastFetched).toISOString() : 'never'
        });
        
        // Log some sample custom emojis for debugging
        const sampleEmojis = Object.entries(customEmojis).slice(0, 5);
        console.log('[EmojiService] Sample custom emojis:', sampleEmojis);
      } catch (error) {
        console.error('[EmojiService] Failed to fetch emojis:', error);
        
        // Fallback to standard emojis only
        const fallbackData: EmojiData = {
          custom: {},
          standard: STANDARD_EMOJIS,
          lastFetched: Date.now()
        };
        emojiData.set(fallbackData);
        console.log('[EmojiService] Using fallback with standard emojis only');
      } finally {
        emojiLoading.set(false);
        this.fetchPromise = null;
      }
    })();

    return this.fetchPromise;
  }

  /**
   * Get emoji URL or Unicode character
   */
  getEmoji(name: string): string | null {
    const data = get(emojiData);
    
    // Remove colons and skin tone modifiers if present
    let cleanName = name.replace(/^:/, '').replace(/:$/, '');
    
    // Handle skin tone variations (e.g., "woman-raising-hand::skin-tone-2" -> "woman-raising-hand")
    const skinToneMatch = cleanName.match(/^(.+)::?skin-tone-\d$/i);
    if (skinToneMatch) {
      cleanName = skinToneMatch[1];
    }
    
    // Remove trailing numbers that might be accidentally included
    // e.g., "woman-raising-hand:1" -> "woman-raising-hand" 
    const numberSuffixMatch = cleanName.match(/^(.+):(\d+)$/);
    if (numberSuffixMatch) {
      cleanName = numberSuffixMatch[1];
    }
    
    // Check custom emojis first
    if (data.custom[cleanName]) {
      return data.custom[cleanName];
    }
    
    // Check standard emojis
    if (data.standard[cleanName]) {
      return data.standard[cleanName];
    }
    
    // Handle special cases and common variations
    if (cleanName === 'thumbsup' || cleanName === '+1') {
      return data.standard['thumbsup'] || '👍';
    }
    if (cleanName === 'thumbsdown' || cleanName === '-1') {
      return data.standard['thumbsdown'] || '👎';
    }
    
    // Try hyphenated vs underscore variations
    const hyphenToUnderscore = cleanName.replace(/-/g, '_');
    const underscoreToHyphen = cleanName.replace(/_/g, '-');
    
    if (data.standard[hyphenToUnderscore]) {
      return data.standard[hyphenToUnderscore];
    }
    if (data.standard[underscoreToHyphen]) {
      return data.standard[underscoreToHyphen];
    }
    if (data.custom[hyphenToUnderscore]) {
      return data.custom[hyphenToUnderscore];
    }
    if (data.custom[underscoreToHyphen]) {
      return data.custom[underscoreToHyphen];
    }
    
    // Try to find variations for custom emojis that might not match exactly
    // Try common variations
    const variations = [
      cleanName.replace('amadesu', 'ama'),  // otsukaresamadesu -> otsukaresama
      cleanName.replace('desu', ''),         // Remove 'desu' suffix
      cleanName.replace('shimasu', ''),      // kakuninshimasu -> kakunin
      cleanName + '2',                       // Try with number suffix
      cleanName + '1',
      cleanName.replace('2', ''),            // Remove number suffix
      cleanName.replace('1', ''),
      cleanName.replace(/_/g, ''),           // Remove underscores
      cleanName.replace(/-/g, ''),           // Remove dashes
    ];
    
    for (const variant of variations) {
      if (data.custom[variant]) {
        console.log(`[EmojiService] Found emoji "${cleanName}" as variant "${variant}"`);
        return data.custom[variant];
      }
      if (data.standard[variant]) {
        console.log(`[EmojiService] Found standard emoji "${cleanName}" as variant "${variant}"`);
        return data.standard[variant];
      }
    }
    
    // Try partial matching for Japanese-style emojis
    const partialMatches = Object.keys(data.custom).filter(key => {
      return key.includes(cleanName) || cleanName.includes(key);
    });
    
    if (partialMatches.length > 0) {
      console.log(`[EmojiService] Found partial match for "${cleanName}": "${partialMatches[0]}"`);
      return data.custom[partialMatches[0]];
    }
    
    // Log when emoji is not found (only for custom workspace emojis)
    if (cleanName.includes('_') || cleanName.length > 15) { // Likely a custom emoji
      console.log('[EmojiService] Custom emoji not found:', cleanName);
    }
    
    return null;
  }

  /**
   * Check if an emoji exists
   */
  hasEmoji(name: string): boolean {
    return this.getEmoji(name) !== null;
  }

  /**
   * Parse text and replace emoji codes with actual emojis
   */
  parseEmojis(text: string): Array<{type: 'text' | 'emoji', content: string, emoji?: string}> {
    const segments: Array<{type: 'text' | 'emoji', content: string, emoji?: string}> = [];
    const emojiRegex = /:([a-zA-Z0-9_+-]+):/g;
    let lastIndex = 0;
    let match;

    while ((match = emojiRegex.exec(text)) !== null) {
      // Add text before emoji
      if (match.index > lastIndex) {
        segments.push({
          type: 'text',
          content: text.substring(lastIndex, match.index)
        });
      }

      const emojiName = match[1];
      const emojiValue = this.getEmoji(emojiName);
      
      if (emojiValue) {
        segments.push({
          type: 'emoji',
          content: match[0], // Original :emoji: text
          emoji: emojiValue  // URL or Unicode
        });
      } else {
        // Keep as text if emoji not found
        segments.push({
          type: 'text',
          content: match[0]
        });
      }

      lastIndex = emojiRegex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      segments.push({
        type: 'text',
        content: text.substring(lastIndex)
      });
    }

    return segments;
  }

  /**
   * Force refresh emoji data
   */
  async refresh(): Promise<void> {
    this.fetchPromise = null;
    await this.fetchEmojis();
  }
  
  /**
   * Try to find an emoji by trying multiple name variations
   */
  findEmojiWithVariations(baseName: string): string | null {
    const data = get(emojiData);
    const variations = [
      baseName,
      baseName + '2',
      baseName + '1',
      baseName.replace('_', ''),
      baseName.replace('-', ''),
      baseName + '_ja',
      baseName + '_jp'
    ];
    
    for (const variant of variations) {
      // Check custom emojis
      if (data.custom[variant]) {
        console.log(`[EmojiService] Found emoji "${baseName}" as "${variant}"`);
        return data.custom[variant];
      }
      // Check standard emojis
      if (data.standard[variant]) {
        return data.standard[variant];
      }
    }
    
    return null;
  }
  
  /**
   * Auto-detect and suggest correct emoji names for quick reactions
   */
  private autoDetectQuickReactionEmojis(data: EmojiData): void {
    const quickReactionPatterns = [
      { base: 'kakunin', variations: ['kakuninshimasu', 'kakunin', 'kakunin_shimasu', 'kakunin-shimasu'] },
      { base: 'sasuga', variations: ['sasuga', 'sasuga2', 'sasuga1', 'sasuga_', 'sasuga-'] },
      { base: 'tsukaru', variations: ['tasukarimasu', 'tasukaru', 'tsukaru', 'tasukari', 'tasukarimasu'] },
      { base: 'otsukare', variations: ['otsukaresamadesu', 'otsukaresama', 'otsukare', 'otsukaresama_desu', 'otsukaresamadeshita'] },
      { base: 'oha', variations: ['ohayougozaimasu', 'ohayou', 'oha', 'ohayo', 'ohayou_gozaimasu'] },
      { base: 'arigataya', variations: ['arigataya', 'arigatai', 'arigata', 'arigataya_'] }
    ];
    
    console.log('[EmojiService] 🔍 Auto-detecting quick reaction emoji names...');
    const suggestions: Record<string, string> = {};
    
    for (const pattern of quickReactionPatterns) {
      let found = false;
      for (const variant of pattern.variations) {
        if (data.custom[variant]) {
          console.log(`  ✅ Found "${pattern.base}": using "${variant}"`);
          suggestions[pattern.base] = variant;
          found = true;
          break;
        }
      }
      if (!found) {
        // Try fuzzy matching
        const fuzzyMatches = Object.keys(data.custom).filter(name => 
          name.toLowerCase().includes(pattern.base.toLowerCase())
        );
        if (fuzzyMatches.length > 0) {
          console.log(`  ⚠️ Fuzzy matches for "${pattern.base}": ${fuzzyMatches.join(', ')}`);
          suggestions[pattern.base] = fuzzyMatches[0];
        } else {
          console.log(`  ❌ Not found: "${pattern.base}"`);
        }
      }
    }
    
    // Store suggestions for later use
    if (Object.keys(suggestions).length > 0) {
      console.log('[EmojiService] Suggested emoji name corrections:', suggestions);
    }
  }

  /**
   * Get all available emojis (for emoji picker)
   */
  getAllEmojis(): Array<{name: string, value: string, isCustom: boolean}> {
    const data = get(emojiData);
    const all: Array<{name: string, value: string, isCustom: boolean}> = [];
    
    // Add custom emojis
    for (const [name, url] of Object.entries(data.custom)) {
      all.push({ name, value: url, isCustom: true });
    }
    
    // Add standard emojis
    for (const [name, unicode] of Object.entries(data.standard)) {
      all.push({ name, value: unicode, isCustom: false });
    }
    
    return all;
  }

  /**
   * Search emojis by name
   */
  searchEmojis(query: string): Array<{name: string, value: string, isCustom: boolean}> {
    const lowerQuery = query.toLowerCase();
    return this.getAllEmojis().filter(emoji => 
      emoji.name.toLowerCase().includes(lowerQuery)
    );
  }
  
  /**
   * Find Japanese/custom emojis that might be useful for quick reactions
   */
  findJapaneseEmojis(): Array<{name: string, url: string}> {
    const data = get(emojiData);
    const japaneseKeywords = [
      'arigatou', 'arigato', 'arigataya',
      'kakunin', 'check',
      'sasuga', 'sugoi', 'subarashi',
      'ohayou', 'ohayo', 'oha',
      'otsukare', 'otsu',
      'tasuka', 'tsuka', 'help',
      'naruhodo', 'naru',
      'yoroshiku', 'yoro',
      'ganbatte', 'ganba', 'ganbaru',
      'ii', 'good', 'ok',
      'hai', 'yes',
      'wakarimashita', 'wakari', 'wakatta',
      'doumo', 'domo',
      'sumimasen', 'sumi',
      'gomennasai', 'gomen'
    ];
    
    const found: Array<{name: string, url: string}> = [];
    const seen = new Set<string>();
    
    for (const [name, url] of Object.entries(data.custom)) {
      const lowerName = name.toLowerCase();
      for (const keyword of japaneseKeywords) {
        if (lowerName.includes(keyword) && !seen.has(name)) {
          found.push({ name, url });
          seen.add(name);
          break;
        }
      }
    }
    
    // Sort by name length (shorter names first)
    found.sort((a, b) => a.name.length - b.name.length);
    
    return found;
  }
}

// Export singleton instance
export const emojiService = EmojiService.getInstance();