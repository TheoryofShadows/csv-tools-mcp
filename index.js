#!/usr/bin/env node
/**
 * @mcpx-digital/csv-tools — MCP server for local CSV validation and conversion.
 * Never uploads user data. Transport: stdio.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  validateCsv,
  schemaCheck,
  csvToJson,
  jsonToCsv,
  sampleRows,
  findDuplicateKeys,
} from "./lib.js";

const LOCAL = "Local files only — never uploads user data anywhere.";

const TOOLS = [
  {
    name: "validate_csv",
    description: `Validate CSV structure (headers, consistent column counts, duplicate headers). ${LOCAL}`,
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Path to CSV file." },
        delimiter: { type: "string", description: "Field delimiter (default ',')." },
      },
      required: ["filePath"],
    },
  },
  {
    name: "schema_check",
    description: `Check required columns and simple column types (string|number|integer|boolean|email|url). ${LOCAL}`,
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Path to CSV file." },
        requiredColumns: {
          type: "array",
          items: { type: "string" },
          description: "Column names that must exist.",
        },
        columnTypes: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Map of column name → type.",
        },
        delimiter: { type: "string" },
      },
      required: ["filePath"],
    },
  },
  {
    name: "csv_to_json",
    description: `Convert a local CSV file to JSON records (returned in tool result). ${LOCAL}`,
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Path to CSV file." },
        delimiter: { type: "string" },
      },
      required: ["filePath"],
    },
  },
  {
    name: "json_to_csv",
    description: `Convert JSON records (or a local JSON array file) to CSV; optionally write to outputPath. ${LOCAL}`,
    inputSchema: {
      type: "object",
      properties: {
        jsonPath: { type: "string", description: "Path to JSON file (array of objects)." },
        records: {
          type: "array",
          items: { type: "object" },
          description: "Inline array of objects (alternative to jsonPath).",
        },
        headers: { type: "array", items: { type: "string" } },
        outputPath: { type: "string", description: "If set, write CSV to this local path." },
      },
    },
  },
  {
    name: "sample_rows",
    description: `Return the first N data rows from a CSV (default 5, max 100). ${LOCAL}`,
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        n: { type: "number", description: "Number of rows to sample." },
        delimiter: { type: "string" },
      },
      required: ["filePath"],
    },
  },
  {
    name: "find_duplicate_keys",
    description: `Find duplicate rows by one or more key columns. ${LOCAL}`,
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        keyColumns: {
          type: "array",
          items: { type: "string" },
          description: "Column name(s) forming the unique key.",
          minItems: 1,
        },
        delimiter: { type: "string" },
      },
      required: ["filePath", "keyColumns"],
    },
  },
];

const handlers = {
  validate_csv: validateCsv,
  schema_check: schemaCheck,
  csv_to_json: csvToJson,
  json_to_csv: jsonToCsv,
  sample_rows: sampleRows,
  find_duplicate_keys: findDuplicateKeys,
};

const server = new Server(
  { name: "csv-tools", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = request.params.arguments ?? {};
  const handler = handlers[name];
  if (!handler) {
    return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
  try {
    const result = await handler(args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
