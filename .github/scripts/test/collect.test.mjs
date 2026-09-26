import test from "node:test";
import assert from "node:assert/strict";

import {
  aggregateLanguages,
  isExcludedRepo,
  mergeUpstream,
  summarizeYears,
  summarizeKernelCommits,
  filterAndDedupeMergedMRs,
  summarizePostmarketos,
} from "../lib/collect.mjs";
import { replaceSection, renderRecentPRs, renderUpdated, escapeMarkdown } from "../lib/readme.mjs";

test("aggregateLanguages normalises per-repo byte shares before summing", () => {
  const repos = [
    {
      languages: {
        edges: [
          { size: 80, node: { name: "Go", color: "#00ADD8" } },
          { size: 20, node: { name: "Shell", color: "#89e051" } },
        ],
      },
    },
    {
      languages: {
        edges: [
          { size: 50, node: { name: "Go", color: "#00ADD8" } },
          { size: 50, node: { name: "Rust", color: "#dea584" } },
        ],
      },
    },
  ];
  const result = aggregateLanguages(repos, { ignore: [], limit: 8 });
  const total = result.reduce((sum, l) => sum + l.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, "shares must sum to 1");

  const go = result.find((l) => l.name === "Go");
  // repo1 contributes 0.8, repo2 contributes 0.5, averaged over 2 repos.
  assert.ok(Math.abs(go.share - (0.8 + 0.5) / 2) < 1e-9);
  assert.equal(go.color, "#00ADD8");
});

test("aggregateLanguages drops ignored languages before weighting", () => {
  const repos = [
    {
      languages: {
        edges: [
          { size: 90, node: { name: "HTML", color: null } },
          { size: 10, node: { name: "Go", color: "#00ADD8" } },
        ],
      },
    },
  ];
  const result = aggregateLanguages(repos, { ignore: ["HTML"], limit: 8 });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Go");
  assert.ok(Math.abs(result[0].share - 1) < 1e-9);
});

test("aggregateLanguages buckets the tail into Other above the threshold", () => {
  const repos = Array.from({ length: 10 }, (_, i) => ({
    languages: { edges: [{ size: 1, node: { name: `Lang${i}`, color: "#000000" } }] },
  }));
  const result = aggregateLanguages(repos, { ignore: [], limit: 3 });
  assert.equal(result.length, 4);
  assert.equal(result[3].name, "Other");
  assert.equal(result[3].color, null);
  assert.ok(result[3].share > 0.0005);
});

test("aggregateLanguages omits the Other bucket when the tail is negligible", () => {
  const repos = [
    {
      languages: {
        edges: [
          { size: 999999, node: { name: "Go", color: "#00ADD8" } },
          { size: 1, node: { name: "Shell", color: "#89e051" } },
        ],
      },
    },
  ];
  const result = aggregateLanguages(repos, { ignore: [], limit: 1 });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Go");
});

test("isExcludedRepo excludes own login, excluded owners (case-insensitive), private repos and forks", () => {
  const config = { login: "M0Rf30", excludeOwners: ["zextras"] };
  assert.equal(isExcludedRepo({ owner: "M0Rf30", isPrivate: false, isFork: false }, config), true, "own login");
  assert.equal(isExcludedRepo({ owner: "ZeXtRaS", isPrivate: false, isFork: false }, config), true, "case-insensitive exclude");
  assert.equal(isExcludedRepo({ owner: "someone", isPrivate: true, isFork: false }, config), true, "private");
  assert.equal(isExcludedRepo({ owner: "someone", isPrivate: false, isFork: true }, config), true, "fork");
  assert.equal(isExcludedRepo({ owner: "someone", isPrivate: false, isFork: false }, config), false, "kept");
  assert.equal(isExcludedRepo(null, config), true, "unresolved");
  assert.equal(isExcludedRepo(undefined, config), true, "undefined");
});

test("mergeUpstream merges PRs + commits per repo, filters, sorts by stars, and totals over the full list", () => {
  const config = { login: "M0Rf30", excludeOwners: ["zextras"] };
  const prItems = [
    { repo: "big/repo", number: 1, title: "a", url: "https://x/1", mergedAt: "2021-05-01T00:00:00Z" },
    { repo: "big/repo", number: 2, title: "b", url: "https://x/2", mergedAt: "2022-05-01T00:00:00Z" },
    { repo: "small/repo", number: 3, title: "c", url: "https://x/3", mergedAt: "2023-05-01T00:00:00Z" },
    { repo: "zextras/internal", number: 4, title: "d", url: "https://x/4", mergedAt: "2023-05-01T00:00:00Z" },
    { repo: "gone/repo", number: 5, title: "e", url: "https://x/5", mergedAt: "2023-05-01T00:00:00Z" },
  ];
  const commitContribsByYear = new Map([
    [
      "big/repo",
      new Map([
        [2020, 5],
        [2021, 3],
      ]),
    ],
  ]);
  const repoMetas = new Map([
    ["big/repo", { owner: "big", name: "repo", url: "https://github.com/big/repo", description: "", stars: 500, isPrivate: false, isFork: false }],
    ["small/repo", { owner: "small", name: "repo", url: "https://github.com/small/repo", description: "", stars: 10, isPrivate: false, isFork: false }],
    ["zextras/internal", { owner: "zextras", name: "internal", url: "https://github.com/zextras/internal", description: "", stars: 999, isPrivate: false, isFork: false }],
    ["gone/repo", null],
  ]);

  const { notable, totals, recentPRsCandidates } = mergeUpstream(prItems, commitContribsByYear, repoMetas, config);

  assert.deepEqual(notable.map((r) => r.repo), ["big/repo", "small/repo"], "excludes zextras + unresolved, sorted by stars desc");
  const big = notable[0];
  assert.equal(big.mergedPRs, 2);
  assert.equal(big.commits, 8);
  assert.equal(big.firstYear, 2020);
  assert.equal(big.lastYear, 2022);
  assert.equal(totals.mergedPRsUpstream, 3, "2 (big) + 1 (small), zextras/gone excluded");
  assert.equal(totals.upstreamRepos, 2);
  assert.deepEqual(recentPRsCandidates.map((p) => p.number), [3, 2, 1], "desc by mergedAt, excludes filtered repos");
});

test("mergeUpstream drops a repo that has neither merged PRs nor commit contributions", () => {
  const config = { login: "M0Rf30", excludeOwners: [] };
  const repoMetas = new Map([["x/y", { owner: "x", name: "y", url: "u", description: "", stars: 1, isPrivate: false, isFork: false }]]);
  const { notable } = mergeUpstream([], new Map([["x/y", new Map()]]), repoMetas, config);
  assert.equal(notable.length, 0);
});

test("summarizeYears sums totals and takes the latest year as this-year", () => {
  const years = [
    { year: 2020, total: 10 },
    { year: 2021, total: 20 },
    { year: 2022, total: 5 },
  ];
  const s = summarizeYears(years);
  assert.equal(s.contributionsAllTime, 35);
  assert.equal(s.contributionsThisYear, 5);
});

test("summarizeKernelCommits derives commits/years/recent from commit-search items, url building via sha.slice(0,12)", () => {
  const cfg = { commitUrlPrefix: "https://git.kernel.org/torvalds/c/", listUrl: "https://example/list", recentLimit: 2 };
  const items = [
    { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", commit: { message: "old commit\nbody", author: { date: "2023-01-05T00:00:00Z" } } },
    { sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", commit: { message: "newest commit", author: { date: "2026-01-24T10:00:00Z" } } },
    { sha: "cccccccccccccccccccccccccccccccccccccccc", commit: { message: "middle commit", author: { date: "2024-04-02T00:00:00Z" } } },
  ];
  const result = summarizeKernelCommits(items, 6, cfg);
  assert.equal(result.commits, 6, "commits comes from total_count, not items.length");
  assert.equal(result.firstYear, 2023);
  assert.equal(result.lastYear, 2026);
  assert.equal(result.url, cfg.listUrl);
  assert.equal(result.recent.length, 2, "capped at recentLimit");
  assert.deepEqual(result.recent[0], {
    title: "newest commit",
    url: "https://git.kernel.org/torvalds/c/bbbbbbbbbbbb",
    date: "2026-01-24",
  });
  assert.equal(result.recent[1].title, "middle commit", "second-newest, not insertion order");
});

test("summarizeKernelCommits handles empty input with zeros/nulls/empty array", () => {
  const cfg = { commitUrlPrefix: "https://x/", listUrl: "https://list", recentLimit: 3 };
  const result = summarizeKernelCommits([], 0, cfg);
  assert.deepEqual(result, { commits: 0, firstYear: null, lastYear: null, url: cfg.listUrl, recent: [] });
});

test("filterAndDedupeMergedMRs keeps only the configured namespace and dedupes by title+merged date", () => {
  const mrs = [
    { title: "fix a", merged_at: "2024-06-23T00:00:00Z", references: { full: "postmarketOS/pmaports!5274" } },
    { title: "fix a", merged_at: "2024-06-23T12:00:00Z", references: { full: "postmarketOS/pmaports!5274" } }, // migrated dupe
    { title: "fix b", merged_at: "2024-01-01T00:00:00Z", references: { full: "someoneelse/other!1" } }, // wrong namespace
    { title: "fix c", merged_at: "2024-02-02T00:00:00Z", references: { full: "postmarketOS-extra/x!1" } }, // prefix but not namespace
  ];
  const result = filterAndDedupeMergedMRs(mrs, "postmarketOS");
  assert.equal(result.length, 1);
  assert.equal(result[0].title, "fix a");
});

test("summarizePostmarketos merges MR + commit years, orders recent newest-first, caps at recentLimit", () => {
  const cfg = { namespace: "postmarketOS", profileUrl: "https://gitlab.postmarketos.org/M0Rf30", recentLimit: 2 };
  const mrItems = [
    {
      title: "old MR",
      web_url: "https://gitlab.com/postmarketOS/pmaports/-/merge_requests/1",
      merged_at: "2020-03-01T00:00:00Z",
      references: { full: "postmarketOS/pmaports!1" },
    },
    {
      title: "newest MR",
      web_url: "https://gitlab.postmarketos.org/postmarketOS/pmaports/-/merge_requests/2",
      merged_at: "2025-05-05T00:00:00Z",
      references: { full: "postmarketOS/pmaports!2" },
    },
    {
      title: "middle MR",
      web_url: "https://gitlab.postmarketos.org/postmarketOS/pmaports/-/merge_requests/3",
      merged_at: "2023-01-01T00:00:00Z",
      references: { full: "postmarketOS/pmaports!3" },
    },
    {
      title: "excluded",
      web_url: "https://gitlab.com/other/proj/-/merge_requests/9",
      merged_at: "2021-01-01T00:00:00Z",
      references: { full: "other/proj!9" },
    },
  ];
  const commits = [{ committed_date: "2024-08-01T00:00:00Z" }, { created_at: "2019-01-01T00:00:00Z" }];
  const result = summarizePostmarketos(mrItems, commits, cfg);
  assert.equal(result.mergedMRs, 3, "namespace-filtered + deduped");
  assert.equal(result.commits, 2);
  assert.equal(result.firstYear, 2019, "earliest across MR + commit dates");
  assert.equal(result.lastYear, 2025);
  assert.equal(result.url, cfg.profileUrl);
  assert.equal(result.recent.length, 2, "capped at recentLimit");
  assert.equal(result.recent[0].title, "newest MR");
  assert.equal(result.recent[1].title, "middle MR");
});

test("summarizePostmarketos handles empty input with zeros/nulls/empty array", () => {
  const cfg = { namespace: "postmarketOS", profileUrl: "https://gitlab.postmarketos.org/M0Rf30", recentLimit: 3 };
  const result = summarizePostmarketos([], [], cfg);
  assert.deepEqual(result, { mergedMRs: 0, commits: 0, firstYear: null, lastYear: null, url: cfg.profileUrl, recent: [] });
});

test("replaceSection swaps content between markers, leaving surrounding text intact", () => {
  const text = "before\n<!-- x:start -->\nold\n<!-- x:end -->\nafter";
  const out = replaceSection(text, "x", "new content");
  assert.match(out, /new content/);
  assert.doesNotMatch(out, /old/);
  assert.match(out, /^before/);
  assert.match(out, /after$/);
});

test("replaceSection throws a clear error when markers are missing", () => {
  assert.throws(() => replaceSection("no markers here", "x", "y"), /x/);
});

test("escapeMarkdown / renderRecentPRs escape markdown-significant characters and handle the empty state", () => {
  assert.equal(escapeMarkdown("a[b]c*d_e`f|g<h>"), "a\\[b\\]c\\*d\\_e\\`f\\|g\\<h\\>");
  assert.equal(renderRecentPRs([]), "- _No recent upstream pull requests._");
  assert.equal(renderRecentPRs(undefined), "- _No recent upstream pull requests._");

  const out = renderRecentPRs([
    { repo: "a/b", number: 1, title: "fix <script>|[x]*_y_`z`", url: "https://x/1", mergedAt: "2024-01-02T00:00:00Z" },
  ]);
  assert.doesNotMatch(out, /<script>/);
  assert.match(out, /\\</);
  assert.match(out, /2024-01-02/);
  assert.match(out, /\[a\/b#1\]\(https:\/\/x\/1\)/);
});

test("renderUpdated renders an ISO date", () => {
  const out = renderUpdated("2026-09-26T09:00:00Z");
  assert.match(out, /2026-09-26/);
  assert.match(out, /workflows\/metrics\.yml/);
});
