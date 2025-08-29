<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getKeyboardService, isKeyboardServiceReady, onKeyboardServiceReady } from '../services/keyboardService';
  import { showInfo, showSuccess, showError } from '../stores/toast';
  
  let testResults: Array<{
    test: string;
    status: 'pending' | 'passed' | 'failed';
    details?: string;
  }> = [
    { test: 'Keyboard Service Initialization', status: 'pending' },
    { test: 'Alt+Enter Handler Registration', status: 'pending' },
    { test: 'Handler Response Time', status: 'pending' },
    { test: 'Focus Management', status: 'pending' }
  ];
  
  let testContainer: HTMLDivElement;
  let isRunning = false;
  
  onMount(() => {
    runTests();
  });
  
  async function runTests() {
    if (isRunning) return;
    isRunning = true;
    
    showInfo('Running keyboard tests', 'Testing Alt+Enter functionality and timing...');
    
    // Test 1: Keyboard Service Initialization
    const serviceReady = isKeyboardServiceReady();
    updateTestResult(0, serviceReady ? 'passed' : 'failed', 
      serviceReady ? 'Service initialized' : 'Service not ready');
    
    if (!serviceReady) {
      // Wait for service to be ready
      await new Promise<void>((resolve) => {
        onKeyboardServiceReady(() => {
          updateTestResult(0, 'passed', 'Service became ready');
          resolve();
        });
      });
    }
    
    // Test 2: Alt+Enter Handler Registration  
    const service = getKeyboardService();
    if (service) {
      const status = service.getHandlerStatus();
      const hasOpenUrls = status.keys.includes('openUrls');
      updateTestResult(1, hasOpenUrls ? 'passed' : 'failed',
        hasOpenUrls ? `Handler registered (${status.count} total)` : 'openUrls handler missing');
    } else {
      updateTestResult(1, 'failed', 'No keyboard service found');
    }
    
    // Test 3: Handler Response Time
    const startTime = performance.now();
    let responseReceived = false;
    
    // Register a temporary test handler
    if (service) {
      service.registerHandler('openUrls' as any, {
        action: () => {
          const endTime = performance.now();
          const responseTime = endTime - startTime;
          responseReceived = true;
          updateTestResult(2, responseTime < 50 ? 'passed' : 'failed',
            `Response time: ${responseTime.toFixed(1)}ms`);
        },
        allowInInput: false
      });
      
      // Simulate Alt+Enter keypress
      setTimeout(() => {
        const testEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          altKey: true,
          bubbles: true,
          cancelable: true
        });
        
        if (testContainer) {
          testContainer.focus();
          document.dispatchEvent(testEvent);
        }
        
        // Check if response was received
        setTimeout(() => {
          if (!responseReceived) {
            updateTestResult(2, 'failed', 'No response to Alt+Enter');
          }
        }, 100);
      }, 50);
    }
    
    // Test 4: Focus Management
    setTimeout(() => {
      const activeElement = document.activeElement;
      const hasFocus = activeElement === testContainer || testContainer.contains(activeElement);
      updateTestResult(3, hasFocus ? 'passed' : 'failed',
        hasFocus ? 'Focus properly managed' : 'Focus management issue');
      
      // Complete testing
      setTimeout(() => {
        isRunning = false;
        const passedTests = testResults.filter(t => t.status === 'passed').length;
        const totalTests = testResults.length;
        
        if (passedTests === totalTests) {
          showSuccess('All tests passed!', `${passedTests}/${totalTests} keyboard tests successful`);
        } else {
          showError('Some tests failed', `${passedTests}/${totalTests} tests passed. Check the details.`);
        }
      }, 500);
    }, 1000);
  }
  
  function updateTestResult(index: number, status: 'passed' | 'failed', details?: string) {
    testResults[index] = { ...testResults[index], status, details };
    testResults = [...testResults]; // Trigger reactivity
  }
  
  function resetTests() {
    testResults = testResults.map(t => ({ ...t, status: 'pending' as const, details: undefined }));
    runTests();
  }
</script>

<div class="keyboard-test" bind:this={testContainer} tabindex="0">
  <div class="test-header">
    <h3>Keyboard Functionality Test</h3>
    <button class="btn-reset" on:click={resetTests} disabled={isRunning}>
      {isRunning ? 'Testing...' : 'Run Tests'}
    </button>
  </div>
  
  <div class="test-results">
    {#each testResults as result, index}
      <div class="test-item" class:passed={result.status === 'passed'} class:failed={result.status === 'failed'}>
        <div class="test-status">
          {#if result.status === 'pending'}
            <span class="status-icon pending">⏳</span>
          {:else if result.status === 'passed'}
            <span class="status-icon passed">✅</span>
          {:else}
            <span class="status-icon failed">❌</span>
          {/if}
        </div>
        <div class="test-info">
          <div class="test-name">{result.test}</div>
          {#if result.details}
            <div class="test-details">{result.details}</div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
  
  <div class="test-instructions">
    <p><strong>Manual Test:</strong> Focus this test area and press <kbd>Alt</kbd> + <kbd>Enter</kbd> to verify the handler responds quickly.</p>
  </div>
</div>

<style>
  .keyboard-test {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    margin: 1rem 0;
    outline: none;
  }
  
  .keyboard-test:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px var(--primary-bg);
  }
  
  .test-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }
  
  .test-header h3 {
    margin: 0;
    color: var(--text-primary);
  }
  
  .btn-reset {
    padding: 0.5rem 1rem;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }
  
  .btn-reset:disabled {
    background: var(--text-secondary);
    cursor: not-allowed;
  }
  
  .btn-reset:hover:not(:disabled) {
    background: var(--primary-hover);
  }
  
  .test-results {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .test-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    transition: all 0.2s;
  }
  
  .test-item.passed {
    border-color: var(--success);
    background: var(--success-bg);
  }
  
  .test-item.failed {
    border-color: var(--error);
    background: var(--error-bg);
  }
  
  .test-status {
    flex-shrink: 0;
  }
  
  .status-icon {
    font-size: 1.2rem;
    display: inline-block;
  }
  
  .test-info {
    flex: 1;
  }
  
  .test-name {
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
  }
  
  .test-details {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }
  
  .test-instructions {
    margin-top: 1rem;
    padding: 0.75rem;
    background: var(--bg-hover);
    border-radius: 4px;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }
  
  .test-instructions kbd {
    padding: 0.125rem 0.375rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-family: monospace;
    font-size: 0.75rem;
    color: var(--text-primary);
  }

  /* Add CSS variables if not already defined */
  :root {
    --success: #10b981;
    --success-bg: #ecfdf5;
    --error: #ef4444;
    --error-bg: #fef2f2;
  }

  /* Dark theme adjustments */
  @media (prefers-color-scheme: dark) {
    :root {
      --success-bg: #064e3b;
      --error-bg: #450a0a;
    }
  }
</style>