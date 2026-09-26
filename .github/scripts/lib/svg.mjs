// Shared design system for every profile card.
//
// Every card is rendered twice, once per theme, and the README picks the right
// file with <picture> + prefers-color-scheme. Cards must only take colours from
// the theme object passed to them; they must never hard-code a colour.
//
// Static renderers (rsvg, GitHub's image proxy thumbnails) ignore CSS
// animations, so base styles always describe the *final* visible state.
// Animations only use `from` keyframes with fill-mode `both`, and are disabled
// under prefers-reduced-motion.

export const CARD_WIDTH = 840;
export const PAD = 24;
export const HEADER_HEIGHT = 60; // body content starts at y = HEADER_HEIGHT

export const FONT_SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif";
export const FONT_MONO =
  "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace";

// Palettes follow GitHub Primer so the cards sit naturally on the profile page;
// the violet→blue accent is the one "brand" touch (M0Rf30 → Morpheus, night sky).
export const THEMES = Object.freeze({
  light: Object.freeze({
    name: "light",
    bg: "#ffffff",
    surface: "#f6f8fa", // tiles, rows, chips
    border: "#d0d7de",
    fg: "#1f2328",
    muted: "#59636e",
    subtle: "#818b98", // tertiary text, axis labels
    track: "#eaeef2", // empty bar / progress track
    grid: "#eaeef2",
    accent: "#8250df",
    accent2: "#0969da",
    accentSoft: "#fbefff",
    star: "#9a6700",
    success: "#1a7f37",
    skyTop: "#f3eefe", // banner gradient
    skyBottom: "#ffffff",
    starDot: "#8250df",
  }),
  dark: Object.freeze({
    name: "dark",
    bg: "#0d1117",
    surface: "#161b22",
    border: "#30363d",
    fg: "#e6edf3",
    muted: "#9198a1",
    subtle: "#6e7681",
    track: "#21262d",
    grid: "#21262d",
    accent: "#a371f7",
    accent2: "#58a6ff",
    accentSoft: "#271c3a",
    star: "#e3b341",
    success: "#3fb950",
    skyTop: "#161029",
    skyBottom: "#0d1117",
    starDot: "#e6edf3",
  }),
});

export function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 999 → "999", 1352 → "1.4k", 16750 → "16.8k", 70409 → "70k", 1.2e6 → "1.2M". */
export function formatNumber(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const fmt = (x, suffix) => {
    const s = x >= 100 ? Math.round(x).toString() : x.toFixed(1).replace(/\.0$/, "");
    return s + suffix;
  };
  if (abs >= 1e6) return fmt(v / 1e6, "M");
  if (abs >= 1e3) return fmt(v / 1e3, "k");
  return String(Math.round(v));
}

/** 0.4567 → "45.7%"; values below 0.1% render as "<0.1%". */
export function formatPercent(share, digits = 1) {
  const pct = (Number(share) || 0) * 100;
  if (pct > 0 && pct < 0.1) return "<0.1%";
  return `${pct.toFixed(digits)}%`;
}

/**
 * Rough text width estimate for layout decisions (truncation, chip sizing).
 * SVG has no text measurement at render time; this is tuned for the sans stack.
 */
export function estimateTextWidth(text, fontSize, { bold = false, mono = false } = {}) {
  const per = mono ? 0.61 : bold ? 0.58 : 0.54;
  return String(text).length * fontSize * per;
}

/** Truncate with an ellipsis so `text` fits in `maxWidth` px at `fontSize`. */
export function truncate(text, maxWidth, fontSize, opts) {
  const s = String(text);
  if (estimateTextWidth(s, fontSize, opts) <= maxWidth) return s;
  let out = s;
  while (out.length > 1 && estimateTextWidth(out + "…", fontSize, opts) > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + "…";
}

// Octicons (16px viewBox), https://primer.style/octicons — MIT.
export const ICONS = Object.freeze({
  star:
    "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z",
  repo:
    "M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z",
  fork:
    "M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z",
  pr:
    "M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z",
  merge:
    "M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z",
  commit:
    "M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z",
  people:
    "M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 0 1 1-1.482.235 4 4 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 3.102 8.05 3.493 3.493 0 0 1 2 5.5ZM11 4a3.001 3.001 0 0 1 2.22 5.018 5.01 5.01 0 0 1 2.56 3.012.749.749 0 0 1-.885.954.752.752 0 0 1-.549-.514 3.507 3.507 0 0 0-2.522-2.372.75.75 0 0 1-.574-.73v-.352a.75.75 0 0 1 .416-.672A1.5 1.5 0 0 0 11 5.5.75.75 0 0 1 11 4Zm-5.5-.5a2 2 0 1 0-.001 3.999A2 2 0 0 0 5.5 3.5Z",
  calendar:
    "M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0ZM2.5 7.5v6.75c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V7.5Zm10.75-4H2.75a.25.25 0 0 0-.25.25V6h11V3.75a.25.25 0 0 0-.25-.25Z",
  code:
    "m11.28 3.22 4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L13.94 8l-3.72-3.72a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215Zm-6.56 0a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L2.06 8l3.72 3.72a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L.47 8.53a.75.75 0 0 1 0-1.06Z",
  pulse:
    "M6 2c.306 0 .582.187.696.471L10 10.731l1.304-3.26A.751.751 0 0 1 12 7h3.25a.75.75 0 0 1 0 1.5h-2.742l-1.812 4.528a.751.751 0 0 1-1.392 0L6 4.77 4.696 8.03A.75.75 0 0 1 4 8.5H.75a.75.75 0 0 1 0-1.5h2.742l1.812-4.529A.751.751 0 0 1 6 2Z",
});

/** An octicon as a nested <svg>, positioned by its top-left corner. */
export function icon(name, { x = 0, y = 0, size = 16, fill = "currentColor", cls = "" } = {}) {
  const d = ICONS[name];
  if (!d) throw new Error(`Unknown icon: ${name}`);
  const classAttr = cls ? ` class="${cls}"` : "";
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 16 16"${classAttr}><path fill="${fill}" d="${d}"/></svg>`;
}

/** <linearGradient> definitions shared by all cards: `accent` (horizontal) and `accentV` (vertical). */
export function gradientDefs(theme) {
  return (
    `<linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="${theme.accent}"/><stop offset="1" stop-color="${theme.accent2}"/>` +
    `</linearGradient>` +
    `<linearGradient id="accentV" x1="0" y1="1" x2="0" y2="0">` +
    `<stop offset="0" stop-color="${theme.accent}"/><stop offset="1" stop-color="${theme.accent2}"/>` +
    `</linearGradient>`
  );
}

/**
 * Base stylesheet. Utility classes available to every card:
 *   .t-title .t-sub .t-label .t-value .t-muted .t-subtle .t-mono
 *   .a-fade  (fade + rise in)       .a-grow-x (scale from left)   .a-grow-y (scale from bottom)
 * Stagger with inline style="animation-delay:120ms".
 */
export function baseStyle(theme, extra = "") {
  return (
    `svg{font-family:${FONT_SANS}}` +
    `.t-title{font-size:16px;font-weight:600;fill:${theme.fg}}` +
    `.t-sub{font-size:12px;fill:${theme.muted}}` +
    `.t-label{font-size:12px;fill:${theme.muted}}` +
    `.t-value{font-size:24px;font-weight:600;fill:${theme.fg}}` +
    `.t-muted{fill:${theme.muted}}` +
    `.t-subtle{fill:${theme.subtle}}` +
    `.t-mono{font-family:${FONT_MONO}}` +
    `@keyframes fade{from{opacity:0;transform:translateY(4px)}}` +
    `@keyframes growX{from{transform:scaleX(0)}}` +
    `@keyframes growY{from{transform:scaleY(0)}}` +
    `.a-fade{animation:fade .6s ease-out both}` +
    `.a-grow-x{transform-box:fill-box;transform-origin:left center;animation:growX .9s cubic-bezier(.2,.7,.2,1) both}` +
    `.a-grow-y{transform-box:fill-box;transform-origin:center bottom;animation:growY .9s cubic-bezier(.2,.7,.2,1) both}` +
    `@media (prefers-reduced-motion:reduce){*{animation:none!important}}` +
    extra
  );
}

/**
 * Wrap a card body in the standard frame: rounded background, border, header
 * row (accent icon + title + optional right-aligned subtitle).
 *
 * `body` is raw SVG markup positioned in card coordinates; content should start
 * at y >= HEADER_HEIGHT and leave PAD at the bottom. Pass `header: false` for
 * full-bleed cards (the banner) that draw their own header.
 */
export function card({
  theme,
  width = CARD_WIDTH,
  height,
  title,
  iconName,
  subtitle = "",
  body = "",
  desc = "",
  defs = "",
  style = "",
  header = true,
}) {
  const t = escapeXml(title);
  const headerMarkup = header
    ? (iconName ? icon(iconName, { x: PAD, y: 25, size: 16, fill: theme.accent }) : "") +
      `<text x="${iconName ? PAD + 24 : PAD}" y="38" class="t-title">${t}</text>` +
      (subtitle
        ? `<text x="${width - PAD}" y="38" text-anchor="end" class="t-sub">${escapeXml(subtitle)}</text>`
        : "")
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" role="img" aria-labelledby="title desc">` +
    `<title id="title">${t}</title><desc id="desc">${escapeXml(desc || subtitle || title)}</desc>` +
    `<defs>${gradientDefs(theme)}${defs}</defs>` +
    `<style>${baseStyle(theme, style)}</style>` +
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="12" fill="${theme.bg}" stroke="${theme.border}"/>` +
    headerMarkup +
    body +
    `</svg>\n`
  );
}

/** A circular avatar from a data: URI, or a monogram fallback when it is null. */
export function avatar({ theme, x, y, size, dataUri, label, id }) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size / 2;
  if (dataUri) {
    return (
      `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>` +
      `<image x="${x}" y="${y}" width="${size}" height="${size}" href="${dataUri}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${r - 0.5}" stroke="${theme.border}"/>`
    );
  }
  const letter = escapeXml((String(label || "?").match(/[A-Za-z0-9]/)?.[0] || "?").toUpperCase());
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${theme.accentSoft}" stroke="${theme.border}"/>` +
    `<text x="${cx}" y="${cy + size * 0.18}" text-anchor="middle" font-size="${Math.round(size * 0.5)}" font-weight="600" fill="${theme.accent}">${letter}</text>`
  );
}
