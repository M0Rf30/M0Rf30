// Single source of truth for everything the profile generator needs to know
// about *who* it is rendering. Cards and the data collector import from here;
// nothing else should hard-code the login, the exclusions or the copy.

export const CONFIG = Object.freeze({
  login: process.env.GITHUB_LOGIN || "M0Rf30",

  // Banner copy. Kept here (not in the card) so it can be edited without
  // touching SVG code.
  displayName: "M0Rf30",
  tagline: "Free-software developer, Linux packager and upstream contributor",
  focus: ["Linux kernel", "postmarketOS", "Packaging", "Rust", "Go", "Mesh networks", "Audio"],

  // Owners (users or orgs) whose repositories must never appear in any card,
  // matched case-insensitively. Employer work stays off the public profile.
  excludeOwners: ["zextras"],

  // Languages dropped from the languages card (generated/vendored noise).
  languageIgnore: ["ASL", "Roff", "HTML", "CSS", "Batchfile", "Dockerfile"],
  languageLimit: 8,

  notableLimit: 24,
  recentPRsLimit: 6,

  // Contributions that live outside GitHub's contribution graph, all under the
  // same M0Rf30 handle. Rendered by the "kernel" card.
  elsewhere: Object.freeze({
    recentLimit: 3,
    kernel: Object.freeze({
      label: "Linux kernel",
      // Mainline mirror on GitHub; commits are matched with `author:<login>`.
      repo: "torvalds/linux",
      commitUrlPrefix: "https://git.kernel.org/torvalds/c/",
      listUrl: "https://github.com/torvalds/linux/commits?author=M0Rf30",
    }),
    postmarketos: Object.freeze({
      label: "postmarketOS",
      username: "M0Rf30",
      // postmarketOS moved from gitlab.com to its own GitLab in 2024; merged MRs
      // live on both. Only projects under `namespace` count.
      hosts: ["https://gitlab.postmarketos.org", "https://gitlab.com"],
      namespace: "postmarketOS",
      commitsHost: "https://gitlab.postmarketos.org",
      commitsProject: "postmarketOS/pmaports",
      profileUrl: "https://gitlab.postmarketos.org/M0Rf30",
    }),
  }),

  // Where rendered SVGs go, relative to the repository root.
  outDir: "metrics",
  readmePath: "README.md",
});
