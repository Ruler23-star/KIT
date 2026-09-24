type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  execute: (input: Record<string, unknown>) => Promise<unknown> | unknown;
};

interface Document {
  modelContext?: {
    registerTool: (tool: WebMcpTool) => Promise<void>;
    unregisterTool?: (name: string) => Promise<void>;
  };
}

