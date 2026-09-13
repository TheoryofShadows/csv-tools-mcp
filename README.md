# @mcpx-digital/csv-tools

**MCP server for local CSV validation and conversion.**

Validate CSV structure, check simple schemas, convert CSV↔JSON, sample rows, and find duplicate keys — all on local files.

> **Privacy:** Never uploads user data anywhere. All processing is local.

## Install

```bash
npx -y @mcpx-digital/csv-tools
```

## Cursor `mcp.json` example

```json
{
  "mcpServers": {
    "csv-tools": {
      "command": "npx",
      "args": ["-y", "@mcpx-digital/csv-tools"]
    }
  }
}
```

Local clone:

```json
{
  "mcpServers": {
    "csv-tools": {
      "command": "node",
      "args": ["/absolute/path/to/csv-tools-mcp/index.js"]
    }
  }
}
```

## Tools

| Tool | What it does |
|------|----------------|
| `validate_csv` | Headers, column counts, duplicate headers |
| `schema_check` | Required columns + basic types |
| `csv_to_json` | CSV → JSON records |
| `json_to_csv` | JSON → CSV (optional write to disk) |
| `sample_rows` | First N rows |
| `find_duplicate_keys` | Duplicate groups by key columns |

## Example prompts

- “Validate `./data/users.csv`”
- “Require columns id,email and check email types”
- “Convert `export.csv` to JSON and show 5 sample rows”
- “Find duplicate `email` values in `users.csv`”

## Development

```bash
git clone https://github.com/TheoryofShadows/csv-tools-mcp.git
cd csv-tools-mcp
npm install
npm test
```

## License

MIT
