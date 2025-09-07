#!/usr/bin/env node

/**
 * Performance test script for Slack Client
 * Tests the optimized search with 400+ messages
 */

const { invoke } = require('@tauri-apps/api/core');

// Test configurations
const TEST_CONFIGS = [
  {
    name: 'Small search (10 messages)',
    params: {
      query: 'test',
      limit: 10
    }
  },
  {
    name: 'Medium search (100 messages)',
    params: {
      query: '',
      channel: 'general',
      limit: 100
    }
  },
  {
    name: 'Large search (400 messages)',
    params: {
      query: '',
      channel: 'general,random,engineering,design',
      limit: 400
    }
  },
  {
    name: 'Mega search (1000 messages)',
    params: {
      query: '',
      limit: 1000
    }
  }
];

async function runPerformanceTest(config) {
  console.log(`\n🧪 Testing: ${config.name}`);
  console.log('Parameters:', config.params);
  
  const startTime = Date.now();
  
  try {
    // Test with fast search
    const fastStart = Date.now();
    const fastResult = await invoke('search_messages_fast', {
      query: config.params.query || '',
      channel: config.params.channel,
      user: config.params.user,
      fromDate: config.params.fromDate,
      toDate: config.params.toDate,
      limit: config.params.limit,
      forceRefresh: false
    });
    const fastTime = Date.now() - fastStart;
    
    console.log(`✅ Fast search: ${fastResult.messages.length} messages in ${fastTime}ms`);
    console.log(`   Average: ${Math.round(fastTime / fastResult.messages.length)}ms per message`);
    
    // Test reaction loading
    if (fastResult.messages.length > 0) {
      const reactionStart = Date.now();
      const messagesNeedingReactions = fastResult.messages.filter(m => !m.reactions);
      
      if (messagesNeedingReactions.length > 0) {
        const requests = messagesNeedingReactions.map((msg, idx) => ({
          channel_id: msg.channel,
          timestamp: msg.ts,
          message_index: idx
        }));
        
        // Batch fetch reactions
        const reactionResult = await invoke('batch_fetch_reactions', {
          requests: requests.slice(0, 50), // Test first 50
          batchSize: 30
        });
        
        const reactionTime = Date.now() - reactionStart;
        console.log(`   Reactions: ${reactionResult.fetched_count} loaded in ${reactionTime}ms`);
      }
    }
    
    // Compare with standard search (optional)
    if (config.params.limit <= 100) {
      const standardStart = Date.now();
      const standardResult = await invoke('search_messages', {
        query: config.params.query || '',
        channel: config.params.channel,
        user: config.params.user,
        fromDate: config.params.fromDate,
        toDate: config.params.toDate,
        limit: config.params.limit,
        forceRefresh: false
      });
      const standardTime = Date.now() - standardStart;
      
      console.log(`📊 Standard search: ${standardResult.messages.length} messages in ${standardTime}ms`);
      console.log(`   Speed improvement: ${Math.round(((standardTime - fastTime) / standardTime) * 100)}%`);
    }
    
    const totalTime = Date.now() - startTime;
    console.log(`⏱️ Total test time: ${totalTime}ms`);
    
    // Performance rating
    const avgTime = fastTime / fastResult.messages.length;
    let rating = '⭐⭐⭐⭐⭐';
    if (avgTime > 50) rating = '⭐';
    else if (avgTime > 25) rating = '⭐⭐';
    else if (avgTime > 10) rating = '⭐⭐⭐';
    else if (avgTime > 5) rating = '⭐⭐⭐⭐';
    
    console.log(`🏆 Performance rating: ${rating}`);
    
    return {
      config: config.name,
      messages: fastResult.messages.length,
      time: fastTime,
      avgPerMessage: Math.round(avgTime)
    };
    
  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    return null;
  }
}

async function runAllTests() {
  console.log('='.repeat(60));
  console.log('🚀 SLACK CLIENT PERFORMANCE TEST SUITE');
  console.log('='.repeat(60));
  
  const results = [];
  
  for (const config of TEST_CONFIGS) {
    const result = await runPerformanceTest(config);
    if (result) {
      results.push(result);
    }
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📈 PERFORMANCE SUMMARY');
  console.log('='.repeat(60));
  
  console.table(results);
  
  // Calculate average performance
  const avgPerformance = results.reduce((sum, r) => sum + r.avgPerMessage, 0) / results.length;
  console.log(`\n🎯 Average performance: ${Math.round(avgPerformance)}ms per message`);
  
  if (avgPerformance < 10) {
    console.log('✨ EXCELLENT PERFORMANCE! Target achieved for 400+ messages.');
  } else if (avgPerformance < 25) {
    console.log('👍 Good performance. Minor optimizations may help.');
  } else {
    console.log('⚠️ Performance needs improvement for large message sets.');
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  console.log('Note: This script should be run from within the Tauri app context.');
  console.log('To test, integrate this into your Svelte app or use Tauri\'s invoke from the frontend.');
}

// Export for use in frontend
module.exports = { runPerformanceTest, runAllTests };