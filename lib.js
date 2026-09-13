/**
 * Local CSV tools — validate, schema-check, convert, sample, find duplicates.
 * Never uploads user data anywhere.
 */
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Minimal RFC4180-ish CSV parser supporting quoted fields and newlines in quotes.
 * @param {string} text
 * @param {{ delimiter?: string }} [opts]
 * @returns {string[][]}
 */
export function parseCsv(text, opts = {}) {
  const delimiter = opts.delimiter ?? ",";
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  const s = String(text).replace(/^\uFEFF/, "");
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // last field
  if (field.length > 0 || row.length > 0 || s.endsWith(delimiter)) {
    row.push(field);
    rows.push(row);
  }
  // drop trailing empty line artifact
  if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "" && s.endsWith("\n")) {
    rows.pop();
  }
  return rows;
}

/**
 * @param {string[][]} rows
 * @returns {{ headers: string[], records: Record<string, string>[] }}
 */
export function rowsToObjects(rows) {
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map((h, idx) => (h === "" ? `column_${idx + 1}` : h));
  const records = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    /** @type {Record<string, string>} */
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c] ?? "";
    }
    records.push(obj);
  }
  return { headers, records };
}

/**
 * @param {Record<string, unknown>[]} records
 * @param {string[]} [headers]
 */
export function objectsToCsv(records, headers) {
  if (!records.length && (!headers || !headers.length)) return "";
  const cols =
    headers && headers.length
      ? headers
      : [...new Set(records.flatMap((r) => Object.keys(r)))];
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [cols.map(escape).join(",")];
  for (const rec of records) {
    lines.push(cols.map((c) => escape(rec[c])).join(","));
  }
  return lines.join("\n") + "\n";
}

/**
 * @param {{ filePath: string, delimiter?: string }} input
 */
export async function validateCsv(input) {
  const abs = path.resolve(String(input.filePath));
  const raw = await fs.readFile(abs, "utf8");
  const rows = parseCsv(raw, { delimiter: input.delimiter });
  const issues = [];
  if (!rows.length) {
    issues.push({ severity: "error", message: "File is empty" });
    return { file: abs, valid: false, rowCount: 0, columnCount: 0, issues };
  }
  const width = rows[0].length;
  if (width === 0) issues.push({ severity: "error", message: "Header row is empty" });
  const headerSet = new Set();
  for (let i = 0; i < rows[0].length; i++) {
    const h = rows[0][i];
    if (h === "") issues.push({ severity: "warning", message: `Empty header at column ${i + 1}` });
    if (headerSet.has(h) && h !== "") {
      issues.push({ severity: "error", message: `Duplicate header: ${h}` });
    }
    headerSet.add(h);
  }
  for (let r = 1; r < rows.length; r++) {
    if (rows[r].length !== width) {
      issues.push({
        severity: "error",
        message: `Row ${r + 1} has ${rows[r].length} columns; expected ${width}`,
      });
    }
  }
  const errors = issues.filter((i) => i.severity === "error");
  return {
    file: abs,
    valid: errors.length === 0,
    rowCount: Math.max(rows.length - 1, 0),
    columnCount: width,
    headers: rows[0],
    issueCount: issues.length,
    issues: issues.slice(0, 100),
  };
}

/**
 * @param {{ filePath: string, requiredColumns?: string[], columnTypes?: Record<string, string>, delimiter?: string }} input
 */
export async function schemaCheck(input) {
  const abs = path.resolve(String(input.filePath));
  const raw = await fs.readFile(abs, "utf8");
  const { headers, records } = rowsToObjects(parseCsv(raw, { delimiter: input.delimiter }));
  const required = input.requiredColumns || [];
  const types = input.columnTypes || {};
  const issues = [];
  for (const col of required) {
    if (!headers.includes(col)) {
      issues.push({ severity: "error", message: `Missing required column: ${col}` });
    }
  }
  const typeCheckers = {
    string: (v) => true,
    number: (v) => v === "" || !Number.isNaN(Number(v)),
    integer: (v) => v === "" || /^-?\d+$/.test(String(v).trim()),
    boolean: (v) => v === "" || /^(true|false|0|1|yes|no)$/i.test(String(v).trim()),
    email: (v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()),
    url: (v) => {
      if (v === "") return true;
      try {
        const u = new URL(String(v));
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    },
  };
  for (const [col, typeName] of Object.entries(types)) {
    const checker = typeCheckers[typeName];
    if (!checker) {
      issues.push({ severity: "warning", message: `Unknown type '${typeName}' for column ${col}` });
      continue;
    }
    if (!headers.includes(col)) {
      issues.push({ severity: "error", message: `Typed column missing: ${col}` });
      continue;
    }
    let bad = 0;
    for (let i = 0; i < records.length; i++) {
      if (!checker(records[i][col])) {
        bad++;
        if (bad <= 5) {
          issues.push({
            severity: "error",
            message: `Row ${i + 2}: column '${col}' expected ${typeName}, got '${records[i][col]}'`,
          });
        }
      }
    }
    if (bad > 5) {
      issues.push({ severity: "error", message: `… and ${bad - 5} more type errors in '${col}'` });
    }
  }
  return {
    file: abs,
    headers,
    rowCount: records.length,
    valid: issues.filter((i) => i.severity === "error").length === 0,
    issues,
  };
}

/**
 * @param {{ filePath: string, delimiter?: string, pretty?: boolean }} input
 */
export async function csvToJson(input) {
  const abs = path.resolve(String(input.filePath));
  const raw = await fs.readFile(abs, "utf8");
  const { headers, records } = rowsToObjects(parseCsv(raw, { delimiter: input.delimiter }));
  return {
    file: abs,
    headers,
    rowCount: records.length,
    json: records,
    note: "Data stays local — not uploaded anywhere.",
  };
}

/**
 * @param {{ filePath: string, jsonPath?: string, records?: object[], headers?: string[], outputPath?: string }} input
 */
export async function jsonToCsv(input) {
  let records = input.records;
  if (!records && input.jsonPath) {
    const abs = path.resolve(String(input.jsonPath));
    const data = JSON.parse(await fs.readFile(abs, "utf8"));
    if (!Array.isArray(data)) throw new Error("JSON file must contain an array of objects");
    records = data;
  }
  if (!Array.isArray(records)) throw new Error("Provide records array or jsonPath");
  const csv = objectsToCsv(records, input.headers);
  let written = null;
  if (input.outputPath) {
    const out = path.resolve(String(input.outputPath));
    await fs.writeFile(out, csv, "utf8");
    written = out;
  }
  return {
    rowCount: records.length,
    csv: written ? undefined : csv,
    outputPath: written,
    note: "Data stays local — not uploaded anywhere.",
  };
}

/**
 * @param {{ filePath: string, n?: number, delimiter?: string }} input
 */
export async function sampleRows(input) {
  const abs = path.resolve(String(input.filePath));
  const raw = await fs.readFile(abs, "utf8");
  const { headers, records } = rowsToObjects(parseCsv(raw, { delimiter: input.delimiter }));
  const n = Math.min(Math.max(input.n ?? 5, 1), 100);
  return {
    file: abs,
    headers,
    totalRows: records.length,
    sampleSize: Math.min(n, records.length),
    sample: records.slice(0, n),
  };
}

/**
 * @param {{ filePath: string, keyColumns: string[], delimiter?: string }} input
 */
export async function findDuplicateKeys(input) {
  const abs = path.resolve(String(input.filePath));
  const keyColumns = input.keyColumns;
  if (!Array.isArray(keyColumns) || !keyColumns.length) {
    throw new Error("keyColumns is required");
  }
  const raw = await fs.readFile(abs, "utf8");
  const { headers, records } = rowsToObjects(parseCsv(raw, { delimiter: input.delimiter }));
  for (const k of keyColumns) {
    if (!headers.includes(k)) throw new Error(`Key column not found: ${k}`);
  }
  /** @type {Map<string, number[]>} */
  const map = new Map();
  records.forEach((rec, idx) => {
    const key = keyColumns.map((c) => rec[c]).join("\u0000");
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(idx + 2); // 1-based file line approx (header + idx)
  });
  const duplicates = [];
  for (const [key, lines] of map) {
    if (lines.length > 1) {
      const parts = key.split("\u0000");
      /** @type {Record<string, string>} */
      const keyObj = {};
      keyColumns.forEach((c, i) => {
        keyObj[c] = parts[i];
      });
      duplicates.push({ key: keyObj, count: lines.length, rows: lines });
    }
  }
  return {
    file: abs,
    keyColumns,
    duplicateGroupCount: duplicates.length,
    duplicates: duplicates.slice(0, 100),
  };
}
