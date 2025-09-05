<script lang="ts">
  import { performanceSettings } from '../stores/performance';
  
  function handleVirtualScrollingToggle(event: Event) {
    const target = event.target as HTMLInputElement;
    performanceSettings.update(s => ({
      ...s,
      virtualScrolling: target.checked
    }));
  }
  
  function handleBatchingToggle(event: Event) {
    const target = event.target as HTMLInputElement;
    performanceSettings.update(s => ({
      ...s,
      enableBatching: target.checked
    }));
  }
  
  function handleMessageLimitChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const value = parseInt(target.value) || 1000;
    performanceSettings.update(s => ({
      ...s,
      messageLimit: Math.max(100, Math.min(5000, value))
    }));
  }
  
  function handleMetricsToggle(event: Event) {
    const target = event.target as HTMLInputElement;
    performanceSettings.update(s => ({
      ...s,
      performanceMetrics: target.checked
    }));
  }
</script>

<div class="performance-settings">
  <h3>Performance Settings</h3>
  <p class="description">Optimize the application performance for your use case</p>
  
  <div class="setting-group">
    <label class="toggle-setting">
      <div class="setting-info">
        <span class="setting-label">Virtual Scrolling</span>
        <span class="setting-description">Renders only visible messages for better performance with large result sets</span>
      </div>
      <input 
        type="checkbox" 
        checked={$performanceSettings.virtualScrolling}
        on:change={handleVirtualScrollingToggle}
        class="toggle-input"
      />
      <span class="toggle-slider"></span>
    </label>
    
    {#if $performanceSettings.virtualScrolling}
      <div class="alert alert-info">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>Virtual scrolling is experimental. If you experience issues, please disable it.</span>
      </div>
    {/if}
  </div>
  
  <div class="setting-group">
    <label class="toggle-setting">
      <div class="setting-info">
        <span class="setting-label">API Request Batching</span>
        <span class="setting-description">Batch multiple channel requests to reduce API calls</span>
      </div>
      <input 
        type="checkbox" 
        checked={$performanceSettings.enableBatching}
        on:change={handleBatchingToggle}
        class="toggle-input"
      />
      <span class="toggle-slider"></span>
    </label>
  </div>
  
  <div class="setting-group">
    <label class="number-setting">
      <div class="setting-info">
        <span class="setting-label">Message Limit</span>
        <span class="setting-description">Maximum number of messages to display (100-5000)</span>
      </div>
      <input 
        type="number" 
        min="100" 
        max="5000" 
        step="100"
        value={$performanceSettings.messageLimit}
        on:input={handleMessageLimitChange}
        class="number-input"
      />
    </label>
  </div>
  
  <div class="setting-group">
    <label class="toggle-setting">
      <div class="setting-info">
        <span class="setting-label">Performance Metrics</span>
        <span class="setting-description">Show performance metrics in the console</span>
      </div>
      <input 
        type="checkbox" 
        checked={$performanceSettings.performanceMetrics}
        on:change={handleMetricsToggle}
        class="toggle-input"
      />
      <span class="toggle-slider"></span>
    </label>
  </div>
  
  <div class="performance-tips">
    <h4>Performance Tips</h4>
    <ul>
      <li>Enable Virtual Scrolling when viewing more than 100 messages</li>
      <li>Use API Batching when searching across multiple channels</li>
      <li>Reduce Message Limit if experiencing slowdowns</li>
      <li>Disable Live/Realtime mode when not needed</li>
    </ul>
  </div>
</div>

<style>
  .performance-settings {
    padding: 1rem;
  }
  
  h3 {
    margin: 0 0 0.5rem 0;
    color: var(--text-primary);
    font-size: 1.125rem;
  }
  
  .description {
    color: var(--text-secondary);
    font-size: 0.875rem;
    margin-bottom: 1.5rem;
  }
  
  .setting-group {
    margin-bottom: 1.5rem;
  }
  
  .toggle-setting,
  .number-setting {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s;
    position: relative;
  }
  
  .toggle-setting:hover,
  .number-setting:hover {
    background: var(--bg-hover);
  }
  
  .setting-info {
    flex: 1;
    margin-right: 1rem;
  }
  
  .setting-label {
    display: block;
    color: var(--text-primary);
    font-weight: 500;
    margin-bottom: 0.25rem;
  }
  
  .setting-description {
    display: block;
    color: var(--text-secondary);
    font-size: 0.8rem;
    line-height: 1.4;
  }
  
  /* Toggle Switch Styles */
  .toggle-input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  
  .toggle-slider {
    position: relative;
    display: inline-block;
    width: 48px;
    height: 24px;
    background-color: var(--border);
    border-radius: 24px;
    transition: background-color 0.3s;
  }
  
  .toggle-slider::before {
    content: '';
    position: absolute;
    width: 18px;
    height: 18px;
    left: 3px;
    top: 3px;
    background-color: white;
    border-radius: 50%;
    transition: transform 0.3s;
  }
  
  .toggle-input:checked + .toggle-slider {
    background-color: var(--primary);
  }
  
  .toggle-input:checked + .toggle-slider::before {
    transform: translateX(24px);
  }
  
  .number-input {
    width: 100px;
    padding: 0.5rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.875rem;
    text-align: center;
  }
  
  .number-input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px var(--primary-bg);
  }
  
  .alert {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    border-radius: 6px;
    font-size: 0.8rem;
    margin-top: 0.5rem;
  }
  
  .alert-info {
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.3);
    color: rgba(59, 130, 246, 1);
  }
  
  .alert svg {
    flex-shrink: 0;
  }
  
  .performance-tips {
    margin-top: 2rem;
    padding: 1rem;
    background: var(--bg-secondary);
    border-radius: 8px;
    border: 1px solid var(--border);
  }
  
  .performance-tips h4 {
    margin: 0 0 0.75rem 0;
    color: var(--text-primary);
    font-size: 0.9rem;
  }
  
  .performance-tips ul {
    margin: 0;
    padding-left: 1.5rem;
    color: var(--text-secondary);
    font-size: 0.8rem;
    line-height: 1.6;
  }
  
  .performance-tips li {
    margin-bottom: 0.4rem;
  }
</style>