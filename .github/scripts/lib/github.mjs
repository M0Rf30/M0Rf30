// Zero-dependency GitHub API client: GraphQL + REST over the built-in `fetch`.
//
// Retries network errors, 5xx, 429 and 403-secondary-rate-limit responses up
// to 3 attempts with exponential backoff, honouring `retry-after` /
// `x-ratelimit-reset` when present (capped at ~60s so a stuck run doesn't
// hang the whole workflow). A plain "bad credentials" 403 is NOT retried.
//
// The token is only ever placed in the Authorization header; it is never
// logged or included in thrown error messages.

const API_ROOT = "https://api.github.com";
const GRAPHQL_URL = `${API_ROOT}/graphql`;
const USER_AGENT = "m0rf30-profile-generator (+github.com/M0Rf30/M0Rf30)";
const MAX_ATTEMPTS = 3;
const MAX_WAIT_MS = 60_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt) {
  return Math.min(500 * 2 ** (attempt - 1), MAX_WAIT_MS);
}

async function waitMsFromResponse(res, attempt) {
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, MAX_WAIT_MS);
  }
  const reset = res.headers.get("x-ratelimit-reset");
  if (reset) {
    const resetMs = Number(reset) * 1000;
    if (Number.isFinite(resetMs)) {
      const wait = resetMs - Date.now();
      if (wait > 0) return Math.min(wait, MAX_WAIT_MS);
    }
  }
  return backoffMs(attempt);
}

/**
 * Fetch with retry. `doFetch` must be re-callable (no consumed request body).
 * Generic enough to back non-GitHub REST clients (see lib/gitlab.mjs);
 * exported as `fetchWithRetry` below.
 */
async function withRetry(doFetch, { maxAttempts = MAX_ATTEMPTS, errorLabel = "GitHub API error" } = {}) {
  let lastNetworkError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res;
    try {
      res = await doFetch();
    } catch (err) {
      lastNetworkError = err;
      if (attempt >= maxAttempts) throw new Error(`network error: ${err.message}`);
      await sleep(backoffMs(attempt));
      continue;
    }

    if (res.ok) return res;

    const status = res.status;
    let secondaryRateLimited = false;
    if (status === 403) {
      // Distinguish "secondary rate limit" (retriable) from e.g. bad
      // credentials or permission errors (not retriable) by peeking at the
      // body without consuming the response we might still need to read.
      const clone = res.clone();
      const body = await clone.text().catch(() => "");
      secondaryRateLimited = /rate limit/i.test(body) || res.headers.get("x-ratelimit-remaining") === "0";
    }
    const retriable = status >= 500 || status === 429 || (status === 403 && secondaryRateLimited);

    if (!retriable || attempt >= maxAttempts) {
      const body = await res.text().catch(() => "");
      const err = new Error(`${errorLabel} ${status} ${res.statusText}: ${body.slice(0, 500)}`);
      err.status = status;
      throw err;
    }

    await sleep(await waitMsFromResponse(res, attempt));
  }
  throw lastNetworkError ?? new Error("request failed after retries");
}

/** Generic retrying fetch, reusable by other API clients (e.g. lib/gitlab.mjs). */
export { withRetry as fetchWithRetry };

/**
 * Create a client bound to `token`. Every method throws on failure; GraphQL
 * responses with a non-empty `errors` array throw with the joined messages.
 */
export function createClient(token) {
  if (!token) throw new Error("createClient(token): a GitHub token is required");

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": USER_AGENT,
  };

  async function graphql(query, variables = {}) {
    const res = await withRetry(() =>
      fetch(GRAPHQL_URL, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({ query, variables }),
      }),
    );
    const json = await res.json();
    if (Array.isArray(json.errors) && json.errors.length > 0) {
      throw new Error(`GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`);
    }
    return json.data;
  }

  function buildUrl(pathOrUrl, params) {
    const url = /^https?:\/\//.test(pathOrUrl) ? new URL(pathOrUrl) : new URL(API_ROOT + pathOrUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  async function rest(pathOrUrl, { params, accept } = {}) {
    const url = buildUrl(pathOrUrl, params);
    const res = await withRetry(() =>
      fetch(url, {
        headers: { ...authHeaders, Accept: accept || "application/vnd.github+json" },
      }),
    );
    return res.json();
  }

  /** Paginate a REST list/search endpoint via `page`/`per_page`. */
  async function restPaginate(pathOrUrl, { params = {}, perPage = 100, maxItems = 1000, itemsKey = "items" } = {}) {
    const results = [];
    let page = 1;
    while (results.length < maxItems) {
      const data = await rest(pathOrUrl, { params: { ...params, per_page: perPage, page } });
      const pageItems = Array.isArray(data) ? data : (data[itemsKey] ?? []);
      results.push(...pageItems);
      if (pageItems.length < perPage) break;
      page += 1;
    }
    return results.slice(0, maxItems);
  }

  /** Fetch a binary resource (e.g. an avatar) and return its content-type + bytes. */
  async function fetchBinary(url) {
    const res = await withRetry(() => fetch(url, { headers: { "User-Agent": USER_AGENT } }));
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const buffer = Buffer.from(await res.arrayBuffer());
    return { contentType, buffer };
  }

  return { graphql, rest, restPaginate, fetchBinary };
}
