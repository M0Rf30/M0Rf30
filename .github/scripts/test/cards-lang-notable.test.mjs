import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import { THEMES } from "../lib/svg.mjs";
import { loadFixture, assertWellFormedSvg } from "./helpers.mjs";
import * as languages from "../cards/languages.mjs";
import * as notable from "../cards/notable.mjs";

const CARDS = [languages, notable];

// A minimal 1x1 transparent PNG, base64-encoded, to exercise the real
// <image>+clip-path path (as opposed to the monogram fallback).
const TINY_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function hasRsvgConvert() {
  try {
    execFileSync("rsvg-convert", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function idsOf(svg) {
  return [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
}

for (const mod of CARDS) {
  test(`${mod.id}: exports the card contract`, () => {
    assert.equal(typeof mod.id, "string");
    assert.equal(typeof mod.alt, "string");
    assert.equal(typeof mod.render, "function");
  });

  for (const themeName of Object.keys(THEMES)) {
    test(`${mod.id}: renders a well-formed ${themeName} SVG from the fixture`, () => {
      const svg = mod.render(loadFixture(), THEMES[themeName]);
      assertWellFormedSvg(svg);
    });
  }

  test(`${mod.id}: rendering is deterministic`, () => {
    const data = loadFixture();
    const a = mod.render(data, THEMES.light);
    const b = mod.render(data, THEMES.light);
    assert.equal(a, b);
  });

  test(`${mod.id}: light and dark output differ`, () => {
    const data = loadFixture();
    const light = mod.render(data, THEMES.light);
    const dark = mod.render(data, THEMES.dark);
    assert.notEqual(light, dark);
  });

  test(`${mod.id}: never renders generatedAt`, () => {
    const svg = mod.render(loadFixture(), THEMES.light);
    assert.doesNotMatch(svg, /generatedAt|2026-09-26T09:00:00Z/);
  });

  test(`${mod.id}: element ids are unique within the SVG`, () => {
    const svg = mod.render(loadFixture(), THEMES.dark);
    const ids = idsOf(svg);
    assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.join(", ")}`);
  });

  if (hasRsvgConvert()) {
    test(`${mod.id}: rsvg-convert accepts the output (both themes)`, () => {
      for (const themeName of Object.keys(THEMES)) {
        const svg = mod.render(loadFixture(), THEMES[themeName]);
        const out = path.join(os.tmpdir(), `cards-ln-${mod.id}-${themeName}-${process.pid}.png`);
        try {
          assert.doesNotThrow(() => {
            execFileSync("rsvg-convert", ["-o", out], { input: svg });
          }, `${themeName} SVG failed to convert`);
          assert.ok(fs.statSync(out).size > 0, "expected a non-empty PNG");
        } finally {
          fs.rmSync(out, { force: true });
        }
      }
    });
  }
}

test("languages: empty array renders an empty-state line, not NaN/undefined", () => {
  const data = loadFixture();
  data.languages = [];
  const svg = languages.render(data, THEMES.light);
  assertWellFormedSvg(svg);
  assert.match(svg, /No language data/);
});

test("languages: null colour falls back to theme.subtle, Other uses theme.border", () => {
  const data = loadFixture();
  data.languages = [
    { name: "Mystery", color: null, share: 0.5 },
    { name: "Other", color: null, share: 0.5 },
  ];
  const svg = languages.render(data, THEMES.dark);
  assertWellFormedSvg(svg);
  assert.match(svg, new RegExp(THEMES.dark.subtle.replace("#", "#")));
  assert.match(svg, new RegExp(THEMES.dark.border));
});

test("languages: segments are clipped to the rounded bar and grow in staggered", () => {
  const svg = languages.render(loadFixture(), THEMES.light);
  assert.match(svg, /<clipPath id="languages-bar-clip">/);
  assert.match(svg, /class="a-grow-x" style="animation-delay:0ms"/);
  assert.match(svg, /class="a-grow-x" style="animation-delay:60ms"/);
});

test("languages: escapes special characters in language names", () => {
  const data = loadFixture();
  data.languages = [{ name: `A&B<C>"'`, color: "#ff0000", share: 1 }];
  const svg = languages.render(data, THEMES.light);
  assertWellFormedSvg(svg);
  assert.match(svg, /A&amp;B&lt;C&gt;&quot;&apos;/);
});

test("notable: empty array renders an empty-state line", () => {
  const data = loadFixture();
  data.notable = [];
  const svg = notable.render(data, THEMES.dark);
  assertWellFormedSvg(svg);
  assert.match(svg, /No upstream contributions yet/);
});

test("notable: a very long owner/name truncates with an ellipsis and does not overflow the row", () => {
  const data = loadFixture();
  const longOwner = "a".repeat(60);
  const longName = "b".repeat(60);
  data.notable = [
    {
      repo: `${longOwner}/${longName}`,
      owner: longOwner,
      name: longName,
      url: `https://github.com/${longOwner}/${longName}`,
      description: "",
      stars: 12,
      mergedPRs: 1,
      commits: 1,
      firstYear: 2020,
      lastYear: 2024,
      avatarDataUri: null,
    },
  ];
  const svg = notable.render(data, THEMES.light);
  assertWellFormedSvg(svg);
  assert.match(svg, /\u2026/, "expected an ellipsis from truncation");
  assert.doesNotMatch(svg, new RegExp(longName), "full untruncated name must not appear");
});

test("notable: mergedPRs 0 and commits 0 omit those stat segments", () => {
  const data = loadFixture();
  data.notable = [
    {
      repo: "owner/zero-stats",
      owner: "owner",
      name: "zero-stats",
      url: "https://github.com/owner/zero-stats",
      description: "",
      stars: 5,
      mergedPRs: 0,
      commits: 0,
      firstYear: 2021,
      lastYear: 2021,
      avatarDataUri: null,
    },
  ];
  const svg = notable.render(data, THEMES.light);
  assertWellFormedSvg(svg);
  assert.doesNotMatch(svg, /\d+\s+PRs?<\/text>/);
  assert.doesNotMatch(svg, /\d+\s+commits?<\/text>/);
});

test("notable: single-year range collapses to one year", () => {
  const data = loadFixture();
  data.notable = [
    {
      repo: "owner/same-year",
      owner: "owner",
      name: "same-year",
      url: "https://github.com/owner/same-year",
      description: "",
      stars: 5,
      mergedPRs: 1,
      commits: 1,
      firstYear: 2023,
      lastYear: 2023,
      avatarDataUri: null,
    },
  ];
  const svg = notable.render(data, THEMES.light);
  assert.match(svg, />2023</);
  assert.doesNotMatch(svg, /2023\u20132023/);
});

test("notable: escapes special characters in owner/name", () => {
  const data = loadFixture();
  data.notable = [
    {
      repo: `A&B/C<D>"'`,
      owner: `A&B`,
      name: `C<D>"'`,
      url: "https://github.com/A%26B/C",
      description: "",
      stars: 1,
      mergedPRs: 1,
      commits: 1,
      firstYear: 2020,
      lastYear: 2021,
      avatarDataUri: null,
    },
  ];
  const svg = notable.render(data, THEMES.dark);
  assertWellFormedSvg(svg);
  assert.match(svg, /A&amp;B/);
  assert.match(svg, /C&lt;D&gt;&quot;&apos;/);
});

test("notable: a real data-URI avatar renders an <image> clipped to a circle", () => {
  const data = loadFixture();
  data.notable[0].avatarDataUri = TINY_PNG_DATA_URI;
  const svg = notable.render(data, THEMES.light);
  assertWellFormedSvg(svg);
  assert.match(svg, /<image[^>]*href="data:image\/png;base64,[^"]+"[^>]*clip-path="url\(#av-0\)"/);
  assert.match(svg, /<clipPath id="av-0">/);
});

test("notable: rows are filled row-major (col 0/1 alternate by index) and use unique avatar ids", () => {
  const data = loadFixture();
  data.notable[0].avatarDataUri = TINY_PNG_DATA_URI;
  data.notable[1].avatarDataUri = TINY_PNG_DATA_URI;
  data.notable[2].avatarDataUri = TINY_PNG_DATA_URI;
  const svg = notable.render(data, THEMES.light);
  const avatarIds = idsOf(svg).filter((i) => i.startsWith("av-"));
  assert.equal(new Set(avatarIds).size, avatarIds.length);
  assert.deepEqual(avatarIds, ["av-0", "av-1", "av-2"]);
});
