// "At a glance" — an 8-tile grid of headline numbers.
import { CONFIG } from "../config.mjs";
import { CARD_WIDTH, PAD, HEADER_HEIGHT, card, icon, escapeXml, formatNumber, truncate } from "../lib/svg.mjs";

export const id = "stats";
export const alt = `GitHub stats for ${CONFIG.displayName} — stars, forks, PRs and contributions at a glance.`;

const COLS = 4;
const ROWS = 2;
const GAP = 12;
const TILE_H = 88;
const GRID_TOP = HEADER_HEIGHT + 16;

function buildTiles(totals) {
  return [
    { iconName: "star", value: formatNumber(totals.stars), label: "Stars earned" },
    { iconName: "fork", value: formatNumber(totals.forks), label: "Forks" },
    { iconName: "repo", value: formatNumber(totals.ownRepos), label: "Original repos" },
    { iconName: "people", value: formatNumber(totals.followers), label: "Followers" },
    { iconName: "merge", value: formatNumber(totals.mergedPRsUpstream), label: "Upstream PRs merged" },
    { iconName: "code", value: formatNumber(totals.upstreamRepos), label: "Upstream projects" },
    { iconName: "commit", value: formatNumber(totals.contributionsAllTime), label: "Contributions all-time" },
    {
      iconName: "calendar",
      value: String(totals.yearsOnGitHub ?? 0),
      label: totals.firstYear ? `Years on GitHub (${totals.firstYear})` : "Years on GitHub",
    },
  ];
}

export function render(data, theme) {
  const totals = data?.totals || {};
  const years = Array.isArray(data?.years) ? data.years : [];
  const lastYear = years.length ? years[years.length - 1] : null;
  const thisYearContribs = (totals.contributionsThisYear || 0).toLocaleString("en-US");
  const subtitle = lastYear ? `${thisYearContribs} contributions in ${lastYear.year}` : `${thisYearContribs} contributions`;

  const tiles = buildTiles(totals);
  const contentW = CARD_WIDTH - PAD * 2;
  const tileW = (contentW - (COLS - 1) * GAP) / COLS;

  let body = "";
  tiles.forEach((t, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = PAD + col * (tileW + GAP);
    const y = GRID_TOP + row * (TILE_H + GAP);
    const delay = i * 55;
    body +=
      `<g class="a-fade" style="animation-delay:${delay}ms">` +
      `<rect x="${x.toFixed(2)}" y="${y}" width="${tileW.toFixed(2)}" height="${TILE_H}" rx="8" fill="${theme.surface}" stroke="${theme.border}"/>` +
      icon(t.iconName, { x: x + 16, y: y + 14, size: 18, fill: theme.accent }) +
      `<text x="${(x + 16).toFixed(2)}" y="${y + 56}" class="t-value">${escapeXml(t.value)}</text>` +
      `<text x="${(x + 16).toFixed(2)}" y="${y + 74}" class="t-label">${escapeXml(truncate(t.label, tileW - 32, 12))}</text>` +
      `</g>`;
  });

  const height = GRID_TOP + ROWS * TILE_H + (ROWS - 1) * GAP + PAD;

  return card({
    theme,
    height,
    title: "At a glance",
    iconName: "pulse",
    subtitle,
    body,
    desc: subtitle,
  });
}
