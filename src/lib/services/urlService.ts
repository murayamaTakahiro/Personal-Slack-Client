/**
 * URL Service - Handles URL extraction and classification from Slack messages
 * 
 * This service extracts URLs from text and classifies them as Slack archive URLs
 * or external URLs for appropriate handling.
 */

export interface ExtractedUrls {
  slackUrls: string[];
  externalUrls: string[];
}

export interface UrlOpeningResult {
  openedSlack: boolean;
  openedExternalCount: number;
  errors: string[];
}

export class UrlService {
  // Slack Archive URL pattern (supports query parameters)
  private static readonly SLACK_URL_PATTERN = /https:\/\/[\w-]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+(\?[^\s<>"{}|\\^`\[\]]*)?/gi;
  
  // General URL pattern
  private static readonly GENERAL_URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  
  // Maximum external URLs to open without confirmation
  private static readonly MAX_EXTERNAL_URLS_THRESHOLD = 5;
  
  /**
   * Extract all URLs from text and classify them
   * @param text - The text to extract URLs from
   * @returns Object containing arrays of Slack and external URLs
   */
  extractUrls(text: string): ExtractedUrls {
    if (!text || typeof text !== 'string') {
      return { slackUrls: [], externalUrls: [] };
    }
    
    // Extract all URLs first
    const allUrls = this.extractAllUrls(text);
    
    // Classify URLs
    const slackUrls: string[] = [];
    const externalUrls: string[] = [];
    
    for (const url of allUrls) {
      if (this.isSlackArchiveUrl(url)) {
        slackUrls.push(url);
      } else {
        externalUrls.push(url);
      }
    }
    
    return { slackUrls, externalUrls };
  }
  
  /**
   * Check if a URL is a Slack archive URL
   * @param url - The URL to check
   * @returns True if it's a Slack archive URL
   */
  isSlackArchiveUrl(url: string): boolean {
    if (!url || typeof url !== 'string') {
      return false;
    }
    
    // Reset regex lastIndex to ensure consistent behavior
    const pattern = new RegExp(UrlService.SLACK_URL_PATTERN.source, 'i');
    return pattern.test(url);
  }
  
  /**
   * Extract all URLs from text using the general pattern
   * @param text - The text to extract URLs from
   * @returns Array of unique URLs
   */
  private extractAllUrls(text: string): string[] {
    const urlPattern = new RegExp(UrlService.GENERAL_URL_PATTERN.source, 'gi');
    const matches = text.match(urlPattern) || [];
    
    // Remove duplicates
    return [...new Set(matches)];
  }
  
  /**
   * Prepare URLs for opening (first Slack URL only, all external URLs)
   * @param extractedUrls - The extracted URLs object
   * @returns Object with URLs ready for opening
   */
  prepareUrlsForOpening(extractedUrls: ExtractedUrls): {
    slackUrl: string | null;
    externalUrls: string[];
  } {
    return {
      slackUrl: extractedUrls.slackUrls.length > 0 ? extractedUrls.slackUrls[0] : null,
      externalUrls: extractedUrls.externalUrls
    };
  }
  
  /**
   * Check if the number of external URLs requires user confirmation
   * @param externalUrlCount - Number of external URLs to open
   * @returns True if confirmation is needed
   */
  requiresConfirmation(externalUrlCount: number): boolean {
    return externalUrlCount > UrlService.MAX_EXTERNAL_URLS_THRESHOLD;
  }
  
  /**
   * Generate user-friendly message about URLs to be opened
   * @param slackUrlCount - Number of Slack URLs found (only first will be opened)
   * @param externalUrlCount - Number of external URLs to open
   * @returns Descriptive message
   */
  generateOpeningMessage(slackUrlCount: number, externalUrlCount: number): string {
    const parts: string[] = [];
    
    if (slackUrlCount > 0) {
      parts.push(`1 Slack link${slackUrlCount > 1 ? ` (${slackUrlCount} found, opening first)` : ''}`);
    }
    
    if (externalUrlCount > 0) {
      parts.push(`${externalUrlCount} external URL${externalUrlCount !== 1 ? 's' : ''}`);
    }
    
    if (parts.length === 0) {
      return 'No URLs found in message';
    }
    
    return `Opening ${parts.join(' and ')}...`;
  }
}

// Singleton instance
export const urlService = new UrlService();