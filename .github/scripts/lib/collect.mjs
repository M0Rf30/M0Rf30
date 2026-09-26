// Builds a ProfileData object (see local://profile-contract.md) from live
// GitHub data. The network-touching orchestration lives in
// `collectProfileData`; every decision that can be unit-tested without a
// network call is factored out into a plain, exported function below.

import { createGitLabClient } from "./gitlab.mjs";

const YEAR_CHUNK_SIZE = 4;
const REPO_META_BATCH_SIZE = 30;
const OTHER_LANGUAGE_THRESHOLD = 0.0005;

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested directly, no network involved)
// ---------------------------------------------------------------------------

/**
 * Aggregate per-repo language byte counts into profile-wide shares.
 *
 * Each repo contributes an equal weight of 1, split across its own
 * (non-ignored) languages by byte share. This keeps a single
 * vendored-dependency-heavy repo from dominating the whole profile the way
 * raw byte totals would.
 *
 * @param {Array<{languages: {edges: Array<{size:number, node:{name:string,color:string|null}}>}}>} repos
 * @param {{ignore?: string[], limit?: number}} [opts]
 * @returns {Array<{name:string, color:string|null, share:number}>} desc by share, capped at `limit`,
 *   plus a trailing `{name:"Other"}` bucket when the remainder is non-negligible.
 */
export function aggregateLanguages(repos, { ignore = [], limit = 8 } = {}) {
  const ignoreSet = new Set(ignore.map((name) => name.toLowerCase()));
  const weights = new Map();
  const colors = new Map();
  let totalWeight = 0;

  for (const repo of repos || []) {
    const edges = repo?.languages?.edges || [];
    const filtered = edges
      .map((edge) => ({ name: edge?.node?.name, color: edge?.node?.color ?? null, size: edge?.size || 0 }))
      .filter((lang) => lang.name && lang.size > 0 && !ignoreSet.has(lang.name.toLowerCase()));

    const repoTotal = filtered.reduce((sum, lang) => sum + lang.size, 0);
    if (repoTotal <= 0) continue;

    totalWeight += 1;
    for (const lang of filtered) {
      const share = lang.size / repoTotal;
      weights.set(lang.name, (weights.get(lang.name) || 0) + share);
      if (!colors.has(lang.name) && lang.color) colors.set(lang.name, lang.color);
    }
  }

  if (totalWeight <= 0) return [];

  const entries = [...weights.entries()]
    .map(([name, weight]) => ({ name, color: colors.get(name) ?? null, share: weight / totalWeight }))
    .sort((a, b) => b.share - a.share);

  const top = entries.slice(0, limit);
  const rest = entries.slice(limit);
  const otherShare = rest.reduce((sum, lang) => sum + lang.share, 0);
  if (otherShare > OTHER_LANGUAGE_THRESHOLD) top.push({ name: "Other", color: null, share: otherShare });
  return top;
}

/**
 * @param {{owner?: string, isPrivate?: boolean, isFork?: boolean}|null|undefined} meta
 * @param {{login: string, excludeOwners?: string[]}} config
 */
export function isExcludedRepo(meta, config) {
  if (!meta || !meta.owner) return true;
  const owner = meta.owner.toLowerCase();
  if (owner === config.login.toLowerCase()) return true;
  if ((config.excludeOwners || []).some((name) => name.toLowerCase() === owner)) return true;
  if (meta.isPrivate) return true;
  if (meta.isFork) return true;
  return false;
}

/**
 * Merge PR-search results with per-year commit contributions into the
 * uncapped, filtered upstream repo list plus totals and recent-PR candidates.
 *
 * @param {Array<{repo:string, number:number, title:string, url:string, mergedAt:string}>} prItems
 * @param {Map<string, Map<number, number>>} commitContribsByYear repo full name -> year -> commit count
 * @param {Map<string, object|null>} repoMetas repo full name -> resolved metadata (or null if unresolved)
 * @param {{login: string, excludeOwners?: string[]}} config
 */
export function mergeUpstream(prItems, commitContribsByYear, repoMetas, config) {
  const prsByRepo = new Map();
  for (const item of prItems || []) {
    if (!prsByRepo.has(item.repo)) prsByRepo.set(item.repo, []);
    prsByRepo.get(item.repo).push(item);
  }

  const repoNames = new Set([...prsByRepo.keys(), ...(commitContribsByYear ? commitContribsByYear.keys() : [])]);

  const notable = [];
  for (const repoFullName of repoNames) {
    const meta = repoMetas?.get(repoFullName);
    if (isExcludedRepo(meta, config)) continue;

    const prs = prsByRepo.get(repoFullName) || [];
    const yearMap = commitContribsByYear?.get(repoFullName);
    const commits = yearMap ? [...yearMap.values()].reduce((sum, n) => sum + n, 0) : 0;
    if (prs.length === 0 && commits === 0) continue;

    const years = [];
    for (const pr of prs) {
      if (pr.mergedAt) years.push(new Date(pr.mergedAt).getUTCFullYear());
    }
    if (yearMap) for (const year of yearMap.keys()) years.push(year);

    const [owner, name] = repoFullName.split("/");
    notable.push({
      repo: repoFullName,
      owner: meta.owner ?? owner,
      name: meta.name ?? name,
      url: meta.url ?? `https://github.com/${repoFullName}`,
      description: meta.description ?? "",
      stars: meta.stars ?? 0,
      mergedPRs: prs.length,
      commits,
      firstYear: years.length ? Math.min(...years) : null,
      lastYear: years.length ? Math.max(...years) : null,
      avatarUrl: meta.avatarUrl ?? null,
    });
  }

  notable.sort((a, b) => b.stars - a.stars);

  const totals = {
    mergedPRsUpstream: notable.reduce((sum, repo) => sum + repo.mergedPRs, 0),
    upstreamRepos: notable.length,
  };

  const recentPRsCandidates = (prItems || [])
    .filter((item) => !isExcludedRepo(repoMetas?.get(item.repo), config))
    .slice()
    .sort((a, b) => new Date(b.mergedAt) - new Date(a.mergedAt));

  return { notable, totals, recentPRsCandidates };
}

/** @param {Array<{year:number,total:number}>} years ascending */
export function summarizeYears(years) {
  const contributionsAllTime = (years || []).reduce((sum, y) => sum + (y.total || 0), 0);
  const contributionsThisYear = years && years.length ? years[years.length - 1].total : 0;
  return { contributionsAllTime, contributionsThisYear };
}

/**
 * Reduce raw GitHub commit-search items for `CONFIG.elsewhere.kernel` into the
 * `elsewhere.kernel` shape. `totalCount` drives `commits` (the search API's
 * `total_count`, which may exceed `items.length` when capped at 1000).
 *
 * @param {Array<{sha:string, commit:{message:string, author:{date:string}}}>} items
 * @param {number} totalCount
 * @param {{commitUrlPrefix:string, listUrl:string, recentLimit?:number}} cfg
 */
export function summarizeKernelCommits(items, totalCount, cfg) {
  const dated = (items || []).filter((item) => item?.sha && item?.commit?.author?.date);
  const years = dated.map((item) => new Date(item.commit.author.date).getUTCFullYear());

  const recent = dated
    .slice()
    .sort((a, b) => new Date(b.commit.author.date) - new Date(a.commit.author.date))
    .slice(0, cfg.recentLimit ?? 3)
    .map((item) => ({
      title: (item.commit.message || "").split("\n")[0],
      url: `${cfg.commitUrlPrefix}${item.sha.slice(0, 12)}`,
      date: item.commit.author.date.slice(0, 10),
    }));

  return {
    commits: totalCount || 0,
    firstYear: years.length ? Math.min(...years) : null,
    lastYear: years.length ? Math.max(...years) : null,
    url: cfg.listUrl,
    recent,
  };
}

/**
 * Keep only merge requests whose full reference lives under `namespace`
 * (postmarketOS moved GitLab instances, so the same MR can otherwise show up
 * twice), then dedupe by (title, merged date).
 *
 * @param {Array<{title?:string, merged_at?:string, references?:{full?:string}}>} mrItems
 * @param {string} namespace
 */
export function filterAndDedupeMergedMRs(mrItems, namespace) {
  const prefix = `${namespace}/`;
  const filtered = (mrItems || []).filter((mr) => typeof mr?.references?.full === "string" && mr.references.full.startsWith(prefix));

  const seen = new Set();
  const deduped = [];
  for (const mr of filtered) {
    const key = `${mr.title ?? ""}\u0000${(mr.merged_at || "").slice(0, 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(mr);
  }
  return deduped;
}

/**
 * Reduce raw GitLab merge-request + commit lists for `CONFIG.elsewhere.postmarketos`
 * into the `elsewhere.postmarketos` shape.
 *
 * @param {Array<{title?:string, web_url?:string, merged_at?:string, references?:{full?:string}}>} mrItems
 *   raw merged MRs pooled across all configured hosts (not yet namespace-filtered/deduped)
 * @param {Array<{committed_date?:string, created_at?:string}>} commits
 *   raw commit objects from `commitsProject` on `commitsHost`
 * @param {{namespace:string, profileUrl:string, recentLimit?:number}} cfg
 */
export function summarizePostmarketos(mrItems, commits, cfg) {
  const deduped = filterAndDedupeMergedMRs(mrItems, cfg.namespace);

  const mrYears = deduped.map((mr) => mr.merged_at).filter(Boolean).map((d) => new Date(d).getUTCFullYear());
  const commitYears = (commits || [])
    .map((c) => c?.committed_date || c?.created_at)
    .filter(Boolean)
    .map((d) => new Date(d).getUTCFullYear());
  const years = [...mrYears, ...commitYears];

  const recent = deduped
    .slice()
    .sort((a, b) => new Date(b.merged_at) - new Date(a.merged_at))
    .slice(0, cfg.recentLimit ?? 3)
    .map((mr) => ({
      title: mr.title ?? "",
      url: mr.web_url,
      date: (mr.merged_at || "").slice(0, 10),
    }));

  return {
    mergedMRs: deduped.length,
    commits: commits ? commits.length : 0,
    firstYear: years.length ? Math.min(...years) : null,
    lastYear: years.length ? Math.max(...years) : null,
    url: cfg.profileUrl,
    recent,
  };
}

function yearsElapsed(createdAt, now) {
  const created = new Date(createdAt);
  let years = now.getUTCFullYear() - created.getUTCFullYear();
  const anniversaryThisYear = new Date(Date.UTC(now.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate()));
  if (now < anniversaryThisYear) years -= 1;
  return Math.max(0, years);
}

function parseSearchItem(raw) {
  const match = /^https:\/\/api\.github\.com\/repos\/(.+)$/.exec(raw.repository_url || "");
  if (!match) return null;
  const mergedAt = raw.pull_request?.merged_at;
  if (!mergedAt) return null;
  return { repo: match[1], number: raw.number, title: raw.title, url: raw.html_url, mergedAt };
}

function avatarUrlWithSize(url, size) {
  const withSize = new URL(url);
  withSize.searchParams.set("s", String(size));
  return withSize.toString();
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Network-touching orchestration
// ---------------------------------------------------------------------------

async function fetchUser(client, login) {
  const query = `
    query UserProfile($login: String!) {
      user(login: $login) {
        name
        createdAt
        followers { totalCount }
        following { totalCount }
        repositories(ownerAffiliations: OWNER, privacy: PUBLIC) { totalCount }
      }
    }
  `;
  const data = await client.graphql(query, { login });
  if (!data.user) throw new Error(`collectProfileData: user "${login}" not found`);
  return data.user;
}

async function fetchOwnRepos(client, login) {
  const query = `
    query OwnRepos($login: String!, $after: String) {
      user(login: $login) {
        repositories(
          first: 100
          after: $after
          ownerAffiliations: OWNER
          isFork: false
          privacy: PUBLIC
          orderBy: { field: NAME, direction: ASC }
        ) {
          pageInfo { hasNextPage endCursor }
          nodes {
            name
            stargazerCount
            forkCount
            languages(first: 20, orderBy: { field: SIZE, direction: DESC }) {
              edges { size node { name color } }
            }
          }
        }
      }
    }
  `;
  const repos = [];
  let after = null;
  for (;;) {
    const data = await client.graphql(query, { login, after });
    const page = data.user.repositories;
    repos.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
  }
  return repos;
}

/**
 * One aliased `contributionsCollection` per calendar year, chunked so a
 * single request never spans too many years. Returns a Map keyed by year with
 * the raw GraphQL fragment for that year.
 */
async function fetchYearsRaw(client, login, firstYear, now) {
  const currentYear = now.getUTCFullYear();
  const years = [];
  for (let year = firstYear; year <= currentYear; year++) years.push(year);

  const results = new Map();
  for (const yearsChunk of chunk(years, YEAR_CHUNK_SIZE)) {
    const variables = { login };
    const fields = yearsChunk.map((year, idx) => {
      const from = new Date(Date.UTC(year, 0, 1, 0, 0, 0)).toISOString();
      const naturalTo = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
      const to = (year === currentYear ? new Date(Math.min(naturalTo.getTime(), now.getTime())) : naturalTo).toISOString();
      variables[`from${idx}`] = from;
      variables[`to${idx}`] = to;
      return `
        y${idx}: contributionsCollection(from: $from${idx}, to: $to${idx}) {
          contributionCalendar { totalContributions }
          totalCommitContributions
          totalPullRequestContributions
          totalIssueContributions
          totalPullRequestReviewContributions
          restrictedContributionsCount
          commitContributionsByRepository(maxRepositories: 100) {
            contributions { totalCount }
            repository { nameWithOwner isPrivate isFork stargazerCount owner { login } }
          }
        }
      `;
    });
    const varDefs = yearsChunk.map((_, idx) => `$from${idx}: DateTime!, $to${idx}: DateTime!`).join(", ");
    const query = `query Years($login: String!, ${varDefs}) { user(login: $login) { ${fields.join("\n")} } }`;
    const data = await client.graphql(query, variables);
    yearsChunk.forEach((year, idx) => results.set(year, data.user[`y${idx}`]));
  }
  return results;
}

/** Fetch metadata for the union of upstream repo candidates, ~30 aliases per request. */
async function fetchRepoMetas(client, fullNames) {
  const pairs = fullNames.map((fullName) => {
    const [owner, name] = fullName.split("/");
    return { fullName, owner, name };
  });

  async function fetchBatch(batch) {
    const variables = {};
    const fields = batch.map((p, idx) => {
      variables[`o${idx}`] = p.owner;
      variables[`n${idx}`] = p.name;
      return `r${idx}: repository(owner: $o${idx}, name: $n${idx}) {
        isPrivate isFork isArchived stargazerCount description url
        owner { login avatarUrl }
      }`;
    });
    const varDefs = batch.map((_, idx) => `$o${idx}: String!, $n${idx}: String!`).join(", ");
    const query = `query RepoMetas(${varDefs}) { ${fields.join("\n")} }`;
    const data = await client.graphql(query, variables);
    const out = new Map();
    batch.forEach((p, idx) => {
      const raw = data[`r${idx}`];
      out.set(
        p.fullName,
        raw
          ? {
              owner: raw.owner?.login ?? p.owner,
              name: p.name,
              isPrivate: raw.isPrivate,
              isFork: raw.isFork,
              isArchived: raw.isArchived,
              stars: raw.stargazerCount,
              description: raw.description,
              url: raw.url,
              avatarUrl: raw.owner?.avatarUrl ?? null,
            }
          : null,
      );
    });
    return out;
  }

  const result = new Map();
  for (const batch of chunk(pairs, REPO_META_BATCH_SIZE)) {
    try {
      const batchResult = await fetchBatch(batch);
      for (const [k, v] of batchResult) result.set(k, v);
    } catch {
      // One stale/renamed/deleted repo makes the GraphQL response carry a
      // partial `errors` array (NOT_FOUND) for the whole aliased batch; fall
      // back to per-repo requests so a single bad repo doesn't drop the rest.
      for (const p of batch) {
        try {
          const single = await fetchBatch([p]);
          result.set(p.fullName, single.get(p.fullName));
        } catch {
          result.set(p.fullName, null);
        }
      }
    }
  }
  return result;
}

async function searchMergedPRs(client, login, excludeOwners) {
  const excludeClauses = excludeOwners.map((owner) => `-org:${owner}`).join(" ");
  const q = `is:pr is:merged author:${login} -user:${login}${excludeClauses ? ` ${excludeClauses}` : ""}`;
  const rawItems = await client.restPaginate("/search/issues", {
    params: { q },
    perPage: 100,
    maxItems: 1000,
    itemsKey: "items",
  });
  const items = [];
  for (const raw of rawItems) {
    const parsed = parseSearchItem(raw);
    if (parsed) items.push(parsed);
  }
  return items;
}

async function fetchAvatarDataUri(client, cache, avatarUrl) {
  if (!avatarUrl) return null;
  if (cache.has(avatarUrl)) return cache.get(avatarUrl);
  let dataUri = null;
  try {
    const sized = avatarUrlWithSize(avatarUrl, 48);
    const { contentType, buffer } = await client.fetchBinary(sized);
    dataUri = `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch (err) {
    console.error(`collectProfileData: warning: failed to fetch avatar (${err.message})`);
    dataUri = null;
  }
  cache.set(avatarUrl, dataUri);
  return dataUri;
}

/**
 * GitHub commit search for `repo:<repo> author:<login>`, newest first.
 * Commit search no longer requires a special `Accept` header, but if GitHub
 * ever responds 415/422 for it, retry once with the legacy cloak-preview
 * media type before giving up.
 */
async function fetchKernelCommitItems(client, repo, login) {
  const path = "/search/commits";
  const baseParams = { q: `repo:${repo} author:${login}`, sort: "author-date", order: "desc", per_page: 100 };
  let accept; // set once the cloak-preview fallback is known to be required

  async function requestPage(page) {
    const params = { ...baseParams, page };
    try {
      return await client.rest(path, { params, accept });
    } catch (err) {
      if (!accept && /\b(415|422)\b/.test(err.message)) {
        accept = "application/vnd.github.cloak-preview+json";
        return client.rest(path, { params, accept });
      }
      throw err;
    }
  }

  const first = await requestPage(1);
  const totalCount = first.total_count || 0;
  const items = [...(first.items || [])];
  let page = 2;
  while (items.length < totalCount && items.length < 1000 && (first.items || []).length === 100) {
    const next = await requestPage(page);
    const pageItems = next.items || [];
    if (pageItems.length === 0) break;
    items.push(...pageItems);
    if (pageItems.length < 100) break;
    page += 1;
  }
  return { totalCount, items: items.slice(0, 1000) };
}

/**
 * Collect the "elsewhere" contributions (Linux kernel on GitHub, postmarketOS
 * on GitLab) that live outside GitHub's own contribution graph. Failures
 * propagate to the caller (generate.mjs is all-or-nothing) except a 404 on
 * the GitLab user lookup, which just means "no commits there".
 *
 * @param {ReturnType<import('./github.mjs').createClient>} githubClient
 * @param {typeof import('../config.mjs').CONFIG} config
 * @param {{gitlabFactory?: typeof createGitLabClient}} [opts]
 */
export async function collectElsewhere(githubClient, config, { gitlabFactory = createGitLabClient } = {}) {
  const cfg = config.elsewhere;
  const recentLimit = cfg.recentLimit ?? 3;

  const { totalCount, items } = await fetchKernelCommitItems(githubClient, cfg.kernel.repo, config.login);
  const kernel = summarizeKernelCommits(items, totalCount, { ...cfg.kernel, recentLimit });

  const pmCfg = cfg.postmarketos;
  const mrLists = await Promise.all(
    pmCfg.hosts.map((host) =>
      gitlabFactory(host).paginate("/merge_requests", {
        author_username: pmCfg.username,
        state: "merged",
        scope: "all",
      }),
    ),
  );
  const mrItems = mrLists.flat();

  const commitsClient = gitlabFactory(pmCfg.commitsHost);
  let commits = [];
  try {
    const users = await commitsClient.get("/users", { username: pmCfg.username });
    const user = Array.isArray(users) ? users[0] : null;
    if (user?.name) {
      commits = await commitsClient.paginate(`/projects/${encodeURIComponent(pmCfg.commitsProject)}/repository/commits`, {
        author: user.name,
      });
    }
  } catch (err) {
    if (err?.status !== 404) throw err;
    commits = [];
  }

  const postmarketos = summarizePostmarketos(mrItems, commits, {
    namespace: pmCfg.namespace,
    profileUrl: pmCfg.profileUrl,
    recentLimit,
  });

  return { kernel, postmarketos };
}

/**
 * @param {ReturnType<import('./github.mjs').createClient>} client
 * @param {typeof import('../config.mjs').CONFIG} config
 * @param {Date} [now]
 */
export async function collectProfileData(client, config, now = new Date()) {
  const login = config.login;

  const [rawUser, ownRepos, elsewhere] = await Promise.all([
    fetchUser(client, login),
    fetchOwnRepos(client, login),
    config.elsewhere ? collectElsewhere(client, config) : Promise.resolve(undefined),
  ]);

  const firstYear = new Date(rawUser.createdAt).getUTCFullYear();
  const yearsRaw = await fetchYearsRaw(client, login, firstYear, now);

  const years = [];
  const commitContribsByYear = new Map(); // repo full name -> year -> commits
  const earlyRepoHints = new Map(); // repo full name -> {owner, isPrivate, isFork} (for cheap pre-filtering)

  for (const year of [...yearsRaw.keys()].sort((a, b) => a - b)) {
    const y = yearsRaw.get(year);
    years.push({
      year,
      total: y.contributionCalendar.totalContributions,
      commits: y.totalCommitContributions,
      pullRequests: y.totalPullRequestContributions,
      issues: y.totalIssueContributions,
      reviews: y.totalPullRequestReviewContributions,
      restricted: y.restrictedContributionsCount,
    });
    for (const entry of y.commitContributionsByRepository) {
      const repo = entry.repository;
      const fullName = repo.nameWithOwner;
      earlyRepoHints.set(fullName, { owner: repo.owner?.login, isPrivate: repo.isPrivate, isFork: repo.isFork });
      if (isExcludedRepo({ owner: repo.owner?.login, isPrivate: repo.isPrivate, isFork: repo.isFork }, config)) continue;
      if (!commitContribsByYear.has(fullName)) commitContribsByYear.set(fullName, new Map());
      commitContribsByYear.get(fullName).set(year, entry.contributions.totalCount);
    }
  }

  const prItems = await searchMergedPRs(client, login, config.excludeOwners || []);

  const candidateRepoNames = new Set([...prItems.map((p) => p.repo), ...commitContribsByYear.keys()]);
  // Cheap early exclusion using whatever hints we already have (own login is
  // always derivable from the repo name itself; commit-contrib repos also
  // carry isPrivate/isFork). PR-search repos without hints still get a full
  // metadata fetch, which is the only source of truth for them.
  const toResolve = [...candidateRepoNames].filter((fullName) => {
    const owner = fullName.split("/")[0];
    if (owner.toLowerCase() === login.toLowerCase()) return false;
    if ((config.excludeOwners || []).some((o) => o.toLowerCase() === owner.toLowerCase())) return false;
    const hint = earlyRepoHints.get(fullName);
    if (hint && isExcludedRepo(hint, config)) return false;
    return true;
  });

  const repoMetas = await fetchRepoMetas(client, toResolve);

  const { notable: notableAll, totals: upstreamTotals, recentPRsCandidates } = mergeUpstream(
    prItems,
    commitContribsByYear,
    repoMetas,
    config,
  );

  const notableCapped = notableAll.slice(0, config.notableLimit);
  const avatarCache = new Map();
  const notable = [];
  for (const repo of notableCapped) {
    const avatarDataUri = await fetchAvatarDataUri(client, avatarCache, repo.avatarUrl);
    const { avatarUrl: _avatarUrl, ...rest } = repo;
    notable.push({ ...rest, avatarDataUri });
  }

  const recentPRs = recentPRsCandidates.slice(0, config.recentPRsLimit).map((pr) => ({
    repo: pr.repo,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    mergedAt: pr.mergedAt,
  }));

  const languages = aggregateLanguages(ownRepos, { ignore: config.languageIgnore || [], limit: config.languageLimit });
  const { contributionsAllTime, contributionsThisYear } = summarizeYears(years);

  const stars = ownRepos.reduce((sum, r) => sum + (r.stargazerCount || 0), 0);
  const forks = ownRepos.reduce((sum, r) => sum + (r.forkCount || 0), 0);

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    user: {
      login,
      name: rawUser.name ?? null,
      createdAt: rawUser.createdAt,
      followers: rawUser.followers.totalCount,
      following: rawUser.following.totalCount,
      publicRepos: rawUser.repositories.totalCount,
    },
    totals: {
      stars,
      forks,
      ownRepos: ownRepos.length,
      followers: rawUser.followers.totalCount,
      mergedPRsUpstream: upstreamTotals.mergedPRsUpstream,
      upstreamRepos: upstreamTotals.upstreamRepos,
      contributionsAllTime,
      contributionsThisYear,
      firstYear,
      yearsOnGitHub: yearsElapsed(rawUser.createdAt, now),
    },
    years,
    languages,
    notable,
    recentPRs,
    ...(elsewhere ? { elsewhere } : {}),
  };
}
