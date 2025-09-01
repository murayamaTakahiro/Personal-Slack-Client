/**
 * Test file for HTML entity decoder
 * Run these tests to verify the decoder works correctly
 */

import { decodeHtmlEntities, hasHtmlEntities, decodeSlackText } from './htmlEntities';

// Test cases for the HTML entity decoder
const testCases = [
  {
    name: 'Basic ampersand',
    input: 'This &amp; that',
    expected: 'This & that'
  },
  {
    name: 'Less than and greater than',
    input: '&lt;div&gt; tag',
    expected: '<div> tag'
  },
  {
    name: 'Quotes',
    input: '&quot;Hello&quot; and &#39;World&#39;',
    expected: '"Hello" and \'World\''
  },
  {
    name: 'Multiple entities',
    input: 'Q&amp;A: &quot;What&apos;s 2&lt;3?&quot;',
    expected: 'Q&A: "What\'s 2<3?"'
  },
  {
    name: 'Numeric entities',
    input: '&#65; &#66; &#67;',
    expected: 'A B C'
  },
  {
    name: 'Hex entities',
    input: '&#x41; &#x42; &#x43;',
    expected: 'A B C'
  },
  {
    name: 'Special characters',
    input: '&copy; &reg; &trade; &euro;',
    expected: '© ® ™ €'
  },
  {
    name: 'Double encoded entities',
    input: '&amp;amp; &amp;lt; &amp;gt;',
    expected: '& < >'
  },
  {
    name: 'Mixed content',
    input: 'Code: `const x = 5 &amp;&amp; y &lt; 10`',
    expected: 'Code: `const x = 5 && y < 10`'
  },
  {
    name: 'URL with parameters',
    input: 'https://example.com?foo=bar&amp;baz=qux',
    expected: 'https://example.com?foo=bar&baz=qux'
  },
  {
    name: 'Slack user mention',
    input: '@john.doe mentioned &quot;Q&amp;A session&quot;',
    expected: '@john.doe mentioned "Q&A session"'
  },
  {
    name: 'No entities',
    input: 'Just plain text with & < > " symbols',
    expected: 'Just plain text with & < > " symbols'
  },
  {
    name: 'Empty string',
    input: '',
    expected: ''
  },
  {
    name: 'Null/undefined handling',
    input: null as any,
    expected: null
  }
];

// Test hasHtmlEntities function
const entityDetectionTests = [
  { input: 'This &amp; that', expected: true },
  { input: 'No entities here', expected: false },
  { input: '&#65; numeric', expected: true },
  { input: '&#x41; hex', expected: true },
  { input: '', expected: false },
  { input: null as any, expected: false }
];

// Run tests
export function runTests() {
  console.log('Running HTML Entity Decoder Tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test decodeHtmlEntities
  console.log('Testing decodeHtmlEntities:');
  for (const test of testCases) {
    const result = decodeHtmlEntities(test.input);
    const success = result === test.expected;
    
    if (success) {
      console.log(`✓ ${test.name}`);
      passed++;
    } else {
      console.log(`✗ ${test.name}`);
      console.log(`  Input:    "${test.input}"`);
      console.log(`  Expected: "${test.expected}"`);
      console.log(`  Got:      "${result}"`);
      failed++;
    }
  }
  
  // Test hasHtmlEntities
  console.log('\nTesting hasHtmlEntities:');
  for (const test of entityDetectionTests) {
    const result = hasHtmlEntities(test.input);
    const success = result === test.expected;
    
    if (success) {
      console.log(`✓ "${test.input}" → ${test.expected}`);
      passed++;
    } else {
      console.log(`✗ "${test.input}" → expected ${test.expected}, got ${result}`);
      failed++;
    }
  }
  
  // Test decodeSlackText (which handles double encoding)
  console.log('\nTesting decodeSlackText:');
  const doubleEncodedTests = [
    {
      name: 'Double encoded ampersand',
      input: '&amp;amp;',
      expected: '&'
    },
    {
      name: 'Triple encoded (stops at double)',
      input: '&amp;amp;amp;',
      expected: '&amp;'
    }
  ];
  
  for (const test of doubleEncodedTests) {
    const result = decodeSlackText(test.input);
    const success = result === test.expected;
    
    if (success) {
      console.log(`✓ ${test.name}`);
      passed++;
    } else {
      console.log(`✗ ${test.name}`);
      console.log(`  Input:    "${test.input}"`);
      console.log(`  Expected: "${test.expected}"`);
      console.log(`  Got:      "${result}"`);
      failed++;
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));
  
  return { passed, failed };
}

// Example usage in browser console:
// import('./htmlEntities.test').then(m => m.runTests())