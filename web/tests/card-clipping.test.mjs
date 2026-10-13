import fs from "node:fs";
import assert from "node:assert/strict";
import postcss from "postcss";
import sharp from "sharp";
import { getSvgPath } from "figma-squircle";

const css = postcss.parse(fs.readFileSync("src/components/process-book.module.css", "utf8"));
const fallbackSelector = '.app .stackCard[data-smooth-corners][style*="--smooth-path"]';
let fallback;
css.walkRules(fallbackSelector, rule => {
  rule.walkDecls("border-radius", declaration => { fallback = declaration.value; });
});
assert.equal(fallback, "calc(var(--corner-radius) - 2px)", "the moving card keeps a native overflow clip beneath its smoothed path");

async function alpha(svg) {
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, channels: info.channels };
}

for (const [width, height, radius] of [[332, 332, 24], [316, 316, 24], [260, 260, 24], [540, 540, 32]]) {
  const path = getSvgPath({ width, height, cornerRadius: radius, cornerSmoothing: 0.6 });
  const [smoothed, rounded] = await Promise.all([
    alpha(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><path d="${path}" fill="white"/></svg>`),
    alpha(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius - 2}" fill="white"/></svg>`),
  ]);
  for (let pixel = 0; pixel < width * height; pixel++) {
    assert(smoothed.data[pixel * smoothed.channels + 3] <= rounded.data[pixel * rounded.channels + 3] + 1,
      `the backup clip must never trim the 60% smoothed silhouette at ${width}px, pixel ${pixel}`);
  }
}

console.log("PASS: mobile cards keep a native Safari overflow clip without changing their 60% smoothed silhouette.");
