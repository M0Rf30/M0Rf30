import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertWellFormedSvg } from "./helpers.mjs";
import { CARDS } from "../cards/index.mjs";
import { THEMES } from "../lib/svg.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.resolve(HERE, "..");
const GENERATE = path.join(SCRIPTS_DIR, "generate.mjs");
const FIXTURE = path.join(HERE, "fixtures", "profile.json");

test("generate.mjs renders every registered card in both themes from a fixture", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "profile-generate-"));
  try {
    execFileSync(process.execPath, [GENERATE, "--fixture", FIXTURE, "--out", outDir, "--no-readme"], {
      encoding: "utf8",
      stdio: "pipe",
    });

    const themeNames = Object.keys(THEMES);
    for (const card of CARDS) {
      for (const themeName of themeNames) {
        const file = path.join(outDir, `${card.id}-${themeName}.svg`);
        assert.ok(fs.existsSync(file), `expected ${file} to exist`);
        const svg = fs.readFileSync(file, "utf8");
        assertWellFormedSvg(svg);
      }
    }

    const files = fs.readdirSync(outDir);
    assert.equal(files.length, CARDS.length * themeNames.length, "no stray output files");
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("generate.mjs --save-data writes the collected/fixture ProfileData as JSON", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "profile-generate-"));
  const saveDataPath = path.join(outDir, "data.json");
  try {
    execFileSync(
      process.execPath,
      [GENERATE, "--fixture", FIXTURE, "--out", outDir, "--no-readme", "--save-data", saveDataPath],
      { encoding: "utf8", stdio: "pipe" },
    );
    const saved = JSON.parse(fs.readFileSync(saveDataPath, "utf8"));
    const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
    assert.deepEqual(saved, fixture);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
