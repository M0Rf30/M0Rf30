import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { THEMES } from "../lib/svg.mjs";
import { loadFixture, assertWellFormedSvg } from "./helpers.mjs";
import * as banner from "../cards/banner.mjs";
import * as stats from "../cards/stats.mjs";
import * as activity from "../cards/activity.mjs";

const CARDS = [banner, stats, activity];
const THEME_NAMES = Object.keys(THEMES);

function hasRsvgConvert() {
  try {
    execFileSync("rsvg-convert", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function collectIds(svg) {
  return [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
}

for (const mod of CARDS) {
  for (const themeName of THEME_NAMES) {
    const theme = THEMES[themeName];

    test(`${mod.id} (${themeName}): renders a well-formed svg`, () => {
      const svg = mod.render(loadFixture(), theme);
      assertWellFormedSvg(svg);
    });

    test(`${mod.id} (${themeName}): ids are unique`, () => {
      const svg = mod.render(loadFixture(), theme);
      const ids = collectIds(svg);
      assert.deepEqual(ids, [...new Set(ids)], "duplicate id in rendered svg");
    });

    test(`${mod.id} (${themeName}): deterministic across renders`, () => {
      const a = mod.render(loadFixture(), theme);
      const b = mod.render(loadFixture(), theme);
      assert.equal(a, b);
    });

    test(`${mod.id} (${themeName}): handles empty/zero data`, () => {
      const data = loadFixture();
      data.years = [];
      data.totals = {
        stars: 0,
        forks: 0,
        ownRepos: 0,
        followers: 0,
        mergedPRsUpstream: 0,
        upstreamRepos: 0,
        contributionsAllTime: 0,
        contributionsThisYear: 0,
        firstYear: 0,
        yearsOnGitHub: 0,
      };
      data.notable = [];
      data.recentPRs = [];
      data.languages = [];
      const svg = mod.render(data, theme);
      assertWellFormedSvg(svg);
    });
  }

  test(`${mod.id}: light and dark output differ`, () => {
    const light = mod.render(loadFixture(), THEMES.light);
    const dark = mod.render(loadFixture(), THEMES.dark);
    assert.notEqual(light, dark);
  });

  test(`${mod.id}: exports id/alt/render`, () => {
    assert.equal(typeof mod.id, "string");
    assert.ok(mod.id.length > 0);
    assert.equal(typeof mod.alt, "string");
    assert.ok(mod.alt.length > 0);
    assert.equal(typeof mod.render, "function");
  });
}

if (hasRsvgConvert()) {
  test("rsvg-convert renders every card/theme to PNG", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cards-hero-"));
    for (const mod of CARDS) {
      for (const themeName of THEME_NAMES) {
        const svg = mod.render(loadFixture(), THEMES[themeName]);
        const svgPath = path.join(tmpDir, `${mod.id}-${themeName}.svg`);
        const pngPath = path.join(tmpDir, `${mod.id}-${themeName}.png`);
        fs.writeFileSync(svgPath, svg);
        execFileSync("rsvg-convert", ["-o", pngPath, svgPath]);
        assert.ok(fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0);
      }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
}
