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
    // This is inline triple backticks, not a code block
    return null;
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

  // First, handle inline triple backticks (```content```)
  // These should be treated as inline code blocks
  const inlineTripleBacktickRegex = /```([^`]+?)```/g;
  let lastIndex = 0;
  let hasInlineTripleBackticks = false;
  let processedText = text;
  const inlineTripleSegments: {start: number, end: number, content: string}[] = [];

  // Find all inline triple backticks first
  let tripleMatch;
  while ((tripleMatch = inlineTripleBacktickRegex.exec(text)) !== null) {
    hasInlineTripleBackticks = true;
    inlineTripleSegments.push({
      start: tripleMatch.index,
      end: tripleMatch.index + tripleMatch[0].length,
      content: tripleMatch[1]
    });
  }

  // If we have inline triple backticks, process them
  if (hasInlineTripleBackticks) {
    lastIndex = 0;
    for (const segment of inlineTripleSegments) {
      // Add text before this inline code block
      if (segment.start > lastIndex) {
        const beforeText = text.substring(lastIndex, segment.start);
        if (beforeText) {
          // Process this text for single backticks
          const subSegments = processInlineCodeSingle(beforeText);
          segments.push(...subSegments);
        }
      }

      // Add the inline code block
      segments.push({
        type: 'inline-code',
        content: segment.content
      });

      lastIndex = segment.end;
    }

    // Add any remaining text
    if (lastIndex < text.length) {
      const remainingText = text.substring(lastIndex);
      if (remainingText) {
        // Process remaining text for single backticks
        const subSegments = processInlineCodeSingle(remainingText);
        segments.push(...subSegments);
      }
    }
  } else {
    // No inline triple backticks, just process single backticks
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