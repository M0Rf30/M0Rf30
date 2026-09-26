// "Contributions per year" — a stacked bar chart, one bar per calendar year.
import { CONFIG } from "../config.mjs";
import { CARD_WIDTH, PAD, HEADER_HEIGHT, card, escapeXml, estimateTextWidth, formatNumber } from "../lib/svg.mjs";

export const id = "activity";
export const alt = `Contributions per year for ${CONFIG.displayName}.`;

const BAR_MAX_H = 130;
const CHART_TOP = HEADER_HEIGHT + 8 + 14;
const CHART_BOTTOM = CHART_TOP + BAR_MAX_H;
const YEAR_LABEL_Y = CHART_BOTTOM + 16;
const LEGEND_Y = YEAR_LABEL_Y + 26;
const HEIGHT = LEGEND_Y + 20;
const GRID_TICKS = 3;
const BAR_GAP = 6;
const BAR_MIN_W = 6;
const BAR_MAX_W = 44;
const BAR_RADIUS = 3;
const PRIVATE_OPACITY = 0.4; // private/restricted segment: tinted accent, not dull grey

/** Round `value` up to a "nice" 1 / 2 / 2.5 / 5 × 10^n ceiling. */
function niceMax(value) {
  if (!(value > 0)) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  const norm = value / base;
  let n;
  if (norm <= 1) n = 1;
  else if (norm <= 2) n = 2;
  else if (norm <= 2.5) n = 2.5;
  else if (norm <= 5) n = 5;
  else n = 10;
  return n * base;
}

/** A rect path rounded on its top two corners only. */
function roundedTopPath(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  if (rr < 0.01) return `M${x},${y} h${w} v${h} h${-w} Z`;
  return (
    `M${x},${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} ` +
    `Q${x + w},${y} ${x + w},${y + rr} V${y + h} H${x} Z`
  );
}

export function render(data, theme) {
  const years = Array.isArray(data?.years) ? data.years : [];
  const totals = data?.totals || {};

  const subtitleParts = [];
  subtitleParts.push(totals.contributionsAllTime ? `${formatNumber(totals.contributionsAllTime)} contributions` : "No contributions yet");
  if (totals.firstYear) subtitleParts.push(`since ${totals.firstYear}`);
  const subtitle = subtitleParts.join(" ");

  if (years.length === 0) {
    const body = `<text x="${CARD_WIDTH / 2}" y="${HEADER_HEIGHT + 56}" text-anchor="middle" class="t-muted">No contribution history yet.</text>`;
    return card({
      theme,
      height: HEADER_HEIGHT + 110,
      title: "Contributions per year",
      iconName: "calendar",
      subtitle,
      body,
      desc: subtitle,
    });
  }

  const contentW = CARD_WIDTH - PAD * 2;
  const maxTotal = Math.max(0, ...years.map((y) => Number(y.total) || 0));
  const topValue = niceMax(maxTotal * 1.08);

  const rawW = (contentW - (years.length - 1) * BAR_GAP) / years.length;
  const barW = Math.max(BAR_MIN_W, Math.min(BAR_MAX_W, rawW));
  const usedW = years.length * barW + (years.length - 1) * BAR_GAP;
  const startX = PAD + (contentW - usedW) / 2;

  let gridlines = "";
  for (let t = 1; t <= GRID_TICKS; t++) {
    const gy = CHART_BOTTOM - (t / GRID_TICKS) * BAR_MAX_H;
    gridlines += `<line x1="${PAD}" y1="${gy.toFixed(2)}" x2="${CARD_WIDTH - PAD}" y2="${gy.toFixed(2)}" stroke="${theme.grid}" stroke-width="1"/>`;
  }

  const labelEvery = barW < 24 ? 2 : 1;
  let bars = "";
  years.forEach((y, i) => {
    const total = Number(y.total) || 0;
    const commits = Math.max(0, Number(y.commits) || 0);
    const prIssuesReviews = Math.max(0, (Number(y.pullRequests) || 0) + (Number(y.issues) || 0) + (Number(y.reviews) || 0));
    const restricted = Math.max(0, Number(y.restricted) || 0);
    const other = Math.max(0, total - (commits + prIssuesReviews + restricted));
    const segs = [
      { v: commits, color: theme.accent },
      { v: prIssuesReviews, color: theme.accent2 },
      { v: restricted, color: theme.accent, opacity: PRIVATE_OPACITY },
      { v: other, color: theme.border },
    ].filter((s) => s.v > 0);

    const x = startX + i * (barW + BAR_GAP);
    const cx = x + barW / 2;

    if (segs.length === 0) {
      bars +=
        `<g class="a-grow-y" style="animation-delay:${i * 30}ms">` +
        `<rect x="${x.toFixed(2)}" y="${(CHART_BOTTOM - 2).toFixed(2)}" width="${barW.toFixed(2)}" height="2" rx="1" fill="${theme.track}"/>` +
        `</g>`;
    } else {
      let cursor = CHART_BOTTOM;
      let segMarkup = "";
      segs.forEach((s, si) => {
        const h = Math.max(0.5, (s.v / topValue) * BAR_MAX_H);
        const segY = cursor - h;
        const isTop = si === segs.length - 1;
        const opacityAttr = s.opacity !== undefined ? ` fill-opacity="${s.opacity}"` : "";
        segMarkup += isTop
          ? `<path d="${roundedTopPath(x, segY, barW, h, BAR_RADIUS)}" fill="${s.color}"${opacityAttr}/>`
          : `<rect x="${x.toFixed(2)}" y="${segY.toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" fill="${s.color}"${opacityAttr}/>`;
        cursor = segY;
      });
      bars +=
        `<g class="a-grow-y" style="animation-delay:${i * 30}ms">${segMarkup}</g>` +
        `<text x="${cx.toFixed(2)}" y="${(cursor - 6).toFixed(2)}" text-anchor="middle" font-size="10" font-weight="600" fill="${theme.fg}">${escapeXml(formatNumber(total))}</text>`;
    }

    if (i % labelEvery === 0 || i === years.length - 1) {
      const isLast = i === years.length - 1;
      const label = isLast ? `${y.year}<tspan font-size="8" dx="2">YTD</tspan>` : String(y.year);
      bars += `<text x="${cx.toFixed(2)}" y="${YEAR_LABEL_Y}" text-anchor="middle" class="t-subtle" font-size="11">${label}</text>`;
    }
  });

  const legendItems = [
    { label: "Commits", color: theme.accent },
    { label: "PRs, issues & reviews", color: theme.accent2 },
    { label: "Private contributions", color: theme.accent, opacity: PRIVATE_OPACITY },
    { label: "Other", color: theme.border },
  ];
  let lx = PAD;
  let legend = "";
  for (const item of legendItems) {
    const opacityAttr = item.opacity !== undefined ? ` fill-opacity="${item.opacity}"` : "";
    legend +=
      `<rect x="${lx.toFixed(2)}" y="${LEGEND_Y - 9}" width="8" height="8" rx="2" fill="${item.color}"${opacityAttr}/>` +
      `<text x="${(lx + 14).toFixed(2)}" y="${LEGEND_Y}" class="t-subtle" font-size="11">${escapeXml(item.label)}</text>`;
    lx += 14 + estimateTextWidth(item.label, 11) + 20;
  }

  const body = gridlines + bars + legend;

  return card({
    theme,
    height: HEIGHT,
    title: "Contributions per year",
    iconName: "calendar",
    subtitle,
    body,
    desc: subtitle,
  });
}
