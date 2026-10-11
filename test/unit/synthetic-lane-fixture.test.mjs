import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const fixtureUrl = new URL("../dom-synthetic-lane-matrix.ass", import.meta.url);
const generatorUrl = new URL("../../scripts/generate-synthetic-lane-matrix.py", import.meta.url);

test("synthetic lane fixture is reproducible and contains only non-language payloads", async () => {
  const check = spawnSync(fileURLToPath(generatorUrl), ["--check"], { encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr || check.stdout);

  const content = await readFile(fixtureUrl, "utf8");
  assert.match(content, /^Title: SYNTHETIC-LAYOUT-MATRIX-V1$/m);
  assert.match(content, /^PlayResX: 864$/m);
  assert.match(content, /^PlayResY: 486$/m);
  assert.doesNotMatch(content, /^(?:Original|Video File|Audio File|Synch Point|Collisions):/mi);
  assert.ok([...content].every((character) => character.charCodeAt(0) < 128));

  const dialogues = content.split(/\r?\n/).filter((line) => line.startsWith("Dialogue:"));
  assert.equal(dialogues.length, 29);
  for (const dialogue of dialogues) {
    const fields = splitFields(dialogue.slice("Dialogue:".length), 10);
    assert.equal(fields.length, 10);
    assert.equal(fields[4], "");
    assert.equal(fields[8], "");
    const visible = fields[9].replace(/^\{[^}]*\}/, "");
    for (const line of visible.split("\\N")) {
      assert.match(line, /^[A-Z][0-9](?:-[A-Z][0-9]){3}$/);
    }
  }
});

function splitFields(value, fieldCount) {
  const fields = [];
  let rest = value;
  for (let index = 1; index < fieldCount; index += 1) {
    const comma = rest.indexOf(",");
    assert.notEqual(comma, -1);
    fields.push(rest.slice(0, comma).trim());
    rest = rest.slice(comma + 1);
  }
  fields.push(rest.trim());
  return fields;
}
