/**
 * Local placeholder image generator using SVG Data URLs
 * Replaces external placeholder services to avoid network dependencies
 */

interface PlaceholderOptions {
  width?: number;
  height?: number;
  text?: string;
  backgroundColor?: string;
  textColor?: string;
  format?: 'svg' | 'dataurl';
}

/**
 * Generate a local placeholder image as a Data URL
 */
export function generatePlaceholder(options: PlaceholderOptions = {}): string {
  const {
    width = 360,
    height = 360,
    text = 'Image',
    backgroundColor = '#4a5568',
    textColor = '#ffffff',
    format = 'dataurl'
  } = options;

  // Calculate font size based on dimensions
  const fontSize = Math.min(width, height) / 8;
  
  // Create SVG content
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="${backgroundColor}"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" 
            font-family="system-ui, -apple-system, sans-serif" 
            font-size="${fontSize}" 
            font-weight="500" 
            fill="${textColor}">
        ${escapeXml(text)}
      </text>
    </svg>
  `.trim();

  if (format === 'svg') {
    return svg;
  }

  // Convert to Data URL
  const encoded = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${encoded}`;
}

/**
 * Generate a placeholder for specific file types
 */
export function generateFilePlaceholder(
  fileType: 'image' | 'pdf' | 'video' | 'audio' | 'document' | 'code' | 'default',
  size: number = 360
): string {
  const configs: Record<typeof fileType, { text: string; bg: string; fg: string }> = {
    image: { text: '🖼️', bg: '#4a90e2', fg: '#ffffff' },
    pdf: { text: '📄 PDF', bg: '#dc3545', fg: '#ffffff' },
    video: { text: '🎥', bg: '#6f42c1', fg: '#ffffff' },
    audio: { text: '🎵', bg: '#20c997', fg: '#ffffff' },
    document: { text: '📃', bg: '#fd7e14', fg: '#ffffff' },
    code: { text: '</>', bg: '#28a745', fg: '#ffffff' },
    default: { text: '📎', bg: '#6c757d', fg: '#ffffff' }
  };

  const config = configs[fileType] || configs.default;
  
  return generatePlaceholder({
    width: size,
    height: size,
    text: config.text,
    backgroundColor: config.bg,
    textColor: config.fg
  });
}

/**
 * Generate a thumbnail placeholder with specific dimensions
 */
export function generateThumbnailPlaceholder(
  width: number,
  height: number,
  label?: string
): string {
  return generatePlaceholder({
    width,
    height,
    text: label || `${width}×${height}`,
    backgroundColor: '#718096',
    textColor: '#e2e8f0'
  });
}

/**
 * Generate an error placeholder image
 */
export function generateErrorPlaceholder(size: number = 360): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" fill="#fee2e2"/>
      <g transform="translate(${size/2}, ${size/2})">
        <circle r="${size/6}" fill="none" stroke="#dc2626" stroke-width="3"/>
        <line x1="${-size/12}" y1="${-size/12}" x2="${size/12}" y2="${size/12}" 
              stroke="#dc2626" stroke-width="3" stroke-linecap="round"/>
        <line x1="${size/12}" y1="${-size/12}" x2="${-size/12}" y2="${size/12}" 
              stroke="#dc2626" stroke-width="3" stroke-linecap="round"/>
      </g>
      <text x="50%" y="${size * 0.75}" text-anchor="middle" 
            font-family="system-ui" font-size="${size/20}" fill="#991b1b">
        Failed to load
      </text>
    </svg>
  `.trim();

  const encoded = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${encoded}`;
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  const xmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
  };
  
  return text.replace(/[&<>"']/g, char => xmlEscapes[char] || char);
}

/**
 * Check if a URL is an external placeholder service
 */
export function isExternalPlaceholder(url: string): boolean {
  const placeholderDomains = [
    'via.placeholder.com',
    'placeholder.com',
    'placehold.it',
    'placekitten.com',
    'loremflickr.com',
    'picsum.photos',
    'dummyimage.com'
  ];
  
  try {
    const urlObj = new URL(url);
    return placeholderDomains.some(domain => urlObj.hostname.includes(domain));
  } catch {
    return false;
  }
}

/**
 * Replace external placeholder URLs with local placeholders
 */
export function replaceExternalPlaceholder(url: string, fileType?: string): string {
  if (!isExternalPlaceholder(url)) {
    return url;
  }

  // Try to extract dimensions from URL
  const sizeMatch = url.match(/(\d+)x(\d+)/);
  if (sizeMatch) {
    const [, width, height] = sizeMatch;
    return generateThumbnailPlaceholder(parseInt(width), parseInt(height));
  }

  // Try to extract single dimension
  const singleSizeMatch = url.match(/\/(\d+)\//);
  if (singleSizeMatch) {
    const size = parseInt(singleSizeMatch[1]);
    return generateThumbnailPlaceholder(size, size);
  }

  // Default placeholder based on file type
  if (fileType) {
    const type = fileType.toLowerCase();
    if (type.includes('pdf')) return generateFilePlaceholder('pdf');
    if (type.includes('video')) return generateFilePlaceholder('video');
    if (type.includes('audio')) return generateFilePlaceholder('audio');
    if (type.includes('code') || type.includes('javascript')) return generateFilePlaceholder('code');
    if (type.includes('image') || type.includes('png') || type.includes('jpg')) {
      return generateFilePlaceholder('image');
    }
  }

  return generateFilePlaceholder('default');
}