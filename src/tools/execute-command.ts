import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SSHConnectionManager } from "../services/ssh-connection-manager.js";
import { Logger } from "../utils/logger.js";
import { toToolError } from "../utils/tool-error.js";

const FILE_MODE_DESCRIPTION =
  "\n" +
  "File transport mode: when the server runs with --transport-mode file (targets whose output cannot be framed, e.g. private device CLIs), the result does not contain the command output itself. Instead it reports `[file mode] log: <path>` and `[start] ... byte offset <N>`: all raw channel bytes are appended verbatim to that local log file, and this command's output starts at offset N. Read the file from that offset to its end with your own file tools. The server performs NO waiting: the command is written and the result returns immediately, so output is normally still arriving — the stream has no end marker. Do NOT pass the timeout parameter in this mode; it is rejected with an error. Judge completeness from the content yourself (typically the device's command prompt has reappeared); if the response looks truncated or the prompt is missing, wait briefly and re-read from the same offset before retrying or sending another command.";

/**
 * Register execute command tool
 * @param fileModeNote 是否存在至少一条使用 file 传输模式的连接；为真时把 file 模式使用说明附加到工具描述（随 schema 每会话注入一次），使其它传输模式不为其付出上下文成本
 */
export function registerExecuteCommandTool(
  server: McpServer,
  fileModeNote = false,
): void {
  const sshManager = SSHConnectionManager.getInstance();

  server.registerTool(
    "execute-command",
    {
      description:
        "Execute command on connected server and get output result" +
        (fileModeNote ? FILE_MODE_DESCRIPTION : ""),
      inputSchema: {
        cmdString: z.string().describe("Command to execute"),
        directory: z.string().optional().describe("Working directory for command execution"),
        connectionName: z
          .string()
          .optional()
          .describe("SSH connection name (optional, default is 'default')"),
        timeout: z
          .number()
          .optional()
          .describe(
            "Command execution timeout in milliseconds (optional; overrides the connection's commandTimeoutMs or shellCommandTimeoutMs, which defaults to 30000ms)",
          ),
      },
    },
    async ({ cmdString, directory, connectionName, timeout }) => {
      try {
        const result = await sshManager.executeCommand(
          cmdString,
          directory,
          connectionName,
          {
            timeout,
          },
        );
        return {
          content: [{ type: "text", text: result }],
        };
      } catch (error: unknown) {
        const toolError = toToolError(error, "UNKNOWN_ERROR");
        Logger.handleError(toolError, "Failed to execute command");
        return {
          content: [{
            type: "text",
            text: JSON.stringify(
              {
                code: toolError.code,
                message: toolError.message,
                retriable: toolError.retriable,
              },
              null,
              2,
            ),
          }],
          isError: true,
        };
      }
    },
  );
}
