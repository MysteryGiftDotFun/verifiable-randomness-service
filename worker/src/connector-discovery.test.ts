import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const staticDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "static");

test("RNG connector brief names the public host and Bearer auth", () => {
  const brief = fs.readFileSync(path.join(staticDir, "connectors/muse.md"), "utf8");
  assert.match(brief, /https:\/\/rng\.mysterygift\.fun/);
  assert.match(brief, /Authorization: Bearer/);
  assert.match(brief, /Do \*\*not\*\* send `X-Internal-Secret`/);
  assert.match(brief, /GET \/v1\/health/);
});

test("RNG OpenAPI lists pick", () => {
  const spec = fs.readFileSync(path.join(staticDir, "openapi.yaml"), "utf8");
  assert.match(spec, /\/v1\/random\/pick/);
});

test("RNG llms.txt points at the brief", () => {
  const index = fs.readFileSync(path.join(staticDir, "llms.txt"), "utf8");
  assert.match(index, /\/connectors\/muse\.md/);
});
