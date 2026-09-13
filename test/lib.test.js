import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseCsv,
  objectsToCsv,
  validateCsv,
  schemaCheck,
  csvToJson,
  jsonToCsv,
  sampleRows,
  findDuplicateKeys,
} from "../lib.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const people = path.join(__dirname, "../fixtures/people.csv");
const ragged = path.join(__dirname, "../fixtures/ragged.csv");

describe("parseCsv", () => {
  it("parses quoted fields", () => {
    const rows = parseCsv('a,b\n"x,y","z""z"\n');
    assert.deepEqual(rows[0], ["a", "b"]);
    assert.deepEqual(rows[1], ["x,y", 'z"z']);
  });
});

describe("validateCsv", () => {
  it("accepts well-formed csv", async () => {
    const r = await validateCsv({ filePath: people });
    assert.equal(r.valid, true);
    assert.equal(r.rowCount, 4);
  });

  it("flags ragged rows", async () => {
    const r = await validateCsv({ filePath: ragged });
    assert.equal(r.valid, false);
    assert.ok(r.issues.length >= 1);
  });
});

describe("schemaCheck", () => {
  it("checks types and required columns", async () => {
    const r = await schemaCheck({
      filePath: people,
      requiredColumns: ["id", "email"],
      columnTypes: { age: "integer", email: "email" },
    });
    assert.equal(r.valid, false);
    assert.ok(r.issues.some((i) => /email|age|integer/i.test(i.message)));
  });
});

describe("csvToJson / jsonToCsv", () => {
  it("round-trips", async () => {
    const j = await csvToJson({ filePath: people });
    assert.equal(j.rowCount, 4);
    const csv = await jsonToCsv({ records: j.json });
    assert.match(csv.csv, /id,name,email,age/);
  });
});

describe("sampleRows", () => {
  it("samples n rows", async () => {
    const r = await sampleRows({ filePath: people, n: 2 });
    assert.equal(r.sample.length, 2);
  });
});

describe("findDuplicateKeys", () => {
  it("finds duplicate emails", async () => {
    const r = await findDuplicateKeys({ filePath: people, keyColumns: ["email"] });
    assert.ok(r.duplicateGroupCount >= 1);
  });
});

describe("objectsToCsv", () => {
  it("escapes commas", () => {
    const csv = objectsToCsv([{ a: "x,y" }], ["a"]);
    assert.match(csv, /"x,y"/);
  });
});
