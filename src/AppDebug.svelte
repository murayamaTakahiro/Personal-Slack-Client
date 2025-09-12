<script lang="ts">
  import { onMount } from 'svelte';
  
  let status = 'Initializing...';
  let errors: string[] = [];
  
  onMount(() => {
    console.log('[AppDebug] Component mounted');
    status = 'Component mounted successfully!';
    
    // Try to import and test each store one by one
    testStores();
  });
  
  async function testStores() {
    try {
      console.log('[AppDebug] Testing savedSearches store...');
      const { savedSearchesStore } = await import('./lib/stores/savedSearches');
      console.log('[AppDebug] savedSearches store imported successfully');
      errors.push('✅ savedSearches store OK');
    } catch (error) {
      console.error('[AppDebug] Error importing savedSearches:', error);
      errors.push(`❌ savedSearches: ${error.message}`);
    }
    
    try {
      console.log('[AppDebug] Testing settings store...');
      const { settings } = await import('./lib/stores/settings');
      console.log('[AppDebug] settings store imported successfully');
      errors.push('✅ settings store OK');
    } catch (error) {
      console.error('[AppDebug] Error importing settings:', error);
      errors.push(`❌ settings: ${error.message}`);
    }
    
    try {
      console.log('[AppDebug] Testing search store...');
      const { searchResults } = await import('./lib/stores/search');
      console.log('[AppDebug] search store imported successfully');
      errors.push('✅ search store OK');
    } catch (error) {
      console.error('[AppDebug] Error importing search:', error);
      errors.push(`❌ search: ${error.message}`);
    }
    
    // Force update
    errors = errors;
  }
</script>

<div style="padding: 2rem; font-family: monospace;">
  <h1>App Debug Mode</h1>
  <p>Status: {status}</p>
  
  <h2>Store Tests:</h2>
  <ul>
    {#each errors as error}
      <li>{error}</li>
    {/each}
  </ul>
  
  <p>Check browser console for detailed logs.</p>
</div>