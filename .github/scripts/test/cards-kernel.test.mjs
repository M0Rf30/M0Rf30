import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import { THEMES } from "../lib/svg.mjs";
import * as kernelCard from "../cards/kernel.mjs";
import { CARDS } from "../cards/index.mjs";
import { loadFixture, assertWellFormedSvg } from "./helpers.mjs";

function hasRsvgConvert() {
  try {
    execFileSync("rsvg-convert", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("kernel card: well-formed in both themes", () => {
  const data = loadFixture();
  for (const theme of Object.values(THEMES)) {
    const svg = kernelCard.render(data, theme);
    assertWellFormedSvg(svg);
  }
});

test("kernel card: deterministic for the same input", () => {
  const data = loadFixture();
  const a = kernelCard.render(data, THEMES.dark);
  const b = kernelCard.render(data, THEMES.dark);
  assert.equal(a, b);
});

test("kernel card: light and dark differ", () => {
  const data = loadFixture();
  const light = kernelCard.render(data, THEMES.light);
  const dark = kernelCard.render(data, THEMES.dark);
  assert.notEqual(light, dark);
});

test("kernel card: renders a valid empty state when elsewhere is missing", () => {
  const data = loadFixture();
  delete data.elsewhere;
  const svg = kernelCard.render(data, THEMES.dark);
  assertWellFormedSvg(svg);
  assert.match(svg, /No data/);
});

test("kernel card: renders a valid state when elsewhere sources are zero/absent", () => {
  const data = loadFixture();
  data.elsewhere = { kernel: { commits: 0, recent: [] }, postmarketos: { mergedMRs: 0, commits: 0, recent: [] } };
  const svg = kernelCard.render(data, THEMES.light);
  assertWellFormedSvg(svg);
  const noDataCount = svg.match(/No data/g) || [];
  assert.equal(noDataCount.length, 2);
});

test("kernel card: escapes special characters in recent commit/MR titles", () => {
  const data = loadFixture();
  data.elsewhere.kernel.recent = [{ title: `fix <script>&"'`, url: "https://example.test", date: "2026-01-01" }];
  const svg = kernelCard.render(data, THEMES.dark);
  assertWellFormedSvg(svg);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /fix &lt;script&gt;&amp;&quot;&apos;/);
});

test("kernel card: preserves the space between a subsystem prefix and its subject", () => {
  const data = loadFixture();
  data.elsewhere.kernel.recent = [
    { title: "arm64: dts: qcom: sdm630: add SPI7 interface", url: "https://example.test", date: "2026-01-20" },
  ];
  const svg = kernelCard.render(data, THEMES.dark);
  assertWellFormedSvg(svg);
  // The prefix/subject split renders as two <tspan>s; a plain trailing space
  // at that boundary can be silently collapsed by SVG/XML renderers (the
  // regressed bug: "sdm630:add SPI7 interface" with no visible space). A
  // no-break space must survive the split intact.
  assert.match(svg, /qcom: sdm630:\u00a0<\/tspan>/);
  assert.doesNotMatch(svg, /sdm630:add SPI7/);
});

test("kernel card: truncates a very long recent title with an ellipsis", () => {
  const data = loadFixture();
  const longTitle = "subsystem: " + "a very long commit subject that keeps going ".repeat(6).trim();
  data.elsewhere.kernel.recent = [{ title: longTitle, url: "https://example.test", date: "2026-01-01" }];
  const svg = kernelCard.render(data, THEMES.dark);
  assertWellFormedSvg(svg);
  assert.match(svg, /\u2026/);
  assert.doesNotMatch(svg, new RegExp(longTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("kernel card: element ids (if any) are unique within a single render", () => {
  const data = loadFixture();
  const svg = kernelCard.render(data, THEMES.light);
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "duplicate id in rendered SVG");
});

test("kernel card: exposes contract fields and CARDS ordering", () => {
  assert.equal(kernelCard.id, "kernel");
  assert.equal(typeof kernelCard.alt, "string");
  assert.ok(kernelCard.alt.length > 0);

  const ids = CARDS.map((c) => c.id);
  const langIdx = ids.indexOf("languages");
  const kernelIdx = ids.indexOf("kernel");
  const notableIdx = ids.indexOf("notable");
  assert.ok(langIdx >= 0 && kernelIdx >= 0 && notableIdx >= 0, "expected cards present");
  assert.equal(kernelIdx, langIdx + 1, "kernel must come right after languages");
  assert.equal(notableIdx, kernelIdx + 1, "notable must come right after kernel");
});

test("kernel card: rsvg-convert accepts the rendered SVG (skipped if not installed)", (t) => {
  if (!hasRsvgConvert()) {
    t.skip("rsvg-convert not installed");
    return;
  }
  const data = loadFixture();
  const svg = kernelCard.render(data, THEMES.dark);
  const out = path.join(os.tmpdir(), `kernel-card-test-${process.pid}.png`);
  try {
    execFileSync("rsvg-convert", ["-o", out], { input: svg });
    assert.ok(fs.statSync(out).size > 0);
  } finally {
    fs.rmSync(out, { force: true });
  }
});
