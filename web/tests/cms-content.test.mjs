import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function compile(path, dependencies = {}) {
  const compiledModule = { exports: {} };
  vm.runInNewContext(ts.transpile(fs.readFileSync(path, "utf8"), {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  }), { module: compiledModule, exports: compiledModule.exports, require: name => dependencies[name] ?? require(name) });
  return compiledModule.exports;
}
const env = { projectId: "6ny2t94o", dataset: "production" };
const image = compile("src/sanity/lib/image.ts", { "../env": env });
const { createProcessBookContent } = compile("src/sanity/lib/process-book.ts", { "./image": image });
const empty = createProcessBookContent({ categories: [], posts: [] });
assert.equal(empty.weeks.length, 0, "an empty CMS never manufactures placeholder weeks");
assert.equal(empty.periods.length, 4);
assert(empty.periods.every(period => period.firstIndex === null && period.range === "No weeks"));
const categories = ["foundation", "playgrounds-one", "personal-project", "playgrounds-two"].map((key, index) => ({ _id: `category-${index}`, key, title: `Period ${index + 1}` }));
const cover = {
  _type: "image", alt: "CMS image alternative text",
  asset: { _type: "reference", _ref: "image-997273a60edcd2bc849f6b261f04d32b4af814ba-3024x1528-png" },
  crop: { _type: "sanity.imageCrop", left: .01, right: .75, top: .45, bottom: .115 },
};
const posts = [
  { _id: "week-c", title: "A CMS title", weekNumber: 8, categoryId: "category-1", coverImage: cover },
  { _id: "week-b", title: "Second", weekNumber: 3, categoryId: "category-0", coverImage: cover },
  { _id: "week-a", title: "First", weekNumber: 1, categoryId: "category-0", coverImage: cover },
  { _id: "week-d", title: " ", weekNumber: 22, categoryId: "category-3", coverImage: null },
  { _id: "orphan", title: "Unlinked", weekNumber: 9, categoryId: "missing", coverImage: cover },
  { _id: "invalid", title: "Invalid", weekNumber: 1.5, categoryId: "category-0", coverImage: cover },
];
const result = createProcessBookContent({ categories, posts });
assert.deepEqual(Array.from(result.weeks, week => week.id), ["week-a", "week-b", "week-c", "week-d"]);
assert.deepEqual(Array.from(result.periods, period => period.firstIndex), [0, 2, null, 3], "tab destinations follow actual category membership, without seven-week arithmetic");
assert.deepEqual(Array.from(result.periods, period => period.range), ["Week 1-3", "Week 8-8", "No weeks", "Week 22-22"]);
assert.equal(result.weeks[2].period, 1);
assert.equal(result.weeks[2].title, "A CMS title");
assert.equal(result.weeks[2].imageAlt, cover.alt);
const url = new URL(result.weeks[0].image);
assert.equal(url.hostname, "cdn.sanity.io");
assert.equal(url.searchParams.get("w"), "1060");
assert.equal(url.searchParams.get("h"), "1060");
assert.equal(url.searchParams.get("auto"), "format");
assert(url.searchParams.has("rect"), "the image builder applies the CMS crop");
assert.equal(result.weeks[3].image, null, "missing CMS images never display another week's artwork");
assert.equal(result.weeks[3].title, "Untitled week");
assert.equal(posts[0]._id, "week-c", "normalizing content never mutates its input");
console.log("PASS: CMS posts drive titles, image URLs/crops/alt text, categories, unequal week counts, ranges and tab destinations; empty, missing-image and unlinked content remain safe.");
