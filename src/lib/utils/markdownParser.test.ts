import { parseMessageWithMarkdown } from './markdownParser';
import type { MessageSegment } from './emojiParser';

// Test cases for markdown parser
const testCases = [
  {
    name: 'Simple inline code',
    input: [{ type: 'text', content: '`code`' } as MessageSegment],
    expectedTypes: ['inline-code'],
    expectedContents: ['code']
  },
  {
    name: 'Backticks with spaces (should be plain text)',
    input: [{ type: 'text', content: '` `code` `' } as MessageSegment],
    expectedTypes: ['text'],
    expectedContents: ['` `code` `']
  },
  {
    name: 'Inline code within text',
    input: [{ type: 'text', content: 'text `inline code` more' } as MessageSegment],
    expectedTypes: ['text', 'inline-code', 'text'],
    expectedContents: ['text ', 'inline code', ' more']
  },
  {
    name: 'Multiple spaced backticks',
    input: [{ type: 'text', content: '` ` ` `' } as MessageSegment],
    expectedTypes: ['text'],
    expectedContents: ['` ` ` `']
  },
  {
    name: 'Just spaces between backticks',
    input: [{ type: 'text', content: '`  `' } as MessageSegment],
    expectedTypes: ['text'],
    expectedContents: ['`  `']
  },
  {
    name: 'Content with spaces at edges (valid code)',
    input: [{ type: 'text', content: 'a ` b ` c' } as MessageSegment],
    expectedTypes: ['text', 'inline-code', 'text'],
    expectedContents: ['a ', ' b ', ' c']
  },
  {
    name: 'Inline triple backticks (code block)',
    input: [{ type: 'text', content: '```code block```' } as MessageSegment],
    expectedTypes: ['code-block'],
    expectedContents: ['code block']
  },
  {
    name: 'Triple backticks on separate lines',
    input: [{ type: 'text', content: '```\ncode\nblock\n```' } as MessageSegment],
    expectedTypes: ['code-block'],
    expectedContents: ['code\nblock']
  },
  {
    name: 'Single backtick inline code',
    input: [{ type: 'text', content: '`inline`' } as MessageSegment],
    expectedTypes: ['inline-code'],
    expectedContents: ['inline']
  },
  {
    name: 'Mixed inline and block code',
    input: [{ type: 'text', content: 'Here is `inline` and ```block```' } as MessageSegment],
    expectedTypes: ['text', 'inline-code', 'text', 'code-block'],
    expectedContents: ['Here is ', 'inline', ' and ', 'block']
  }
];

export function runTests() {
  console.log('Running markdown parser tests...\n');
  let passed = 0;
  let failed = 0;

  testCases.forEach(test => {
    console.log(`Test: ${test.name}`);
    console.log(`Input: "${test.input[0].content}"`);

    const result = parseMessageWithMarkdown(test.input);

    // Extract types and contents from result
    const resultTypes = result.map(s => s.type);
    const resultContents = result.map(s => s.content);

    // Check if types match
    const typesMatch = JSON.stringify(resultTypes) === JSON.stringify(test.expectedTypes);
    const contentsMatch = JSON.stringify(resultContents) === JSON.stringify(test.expectedContents);

    if (typesMatch && contentsMatch) {
      console.log('✓ PASS\n');
      passed++;
    } else {
      console.log('✗ FAIL');
      console.log('Expected types:', test.expectedTypes);
      console.log('Got types:', resultTypes);
      console.log('Expected contents:', test.expectedContents);
      console.log('Got contents:', resultContents);
      console.log();
      failed++;
    }
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Run tests if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}