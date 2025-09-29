<script lang="ts">
  import { realtimeStore } from '../stores/realtime';
  
  const intervalOptions = [
    { value: 1, label: '1 second' },
    { value: 5, label: '5 seconds' },
    { value: 10, label: '10 seconds' },
    { value: 15, label: '15 seconds' },
    { value: 30, label: '30 seconds' },
    { value: 60, label: '1 minute' },
    { value: 120, label: '2 minutes' },
    { value: 300, label: '5 minutes' }
  ];
</script>

<div class="setting-group">
  <h3>Realtime Mode Settings</h3>
  <p class="help-text">
    Configure automatic updates for multi-channel monitoring
  </p>
  
  <div class="setting-row">
    <label>
      Update Interval:
      <select 
        value={$realtimeStore.updateInterval}
        on:change={(e) => realtimeStore.setUpdateInterval(Number(e.target.value))}
      >
        {#each intervalOptions as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </label>
  </div>
  
  <div class="setting-row">
    <label class="checkbox-label">
      <input
        type="checkbox"
        checked={$realtimeStore.autoScroll}
        on:change={() => realtimeStore.toggleAutoScroll()}
      />
      Auto-scroll to new messages
    </label>
    <p class="help-text">
      Automatically scroll to the top when new messages arrive
    </p>
  </div>
  
  <div class="setting-row">
    <label class="checkbox-label">
      <input
        type="checkbox"
        checked={$realtimeStore.showNotifications}
        on:change={() => realtimeStore.toggleNotifications()}
      />
      Desktop notifications
    </label>
    <p class="help-text">
      Show desktop notifications when new messages are found
    </p>
  </div>
  
  {#if $realtimeStore.showNotifications && 'Notification' in window && Notification.permission === 'default'}
    <div class="notification-prompt">
      <button 
        class="btn-primary"
        on:click={() => Notification.requestPermission()}
      >
        Enable Notifications
      </button>
      <p class="help-text">
        Click to enable browser notifications
      </p>
    </div>
  {/if}
</div>

<style>
  .setting-group {
    margin-bottom: 2rem;
  }
  
  .setting-group h3 {
    margin-bottom: 0.5rem;
    color: var(--text-primary);
    font-size: 1.1rem;
  }
  
  .setting-row {
    margin: 1rem 0;
  }
  
  .setting-row label {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    color: var(--text-secondary);
  }
  
  .checkbox-label {
    flex-direction: row !important;
    align-items: center;
    cursor: pointer;
  }
  
  .checkbox-label input[type="checkbox"] {
    margin-right: 0.5rem;
  }
  
  select {
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
  }
  
  .help-text {
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin-top: 0.25rem;
  }
  
  .notification-prompt {
    margin-top: 1rem;
    padding: 1rem;
    background: var(--primary-bg);
    border: 1px solid var(--primary);
    border-radius: 4px;
  }
  
  .btn-primary {
    padding: 0.5rem 1rem;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: background 0.2s;
  }
  
  .btn-primary:hover {
    background: var(--primary-hover);
  }
</style>