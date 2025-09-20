import type { MessageSegment } from './emojiParser';

export interface MarkdownSegment {
  type: 'text' | 'emoji' | 'mention' | 'url' | 'blockquote' | 'code-block' | 'inline-code';
  content: string;
  emoji?: string; // URL or Unicode for emoji
  url?: string; // For URL segments
  userId?: string; // For mention segments
  language?: string; // For code blocks with language specification
}

/**
 * Parse markdown-style formatting in Slack messages
 * Handles blockquotes (>), code blocks (```), and inline code (`)
 */
export function parseMarkdown(segments: MessageSegment[]): MarkdownSegment[] {
  const result: MarkdownSegment[] = [];

  for (const segment of segments) {
    if (segment.type !== 'text') {
      // Pass through non-text segments unchanged
      result.push(segment as MarkdownSegment);
      continue;
    }

    // Process text segment for markdown
    const processed = processTextForMarkdown(segment.content);
    result.push(...processed);
  }

  return result;
}

function processTextForMarkdown(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  const lines = text.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Check for code block start (only if triple backticks are on their own line)
    if (line.trim().startsWith('```')) {
      const codeBlock = extractCodeBlock(lines, i);
      if (codeBlock) {
        segments.push(codeBlock);
        i = codeBlock.endIndex + 1;
        continue;
      }
    }

    // Check for blockquote
    if (line.startsWith('>')) {
      const quote = extractBlockquote(lines, i);
      segments.push(quote);
      i = quote.endIndex + 1;
      continue;
    }

    // Process inline code and regular text
    const inlineProcessed = processInlineCode(line);
    segments.push(...inlineProcessed);

    // Add newline if not last line
    if (i < lines.length - 1) {
      segments.push({ type: 'text', content: '\n' });
    }

    i++;
  }

  return segments;
}

function extractCodeBlock(lines: string[], startIndex: number): (MarkdownSegment & { endIndex: number }) | null {
  const firstLine = lines[startIndex].trim();
  if (!firstLine.startsWith('```')) {
    return null;
  }

  // Check if this is inline triple backticks (has content after closing ```)
  // e.g., ```code block``` all on one line
  if (firstLine.length > 3 && firstLine.endsWith('```') && firstLine.length > 6) {
    // This is inline triple backticks - extract content between the backticks
    const content = firstLine.slice(3, -3).trim();
    return {
      type: 'code-block',
      content,
      language: undefined,
      endIndex: startIndex  // It ends on the same line
    };
  }

  // Extract language identifier if present
  const language = firstLine.slice(3).trim() || undefined;

  // Find closing ``` (must be on its own line)
  let endIndex = -1;
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (lines[i].trim() === '```') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    // No closing found, treat as regular text
    return null;
  }

  // Extract code content (excluding the ``` lines)
  const codeLines = lines.slice(startIndex + 1, endIndex);
  const content = codeLines.join('\n');

  return {
    type: 'code-block',
    content,
    language,
    endIndex
  };
}

function extractBlockquote(lines: string[], startIndex: number): MarkdownSegment & { endIndex: number } {
  const quotedLines: string[] = [];
  let endIndex = startIndex;

  // Collect all consecutive lines that start with >
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('>')) {
      // Remove the > and optional space after it
      const content = line.replace(/^>\s?/, '');
      quotedLines.push(content);
      endIndex = i;
    } else if (line.trim() === '' && i < lines.length - 1 && lines[i + 1].startsWith('>')) {
      // Allow empty lines within blockquotes if followed by more quote lines
      quotedLines.push('');
      endIndex = i;
    } else {
      // End of blockquote
      break;
    }
  }

  return {
    type: 'blockquote',
    content: quotedLines.join('\n'),
    endIndex
  };
}

function processInlineCode(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];

  // First check for inline triple backticks ```content```
  const tripleBacktickRegex = /```([^`]+?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = tripleBacktickRegex.exec(text)) !== null) {
    // Add text before the code block
    if (match.index > lastIndex) {
      const beforeText = text.substring(lastIndex, match.index);
      if (beforeText) {
        // Process for single backticks
        const beforeSegments = processInlineCodeSingle(beforeText);
        segments.push(...beforeSegments);
      }
    }

    // Add the code block
    segments.push({
      type: 'code-block',
      content: match[1]
    });

    lastIndex = match.index + match[0].length;
  }

  // Process any remaining text
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    if (remainingText) {
      const remainingSegments = processInlineCodeSingle(remainingText);
      segments.push(...remainingSegments);
    }
  }

  // If no triple backticks were found, just process single backticks
  if (segments.length === 0) {
    return processInlineCodeSingle(text);
  }

  return segments;
}

// Helper function to process single backticks
function processInlineCodeSingle(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];

  // Regular expression to match inline code (single backticks)
  const inlineCodeRegex = /`([^`]+)`/g;

  let lastIndex = 0;
  let match;

  while ((match = inlineCodeRegex.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;
    const content = match[1];

    // Check for problematic patterns:
    // 1. If content is only spaces, skip it (likely part of spaced backticks pattern)
    // 2. If this is part of a "` `something` `" pattern, skip it

    // Check if content is only spaces
    if (content.trim().length === 0) {
      // This could be part of a spaced backticks pattern like ` ` or ` `code` `
      // Don't treat as inline code
      continue;
    }

    // Check if we're in a spaced backticks pattern: ` `code` `
    // This would manifest as the match being 'code' at index 2 in the string "` `code` `"
    // We need to check if there's a backtick-space pattern before and after
    const hasBefore = matchStart >= 2 && text.substring(matchStart - 2, matchStart) === '` ';
    const hasAfter = matchEnd + 1 < text.length && text.substring(matchEnd, matchEnd + 2) === ' `';

    if (hasBefore && hasAfter) {
      // This is the 'code' part in ` `code` `, don't treat as inline code
      continue;
    }

    // Add text before the inline code
    if (match.index > lastIndex) {
      const beforeText = text.substring(lastIndex, match.index);
      if (beforeText) {
        segments.push({ type: 'text', content: beforeText });
      }
    }

    // Add the inline code segment
    segments.push({
      type: 'inline-code',
      content: match[1] // Content without backticks
    });

    lastIndex = match.index + match[0].length;
  }

  // Add any remaining text after the last match
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    if (remainingText) {
      segments.push({ type: 'text', content: remainingText });
    }
  }

  // If no inline code was found, return the original text
  if (segments.length === 0 && text) {
    segments.push({ type: 'text', content: text });
  }

  return segments;
}

/**
 * Combines emoji parsing and markdown parsing
 */
export function parseMessageWithMarkdown(segments: MessageSegment[]): MarkdownSegment[] {
  // Apply markdown parsing to the already emoji-parsed segments
  return parseMarkdown(segments);
}