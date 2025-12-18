// Command execution system for Vim mode

import type { CommandResult, CommandExecutor } from "../types";

export class VimCommandExecutor implements CommandExecutor {
  private commands: Map<string, (args: string[]) => CommandResult> = new Map();

  constructor() {
    // Register built-in commands
    this.registerBuiltinCommands();
  }

  private registerBuiltinCommands(): void {
    // Basic quit command
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

  execute(command: string): CommandResult {
    // Parse the command
    const parsed = this.parseCommand(command);

    if (!parsed) {
      return {
        success: false,
        error: "Invalid command format",
      };
    }

    const { name, args } = parsed;

    // Check if command exists
    const handler = this.commands.get(name);
    if (!handler) {
      return {
        success: false,
        error: `E492: Not an editor command: ${name}`,
      };
    }

    try {
      // Execute the command
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

  private parseCommand(
    command: string
  ): { name: string; args: string[] } | null {
    const trimmed = command.trim();
    if (!trimmed) {
      return null;
    }

    // Split command into name and arguments
    const parts = trimmed.split(/\s+/);
    const name = parts[0];
    if (!name) {
      return null;
    }
    const args = parts.slice(1);

    return { name, args };
  }

  registerCommand(
    name: string,
    handler: (args: string[]) => CommandResult
  ): void {
    this.commands.set(name, handler);
  }

  unregisterCommand(name: string): void {
    this.commands.delete(name);
  }

  getAvailableCommands(): string[] {
    return Array.from(this.commands.keys()).sort();
  }
}

// Default command executor instance
export const defaultCommandExecutor = new VimCommandExecutor();
