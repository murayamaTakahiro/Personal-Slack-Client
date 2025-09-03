<script lang="ts">
  import { onMount } from 'svelte';
  import { emojiData, emojiService } from '../services/emojiService';
  import { emojiSearchService } from '../services/emojiSearchService';
  
  let debugInfo = {
    dataLoaded: false,
    customCount: 0,
    standardCount: 0,
    searchResults: [],
    testQueries: []
  };
  
  onMount(() => {
    // Subscribe to emoji data
    const unsubscribe = emojiData.subscribe(data => {
      debugInfo.dataLoaded = true;
      debugInfo.customCount = Object.keys(data.custom).length;
      debugInfo.standardCount = Object.keys(data.standard).length;
      
      // Run test searches
      runTestSearches();
    });
    
    return unsubscribe;
  });
  
  function runTestSearches() {
    const queries = ['ojigi', 'man', 'bow', 'bowing', 'person_bowing', '100'];
    debugInfo.testQueries = queries.map(query => {
      const results = emojiSearchService.search(query);
      return {
        query,
        count: results.length,
        results: results.slice(0, 3).map(r => ({
          name: r.name,
          value: r.value,
          isCustom: r.isCustom,
          matchType: r.matchType
        }))
      };
    });
  }
  
  function rebuildIndex() {
    console.log('Manually rebuilding search index...');
    emojiSearchService.rebuildIndex();
    runTestSearches();
  }
</script>

<div class="emoji-debug">
  <h3>Emoji Debug Info</h3>
  
  <div class="stats">
    <p>Data Loaded: {debugInfo.dataLoaded ? 'Yes' : 'No'}</p>
    <p>Custom Emojis: {debugInfo.customCount}</p>
    <p>Standard Emojis: {debugInfo.standardCount}</p>
  </div>
  
  <button on:click={rebuildIndex}>Rebuild Search Index</button>
  
  <div class="test-results">
    <h4>Test Search Results:</h4>
    {#each debugInfo.testQueries as test}
      <div class="test-query">
        <strong>"{test.query}"</strong> - {test.count} results
        {#if test.results.length > 0}
          <ul>
            {#each test.results as result}
              <li>
                {result.name} 
                ({result.isCustom ? 'custom' : result.value}) 
                - {result.matchType}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .emoji-debug {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: white;
    border: 2px solid #333;
    border-radius: 8px;
    padding: 15px;
    max-width: 400px;
    max-height: 500px;
    overflow-y: auto;
    z-index: 9999;
    font-size: 12px;
    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
  }
  
  .stats {
    background: #f0f0f0;
    padding: 10px;
    border-radius: 4px;
    margin-bottom: 10px;
  }
  
  .stats p {
    margin: 5px 0;
  }
  
  button {
    background: #007bff;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    margin-bottom: 10px;
  }
  
  button:hover {
    background: #0056b3;
  }
  
  .test-results {
    background: #f9f9f9;
    padding: 10px;
    border-radius: 4px;
  }
  
  .test-query {
    margin-bottom: 10px;
    padding: 5px;
    background: white;
    border-radius: 4px;
  }
  
  ul {
    margin: 5px 0 0 20px;
    padding: 0;
  }
  
  li {
    margin: 2px 0;
  }
  
  h3, h4 {
    margin: 0 0 10px 0;
  }
</style>