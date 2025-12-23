// Command registry system for user-defined commands

import type { CommandResult } from "../types";

export interface CommandHandler {
  (args: string[]): CommandResult;
}

export class CommandRegistry {
  private commands: Map<string, CommandHandler> = new Map();

  constructor() {
    // Register built-in commands by default
    this.registerBuiltinCommands();
  }

  private registerBuiltinCommands(): void {
    // Basic quit command - will be handled by app via onCommand callback
    this.registerCommand("q", () => ({
      success: true,
      message: "Quit command executed",
    }));

    // Quit with force
    this.registerCommand("q!", () => ({
      success: true,
      message: "Force quit command executed",
    }));

    // Write command (placeholder)
    this.registerCommand("w", () => ({
      success: true,
      message: "Write command executed",
    }));

    // Write and quit
    this.registerCommand("wq", () => ({
      success: true,
      message: "Write and quit command executed",
    }));

    // Help command
    this.registerCommand("help", (args) => {
      if (args.length === 0) {
        const commands = Array.from(this.commands.keys()).sort();
        return {
          success: true,
          message: `Available commands: ${commands.join(", ")}`,
        };
      } else {
        const command = args[0];
        if (!command) {
          return {
            success: false,
            error: "Help command requires a command name",
          };
        }
        if (this.commands.has(command)) {
          return {
            success: true,
            message: `Help for command: ${command}`,
          };
        } else {
          return {
            success: false,
            error: `No help available for command: ${command}`,
          };
        }
      }
    });

    // Echo command for testing
    this.registerCommand("echo", (args) => ({
      success: true,
      message: args.join(" "),
    }));
  }

  /**
   * Register a custom command
   */
  registerCommand(name: string, handler: CommandHandler): void {
    this.commands.set(name, handler);
  }

  /**
   * Unregister a command
   */
  unregisterCommand(name: string): void {
    this.commands.delete(name);
  }

  /**
   * Execute a command
   */
  execute(command: string): CommandResult {
    const parsed = this.parseCommand(command);

    if (!parsed) {
      return {
        success: false,
        error: "Invalid command format",
      };
    }

    const { name, args } = parsed;
    const handler = this.commands.get(name);

    if (!handler) {
      return {
        success: false,
        error: `E492: Not an editor command: ${name}`,
      };
    }

    try {
      return handler(args);
    } catch (error) {
      return {
        success: false,
        error: `Command execution failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  /**
   * Get all available commands
   */
  getAvailableCommands(): string[] {
    return Array.from(this.commands.keys()).sort();
  }

  /**
   * Check if a command exists
   */
  hasCommand(name: string): boolean {
    return this.commands.has(name);
  }

  private parseCommand(
    command: string
  ): { name: string; args: string[] } | null {
    const trimmed = command.trim();
    if (!trimmed) {
      return null;
    }

    const parts = trimmed.split(/\s+/);
    const name = parts[0];
    if (!name) {
      return null;
    }
    const args = parts.slice(1);

    return { name, args };
  }
}

// Global command registry instance
export const globalCommandRegistry = new CommandRegistry();

// Hook for using command registry
export function useCommandRegistry() {
  return globalCommandRegistry;
}