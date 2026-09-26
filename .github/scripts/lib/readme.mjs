// Small, pure text helpers for updating the generated sections of README.md.
// No filesystem access here — generate.mjs owns reading/writing the file.

/** Escape characters that are meaningful in Markdown/HTML so titles render as plain text. */
export function escapeMarkdown(text) {
  return String(text ?? "").replace(/[<>|[\]*_`]/g, (ch) => `\\${ch}`);
}

/**
 * Replace the content between `<!-- {name}:start -->` and `<!-- {name}:end -->`
 * markers in `text` with `content` (placed on its own lines). Throws if the
 * markers are missing or out of order.
 */
export function replaceSection(text, name, content) {
  const startMarker = `<!-- ${name}:start -->`;
  const endMarker = `<!-- ${name}:end -->`;
  const startIdx = text.indexOf(startMarker);
  const endIdx = startIdx === -1 ? -1 : text.indexOf(endMarker, startIdx + startMarker.length);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`replaceSection: could not find "${name}" markers (${startMarker} / ${endMarker})`);
  }
  const before = text.slice(0, startIdx + startMarker.length);
  const after = text.slice(endIdx);
  return `${before}\n${String(content).trim()}\n${after}`;
}

/** Render the recent-PRs README section as a Markdown list. */
export function renderRecentPRs(recentPRs) {
  if (!recentPRs || recentPRs.length === 0) {
    return "- _No recent upstream pull requests._";
  }
  return recentPRs
    .map((pr) => {
      const date = String(pr.mergedAt || "").slice(0, 10);
      const title = escapeMarkdown(pr.title);
      return `- [${pr.repo}#${pr.number}](${pr.url}) — ${title} · <sub>${date}</sub>`;
    })
    .join("\n");
}

/** Render the "last updated" README section. */
export function renderUpdated(generatedAt) {
  const date = new Date(generatedAt).toISOString().slice(0, 10);
  return `<sub>Cards regenerated daily by <a href=".github/workflows/metrics.yml">a GitHub Actions workflow</a> · last run ${date}</sub>`;
}
