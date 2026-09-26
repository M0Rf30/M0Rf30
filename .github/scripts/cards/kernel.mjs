// "Linux kernel & postmarketOS" — contributions the user makes under the same
// handle outside GitHub's contribution graph: mainline Linux kernel commits
// (mirrored on GitHub, found via commit search `author:<login>`) and
// postmarketOS GitLab activity (merged merge requests + pmaports commits).
// Two side-by-side panels, one per source, in the tile/row language of
// stats.mjs and notable.mjs (surface fill, border, rx 8).
import { CONFIG } from "../config.mjs";
import { CARD_WIDTH, PAD, HEADER_HEIGHT, card, escapeXml, formatNumber, estimateTextWidth, truncate } from "../lib/svg.mjs";

export const id = "kernel";
export const alt = "Linux kernel and postmarketOS contributions";

const PANEL_GAP = 12;
const PANEL_TOP = HEADER_HEIGHT + 12; // 72
const INNER_PAD = 14;
const PANEL_W = (CARD_WIDTH - PAD * 2 - PANEL_GAP) / 2;

// Vertical rhythm inside a panel, measured from the panel's own top edge.
// Both panels always reserve the same slots (header / value / note / list)
// so the two columns stay the same height whether or not a given source has
// a secondary note or any recent items.
const HEADER_OFFSET = 22;
const VALUE_OFFSET = 54;
const NOTE_OFFSET = 74;
const LIST_LABEL_OFFSET = 96;
const LIST_FIRST_OFFSET = LIST_LABEL_OFFSET + 18;
const LIST_ITEM_GAP = 16;
const MAX_ITEMS = 3;
const PANEL_BOTTOM_PAD = 14;
const PANEL_H = LIST_FIRST_OFFSET + (MAX_ITEMS - 1) * LIST_ITEM_GAP + PANEL_BOTTOM_PAD;

function pluralize(n, singular, plural) {
  return n === 1 ? singular : plural;
}

function yearRange(first, last) {
  if (!first && !last) return "";
  if (!last || first === last) return String(first ?? last);
  return `${first}\u2013${last}`;
}

function buildSubtitle(kernel, pmos) {
  const parts = [];
  const commits = Number(kernel?.commits) || 0;
  const mergedMRs = Number(pmos?.mergedMRs) || 0;
  if (commits > 0) parts.push(`${formatNumber(commits)} mainline ${pluralize(commits, "commit", "commits")}`);
  if (mergedMRs > 0) parts.push(`${formatNumber(mergedMRs)} merged ${pluralize(mergedMRs, "MR", "MRs")}`);
  return parts.length ? parts.join(" \u00b7 ") : "same handle, beyond GitHub";
}

/** Split "subsystem: rest of message" so the prefix can render muted; falls
 * back to a single plain span when there is no ": " or the text had to be
 * truncated (splitting an already-cut string could chop the prefix itself). */
function renderRecentTitle(theme, x, y, title, maxWidth) {
  const full = String(title || "");
  const fitted = truncate(full, maxWidth, 12);
  const colon = fitted === full ? full.lastIndexOf(": ") : -1;
  if (colon > 0) {
    const prefix = full.slice(0, colon);
    const rest = full.slice(colon + 2);
    // SVG/XML collapses a plain trailing/leading space at a <tspan> boundary
    // in some renderers even with default xml:space, which silently glued
    // "subsystem:" to the next word. A no-break space is never whitespace-
    // collapsed, and xml:space="preserve" is kept as a second safety net.
    return (
      `<text x="${x}" y="${y}" font-size="12" xml:space="preserve">` +
      `<tspan fill="${theme.subtle}">${escapeXml(prefix)}:\u00a0</tspan>` +
      `<tspan fill="${theme.fg}">${escapeXml(rest)}</tspan>` +
      `</text>`
    );
  }
  return `<text x="${x}" y="${y}" font-size="12" fill="${theme.fg}" xml:space="preserve">${escapeXml(fitted)}</text>`;
}

function renderRecentList(theme, x, innerWidth, items, baseY) {
  const list = Array.isArray(items) ? items.slice(0, MAX_ITEMS) : [];
  if (list.length === 0) return "";
  let out = `<text x="${x}" y="${baseY + LIST_LABEL_OFFSET}" font-size="11" class="t-subtle">Latest</text>`;
  list.forEach((item, i) => {
    const y = baseY + LIST_FIRST_OFFSET + i * LIST_ITEM_GAP;
    const date = String(item?.date || "");
    const dateWidth = date ? estimateTextWidth(date, 11, { mono: true }) : 0;
    const gap = date ? dateWidth + 8 : 0;
    const titleX = x + gap;
    const titleMaxWidth = Math.max(innerWidth - gap, 20);
    if (date) {
      out += `<text x="${x}" y="${y}" font-size="11" class="t-mono t-subtle">${escapeXml(date)}</text>`;
    }
    out += renderRecentTitle(theme, titleX, y, item?.title, titleMaxWidth);
  });
  return out;
}

function renderPanel({ theme, x, delay, label, yearLabel, empty, valueText, captionText, noteText, recent }) {
  const y = PANEL_TOP;
  const innerX = x + INNER_PAD;
  const innerWidth = PANEL_W - INNER_PAD * 2;
  const rightX = x + PANEL_W - INNER_PAD;
  const headerY = y + HEADER_OFFSET;

  let inner = `<text x="${innerX}" y="${headerY}" font-size="14" font-weight="600" fill="${theme.fg}">${escapeXml(label)}</text>`;
  if (yearLabel) {
    inner += `<text x="${rightX}" y="${headerY}" text-anchor="end" font-size="11" class="t-mono t-subtle">${escapeXml(yearLabel)}</text>`;
  }

  if (empty) {
    inner += `<text x="${innerX}" y="${y + VALUE_OFFSET}" class="t-sub">No data</text>`;
  } else {
    inner +=
      `<text x="${innerX}" y="${y + VALUE_OFFSET}">` +
      `<tspan class="t-value">${escapeXml(valueText)}</tspan>` +
      `<tspan dx="6" font-size="13" fill="${theme.muted}"> ${escapeXml(captionText)}</tspan>` +
      `</text>`;
    if (noteText) {
      inner += `<text x="${innerX}" y="${y + NOTE_OFFSET}" font-size="12" class="t-muted">${escapeXml(noteText)}</text>`;
    }
    inner += renderRecentList(theme, innerX, innerWidth, recent, y);
  }

  return (
    `<g class="a-fade" style="animation-delay:${delay}ms">` +
    `<rect x="${x}" y="${y}" width="${PANEL_W}" height="${PANEL_H}" rx="8" fill="${theme.surface}" stroke="${theme.border}"/>` +
    inner +
    `</g>`
  );
}

export function render(data, theme) {
  const elsewhere = data?.elsewhere || {};
  const kernel = elsewhere.kernel;
  const pmos = elsewhere.postmarketos;
  const kernelCfg = CONFIG.elsewhere?.kernel;
  const pmosCfg = CONFIG.elsewhere?.postmarketos;

  const subtitle = buildSubtitle(kernel, pmos);

  const leftX = PAD;
  const rightX = PAD + PANEL_W + PANEL_GAP;

  const kernelEmpty = !kernel || !Number(kernel.commits);
  const kernelCommits = Number(kernel?.commits) || 0;

  const kernelPanel = renderPanel({
    theme,
    x: leftX,
    delay: 0,
    label: kernelCfg?.label || "Linux kernel",
    yearLabel: kernelEmpty ? "" : yearRange(kernel.firstYear, kernel.lastYear),
    empty: kernelEmpty,
    valueText: kernelEmpty ? "" : formatNumber(kernelCommits),
    captionText: kernelEmpty ? "" : `${pluralize(kernelCommits, "commit", "commits")} in mainline Linux`,
    noteText: "",
    recent: kernelEmpty ? [] : kernel.recent,
  });

  const pmosMergedMRs = Number(pmos?.mergedMRs) || 0;
  const pmosCommits = Number(pmos?.commits) || 0;
  const pmosEmpty = !pmos || (!pmosMergedMRs && !pmosCommits);
  const pmosNote = pmosCommits > 0 ? `${formatNumber(pmosCommits)} ${pluralize(pmosCommits, "commit", "commits")} to pmaports` : "";

  const pmosPanel = renderPanel({
    theme,
    x: rightX,
    delay: 90,
    label: pmosCfg?.label || "postmarketOS",
    yearLabel: pmosEmpty ? "" : yearRange(pmos.firstYear, pmos.lastYear),
    empty: pmosEmpty,
    valueText: pmosEmpty ? "" : formatNumber(pmosMergedMRs),
    captionText: pmosEmpty ? "" : `merged ${pluralize(pmosMergedMRs, "MR", "MRs")}`,
    noteText: pmosEmpty ? "" : pmosNote,
    recent: pmosEmpty ? [] : pmos.recent,
  });

  const height = PANEL_TOP + PANEL_H + PAD;
  const body = kernelPanel + pmosPanel;

  return card({
    theme,
    height,
    title: "Linux kernel & postmarketOS",
    iconName: "commit",
    subtitle,
    body,
    desc: subtitle,
  });
}
