/**
 * URL extraction and classification service for Slack messages
 */

export interface ExtractedUrls {
  slackUrls: string[];
  externalUrls: string[];
}

export interface OpenUrlsResult {
  openedSlack: boolean;
  openedExternalCount: number;
  errors: string[];
}

export class UrlService {
  // Slack Archive URL pattern (including query parameters)
  private readonly SLACK_URL_PATTERN = /https:\/\/[\w-]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+(\?[^\s<>"{}|\\^`\[\]]*)?/gi;
  
  // General URL pattern
  private readonly GENERAL_URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  
  /**
   * Extract and classify URLs from message text
   */
  extractUrls(text: string): ExtractedUrls {
    if (!text) {
      return { slackUrls: [], externalUrls: [] };
    }
    
    // Extract all URLs
    const allUrls = text.match(this.GENERAL_URL_PATTERN) || [];
    
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
   * Check if URL is a Slack archive URL
   */
  isSlackArchiveUrl(url: string): boolean {
    return /^https:\/\/[\w-]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+/.test(url);
  }
  
  /**
   * Prepare URLs for opening (first Slack URL, all external URLs)
   */
  prepareUrlsForOpening(urls: ExtractedUrls): {
    slackUrl: string | null;
    externalUrls: string[];
  } {
    return {
      slackUrl: urls.slackUrls[0] || null,
      externalUrls: urls.externalUrls
    };
  }
  
  /**
   * Check if confirmation is needed for opening multiple URLs
   */
  requiresConfirmation(externalUrlCount: number): boolean {
    return externalUrlCount >= 5;
  }
  
  /**
   * Generate user-friendly message for URL opening
   */
  generateOpeningMessage(slackCount: number, externalCount: number): string {
    const parts: string[] = [];
    
    if (slackCount > 0) {
      parts.push('1 Slack link');
    }
    
    if (externalCount > 0) {
      parts.push(`${externalCount} external URL${externalCount > 1 ? 's' : ''}`);
    }
    
    if (parts.length === 0) {
      return 'No URLs to open';
    }
    
    return `Opening ${parts.join(' and ')}...`;
  }
}

// Singleton instance
export const urlService = new UrlService();