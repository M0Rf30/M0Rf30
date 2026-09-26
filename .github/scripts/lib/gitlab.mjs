// Tiny, unauthenticated GitLab v4 REST client (built-in `fetch` only). Used to
// pull public merged-MR and commit history for postmarketOS contributions —
// no token is needed for public GitLab data, so there is nothing secret to
// protect here, unlike lib/github.mjs.
//
// Shares its retry policy (network errors, 5xx, 429; capped backoff) with
// lib/github.mjs via the exported `fetchWithRetry` helper.

import { fetchWithRetry } from "./github.mjs";

const USER_AGENT = "m0rf30-profile-generator (+github.com/M0Rf30/M0Rf30)";
const PER_PAGE = 100;
const DEFAULT_MAX_PAGES = 20;

function buildUrl(root, pathOrUrl, params) {
  const url = /^https?:\/\//.test(pathOrUrl) ? new URL(pathOrUrl) : new URL(root + pathOrUrl);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }
  return url;
}

/**
 * @param {string} host e.g. "https://gitlab.postmarketos.org" (no trailing slash required)
 */
export function createGitLabClient(host) {
  const root = `${host.replace(/\/$/, "")}/api/v4`;

  async function getResponse(path, params) {
    const url = buildUrl(root, path, params);
    return fetchWithRetry(() => fetch(url, { headers: { "User-Agent": USER_AGENT } }), {
      errorLabel: "GitLab API error",
    });
  }

  /** GET a single page/resource; returns parsed JSON. Throws with `.status` set on HTTP errors (e.g. 404). */
  async function get(path, params) {
    const res = await getResponse(path, params);
    return res.json();
  }

  /**
   * Paginate a GitLab list endpoint using `x-next-page` / `x-total-pages`
   * response headers (offset pagination), `per_page=100`.
   * @param {{maxPages?: number}} [opts]
   */
  async function paginate(path, params = {}, { maxPages = DEFAULT_MAX_PAGES } = {}) {
    const results = [];
    let page = 1;
    for (;;) {
      const res = await getResponse(path, { ...params, per_page: PER_PAGE, page });
      const data = await res.json();
      if (!Array.isArray(data)) break;
      results.push(...data);

      const totalPages = Number(res.headers.get("x-total-pages"));
      const nextPage = res.headers.get("x-next-page");
      if (!nextPage) break;
      if (Number.isFinite(totalPages) && totalPages > 0 && page >= totalPages) break;
      if (page >= maxPages) break;
      page += 1;
    }
    return results;
  }

  return { get, paginate };
}
