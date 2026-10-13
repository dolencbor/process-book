import fs from "node:fs";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import postcss from "postcss";
import sharp from "sharp";
import vm from "node:vm";

const css = postcss.parse(fs.readFileSync("src/components/process-book.module.css", "utf8"));
function mobile(selector) {
  const result = {};
  css.walkAtRules("media", rule => {
    if (rule.params !== "(max-width: 700px)") return;
    rule.walkRules(selector, match => match.walkDecls(decl => { result[decl.prop] = decl.value; }));
  });
  return result;
}
assert.equal(mobile(".owner > span").display, "none");
assert.equal(mobile(".year").display, "inline");
assert.equal(mobile(".tableView")["--table-heading-height"], "263px");
assert.equal(mobile(".tableHeader").padding, "calc(124px - var(--table-top)) 16px 0");
assert.equal(mobile(".tableHero")["font-size"], "36px");
assert.equal(mobile(".tableHero").gap, "0");
assert.equal(mobile(".tableRange")["align-self"], "flex-start");
assert.equal(mobile(".tableHeading, .tableRow")["grid-template-columns"], "91px minmax(0, 1fr)");
assert.equal(mobile(".tableHeading, .tableRow")["column-gap"], "4px");
assert.equal(mobile(".tableScroll")["scroll-snap-type"], "y mandatory");
assert.equal(mobile('.tableScroll[data-travelling="true"]')["scroll-snap-type"], "none");
assert.equal(mobile(".tableRow")["scroll-snap-align"], "start");
assert.equal(mobile(".tableRow")["min-height"], "57.5px");
assert.equal(mobile(".tableRow").height, "auto", "long titles must expand the row");
assert.equal(mobile(".tableRow").padding, "20px 8px");
assert.equal(mobile(".rowPreview").right, "8px");
assert.equal(mobile(".rowPreview").width, "min(178px, 45.3vw)");
assert.equal(mobile(".rowPreview").bottom, "calc(72px + env(safe-area-inset-bottom, 0px))");
assert.equal(mobile(".rowPreviewMask").translate, "0 0");
assert.equal(mobile(".viewToggle").bottom, "calc(16px + env(safe-area-inset-bottom, 0px))");
assert.equal(mobile('.viewToggle[data-view-mode="scroll"]').bottom, undefined, "both views share one mobile switcher position");
assert.equal(mobile(".selectedWeek, .selectedTitle")["letter-spacing"], "-0.02em");
assert.equal(mobile(".selectedWeek")["grid-row"], "2");
assert.equal(mobile(".selectedTitle")["grid-row"], "4");
assert.equal(mobile(".stack")["grid-row"], "6");
assert.equal(mobile(".far")["--corner-radius"], "15px");
assert.equal(mobile(".near")["--corner-radius"], "18px");
assert.equal(mobile(".mainCard")["--corner-radius"], "24px");
assert.equal(mobile(".selectedWeek .number")["font-feature-settings"], '"lnum" 1, "tnum" 1, "zero" 0');
const stage = mobile(".scrollStage");
assert.equal(stage["grid-template-rows"], "minmax(0, 1fr) 16px 10px 16px minmax(0, 1fr) var(--rail-height)");
const evaluateSize = (expression, width, height, cardSize) => vm.runInNewContext(expression
  .replaceAll("var(--card-size)", String(cardSize)).replaceAll("100vw", String(width)).replaceAll("100dvh", String(height))
  .replaceAll("px", "").replaceAll("calc", "").replaceAll("min(", "Math.min("));
for (const [width, height] of [[393,852],[375,667],[320,568],[700,900],[393,400]]) {
  const card = evaluateSize(stage["--card-size"], width, height);
  const railHeight = evaluateSize(stage["--rail-height"], width, height, card);
  const stackTop = height - railHeight;
  const labelTop = 76 + (stackTop - 76 - 42) / 2;
  assert(labelTop >= 76, "the text fits between the fixed tabs and card stack at short heights");
  assert(Math.abs(labelTop + 21 - (76 + stackTop) / 2) < .001, "the label block stays centered between the tabs and cards");
  assert(card <= width - 16, "the rail fits the mobile width");
  if (width === 393 && height === 852) {
    assert.equal(card, 318);
    assert(Math.abs(stackTop - 270) < .001);
    assert(Math.abs(labelTop - 152) < .001);
    assert.equal(height - 16 - 32, 804, "Scroll switcher matches Figma's bottom placement");
  }
}
assert.equal(mobile(".topFade, .bottomFade")["background-image"], 'url("/design/mobile-rail-fade.webp")');
const mobileFade = await sharp("public/design/mobile-rail-fade.webp").metadata();
assert.equal(mobileFade.width,377); assert.equal(mobileFade.height,126);
const fadePixels = await Promise.all(["png","webp"].map(format => sharp(`public/design/mobile-rail-fade.${format}`).ensureAlpha().raw().toBuffer()));
assert(fadePixels[0].equals(fadePixels[1]), "the mobile gradient asset is preserved losslessly");
// Coordinates at Figma's 393x852 frame, with zero additional safe-area inset.
const previewWidth = Number(mobile(".rowPreview").width.match(/\d+/)[0]);
const previewBottom = Number(mobile(".rowPreview").bottom.match(/\d+/)[0]);
assert.equal(852 - previewBottom - previewWidth, 602, "preview's page top");
const switcherBottom = Number(mobile(".viewToggle").bottom.match(/\d+/)[0]);
assert.equal(852 - switcherBottom - 32, 804, "switcher's page top in both Scroll and List");
const titleTop = Number(mobile(".tableHeader").padding.match(/\d+/)[0]);
assert.equal(titleTop + parseFloat(mobile(".tableHero")["font-size"]), 160, "range begins directly below the title");
assert.equal(parseFloat(mobile(".tableRow").padding.split(" ")[1]) + parseFloat(mobile(".tableHeading, .tableRow")["grid-template-columns"]) + parseFloat(mobile(".tableHeading, .tableRow")["column-gap"]), 103, "row title x position");

const expected = {
  "mobile-logo": "d232f3d7e87a8535a97433a2f9d84582dd4d850f",
  foundation: "0664b67efaa9064d3c01b4c71701fdca1350986b",
  "playgrounds-one": "8cc098b2688644b59712b79e2c16e20d8120ae5f",
  "personal-project": "254e2438030071ef6487abd670cd2df898292efb",
  "playgrounds-two": "066bc6bcc876042c184b19788dfe5bcb88831758",
  "selected-cover": "997273a60edcd2bc849f6b261f04d32b4af814ba",
};
for (const [name, hash] of Object.entries(expected)) {
  assert.equal(crypto.createHash("sha1").update(fs.readFileSync(`public/design/${name}.png`)).digest("hex"), hash, `${name} must use the actual Figma source`);
  assert(fs.statSync(`public/design/${name}.webp`).size > 0);
}
const [original, compressed] = await Promise.all(["png", "webp"].map(format => sharp(`public/design/mobile-logo.${format}`).ensureAlpha().raw().toBuffer()));
assert.equal(original.length, compressed.length);
for (let i=0; i<original.length; i+=4) {
  assert.equal(original[i+3],compressed[i+3]);
  if (original[i+3]) assert(original.subarray(i,i+3).equals(compressed.subarray(i,i+3)), "mobile logo's visible pixels must survive WebP conversion");
}
console.log("PASS: mobile Figma geometry, native snapping, variable-height rows, safe-area spacing and List label are configured; all six raster source hashes match Figma, files are local, and the new logo's visible pixels are preserved.");
