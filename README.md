# Azure SDK Copilot Plugin

A [VS Code Agent Plugin](https://code.visualstudio.com/docs/copilot/customization/agent-plugins) that provides [Azure SDK MCP tools](https://github.com/Azure/azure-sdk-tools/tree/main/tools/azsdk-cli) for GitHub Copilot Chat — no Azure SDK repo clone required.

## What's included

The plugin bundles the Azure SDK MCP server, which provides 50+ tools for:

- **SDK generation** — Generate SDKs from TypeSpec definitions
- **Build & test** — Build packages and run tests
- **Release planning** — Create/manage release plan work items
- **Pipeline analysis** — Diagnose CI pipeline failures
- **APIView** — Review API surface feedback
- **TypeSpec** — Validate and manage TypeSpec projects

## Install

### From source

1. Open VS Code Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run **Chat: Install Plugin From Source**
3. Enter: `https://github.com/pvaneck/sdk-copilot-plugin`

## How it works

The plugin includes a lightweight Node.js wrapper script that:

1. Downloads the latest `azsdk` binary from [Azure SDK Tools releases](https://github.com/Azure/azure-sdk-tools/releases)
2. Caches it at `$HOME/.azure-sdk-mcp/`
3. Starts the MCP server with stdio transport

No `.NET SDK`, `npm install`, or manual setup needed — just Node.js (which VS Code users already have).

## Requirements

- [VS Code](https://code.visualstudio.com/) with [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot)
- Node.js (bundled with VS Code or installed separately)
- `tar` or `unzip` available on PATH (standard on macOS/Linux/Windows 10+)

## Configuration

The MCP server is configured in [`.mcp.json`](.mcp.json). By default, all tools are exposed. To limit to specific tool categories, modify the args:

```json
{
  "mcpServers": {
    "azure-sdk-mcp": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/run-azsdk-mcp.js", "mcp", "--tools", "azsdk_package_*,azsdk_typespec_*"]
    }
  }
}
```

Tool names use glob patterns. Common presets:

| Pattern | Tools included |
|---------|---------------|
| `azsdk_package_*` | SDK generation, build, test, pack |
| `azsdk_typespec_*` | TypeSpec validation and management |
| `azsdk_*release*` | Release planning and management |
| `azsdk_analyze_*` | Pipeline analysis and debugging |
| `azsdk_apiview_*` | APIView feedback |
| `*` | All tools (default) |

## License

MIT
