import { parseMessageWithMarkdown } from './src/lib/utils/markdownParser.js';
import { parseMessageWithEmojis } from './src/lib/utils/emojiParser.js';

// Test the exact text from the screenshot
const testText = '```code block```\n`inline display`\n> quote';

console.log('Testing text:', testText);
console.log('---');

// First parse emojis
const emojiSegments = parseMessageWithEmojis(testText);
console.log('After emoji parsing:', emojiSegments);
console.log('---');

// Then parse markdown
const markdownSegments = parseMessageWithMarkdown(emojiSegments);
console.log('After markdown parsing:', markdownSegments);
console.log('---');

// Check segment types
console.log('Segment types:');
markdownSegments.forEach((seg, i) => {
  console.log(`  ${i}: type="${seg.type}", content="${seg.content.replace(/\n/g, '\\n')}"`);
});