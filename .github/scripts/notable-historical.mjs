#!/usr/bin/env node
// Finds merged PRs authored by GITHUB_LOGIN on other people's/orgs' repos, going
// back through GitHub's full history (via the Search API, which is not subject to
// the ~1-year lookback window that lowlighter/metrics' `notable` plugin is bound
// by), and renders them as a self-contained SVG badge similar in spirit to
// metrics/plugin-notable.svg.
//
// Zero npm dependencies: Node's built-in global `fetch` only.

import fs from "node:fs";
import path from "node:path";

const API_ROOT = "https://api.github.com";
const USER_AGENT = "notable-historical-script";
const MAX_SEARCH_RESULTS = 1000;
const SEARCH_PER_PAGE = 100;
const MAX_RENDERED_ROWS = 20;

const GITHUB_LOGIN = process.env.GITHUB_LOGIN || "M0Rf30";
const OUTPUT_PATH = process.env.OUTPUT_PATH || "metrics/notable-historical.svg";

/**
 * Query the Search API for merged PRs authored by `login` on repos not owned by
 * `login` and not in the `zextras` org, paginating up to the API's 1000-result
 * ceiling. Returns a Map of "owner/repo" -> number of merged PRs found.
 */
async function searchMergedPRs(login, token) {
  const query = `is:pr is:merged author:${login} -user:${login} -org:zextras`;
  const prCountByRepo = new Map();

  for (let page = 1; page <= MAX_SEARCH_RESULTS / SEARCH_PER_PAGE; page++) {
    const url = new URL(`${API_ROOT}/search/issues`);
    url.searchParams.set("q", query);
    url.searchParams.set("per_page", String(SEARCH_PER_PAGE));
    url.searchParams.set("page", String(page));

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": USER_AGENT,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub search failed: ${res.status} ${res.statusText}: ${body}`);
    }

    const data = await res.json();
    const items = data.items || [];

    for (const item of items) {
      const match = /^https:\/\/api\.github\.com\/repos\/(.+)$/.exec(item.repository_url || "");
      if (!match) continue;
      const fullName = match[1];
      prCountByRepo.set(fullName, (prCountByRepo.get(fullName) || 0) + 1);
    }

    if (items.length < SEARCH_PER_PAGE) break;
  }

  return prCountByRepo;
}

/**
 * Fetch repo metadata needed to filter/sort/render. Returns null (caller should
 * skip) on any request failure or if the repo is a fork.
 */
async function fetchRepoMeta(fullName, token) {
  try {
    const res = await fetch(`${API_ROOT}/repos/${fullName}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": USER_AGENT,
      },
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (data.fork) return null;

    return {
      fullName,
      stargazersCount: data.stargazers_count || 0,
      ownerLogin: data.owner?.login,
      avatarUrl: data.owner?.avatar_url,
    };
  } catch {
    return null;
  }
}

/** Fetch an image and base64-encode it as a data: URI using its real content-type. */
async function toDataUri(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Failed to fetch avatar ${url}: ${res.status} ${res.statusText}`);
  const mime = res.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const SVG_WIDTH = 480;
const HEADER_HEIGHT = 44;
const ROW_HEIGHT = 44;
const ROW_GAP = 4;
const PADDING_X = 12;
const PADDING_BOTTOM = 12;
const AVATAR_SIZE = 28;

function renderHeader() {
  return `
  <text x="${PADDING_X}" y="26" font-size="16" font-weight="400" fill="#0366d6">🎩 Notable contributions (historical)</text>`;
}

function renderRow(entry, index) {
  const rowY = HEADER_HEIGHT + index * (ROW_HEIGHT + ROW_GAP);
  const avatarX = PADDING_X + 8;
  const avatarY = rowY + (ROW_HEIGHT - AVATAR_SIZE) / 2;
  const avatarCx = avatarX + AVATAR_SIZE / 2;
  const avatarCy = avatarY + AVATAR_SIZE / 2;
  const textX = avatarX + AVATAR_SIZE + 12;
  const clipId = `avatar-clip-${index}`;

  const avatarMarkup = entry.avatarDataUri
    ? `
      <clipPath id="${clipId}">
        <circle cx="${avatarCx}" cy="${avatarCy}" r="${AVATAR_SIZE / 2}" />
      </clipPath>
      <image x="${avatarX}" y="${avatarY}" width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" href="${entry.avatarDataUri}" clip-path="url(#${clipId})" />`
    : `
      <circle cx="${avatarCx}" cy="${avatarCy}" r="${AVATAR_SIZE / 2}" fill="#959da540" />`;

  const prLabel = entry.mergedPrCount === 1 ? "PR" : "PRs";

  return `
    <g>
      <rect x="${PADDING_X}" y="${rowY}" width="${SVG_WIDTH - PADDING_X * 2}" height="${ROW_HEIGHT}" rx="6" fill="#959da520" stroke="#959da5" stroke-width="1" />${avatarMarkup}
      <text x="${textX}" y="${rowY + 19}" font-size="13" font-weight="600" fill="#24292e">${escapeXml(entry.fullName)}</text>
      <text x="${textX}" y="${rowY + 34}" font-size="11" fill="#777777">★ ${entry.stargazersCount} · ${entry.mergedPrCount} ${prLabel}</text>
    </g>`;
}

/** Render the full SVG, or a small empty-state SVG when `entries` is empty. */
function renderSvg(entries) {
  const commonStyle = `svg{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji}`;

  if (entries.length === 0) {
    const height = HEADER_HEIGHT + 24 + PADDING_BOTTOM;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${height}" viewBox="0 0 ${SVG_WIDTH} ${height}">
  <style>${commonStyle}</style>${renderHeader()}
  <text x="${PADDING_X}" y="${HEADER_HEIGHT + 18}" font-size="13" fill="#777777">No historical notable contributions found</text>
</svg>
`;
  }

  const height = HEADER_HEIGHT + entries.length * (ROW_HEIGHT + ROW_GAP) - ROW_GAP + PADDING_BOTTOM;
  const rows = entries.map((entry, index) => renderRow(entry, index)).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${height}" viewBox="0 0 ${SVG_WIDTH} ${height}">
  <style>${commonStyle}</style>${renderHeader()}${rows}
</svg>
`;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("GITHUB_TOKEN environment variable is required.");
    process.exit(1);
  }

  const login = GITHUB_LOGIN;

  const prCountByRepo = await searchMergedPRs(login, token);
  const uniqueRepoNames = [...prCountByRepo.keys()];

  const metas = [];
  for (const fullName of uniqueRepoNames) {
    const meta = await fetchRepoMeta(fullName, token);
    if (meta) metas.push(meta);
  }

  metas.sort((a, b) => b.stargazersCount - a.stargazersCount);
  const topMetas = metas.slice(0, MAX_RENDERED_ROWS);

  const avatarCache = new Map();
  const entries = [];
  for (const meta of topMetas) {
    let avatarDataUri = null;
    if (meta.avatarUrl) {
      if (avatarCache.has(meta.avatarUrl)) {
        avatarDataUri = avatarCache.get(meta.avatarUrl);
      } else {
        try {
          avatarDataUri = await toDataUri(meta.avatarUrl);
        } catch (err) {
          console.error(`Warning: could not fetch avatar for ${meta.fullName}: ${err.message}`);
          avatarDataUri = null;
        }
        avatarCache.set(meta.avatarUrl, avatarDataUri);
      }
    }

    entries.push({
      fullName: meta.fullName,
      stargazersCount: meta.stargazersCount,
      mergedPrCount: prCountByRepo.get(meta.fullName) || 0,
      avatarDataUri,
    });
  }

  const svg = renderSvg(entries);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, svg);

  console.log(
    `notable-historical: ${uniqueRepoNames.length} unique repo(s) found, ${entries.length} entry(ies) rendered to ${OUTPUT_PATH}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.stack || String(err));
    process.exit(1);
  });
}
