#!/usr/bin/env node
// CLI entry point: collect ProfileData (live or from a fixture), render every
// card in both themes, and (optionally) refresh the generated README
// sections. All rendering happens in memory first; files are only written
// once every card has rendered successfully (all-or-nothing).
//
// Usage:
//   node .github/scripts/generate.mjs [--fixture <data.json>] [--save-data <path>]
//                                      [--out <dir>] [--no-readme]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CONFIG } from "./config.mjs";
import { CARDS } from "./cards/index.mjs";
import { THEMES } from "./lib/svg.mjs";
import { createClient } from "./lib/github.mjs";
import { collectProfileData } from "./lib/collect.mjs";
import { replaceSection, renderRecentPRs, renderUpdated } from "./lib/readme.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");

function parseArgs(argv) {
  const args = { fixture: null, saveData: null, out: null, readme: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--fixture") args.fixture = argv[++i];
    else if (arg === "--save-data") args.saveData = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--no-readme") args.readme = false;
    else throw new Error(`generate.mjs: unknown argument "${arg}"`);
  }
  return args;
}

async function loadProfileData(args) {
  if (args.fixture) {
    const fixturePath = path.resolve(process.cwd(), args.fixture);
    return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error(
      "generate.mjs: GITHUB_TOKEN environment variable is required for a live run " +
        "(or pass --fixture <path> to render from a saved ProfileData JSON file).",
    );
    process.exit(1);
  }
  const client = createClient(token);
  return collectProfileData(client, CONFIG);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const data = await loadProfileData(args);

  // Render every card / theme combination into memory first so a single
  // broken card can never leave a half-updated `metrics/` directory behind.
  const rendered = [];
  for (const card of CARDS) {
    for (const themeName of Object.keys(THEMES)) {
      const theme = THEMES[themeName];
      let svg;
      try {
        svg = card.render(data, theme);
      } catch (err) {
        throw new Error(`generate.mjs: failed to render card "${card.id}" (${themeName}): ${err.message}`);
      }
      if (typeof svg !== "string" || svg.length === 0) {
        throw new Error(`generate.mjs: card "${card.id}" (${themeName}) produced empty output`);
      }
      rendered.push({ file: `${card.id}-${themeName}.svg`, content: svg });
    }
  }

  // Everything above succeeded: now perform the actual writes.
  if (args.saveData) {
    const savePath = path.resolve(process.cwd(), args.saveData);
    fs.mkdirSync(path.dirname(savePath), { recursive: true });
    fs.writeFileSync(savePath, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`generate.mjs: saved collected data to ${savePath}`);
  }

  const outDir = path.resolve(REPO_ROOT, args.out || CONFIG.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  let totalBytes = 0;
  for (const { file, content } of rendered) {
    fs.writeFileSync(path.join(outDir, file), content);
    totalBytes += Buffer.byteLength(content);
  }
  console.log(
    `generate.mjs: wrote ${rendered.length} file(s) (${CARDS.length} cards x ${Object.keys(THEMES).length} themes, ` +
      `${totalBytes} bytes total) to ${outDir}`,
  );

  if (args.readme) {
    const readmePath = path.resolve(REPO_ROOT, CONFIG.readmePath);
    let readme = fs.readFileSync(readmePath, "utf8");
    readme = replaceSection(readme, "recent-prs", renderRecentPRs(data.recentPRs));
    readme = replaceSection(readme, "updated", renderUpdated(data.generatedAt));
    fs.writeFileSync(readmePath, readme);
    console.log(`generate.mjs: updated README sections in ${readmePath}`);
  }

  console.log(
    `generate.mjs: summary — stars=${data.totals.stars} forks=${data.totals.forks} ownRepos=${data.totals.ownRepos} ` +
      `mergedPRsUpstream=${data.totals.mergedPRsUpstream} upstreamRepos=${data.totals.upstreamRepos} ` +
      `languages=${data.languages.length} notable=${data.notable.length} recentPRs=${data.recentPRs.length}`,
  );
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
