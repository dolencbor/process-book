import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import sharp from "sharp";
import { getSvgPath } from "figma-squircle";

const require = createRequire(import.meta.url);
const compiledModule = { exports: {} };
vm.runInNewContext(ts.transpile(fs.readFileSync("src/components/switcher-surface.tsx", "utf8"), {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
}), { module: compiledModule, exports: compiledModule.exports, require });
const render = active => renderToStaticMarkup(React.createElement(compiledModule.exports.SwitcherSurface, { active, className: "surface" }))
  .replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
const active = render(true), inactive = render(false);
assert.match(active, /width="96" height="28" viewBox="0 0 96 28"/);
assert.match(inactive, /width="196" height="32" viewBox="0 0 196 32"/);
for (const [svg, width, height, radius] of [[active,96,28,8], [inactive,196,32,10]]) {
  const shape = getSvgPath({ width, height, cornerRadius: radius, cornerSmoothing: 0.6 });
  assert(svg.includes(`d="${shape}"`), "the smoothed shape is already painted before hydration");
}
assert.match(active, /<g filter="url\(#[^)]+\)"><path[^>]+fill="black"/,
  "inset effects use the actual shaped fill and inside stroke as their source");
assert(!active.match(/<filter[^>]*>([\s\S]*?)<\/filter>/)[1].includes("<g"), "SVG filter primitives must be direct children");
assert(!inactive.includes("<filter"), "the unselected segment has no inset effects");
assert.equal((active.match(/<feGaussianBlur/g)||[]).length, 4, "only visible authored effects need rendering");
assert(active.includes('stop-opacity="0.1"')); assert(active.includes('stop-opacity="0.2"'));
assert(inactive.includes('stop-opacity="0.5"')); assert(inactive.includes('stop-opacity="0.25"'));

// Compare production paint with Figma's own exported SVG using the same
// rasterizer. Figma's exporter uses circular corners; compare the central
// strip where both shapes coincide, leaving the required 60% curves intact.
const [reference, actual] = await Promise.all([
  sharp("tests/fixtures/switcher-handle-figma.svg").ensureAlpha().raw().toBuffer(),
  sharp(Buffer.from(active)).ensureAlpha().raw().toBuffer(),
]);
for (let y=0; y<28; y++) for (let x=20; x<76; x++) for (let channel=0; channel<4; channel++) {
  const pixel=(y*96+x)*4+channel;
  assert(Math.abs(reference[pixel]-actual[pixel])<=1, `Figma paint differs at ${x},${y},${channel}`);
}
console.log("PASS: switcher paint matches Figma's exported shadows and strokes, retains 60% smoothing before hydration, and gives inactive segments no extra highlight.");
