/**
 * Logger service for controlled console output
 * Only shows errors in production, all levels in development
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: any;
  timestamp: Date;
}

class Logger {
  private level: LogLevel;
  private history: LogEntry[] = [];
  private maxHistorySize = 100;
  
  constructor() {
    // In production, only show errors. In development, show all.
    this.level = import.meta.env.DEV ? 'debug' : 'error';
  }
  
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }
  
  private addToHistory(entry: LogEntry): void {
    this.history.push(entry);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }
  
  debug(message: string, ...args: any[]): void {
    const entry: LogEntry = {
      level: 'debug',
      message,
      data: args.length > 0 ? args : undefined,
      timestamp: new Date()
    };
    
    this.addToHistory(entry);
    
    if (this.shouldLog('debug')) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }
  
  info(message: string, ...args: any[]): void {
    const entry: LogEntry = {
      level: 'info',
      message,
      data: args.length > 0 ? args : undefined,
      timestamp: new Date()
    };
    
    this.addToHistory(entry);
    
    if (this.shouldLog('info')) {
      console.info(`[INFO] ${message}`, ...args);
    }
  }
  
  warn(message: string, ...args: any[]): void {
    const entry: LogEntry = {
      level: 'warn',
      message,
      data: args.length > 0 ? args : undefined,
      timestamp: new Date()
    };
    
    this.addToHistory(entry);
    
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }
  
  error(message: string, ...args: any[]): void {
    const entry: LogEntry = {
      level: 'error',
      message,
      data: args.length > 0 ? args : undefined,
      timestamp: new Date()
    };
    
    this.addToHistory(entry);
    
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }
  
  /**
   * Set the logging level dynamically
   */
  setLevel(level: LogLevel): void {
    this.level = level;
    this.info(`Logging level set to: ${level}`);
  }
  
  /**
   * Get the current logging level
   */
  getLevel(): LogLevel {
    return this.level;
  }
  
  /**
   * Get the log history (useful for debugging)
   */
  getHistory(): LogEntry[] {
    return [...this.history];
  }
  
  /**
   * Clear the log history
   */
  clearHistory(): void {
    this.history = [];
  }
  
  /**
   * Export logs for debugging
   */
  exportLogs(): string {
    return this.history
      .map(entry => {
        const timestamp = entry.timestamp.toISOString();
        const data = entry.data ? JSON.stringify(entry.data) : '';
        return `[${timestamp}] [${entry.level.toUpperCase()}] ${entry.message} ${data}`;
      })
      .join('\n');
  }
}

// Create singleton instance
export const logger = new Logger();

// Export for testing
export type { LogLevel, LogEntry };
export { Logger };