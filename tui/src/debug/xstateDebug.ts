import type { AnyEventObject, StateValue } from "xstate";
import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// Debug configuration
const isDebugEnabled = process.env.NODE_ENV !== "production";

// Log file configuration
const LOG_DIR = ".pigeon/logs";
const getLogFileName = () => {
  const now = new Date();
  const date = now.toISOString().split("T")[0]; // YYYY-MM-DD
  return `pigeon-debug-${date}.log`;
};

// Ensure log directory exists
function ensureLogDir() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

// Enhanced log types with more context
interface TransitionLog {
  timestamp: string;
  machineId: string;
  fromState: StateValue;
  toState: StateValue;
  event: AnyEventObject;
  duration?: number;
  context?: any;
  meta?: any;
}

interface ErrorLog {
  timestamp: string;
  machineId: string;
  error: Error;
  event?: AnyEventObject;
  context?: any;
  state?: StateValue;
  stack?: string;
}

// Enhanced debug logger with file-based logging
class XStateDebugger {
  private transitionLogs: TransitionLog[] = [];
  private errorLogs: ErrorLog[] = [];
  private transitionStartTimes: Map<string, number> = new Map();
  private maxTransitions = 20; // Match test expectations
  private maxErrors = 10; // Match test expectations
  private logFilePath: string;

  constructor() {
    this.logFilePath = "";

    if (isDebugEnabled) {
      ensureLogDir();
      this.logFilePath = join(LOG_DIR, getLogFileName());

      // Initialize log file with session start
      const sessionStart = {
        timestamp: new Date().toISOString(),
        event: "SESSION_START",
        message: "XState Debugger initialized",
        config: {
          maxTransitions: this.maxTransitions,
          maxErrors: this.maxErrors,
        },
      };

      this.writeToFile(JSON.stringify(sessionStart) + "\n");
    }
  }

  private writeToFile(content: string) {
    if (!isDebugEnabled || !this.logFilePath) return;

    try {
      appendFileSync(this.logFilePath, content);
    } catch (error) {
      // Silently fail to avoid polluting TUI - file logging is best effort
    }
  }

  startTransition(machineId: string, event: AnyEventObject, context?: any) {
    if (!isDebugEnabled) return;
    const key = `${machineId}-${event.type}-${Date.now()}`;
    this.transitionStartTimes.set(key, performance.now());

    // Log to file instead of console to avoid TUI pollution
    const logEntry = {
      type: "TRANSITION_START",
      timestamp: new Date().toISOString(),
      machineId,
      event: event.type,
      context: context ? JSON.stringify(context) : undefined,
    };
    this.writeToFile(JSON.stringify(logEntry) + "\n");

    return key;
  }

  logTransition(
    machineId: string,
    fromState: StateValue,
    toState: StateValue,
    event: AnyEventObject,
    transitionKey?: string,
    context?: any,
    meta?: any
  ) {
    if (!isDebugEnabled) return;

    const timestamp = new Date().toISOString();
    let duration: number | undefined;

    if (transitionKey && this.transitionStartTimes.has(transitionKey)) {
      const startTime = this.transitionStartTimes.get(transitionKey)!;
      duration = performance.now() - startTime;
      this.transitionStartTimes.delete(transitionKey);
    }

    const logEntry: TransitionLog = {
      timestamp,
      machineId,
      fromState,
      toState,
      event,
      duration,
      context,
      meta,
    };

    this.transitionLogs.push(logEntry);

    // Log to file instead of console to avoid TUI pollution
    const fileLogEntry = {
      type: "TRANSITION_COMPLETE",
      timestamp,
      machineId,
      from: String(fromState),
      to: String(toState),
      event: event.type,
      duration: duration ? `${duration.toFixed(2)}ms` : undefined,
      context: context ? JSON.stringify(context) : undefined,
    };
    this.writeToFile(JSON.stringify(fileLogEntry) + "\n");

    // Memory management - keep only recent entries
    if (this.transitionLogs.length > this.maxTransitions) {
      this.transitionLogs = this.transitionLogs.slice(-this.maxTransitions);
    }
  }

  logError(
    machineId: string,
    error: Error,
    event?: AnyEventObject,
    context?: any,
    state?: StateValue
  ) {
    if (!isDebugEnabled) return;

    const timestamp = new Date().toISOString();
    const stack = error.stack || new Error().stack;

    const logEntry: ErrorLog = {
      timestamp,
      machineId,
      error,
      event,
      context,
      state,
      stack,
    };

    this.errorLogs.push(logEntry);

    // Log to file instead of console to avoid TUI pollution
    const fileLogEntry = {
      type: "ERROR",
      timestamp,
      machineId,
      message: error.message,
      event: event?.type,
      state: state ? String(state) : undefined,
      context: context ? JSON.stringify(context) : undefined,
      stack: error.stack,
    };
    this.writeToFile(JSON.stringify(fileLogEntry) + "\n");

    // Memory management - keep only recent entries
    if (this.errorLogs.length > this.maxErrors) {
      this.errorLogs = this.errorLogs.slice(-this.maxErrors);
    }
  }

  getTransitionLogs(): TransitionLog[] {
    return [...this.transitionLogs];
  }

  getErrorLogs(): ErrorLog[] {
    return [...this.errorLogs];
  }

  clearLogs() {
    this.transitionLogs = [];
    this.errorLogs = [];
    // Also clear timing data to free memory
    this.transitionStartTimes.clear();
  }

  // Get comprehensive debug information
  getDebugInfo() {
    return {
      transitions: this.transitionLogs.length,
      errors: this.errorLogs.length,
      timings: this.transitionStartTimes.size,
      maxTransitions: this.maxTransitions,
      maxErrors: this.maxErrors,
      isDebugEnabled,
      recentTransitions: this.transitionLogs.slice(-3).map((log) => ({
        machine: log.machineId,
        transition: `${String(log.fromState)} → ${String(log.toState)}`,
        event: log.event.type,
        duration: log.duration ? `${log.duration.toFixed(2)}ms` : undefined,
      })),
      recentErrors: this.errorLogs.slice(-2).map((log) => ({
        machine: log.machineId,
        message: log.error.message,
        event: log.event?.type,
        state: log.state ? String(log.state) : undefined,
      })),
    };
  }
}

export const xstateDebugger = new XStateDebugger();

export function useXStateDebug() {
  return {
    startTransition: xstateDebugger.startTransition.bind(xstateDebugger),
    logTransition: xstateDebugger.logTransition.bind(xstateDebugger),
    logError: xstateDebugger.logError.bind(xstateDebugger),
    getTransitionLogs: xstateDebugger.getTransitionLogs.bind(xstateDebugger),
    getErrorLogs: xstateDebugger.getErrorLogs.bind(xstateDebugger),
    clearLogs: xstateDebugger.clearLogs.bind(xstateDebugger),
    getDebugInfo: xstateDebugger.getDebugInfo.bind(xstateDebugger),
  };
}

// Helper function to create machines with debugging enabled
export function createDebugMachine<T>(machine: T): T {
  // Simply return the machine as-is since we don't need inspector integration for TUI
  return machine;
}

export type { TransitionLog, ErrorLog };
