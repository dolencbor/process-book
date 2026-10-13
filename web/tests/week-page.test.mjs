import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const compiledModule = { exports: {} };
const query = "single-week-query";
const requests = [];
const post = {
  _id: "published-week", title: "A weekly CMS post", weekNumber: 8, entryDate: "2026-10-26",
  category: { title: "Playgrounds S1" },
  coverImage: { alt: "CMS cover description", asset: { _ref: "image-997273a60edcd2bc849f6b261f04d32b4af814ba-3024x1528-png" } },
  body: [{ _type: "block", _key: "notes", style: "normal", children: [{ _type: "span", _key: "text", text: "Published weekly notes", marks: [] }], markDefs: [] }],
};
let fetched = post;
vm.runInNewContext(ts.transpile(fs.readFileSync("src/app/weeks/[id]/page.tsx", "utf8"), {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
}), {
  module: compiledModule, exports: compiledModule.exports,
  require(name) {
    if (name === "@/sanity/lib/live") return { sanityFetch: async options => { requests.push(options); return { data: fetched }; } };
    if (name === "@/sanity/lib/queries") return { WEEK_POST_QUERY: query };
    if (name === "@/sanity/lib/image") return { urlFor: () => {
      const builder = { width: () => builder, height: () => builder, fit: () => builder, auto: () => builder, quality: () => builder, url: () => "https://cdn.sanity.io/images/6ny2t94o/production/cover.png" };
      return builder;
    } };
    if (name === "next/navigation") return { notFound: () => { throw new Error("404"); } };
    if (name === "@/components/week-cover") return { WeekCover: ({ children }) => React.createElement("figure", null, children) };
    if (name === "@/components/process-body") return { ProcessBody: ({ value }) => React.createElement("p", null, value[0].children[0].text) };
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    return require(name);
  },
});
const props = { params: Promise.resolve({ id: post._id }) };
const html = renderToStaticMarkup(await compiledModule.exports.default(props));
assert.match(html, />Week 08<\/p>/);
assert.match(html, />Playgrounds S1<\/p>/);
assert.match(html, />A weekly CMS post<\/h1>/);
assert.match(html, />Published weekly notes<\/p>/);
assert.match(html, /dateTime="2026-10-26"/i);
assert.match(html, /alt="CMS cover description"/);
assert(!html.includes("← Process Book"), "the reader no longer renders a back control");
assert.equal((await compiledModule.exports.generateMetadata(props)).title, "Week 08 — A weekly CMS post");
for (const request of requests) {
  assert.equal(request.query, query);
  assert.equal(request.params.id, post._id);
  assert.equal(request.perspective, "published", "drafts must never be rendered on the public week route");
  assert.equal(request.stega, false);
}
fetched = { ...post, coverImage: null, body: [] };
const sparse = renderToStaticMarkup(await compiledModule.exports.default(props));
assert(!sparse.includes("<figure"));
assert(!sparse.includes("notes</p>"));
fetched = null;
await assert.rejects(compiledModule.exports.default({ params: Promise.resolve({ id: "missing" }) }), /404/);
await assert.rejects(compiledModule.exports.generateMetadata({ params: Promise.resolve({ id: "missing" }) }), /404/);
console.log("PASS: the single-week page renders the matching published CMS post, metadata, date, category, image and notes; absent content stays safe and unknown/unpublished posts return 404.");
