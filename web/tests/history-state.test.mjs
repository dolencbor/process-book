import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import ts from "typescript";
import { weeks } from "./fixtures/book.mjs";

const require = createRequire(import.meta.url);
const compiledModule = { exports: {} };
let stored = null;
vm.runInNewContext(ts.transpile(fs.readFileSync("src/components/process-book-history.tsx", "utf8"), {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
}), {
  module: compiledModule, exports: compiledModule.exports, require,
  window: { location: { pathname: "/weeks/a-post" }, sessionStorage: { setItem: (_, value) => { stored = value; }, getItem: () => stored } },
});

const { resolveBookPosition, saveBookPosition } = compiledModule.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));
assert.deepEqual(plain(resolveBookPosition(null, weeks)), { view: "scroll", week: 0, selected: 0, list: null, restored: false });
const snapshot = { view: "table", weekId: weeks[13].id, selected: 1, list: { weekId: weeks[12].id, offset: 0.42 } };
saveBookPosition(snapshot);
assert.equal(JSON.parse(stored).weekId, weeks[13].id);
assert.deepEqual(plain(resolveBookPosition(snapshot, weeks)), {
  view: "table", week: 13, selected: 1, list: { week: 12, offset: 0.42 }, restored: true,
});
assert.deepEqual(plain(resolveBookPosition({ ...snapshot, weekId: "removed-post" }, weeks)), {
  view: "scroll", week: 0, selected: 0, list: null, restored: false,
});
assert.deepEqual(plain(resolveBookPosition({ ...snapshot, selected: 99, list: { weekId: "removed-post", offset: 0.42 } }, weeks)), {
  view: "table", week: 13, selected: 1, list: null, restored: true,
});
assert.equal(resolveBookPosition({ ...snapshot, list: { ...snapshot.list, offset: 4 } }, weeks).list.offset, 1);
console.log("PASS: Back navigation restores the exact CMS week/view/period and List row offset, while stale posts and invalid offsets are handled safely.");
