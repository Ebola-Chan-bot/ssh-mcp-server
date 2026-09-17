import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSHConnectionManager } from "../services/ssh-connection-manager.js";
import { CommandLineParser } from "../cli/command-line-parser.js";
import { Logger } from "../utils/logger.js";
import { registerAllTools } from "../tools/index.js";
import { SERVER_CONFIG } from "../config/server.js";

/**
 * MCP Server class
 */
export class SshMcpServer {
  private server: McpServer;
  private sshManager: SSHConnectionManager;
  private shutdownHandlersRegistered = false;
  private shutdownPromise?: Promise<void>;

  constructor() {
    this.server = new McpServer(SERVER_CONFIG);

    this.sshManager = SSHConnectionManager.getInstance();
  }

  /**
   * Register tools
   * @param fileModeNote 是否存在至少一条使用 file 传输模式的连接；透传下去，使 execute-command 仅在确实相关时才注入 file 模式使用说明
   */
  private registerTools(fileModeNote: boolean): void {
    registerAllTools(this.server, fileModeNote);
  }

  private async shutdown(reason: string, exitCode?: number): Promise<void> {
    if (!this.shutdownPromise) {
      this.shutdownPromise = (async () => {
        Logger.log(`Received ${reason}, shutting down SSH MCP server...`, "info");

        this.sshManager.disconnect();

        try {
          await this.server.close();
        } catch (error) {
          Logger.log(
            `Failed to close MCP server cleanly: ${(error as Error).message}`,
            "error",
          );
        }
      })();
    }

    await this.shutdownPromise;

    if (exitCode !== undefined) {
      process.exit(exitCode);
    }
  }

  private registerShutdownHandlers(): void {
    if (this.shutdownHandlersRegistered) {
      return;
    }

    const handleSignal = (signal: NodeJS.Signals) => {
      void this.shutdown(signal, 0);
    };

    process.once("SIGINT", handleSignal);
    process.once("SIGTERM", handleSignal);
    process.stdin.resume();
    process.stdin.once("end", () => void this.shutdown("stdin end", 0));
    process.stdin.once("close", () => void this.shutdown("stdin close", 0));

    this.shutdownHandlersRegistered = true;
  }

  /**
   * Run the server
   */
  public async run(): Promise<void> {
    // Initialize SSH configuration
    const parsedArgs = CommandLineParser.parseArgs();
    this.sshManager.setConfig(parsedArgs.configs);
    this.registerShutdownHandlers();

    // 仅当至少一条连接使用 file 传输时，才把 file 模式使用说明注入 execute-command 的工具描述。
    const fileModeNote = Object.values(parsedArgs.configs).some(
      (c) => c.transportMode === "file",
    );

    // Register tools before accepting MCP requests.
    this.registerTools(fileModeNote);

    // Create transport instance and connect.
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    Logger.log("MCP server connection established");

    // Security warning
    const allConfigs = Object.values(parsedArgs.configs);
    if (
      allConfigs.some(
        (c) => !c.commandWhitelist || c.commandWhitelist.length === 0
      )
    ) {
      Logger.log(
        "WARNING: Running without a command whitelist is strongly discouraged. Please configure a whitelist to restrict the commands that can be executed.",
        "info"
      );
    }
    if (
      allConfigs.some(
        (c) =>
          (c.transportMode || "exec") === "exec" &&
          (!c.allowedRemotePaths || c.allowedRemotePaths.length === 0)
      )
    ) {
      Logger.log(
        "WARNING: Running without allowedRemotePaths is strongly discouraged. SFTP upload/download can read or write any path on the remote server. Configure allowedRemotePaths to restrict the SFTP surface.",
        "info"
      );
    }

    // Pre-connect to all servers if flag is set
    if (parsedArgs.preConnect) {
      Logger.log("Pre-connecting to all configured SSH servers...", "info");
      void this.sshManager
        .connectAll()
        .then(() => {
          Logger.log("Successfully pre-connected to all SSH servers", "info");
        })
        .catch((error) => {
          Logger.log(
            `Warning: Some SSH connections failed during pre-connect: ${(error as Error).message}`,
            "error"
          );
        });
    }
  }
}
