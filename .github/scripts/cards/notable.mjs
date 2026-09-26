// "Upstream contributions" card: a two-column grid of the repositories the
// user has merged pull requests / commits into that they don't own. Replaces
// the old lowlighter "notable contributions" + "merged PRs" cards, which
// hard-coded light-mode text colours and were unreadable in dark mode.
import {
  PAD,
  HEADER_HEIGHT,
  CARD_WIDTH,
  card,
  icon,
  avatar,
  escapeXml,
  formatNumber,
  estimateTextWidth,
  truncate,
} from "../lib/svg.mjs";

export const id = "notable";
export const alt = "Upstream open-source contributions";

const ROW_H = 52;
const ROW_GAP = 8;
const COL_GAP = 12;
const COLS = 2;
const GRID_TOP = HEADER_HEIGHT + 12; // 72
const AVATAR_SIZE = 28;
const ROW_PAD_X = 10;
const RIGHT_PAD = 10;
const STAT_GAP = 14;

function pluralize(n, singular, plural) {
  return n === 1 ? singular : plural;
}

function yearLabelFor(entry) {
  const first = entry.firstYear;
  const last = entry.lastYear;
  if (!first && !last) return "";
  if (!last || first === last) return String(first ?? last);
  return `${first}\u2013${last}`;
}

export function render(data, theme) {
  const notable = Array.isArray(data?.notable) ? data.notable : [];
  const mergedPRsUpstream = Number(data?.totals?.mergedPRsUpstream) || 0;
  const upstreamRepos = Number(data?.totals?.upstreamRepos) || 0;
  const subtitle =
    `${formatNumber(mergedPRsUpstream)} ${pluralize(mergedPRsUpstream, "merged PR", "merged PRs")} ` +
    `across ${formatNumber(upstreamRepos)} ${pluralize(upstreamRepos, "project", "projects")}`;

  if (notable.length === 0) {
    const emptyY = HEADER_HEIGHT + 34;
    const height = emptyY + 20;
    const body = `<text x="${PAD}" y="${emptyY}" class="t-sub">No upstream contributions yet</text>`;
    return card({ theme, height, title: "Upstream contributions", iconName: "merge", subtitle, body });
  }

  const contentWidth = CARD_WIDTH - PAD * 2;
  const colWidth = (contentWidth - (COLS - 1) * COL_GAP) / COLS;
  const rows = Math.ceil(notable.length / COLS);

  let body = "";
  notable.forEach((entry, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = PAD + col * (colWidth + COL_GAP);
    const y = GRID_TOP + row * (ROW_H + ROW_GAP);
    const delay = Math.min(i, 24) * 25;

    body +=
      `<rect x="${x}" y="${y}" width="${colWidth}" height="${ROW_H}" rx="8" ` +
      `fill="${theme.surface}" stroke="${theme.border}" class="a-fade" style="animation-delay:${delay}ms"/>`;

    const avatarY = y + (ROW_H - AVATAR_SIZE) / 2;
    body += avatar({
      theme,
      x: x + ROW_PAD_X,
      y: avatarY,
      size: AVATAR_SIZE,
      dataUri: entry.avatarDataUri,
      label: entry.owner,
      id: `av-${i}`,
    });

    const textX = x + ROW_PAD_X + AVATAR_SIZE + 10;
    const rowRight = x + colWidth - RIGHT_PAD;
    const yearLabel = yearLabelFor(entry);
    const yearWidth = yearLabel ? estimateTextWidth(yearLabel, 11, { mono: true }) : 0;
    const yearReserve = yearLabel ? yearWidth + 18 : 0;
    // estimateTextWidth is a rough per-character average; derate the budget
    // so long runs of wide characters (worst case: no narrow letters at all)
    // still leave a visible gap instead of touching the year label.
    const TRUNCATE_SAFETY = 0.85;
    const maxTitleWidth = Math.max((rowRight - textX - yearReserve) * TRUNCATE_SAFETY, 20);

    const ownerPrefix = `${entry.owner}/`;
    let ownerWidth = estimateTextWidth(ownerPrefix, 13);
    let ownerDisplay = ownerPrefix;
    if (ownerWidth > maxTitleWidth * 0.6) {
      ownerDisplay = truncate(ownerPrefix, maxTitleWidth * 0.55, 13);
      ownerWidth = estimateTextWidth(ownerDisplay, 13);
    }
    const nameMaxWidth = Math.max(maxTitleWidth - ownerWidth, 16);
    const displayName = truncate(entry.name ?? "", nameMaxWidth, 13, { bold: true });

    const nameLineY = y + 20;
    body +=
      `<text x="${textX}" y="${nameLineY}" font-size="13" fill="${theme.muted}">` +
      `${escapeXml(ownerDisplay)}<tspan font-weight="600" fill="${theme.fg}">${escapeXml(displayName)}</tspan>` +
      `</text>`;

    if (yearLabel) {
      body +=
        `<text x="${rowRight}" y="${nameLineY}" text-anchor="end" font-size="11" ` +
        `class="t-mono t-subtle">${escapeXml(yearLabel)}</text>`;
    }

    // Second line: star count always; merge / commit counts only when > 0.
    const statY = y + 38;
    const iconY = statY - 10;
    let cursorX = textX;

    const starLabel = formatNumber(entry.stars);
    body +=
      icon("star", { x: cursorX, y: iconY, size: 12, fill: theme.star }) +
      `<text x="${cursorX + 16}" y="${statY}" font-size="12" class="t-muted">${escapeXml(starLabel)}</text>`;
    cursorX += 16 + estimateTextWidth(starLabel, 12) + STAT_GAP;

    const mergedPRs = Number(entry.mergedPRs) || 0;
    if (mergedPRs > 0) {
      const label = `${formatNumber(mergedPRs)} ${pluralize(mergedPRs, "PR", "PRs")}`;
      body +=
        icon("merge", { x: cursorX, y: iconY, size: 12, fill: theme.muted }) +
        `<text x="${cursorX + 16}" y="${statY}" font-size="12" class="t-muted">${escapeXml(label)}</text>`;
      cursorX += 16 + estimateTextWidth(label, 12) + STAT_GAP;
    }

    const commits = Number(entry.commits) || 0;
    if (commits > 0) {
      const label = `${formatNumber(commits)} ${pluralize(commits, "commit", "commits")}`;
      body +=
        icon("commit", { x: cursorX, y: iconY, size: 12, fill: theme.muted }) +
        `<text x="${cursorX + 16}" y="${statY}" font-size="12" class="t-muted">${escapeXml(label)}</text>`;
    }
  });

  const gridHeight = rows * ROW_H + (rows - 1) * ROW_GAP;
  const height = GRID_TOP + gridHeight + PAD;

  return card({ theme, height, title: "Upstream contributions", iconName: "merge", subtitle, body });
}
