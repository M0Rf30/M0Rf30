// "Languages" card: a single rounded stacked bar (share of each language
// across the user's own, non-fork repositories) plus a legend grid below it.
import {
  PAD,
  HEADER_HEIGHT,
  CARD_WIDTH,
  card,
  escapeXml,
  formatNumber,
  formatPercent,
  estimateTextWidth,
  truncate,
} from "../lib/svg.mjs";

export const id = "languages";
export const alt = "Most used languages";

const BAR_HEIGHT = 12;
const BAR_RADIUS = 6;
const BAR_TOP = HEADER_HEIGHT + 16; // 76
const BAR_GAP = 2; // px between segments
const LEGEND_GAP_ABOVE = 20;
const LEGEND_COLS = 3;
const LEGEND_ROW_H = 28;
const LEGEND_GUTTER = 24;
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

function pluralRepos(n) {
  return n === 1 ? "repository" : "repositories";
}

/** Segment colour: "Other" is always the neutral border tone; a missing or
 * malformed colour falls back to the subtle tone rather than leaking `null`. */
function colorFor(theme, lang) {
  if (lang.name === "Other") return theme.border;
  if (typeof lang.color === "string" && HEX_RE.test(lang.color)) return lang.color;
  return theme.subtle;
}

export function render(data, theme) {
  const languages = Array.isArray(data?.languages) ? data.languages : [];
  const ownRepos = Number(data?.totals?.ownRepos) || 0;
  const subtitle = `across ${formatNumber(ownRepos)} original ${pluralRepos(ownRepos)}`;
  const barX = PAD;
  const barWidth = CARD_WIDTH - PAD * 2;

  if (languages.length === 0) {
    const emptyY = HEADER_HEIGHT + 34;
    const height = emptyY + 20;
    const body = `<text x="${PAD}" y="${emptyY}" class="t-sub">No language data</text>`;
    return card({ theme, height, title: "Languages", iconName: "code", subtitle, body });
  }

  // Segment widths are proportional to `share`, normalised so rounding drift
  // in the source data can't push the bar past 100%, with a fixed 2px gap
  // between segments eaten out of the usable width.
  const total = languages.reduce((sum, l) => sum + (Number(l.share) || 0), 0) || 1;
  const gaps = Math.max(languages.length - 1, 0) * BAR_GAP;
  const usable = Math.max(barWidth - gaps, 0);
  let cursor = barX;
  const clipId = "languages-bar-clip";
  let segMarkup = "";
  languages.forEach((lang, i) => {
    const share = Number(lang.share) || 0;
    const w = (share / total) * usable;
    segMarkup +=
      `<rect class="a-grow-x" style="animation-delay:${i * 60}ms" ` +
      `x="${cursor.toFixed(2)}" y="${BAR_TOP}" width="${Math.max(w, 0).toFixed(2)}" ` +
      `height="${BAR_HEIGHT}" fill="${colorFor(theme, lang)}"/>`;
    cursor += w + BAR_GAP;
  });

  const defs =
    `<clipPath id="${clipId}"><rect x="${barX}" y="${BAR_TOP}" width="${barWidth}" ` +
    `height="${BAR_HEIGHT}" rx="${BAR_RADIUS}"/></clipPath>`;

  const barMarkup =
    `<rect x="${barX}" y="${BAR_TOP}" width="${barWidth}" height="${BAR_HEIGHT}" ` +
    `rx="${BAR_RADIUS}" fill="${theme.track}" stroke="${theme.border}"/>` +
    `<g clip-path="url(#${clipId})">${segMarkup}</g>`;

  // Legend: fixed 3-column grid, filled row-major, colour dot + name + %.
  const legendTop = BAR_TOP + BAR_HEIGHT + LEGEND_GAP_ABOVE;
  const colW = (barWidth - (LEGEND_COLS - 1) * LEGEND_GUTTER) / LEGEND_COLS;
  const rows = Math.ceil(languages.length / LEGEND_COLS);
  const maxNameWidth = colW - 18 - 50;
  let legendMarkup = "";
  languages.forEach((lang, i) => {
    const col = i % LEGEND_COLS;
    const row = Math.floor(i / LEGEND_COLS);
    const colX = barX + col * (colW + LEGEND_GUTTER);
    const rowY = legendTop + row * LEGEND_ROW_H;
    const cy = rowY + LEGEND_ROW_H / 2;
    const color = colorFor(theme, lang);
    const name = truncate(lang.name ?? "", maxNameWidth, 13);
    const pct = formatPercent(lang.share);
    legendMarkup +=
      `<circle cx="${colX + 6}" cy="${cy}" r="5" fill="${color}"/>` +
      `<text x="${colX + 18}" y="${cy + 4}" font-size="13" fill="${theme.fg}">${escapeXml(name)}</text>` +
      `<text x="${colX + colW}" y="${cy + 4}" text-anchor="end" font-size="12" class="t-mono t-muted">${escapeXml(pct)}</text>`;
  });

  const legendBottom = legendTop + rows * LEGEND_ROW_H;
  const height = legendBottom + PAD;
  const body = barMarkup + legendMarkup;

  return card({ theme, height, title: "Languages", iconName: "code", subtitle, defs, body });
}
