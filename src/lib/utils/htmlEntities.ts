/**
 * Decode HTML entities in text while maintaining safety
 * This handles common HTML entities that come from Slack API
 */

// Map of HTML entities to their decoded values
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&#x27;': "'",
  '&#x2F;': '/',
  '&#x60;': '`',
  '&nbsp;': ' ',
  '&ndash;': '–',
  '&mdash;': '—',
  '&hellip;': '…',
  '&ldquo;': '"',
  '&rdquo;': '"',
  '&lsquo;': '\u2018',
  '&rsquo;': '\u2019',
  '&copy;': '©',
  '&reg;': '®',
  '&trade;': '™',
  '&euro;': '€',
  '&pound;': '£',
  '&yen;': '¥',
  '&cent;': '¢',
  '&deg;': '°',
  '&plusmn;': '±',
  '&times;': '×',
  '&divide;': '÷',
  '&frac14;': '¼',
  '&frac12;': '½',
  '&frac34;': '¾',
};

// Regex to match numeric HTML entities
const NUMERIC_ENTITY_REGEX = /&#(\d+);/g;
const HEX_ENTITY_REGEX = /&#x([0-9a-fA-F]+);/g;

/**
 * Decode HTML entities in text
 * @param text - The text containing HTML entities
 * @returns The decoded text
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  
  let decoded = text;
  
  // Replace named entities
  for (const [entity, replacement] of Object.entries(HTML_ENTITIES)) {
    // Use global replace to handle multiple occurrences
    decoded = decoded.split(entity).join(replacement);
  }
  
  // Replace numeric entities (e.g., &#65; -> 'A')
  decoded = decoded.replace(NUMERIC_ENTITY_REGEX, (match, code) => {
    const charCode = parseInt(code, 10);
    // Only decode safe ASCII and common Unicode ranges
    if (charCode > 0 && charCode < 0x10000) {
      return String.fromCharCode(charCode);
    }
    return match; // Keep original if out of safe range
  });
  
  // Replace hex entities (e.g., &#x41; -> 'A')
  decoded = decoded.replace(HEX_ENTITY_REGEX, (match, code) => {
    const charCode = parseInt(code, 16);
    // Only decode safe ASCII and common Unicode ranges
    if (charCode > 0 && charCode < 0x10000) {
      return String.fromCharCode(charCode);
    }
    return match; // Keep original if out of safe range
  });
  
  return decoded;
}

/**
 * Check if text contains HTML entities
 * @param text - The text to check
 * @returns True if text contains HTML entities
 */
export function hasHtmlEntities(text: string): boolean {
  if (!text) return false;
  
  // Check for common named entities
  for (const entity of Object.keys(HTML_ENTITIES)) {
    if (text.includes(entity)) return true;
  }
  
  // Check for numeric entities
  if (NUMERIC_ENTITY_REGEX.test(text)) return true;
  
  // Check for hex entities
  if (HEX_ENTITY_REGEX.test(text)) return true;
  
  return false;
}

/**
 * Safely decode HTML entities for display in Slack messages
 * This function is specifically tailored for Slack message content
 * @param text - The Slack message text
 * @returns The decoded text safe for display
 */
export function decodeSlackText(text: string): string {
  if (!text) return text;
  
  // Decode HTML entities
  let decoded = decodeHtmlEntities(text);
  
  // Handle any double-encoded entities (e.g., &amp;amp; -> &)
  // Run decode again if we still have entities
  if (hasHtmlEntities(decoded)) {
    decoded = decodeHtmlEntities(decoded);
  }
  
  return decoded;
}