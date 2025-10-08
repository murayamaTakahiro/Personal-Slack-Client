import { createHighlighter, type Highlighter, type BundledLanguage, type BundledTheme, type ShikiTransformer } from 'shiki'

// シングルトンハイライター（パフォーマンス最適化）
let highlighterInstance: Highlighter | null = null

// 行番号を追加するカスタムトランスフォーマー
function createLineNumbersTransformer(): ShikiTransformer {
  return {
    name: 'line-numbers',
    line(node, line) {
      // 行番号を span 要素として追加
      node.children.unshift({
        type: 'element',
        tagName: 'span',
        properties: { class: 'line-number' },
        children: [{ type: 'text', value: String(line).padStart(3, ' ') }]
      })
    }
  }
}

// 拡張子からShiki言語名へのマッピング
const extensionToLanguage: Record<string, BundledLanguage> = {
  // プログラミング言語
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

  // スクリプト言語
  'sh': 'bash',
  'bash': 'bash',
  'ps1': 'powershell',
  'bat': 'bat',
  'cmd': 'bat',
  'gs': 'javascript',  // Google Apps Script (JavaScript互換)
  'bas': 'vb',         // BASIC
  'vb': 'vb',          // Visual Basic
  'vbs': 'vb',         // VBScript

  // マークアップ/データ
  'html': 'html',
  'xml': 'xml',
  'json': 'json',
  'yaml': 'yaml',
  'yml': 'yaml',
  'toml': 'toml',
  'md': 'markdown',
  'markdown': 'markdown',

  // スタイル
  'css': 'css',
  'scss': 'scss',
  'sass': 'sass',
  'less': 'less',

  // クエリ言語
  'sql': 'sql',
  'graphql': 'graphql',

  // 設定ファイル
  'dockerfile': 'dockerfile',
  // gitignoreはShikiバンドルに含まれていないため、plaintextとして扱う

  // その他
  'txt': 'plaintext',
  'log': 'plaintext',
}

/**
 * ハイライターを初期化（シングルトンパターン）
 */
export async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterInstance) {
    // 重複除去とplaintextの除外（plaintext以外の言語のみロード）
    const langs = Object.values(extensionToLanguage)
      .filter((v, i, a) => a.indexOf(v) === i && v !== 'plaintext')

    highlighterInstance = await createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: langs.length > 0 ? langs : ['javascript'] // 最低1つの言語が必要
    })
  }
  return highlighterInstance
}

/**
 * コードをハイライトしてHTMLを生成
 *
 * @param code - ハイライトするコード
 * @param filename - ファイル名（拡張子から言語を判定）
 * @param theme - テーマ ('dark' | 'light')
 * @param showLineNumbers - 行番号を表示するか (デフォルト: true)
 * @returns ハイライトされたHTML文字列
 */
export async function highlightCode(
  code: string,
  filename: string,
  theme: 'dark' | 'light' = 'dark',
  showLineNumbers: boolean = true
): Promise<string> {
  try {
    // ファイル拡張子から言語を判定
    const ext = filename.split('.').pop()?.toLowerCase() || 'txt'
    const lang = extensionToLanguage[ext] || 'plaintext'

    console.log(`[SyntaxHighlight] Highlighting ${filename} as ${lang} with ${theme} theme`)

    // plaintextの場合はShikiを使わずフォールバック
    if (lang === 'plaintext') {
      console.log(`[SyntaxHighlight] Using plaintext fallback for ${filename}`)
      return `<pre class="shiki-fallback"><code>${escapeHtml(code)}</code></pre>`
    }

    // ハイライター取得
    const highlighter = await getHighlighter()
    const themeName = theme === 'dark' ? 'github-dark' : 'github-light'

    // トランスフォーマーの設定
    const transformers = showLineNumbers ? [createLineNumbersTransformer()] : []

    // コードをHTML化（行番号トランスフォーマーを使用）
    return highlighter.codeToHtml(code, {
      lang,
      theme: themeName,
      transformers
    })
  } catch (error) {
    console.error('[SyntaxHighlight] Highlighting failed:', error)
    // フォールバック: エスケープされたプレーンテキスト
    return `<pre class="shiki-fallback"><code>${escapeHtml(code)}</code></pre>`
  }
}

/**
 * HTMLエスケープ（XSS対策）
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * ファイル拡張子がハイライト対応かチェック
 */
export function isHighlightSupported(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return ext in extensionToLanguage
}
