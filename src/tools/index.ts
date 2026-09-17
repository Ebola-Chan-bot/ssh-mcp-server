import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerExecuteCommandTool } from "./execute-command.js";
import { registerUploadTool } from "./upload.js";
import { registerDownloadTool } from "./download.js";
import { registerListServersTool } from "./list-servers.js";

/**
 * Register all tools
 * @param server MCP 服务器实例
 * @param fileModeNote 是否存在至少一条使用 file 传输模式的连接；透传给 execute-command，使其 file 模式使用说明仅在相关时注入
 */
export function registerAllTools(
  server: McpServer,
  fileModeNote = false,
): void {
  registerExecuteCommandTool(server, fileModeNote);
  registerUploadTool(server);
  registerDownloadTool(server);
  registerListServersTool(server);
} 