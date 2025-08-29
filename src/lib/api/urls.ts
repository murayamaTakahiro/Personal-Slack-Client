import { invoke } from '@tauri-apps/api/core';

interface OpenUrlsResult {
  opened_slack: boolean;
  opened_external_count: number;
  errors: string[];
}

/**
 * Open URLs smartly - first Slack URL and all external URLs
 */
export async function openUrlsSmart(
  slackUrl: string | null,
  externalUrls: string[],
  delayMs?: number
): Promise<OpenUrlsResult> {
  try {
    const result = await invoke<OpenUrlsResult>('open_urls_smart', {
      slackUrl,
      externalUrls,
      delayMs
    });
    return result;
  } catch (error) {
    console.error('Failed to open URLs:', error);
    throw error;
  }
}