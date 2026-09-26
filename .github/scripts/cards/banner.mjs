// Hero banner: a calm night sky (M0Rf30 → Morpheus, the Sandman) behind the
// display name, tagline and a row of focus-area chips. Full-bleed card
// (header: false) — it draws its own frame content on top of `card()`'s base
// rect so the gradient sky still respects the rounded corners and border.
import { CONFIG } from "../config.mjs";
import { CARD_WIDTH, PAD, card, escapeXml, estimateTextWidth, truncate } from "../lib/svg.mjs";

export const id = "banner";
export const alt = `${CONFIG.displayName} — ${CONFIG.tagline}`;

// Deterministic PRNG (mulberry32) so the star field is byte-identical across
// renders — no Math.random, no Date.now.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 0x4d307230; // arbitrary fixed seed — stable "M0Rf30" sky
const STAR_COUNT = 50;
const STAR_ATTEMPT_BUDGET = STAR_COUNT * 25; // draw-then-reject, never reseed

const NAME_Y = 74;
const TAGLINE_Y = 102;
const CHIPS_TOP = 124;
const CHIP_H = 24;
const CHIP_GAP_X = 8;
const CHIP_GAP_Y = 10;
const CHIP_PAD_X = 10;
const CHIP_MAX_ROWS = 2;
const CHIPS_RIGHT_X = 610; // chips may use the full width up to here
const CHIPS_MAX_WIDTH = CHIPS_RIGHT_X - PAD;
const DECOR_MIN_X = 640; // moon + constellation stay right of this line
const TEXT_EXCLUSION_MARGIN = 8; // px kept clear around the copy block

/** Greedily wrap chip labels into up to `maxRows` rows of `maxWidth` px. */
function layoutChips(items, maxWidth, maxRows) {
  const rows = [[]];
  let width = 0;
  for (const label of items) {
    const w = estimateTextWidth(label, 12) + CHIP_PAD_X * 2;
    const row = rows[rows.length - 1];
    const extra = row.length ? CHIP_GAP_X + w : w;
    if (row.length && width + extra > maxWidth) {
      if (rows.length >= maxRows) break; // cap: silently drop overflow chips
      rows.push([{ label, w }]);
      width = w;
    } else {
      row.push({ label, w });
      width += extra;
    }
  }
  return rows.filter((r) => r.length);
}

function rowWidth(row) {
  return row.reduce((w, c, i) => w + c.w + (i ? CHIP_GAP_X : 0), 0);
}

export function render(data, theme) {
  const totals = data?.totals || {};
  const focus = Array.isArray(CONFIG.focus) ? CONFIG.focus : [];

  const rows = layoutChips(focus, CHIPS_MAX_WIDTH, CHIP_MAX_ROWS);
  const chipsBottom = rows.length
    ? CHIPS_TOP + rows.length * CHIP_H + (rows.length - 1) * CHIP_GAP_Y
    : TAGLINE_Y + 14;
  const footerY = chipsBottom + 22;
  const height = footerY + 20;

  const nameWidth = estimateTextWidth(CONFIG.displayName, 44, { bold: true });
  const taglineMaxW = CARD_WIDTH - PAD * 2 - 20;
  const taglineTruncated = truncate(CONFIG.tagline, taglineMaxW, 15);
  const taglineWidth = estimateTextWidth(taglineTruncated, 15);
  const chipsMaxRowWidth = rows.reduce((m, r) => Math.max(m, rowWidth(r)), 0);
  const textRight = PAD + Math.max(nameWidth, taglineWidth, chipsMaxRowWidth);
  const excl = {
    left: PAD - TEXT_EXCLUSION_MARGIN,
    right: textRight + TEXT_EXCLUSION_MARGIN,
    top: NAME_Y - 38 - TEXT_EXCLUSION_MARGIN, // ~ascent of the 44px name
    bottom: footerY + 6 + TEXT_EXCLUSION_MARGIN,
  };
  const insideExclusion = (x, y) => x >= excl.left && x <= excl.right && y >= excl.top && y <= excl.bottom;

  // -- night sky: gradient + seeded stars (rejecting any that land on the
  // copy block, without ever reseeding) + a faint constellation + a moon,
  // both confined to the right-hand decor strip.
  const rand = mulberry32(SEED);
  const stars = [];
  for (let attempt = 0; attempt < STAR_ATTEMPT_BUDGET && stars.length < STAR_COUNT; attempt++) {
    const x = 12 + rand() * (CARD_WIDTH - 24);
    const y = 10 + rand() * (height - 20);
    const r = 0.6 + rand() * 1.0;
    const o = 0.25 + rand() * 0.55;
    const delay = Math.round(rand() * 3000);
    if (insideExclusion(x, y)) continue; // reject, keep consuming the same stream
    stars.push({ x, y, r, o, twinkle: stars.length % 6 === 0, delay });
  }
  const constellationPts = stars.filter((s) => s.x > DECOR_MIN_X && s.y < height * 0.62).slice(0, 5);

  let starsMarkup = "";
  for (const s of stars) {
    const cls = s.twinkle ? ' class="a-twinkle"' : "";
    const style = s.twinkle ? ` style="animation-delay:${s.delay}ms"` : "";
    starsMarkup += `<circle cx="${s.x.toFixed(2)}" cy="${s.y.toFixed(2)}" r="${s.r.toFixed(2)}" fill="${theme.starDot}" opacity="${s.o.toFixed(2)}"${cls}${style}/>`;
  }

  let constellationMarkup = "";
  if (constellationPts.length >= 2) {
    const pts = constellationPts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
    constellationMarkup =
      `<polyline points="${pts}" fill="none" stroke="${theme.starDot}" stroke-width="1" opacity="0.28"/>` +
      constellationPts
        .map((p) => `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="1.4" fill="${theme.starDot}" opacity="0.9"/>`)
        .join("");
  }

  const moonCx = CARD_WIDTH - 64; // 776 — safely inside the >=640 decor strip
  const moonCy = 44;
  const moonR = 15;
  const moonMarkup =
    `<circle cx="${moonCx}" cy="${moonCy}" r="${moonR}" fill="${theme.starDot}" opacity="0.9"/>` +
    `<circle cx="${(moonCx + moonR * 0.5).toFixed(2)}" cy="${(moonCy - moonR * 0.3).toFixed(2)}" r="${moonR}" fill="url(#banner-sky)"/>`;

  const skyGroup =
    `<g clip-path="url(#banner-clip)">` +
    `<rect x="0" y="0" width="${CARD_WIDTH}" height="${height}" fill="url(#banner-sky)"/>` +
    starsMarkup +
    constellationMarkup +
    moonMarkup +
    `</g>`;

  // -- foreground copy
  const nameText = `<text x="${PAD}" y="${NAME_Y}" font-size="44" font-weight="700" fill="url(#accent)">${escapeXml(CONFIG.displayName)}</text>`;
  const taglineText = `<text x="${PAD}" y="${TAGLINE_Y}" font-size="15" fill="${theme.muted}">${escapeXml(taglineTruncated)}</text>`;

  let chipsMarkup = "";
  rows.forEach((row, ri) => {
    let cx = PAD;
    const cy = CHIPS_TOP + ri * (CHIP_H + CHIP_GAP_Y);
    for (const chip of row) {
      chipsMarkup +=
        `<rect x="${cx.toFixed(2)}" y="${cy}" width="${chip.w.toFixed(2)}" height="${CHIP_H}" rx="12" fill="${theme.surface}" stroke="${theme.border}"/>` +
        `<text x="${(cx + chip.w / 2).toFixed(2)}" y="${cy + 16}" text-anchor="middle" font-size="12" fill="${theme.fg}">${escapeXml(chip.label)}</text>`;
      cx += chip.w + CHIP_GAP_X;
    }
  });

  const footerMarkup = totals.firstYear
    ? `<text x="${PAD}" y="${footerY}" font-size="11" fill="${theme.subtle}">on GitHub since ${escapeXml(String(totals.firstYear))}</text>`
    : "";

  const borderMarkup = `<rect x="0.5" y="0.5" width="${CARD_WIDTH - 1}" height="${height - 1}" rx="12" fill="none" stroke="${theme.border}"/>`;

  const body = skyGroup + nameText + taglineText + chipsMarkup + footerMarkup + borderMarkup;

  const defs =
    `<clipPath id="banner-clip"><rect x="0.5" y="0.5" width="${CARD_WIDTH - 1}" height="${height - 1}" rx="12"/></clipPath>` +
    `<linearGradient id="banner-sky" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${theme.skyTop}"/><stop offset="1" stop-color="${theme.skyBottom}"/>` +
    `</linearGradient>`;

  const style = `@keyframes twinkle{0%,100%{opacity:1}50%{opacity:.25}}.a-twinkle{animation:twinkle 3.2s ease-in-out infinite}`;

  return card({
    theme,
    width: CARD_WIDTH,
    height,
    header: false,
    title: CONFIG.displayName,
    desc: CONFIG.tagline,
    body,
    defs,
    style,
  });
}
