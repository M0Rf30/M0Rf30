// Registry of every rendered card. generate.mjs renders each card once per theme
// into `<outDir>/<id>-<theme>.svg`; the README references those paths.
import * as banner from "./banner.mjs";
import * as stats from "./stats.mjs";
import * as activity from "./activity.mjs";
import * as languages from "./languages.mjs";
import * as kernel from "./kernel.mjs";
import * as notable from "./notable.mjs";

export const CARDS = [banner, stats, activity, languages, kernel, notable];
