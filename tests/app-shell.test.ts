import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync("src/app/globals.css", "utf8");
const script = readFileSync("src/components/ui/ThemeScript.tsx", "utf8");

test("l'application se signale avant le premier affichage", () => {
  assert.match(script, /APP_USER_AGENT = "TamilyaApp\/"/);
  assert.match(script, /navigator\.userAgent\.indexOf\(.*APP_USER_AGENT.*html\.dataset\.app = "android"/);
});

test("sans application, le site ne change pas", () => {
  assert.match(css, /\.app-only \{\s*display: none !important;/);
  assert.match(css, /html\[data-app\] \.app-only \{\s*display: revert !important;/);
  assert.match(css, /html\[data-app\] \.app-hide \{\s*display: none !important;/);
  assert.ok(!/^\.app-hide/m.test(css), "app-hide n'agit que dans l'application");
});
