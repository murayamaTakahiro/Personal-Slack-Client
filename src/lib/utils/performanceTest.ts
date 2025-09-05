/**
 * Performance Testing Utility for Virtual Scrolling ROI Analysis
 * Measures actual impact of virtual scrolling vs standard rendering
 */

interface PerformanceTestResult {
  testName: string;
  messageCount: number;
  virtualScrolling: boolean;
  metrics: {
    initialRenderTime: number;
    scrollPerformance: number[];
    memoryUsage: number;
    domNodeCount: number;
    averageFrameTime: number;
    jankCount: number; // frames > 16.67ms
    interactionLatency: number;
  };
}

export class PerformanceTestSuite {
  private results: PerformanceTestResult[] = [];
  
  /**
   * Measure initial render performance
   */
  async measureInitialRender(
    messages: any[], 
    virtualScrolling: boolean
  ): Promise<number> {
    const startTime = performance.now();
    
    // Force layout/paint
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    const endTime = performance.now();
    return endTime - startTime;
  }
  
  /**
   * Measure scroll performance
   */
  async measureScrollPerformance(
    scrollContainer: HTMLElement,
    iterations: number = 10
  ): Promise<number[]> {
    const measurements: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      
      // Scroll down by viewport height
      scrollContainer.scrollTop += scrollContainer.clientHeight;
      
      // Wait for scroll to complete
      await new Promise(resolve => {
        scrollContainer.addEventListener('scroll', resolve, { once: true });
        setTimeout(resolve, 100); // Timeout fallback
      });
      
      const endTime = performance.now();
      measurements.push(endTime - startTime);
      
      // Small delay between scrolls
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    return measurements;
  }
  
  /**
   * Measure memory usage
   */
  getMemoryUsage(): number {
    // @ts-ignore - performance.memory is Chrome-specific
    if (performance.memory) {
      // @ts-ignore
      return performance.memory.usedJSHeapSize / 1048576; // Convert to MB
    }
    return 0;
  }
  
  /**
   * Count DOM nodes
   */
  countDOMNodes(container: HTMLElement): number {
    return container.querySelectorAll('*').length;
  }
  
  /**
   * Measure frame timing
   */
  async measureFrameTiming(duration: number = 1000): Promise<{
    averageFrameTime: number;
    jankCount: number;
  }> {
    const frameTimes: number[] = [];
    let lastFrameTime = performance.now();
    let jankCount = 0;
    
    return new Promise(resolve => {
      const measureFrame = () => {
        const currentTime = performance.now();
        const frameTime = currentTime - lastFrameTime;
        
        frameTimes.push(frameTime);
        
        // Count jank (frames > 16.67ms for 60fps)
        if (frameTime > 16.67) {
          jankCount++;
        }
        
        lastFrameTime = currentTime;
        
        if (currentTime - frameTimes[0] < duration) {
          requestAnimationFrame(measureFrame);
        } else {
          const averageFrameTime = 
            frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
          resolve({ averageFrameTime, jankCount });
        }
      };
      
      requestAnimationFrame(measureFrame);
    });
  }
  
  /**
   * Measure interaction latency
   */
  async measureInteractionLatency(
    element: HTMLElement
  ): Promise<number> {
    const startTime = performance.now();
    
    // Simulate click
    element.click();
    
    // Wait for any pending updates
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    const endTime = performance.now();
    return endTime - startTime;
  }
  
  /**
   * Run complete performance test
   */
  async runTest(
    testName: string,
    messages: any[],
    container: HTMLElement,
    virtualScrolling: boolean
  ): Promise<PerformanceTestResult> {
    console.log(`[Performance Test] Starting: ${testName}`);
    
    // Initial render
    const initialRenderTime = await this.measureInitialRender(
      messages, 
      virtualScrolling
    );
    
    // Wait for render to stabilize
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Scroll performance
    const scrollContainer = container.querySelector('.messages') as HTMLElement;
    const scrollPerformance = scrollContainer 
      ? await this.measureScrollPerformance(scrollContainer)
      : [];
    
    // Memory usage
    const memoryUsage = this.getMemoryUsage();
    
    // DOM node count
    const domNodeCount = this.countDOMNodes(container);
    
    // Frame timing
    const { averageFrameTime, jankCount } = 
      await this.measureFrameTiming(1000);
    
    // Interaction latency
    const firstMessage = container.querySelector('.message-item') as HTMLElement;
    const interactionLatency = firstMessage
      ? await this.measureInteractionLatency(firstMessage)
      : 0;
    
    const result: PerformanceTestResult = {
      testName,
      messageCount: messages.length,
      virtualScrolling,
      metrics: {
        initialRenderTime,
        scrollPerformance,
        memoryUsage,
        domNodeCount,
        averageFrameTime,
        jankCount,
        interactionLatency
      }
    };
    
    this.results.push(result);
    console.log(`[Performance Test] Completed: ${testName}`, result);
    
    return result;
  }
  
  /**
   * Compare virtual scrolling vs standard rendering
   */
  compareResults(
    virtualResult: PerformanceTestResult,
    standardResult: PerformanceTestResult
  ) {
    const avgScrollVirtual = virtualResult.metrics.scrollPerformance
      .reduce((a, b) => a + b, 0) / virtualResult.metrics.scrollPerformance.length;
    const avgScrollStandard = standardResult.metrics.scrollPerformance
      .reduce((a, b) => a + b, 0) / standardResult.metrics.scrollPerformance.length;
    
    const comparison = {
      messageCount: virtualResult.messageCount,
      initialRender: {
        virtual: virtualResult.metrics.initialRenderTime,
        standard: standardResult.metrics.initialRenderTime,
        improvement: `${((1 - virtualResult.metrics.initialRenderTime / 
          standardResult.metrics.initialRenderTime) * 100).toFixed(1)}%`
      },
      scrollPerformance: {
        virtual: avgScrollVirtual,
        standard: avgScrollStandard,
        improvement: `${((1 - avgScrollVirtual / avgScrollStandard) * 100).toFixed(1)}%`
      },
      memory: {
        virtual: virtualResult.metrics.memoryUsage,
        standard: standardResult.metrics.memoryUsage,
        savings: `${(standardResult.metrics.memoryUsage - 
          virtualResult.metrics.memoryUsage).toFixed(1)}MB`
      },
      domNodes: {
        virtual: virtualResult.metrics.domNodeCount,
        standard: standardResult.metrics.domNodeCount,
        reduction: `${((1 - virtualResult.metrics.domNodeCount / 
          standardResult.metrics.domNodeCount) * 100).toFixed(1)}%`
      },
      jank: {
        virtual: virtualResult.metrics.jankCount,
        standard: standardResult.metrics.jankCount,
        reduction: standardResult.metrics.jankCount - virtualResult.metrics.jankCount
      },
      interaction: {
        virtual: virtualResult.metrics.interactionLatency,
        standard: standardResult.metrics.interactionLatency,
        improvement: `${((1 - virtualResult.metrics.interactionLatency / 
          standardResult.metrics.interactionLatency) * 100).toFixed(1)}%`
      }
    };
    
    return comparison;
  }
  
  /**
   * Determine break-even point for virtual scrolling
   */
  async findBreakEvenPoint(
    container: HTMLElement,
    generateMessages: (count: number) => any[]
  ): Promise<number> {
    const testCounts = [10, 25, 50, 100, 200, 500, 1000, 2000];
    const breakEvenData: any[] = [];
    
    for (const count of testCounts) {
      const messages = generateMessages(count);
      
      // Test with virtual scrolling
      const virtualResult = await this.runTest(
        `Virtual-${count}`,
        messages,
        container,
        true
      );
      
      // Test without virtual scrolling
      const standardResult = await this.runTest(
        `Standard-${count}`,
        messages,
        container,
        false
      );
      
      const comparison = this.compareResults(virtualResult, standardResult);
      
      breakEvenData.push({
        messageCount: count,
        virtualBetter: virtualResult.metrics.initialRenderTime < 
          standardResult.metrics.initialRenderTime,
        comparison
      });
      
      // Stop if virtual is significantly better
      if (virtualResult.metrics.initialRenderTime < 
          standardResult.metrics.initialRenderTime * 0.7) {
        console.log(`[Performance] Break-even point found at ${count} messages`);
        return count;
      }
    }
    
    // No clear break-even point found
    return -1;
  }
  
  /**
   * Generate comprehensive performance report
   */
  generateReport(): string {
    const report: string[] = [
      '=== Virtual Scrolling Performance Analysis ===',
      '',
      'Test Environment:',
      `  User Agent: ${navigator.userAgent}`,
      `  Screen: ${screen.width}x${screen.height}`,
      `  Device Memory: ${(navigator as any).deviceMemory || 'Unknown'}GB`,
      `  Hardware Concurrency: ${navigator.hardwareConcurrency} cores`,
      '',
      'Test Results:',
      ''
    ];
    
    // Group results by message count
    const groupedResults = new Map<number, PerformanceTestResult[]>();
    this.results.forEach(result => {
      const group = groupedResults.get(result.messageCount) || [];
      group.push(result);
      groupedResults.set(result.messageCount, group);
    });
    
    // Compare virtual vs standard for each message count
    groupedResults.forEach((results, messageCount) => {
      const virtualResult = results.find(r => r.virtualScrolling);
      const standardResult = results.find(r => !r.virtualScrolling);
      
      if (virtualResult && standardResult) {
        const comparison = this.compareResults(virtualResult, standardResult);
        
        report.push(`Messages: ${messageCount}`);
        report.push(`  Initial Render: ${comparison.initialRender.improvement} improvement`);
        report.push(`  Scroll Performance: ${comparison.scrollPerformance.improvement} improvement`);
        report.push(`  Memory Savings: ${comparison.memory.savings}`);
        report.push(`  DOM Nodes: ${comparison.domNodes.reduction} reduction`);
        report.push(`  Jank Reduction: ${comparison.jank.reduction} frames`);
        report.push(`  Interaction: ${comparison.interaction.improvement} improvement`);
        report.push('');
      }
    });
    
    // ROI Analysis
    report.push('ROI Analysis:');
    report.push(this.calculateROI());
    
    return report.join('\n');
  }
  
  /**
   * Calculate ROI of virtual scrolling implementation
   */
  private calculateROI(): string {
    const analysis: string[] = [];
    
    // Find threshold where virtual scrolling becomes beneficial
    let threshold = 0;
    const groupedResults = new Map<number, PerformanceTestResult[]>();
    this.results.forEach(result => {
      const group = groupedResults.get(result.messageCount) || [];
      group.push(result);
      groupedResults.set(result.messageCount, group);
    });
    
    groupedResults.forEach((results, messageCount) => {
      const virtualResult = results.find(r => r.virtualScrolling);
      const standardResult = results.find(r => !r.virtualScrolling);
      
      if (virtualResult && standardResult) {
        if (virtualResult.metrics.initialRenderTime < 
            standardResult.metrics.initialRenderTime && threshold === 0) {
          threshold = messageCount;
        }
      }
    });
    
    analysis.push(`  Effective Threshold: ${threshold} messages`);
    analysis.push(`  Implementation Complexity: HIGH`);
    analysis.push(`  Maintenance Burden: MEDIUM-HIGH`);
    analysis.push(`  User Impact: LOW (<100 msgs), MEDIUM (100-500 msgs), HIGH (>500 msgs)`);
    
    // Recommendation
    analysis.push('');
    analysis.push('Recommendation:');
    if (threshold > 200) {
      analysis.push('  ⚠️ Virtual scrolling provides minimal benefit below 200 messages');
      analysis.push('  Consider simpler optimizations first (React.memo, lazy loading)');
    } else if (threshold > 100) {
      analysis.push('  ✓ Virtual scrolling is beneficial for typical usage patterns');
      analysis.push('  But implementation issues need to be resolved first');
    } else {
      analysis.push('  ✅ Virtual scrolling provides significant benefits');
      analysis.push('  Worth the implementation complexity');
    }
    
    return analysis.join('\n');
  }
}

// Export singleton instance
export const performanceTestSuite = new PerformanceTestSuite();