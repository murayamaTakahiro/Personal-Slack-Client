<script lang="ts">
  import { settings, toggleDMChannels, toggleHighlightNewSearchResults } from '../stores/settings';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  // Get current state of DM channels feature
  $: dmChannelsEnabled = $settings.experimentalFeatures?.dmChannelsEnabled || false;

  // Get current state of highlight new search results feature
  $: highlightNewSearchResultsEnabled = $settings.experimentalFeatures?.highlightNewSearchResults || false;

  async function handleDMChannelsToggle() {
    toggleDMChannels(!dmChannelsEnabled);
    // Dispatch event to reload channels
    dispatch('channelsNeedReload');
  }

  function handleHighlightNewSearchResultsToggle() {
    toggleHighlightNewSearchResults(!highlightNewSearchResultsEnabled);
  }
</script>

<div class="experimental-settings">
  <h3>Experimental Features</h3>
  <div class="warning-banner">
    <span class="warning-icon">⚠️</span>
    <div>
      <p><strong>Warning:</strong> These features are experimental and may not work as expected.</p>
      <p>Use with caution and report any issues you encounter.</p>
    </div>
  </div>

  <div class="feature-list">
    <div class="feature-item">
      <div class="feature-header">
        <label class="feature-toggle">
          <input
            type="checkbox"
            checked={dmChannelsEnabled}
            on:change={handleDMChannelsToggle}
          />
          <span class="toggle-label">Enable DM Channels</span>
        </label>
      </div>
      <div class="feature-description">
        <p>Include Direct Message channels in the channel selector alongside regular channels.</p>
        <p class="requirements">Requirements:</p>
        <ul>
          <li>Slack token must have <code>im:read</code> permission</li>
          <li>DMs appear with "@username" format in the channel list</li>
          <li>Search works the same as regular channels</li>
        </ul>
        <p class="phase-info">
          <strong>Note:</strong> You may need to reload the app after toggling this feature
        </p>
      </div>
    </div>

    <div class="feature-item">
      <div class="feature-header">
        <label class="feature-toggle">
          <input
            type="checkbox"
            checked={highlightNewSearchResultsEnabled}
            on:change={handleHighlightNewSearchResultsToggle}
          />
          <span class="toggle-label">Highlight New Search Results</span>
        </label>
      </div>
      <div class="feature-description">
        <p>Visually highlight messages that are new since the last time you performed the same search.</p>
        <p class="requirements">How it works:</p>
        <ul>
          <li>Performs the same search query again</li>
          <li>New messages appear with a green border and "NEW" badge</li>
          <li>Search history is stored locally for 7 days</li>
          <li>Helps you quickly identify messages you haven't seen yet</li>
        </ul>
        <p class="phase-info">
          <strong>Note:</strong> This feature is independent from the search cache and uses local storage to track previously seen messages.
        </p>
      </div>
    </div>
  </div>
</div>

<style>
  .experimental-settings {
    padding: 1rem;
  }

  h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    color: var(--text-primary);
  }

  .warning-banner {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background-color: var(--warning-background, #fff3cd);
    border: 1px solid var(--warning-border, #ffc107);
    border-radius: 4px;
    margin-bottom: 1.5rem;
  }

  .warning-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .warning-banner p {
    margin: 0.25rem 0;
    color: var(--warning-text, #856404);
  }

  .feature-list {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .feature-item {
    padding: 1rem;
    background-color: var(--background-secondary);
    border-radius: 4px;
    border: 1px solid var(--border-color);
  }

  .feature-header {
    margin-bottom: 1rem;
  }

  .feature-toggle {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
  }

  .feature-toggle input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .toggle-label {
    font-weight: 500;
    color: var(--text-primary);
  }

  .feature-description {
    color: var(--text-secondary);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .feature-description p {
    margin: 0.5rem 0;
  }

  .requirements {
    font-weight: 500;
    margin-top: 0.75rem;
    margin-bottom: 0.25rem;
  }

  .feature-description ul {
    margin: 0.25rem 0 0.5rem 1.5rem;
    padding: 0;
  }

  .feature-description li {
    margin: 0.25rem 0;
  }

  .feature-description code {
    background-color: var(--code-background, #f5f5f5);
    padding: 0.125rem 0.25rem;
    border-radius: 3px;
    font-family: monospace;
    font-size: 0.875em;
  }

  .phase-info {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-color);
    font-size: 0.8125rem;
  }

  /* Dark mode support */
  :global(.dark) .warning-banner {
    background-color: #3a3a2a;
    border-color: #8b7355;
  }

  :global(.dark) .warning-banner p {
    color: #d4af37;
  }

  :global(.dark) .feature-item {
    background-color: #1e1e1e;
    border-color: #3a3a3a;
  }

  :global(.dark) .feature-description code {
    background-color: #2a2a2a;
  }
</style>