#!/usr/bin/env node
/**
 * Concatenates backend/data/omens_chunks/*.json (each file is a JSON array) into omens_source.json.
 * Next step — map to DB/API payload:
 *   node backend/scripts/omens-to-api-batch.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const chunkDir = join(__dirname, "../data/omens_chunks");
const out = join(__dirname, "../data/omens_source.json");

const files = readdirSync(chunkDir)
  .filter((f) => f.endsWith(".json"))
  .sort();
let all = [];
for (const f of files) {
  const part = JSON.parse(readFileSync(join(chunkDir, f), "utf8"));
  if (!Array.isArray(part)) throw new Error(`${f} must be a JSON array`);
  all = all.concat(part);
}
writeFileSync(out, JSON.stringify(all, null, 2) + "\n", "utf8");
console.error(`Merged ${files.length} chunk files -> ${all.length} cards -> ${out}`);
