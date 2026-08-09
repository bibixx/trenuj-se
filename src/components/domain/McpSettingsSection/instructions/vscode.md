Create `.vscode/mcp.json` in your workspace (MCP requires the `chat.mcp.enabled` setting):

```json
{
  "servers": {
    "trenuj-se": {
      "type": "http",
      "url": "{SERVER_URL}/mcp"
    }
  }
}
```

VS Code prompts you to start the server and opens your browser to log in with your trenuj.se account.
