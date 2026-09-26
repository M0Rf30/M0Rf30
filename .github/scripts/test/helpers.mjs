import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Deep-cloned fixture so tests can mutate freely. */
export function loadFixture() {
  return JSON.parse(fs.readFileSync(path.join(HERE, "fixtures", "profile.json"), "utf8"));
}

const VOID_OK = /\/>$/;

/**
 * Minimal well-formedness check: balanced tags, a single <svg> root, no
 * leaked JS values, no unescaped ampersands. Not a full XML parser, but it
 * catches the mistakes string-built SVG actually makes.
 */
export function assertWellFormedSvg(svg) {
  assert.equal(typeof svg, "string");
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, "must start with an <svg> root");
  const scan = svg.replace(/data:[^"]+/g, "");
  assert.doesNotMatch(scan, /\b(undefined|NaN|null|\[object Object\])\b/, "leaked JS value in output");
  assert.doesNotMatch(scan, /&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/, "unescaped ampersand");
  const body = svg.replace(/<style>[\s\S]*?<\/style>/g, "");
  const stack = [];
  for (const m of body.matchAll(/<\/?([a-zA-Z][\w:-]*)(?:\s[^<>]*?)?\/?>/g)) {
    const [tag, name] = m;
    if (tag.startsWith("</")) {
      const open = stack.pop();
      assert.equal(open, name, `mismatched </${name}> (open: <${open}>)`);
    } else if (!VOID_OK.test(tag)) {
      stack.push(name);
    }
  }
  assert.deepEqual(stack, [], "unclosed tags");
  const w = Number(/width="(\d+(?:\.\d+)?)"/.exec(svg)?.[1]);
  const h = Number(/height="(\d+(?:\.\d+)?)"/.exec(svg)?.[1]);
  assert.ok(w > 0 && h > 0, "root must have positive width/height");
}
