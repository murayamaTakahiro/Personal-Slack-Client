/**
 * Lazy-loaded syntax highlighter wrapper
 *
 * This module provides the same API as syntaxHighlight.ts but loads Shiki dynamically
 * only when needed, reducing the initial bundle size significantly.
 */

import type { BundledLanguage } from 'shiki';

// Cache for lazy-loaded module
let highlightModule: typeof import('./syntaxHighlight') | null = null;
let isLoading = false;
let loadPromise: Promise<void> | null = null;

/**
 * Lazy load the syntax highlighting module
 */
async function loadHighlighter(): Promise<void> {
  // Return existing promise if already loading
  if (isLoading && loadPromise) {
    return loadPromise;
  }

  // Return immediately if already loaded
  if (highlightModule) {
    return;
  }

  isLoading = true;
  loadPromise = (async () => {
    try {
      console.log('[LazyHighlight] Loading Shiki syntax highlighter...');
      const start = performance.now();

      // Dynamic import - only loads when first code file is previewed
      highlightModule = await import('./syntaxHighlight');

      const duration = Math.round(performance.now() - start);
      console.log(`[LazyHighlight] Shiki loaded successfully in ${duration}ms`);
    } catch (error) {
      console.error('[LazyHighlight] Failed to load syntax highlighter:', error);
      throw error;
    } finally {
      isLoading = false;
      loadPromise = null;
    }
  })();

  return loadPromise;
}

/**
 * Highlight code with lazy-loaded Shiki
 *
 * @param code - Code to highlight
 * @param filename - Filename (extension used to detect language)
 * @param theme - Theme ('dark' | 'light')
 * @param showLineNumbers - Show line numbers (default: true)
 * @returns Highlighted HTML string
 */
export async function highlightCode(
  code: string,
  filename: string,
  theme: 'dark' | 'light' = 'dark',
  showLineNumbers: boolean = true
): Promise<string> {
  try {
    // Load highlighter module on first use
    await loadHighlighter();

    if (!highlightModule) {
      throw new Error('Highlighter module failed to load');
    }

    // Delegate to the actual implementation
    return await highlightModule.highlightCode(code, filename, theme, showLineNumbers);
  } catch (error) {
    console.error('[LazyHighlight] Highlighting failed:', error);
    // Fallback: Return escaped plain text
    return `<pre class="shiki-fallback"><code>${escapeHtml(code)}</code></pre>`;
  }
}

/**
 * Check if file extension is supported for highlighting
 *
 * @param filename - Filename to check
 * @returns true if syntax highlighting is available
 */
export function isHighlightSupported(filename: string): boolean {
  // Extension to language mapping (must match syntaxHighlight.ts)
  const extensionToLanguage: Record<string, BundledLanguage> = {
    // Programming languages
    'py': 'python',
    'js': 'javascript',
    'ts': 'typescript',
    'jsx': 'jsx',
    'tsx': 'tsx',
    'rb': 'ruby',
    'rs': 'rust',
    'go': 'go',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'cs': 'csharp',
    'php': 'php',
    'swift': 'swift',
    'kt': 'kotlin',
    'scala': 'scala',

    // Script languages
    'sh': 'bash',
    'bash': 'bash',
    'ps1': 'powershell',
    'bat': 'bat',
    'cmd': 'bat',
    'gs': 'javascript',
    'bas': 'vb',
    'vb': 'vb',
    'vbs': 'vb',

    // Markup/Data
    'html': 'html',
    'xml': 'xml',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'toml': 'toml',
    'md': 'markdown',
    'markdown': 'markdown',

    // Styles
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'less': 'less',

    // Query languages
    'sql': 'sql',
    'graphql': 'graphql',

    // Config files
    'dockerfile': 'dockerfile',

    // Other
    'txt': 'plaintext',
    'log': 'plaintext',
  };

  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return ext in extensionToLanguage;
}

/**
 * HTML escape for XSS prevention
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
