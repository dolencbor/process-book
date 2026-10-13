import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";
import postcss from "postcss";
import { keyframes } from "motion";

const source = fs.readFileSync("src/components/process-book.tsx", "utf8");
const css = postcss.parse(fs.readFileSync("src/components/process-book.module.css", "utf8"));
const declarations = selector => {
  const result = {};
  css.walkRules(selector, rule => rule.walkDecls(decl => { result[decl.prop] = decl.value; }));
  return result;
};
const mask = declarations(".range"), text = declarations(".range > span");
assert.equal(mask.right, "12px");
assert.equal(mask.width, undefined, "the mask covers the remaining space instead of moving a fixed-width window");
assert.equal(text.position, "absolute");
assert.equal(text.right, "0");
assert.equal(text.width, "var(--tab-range-width)");
assert.equal(declarations(".categoryName, .range").overflow, "hidden");

const context = {};
vm.createContext(context);
vm.runInContext(ts.transpile(source.slice(source.indexOf("const categories ="), source.indexOf("\nfunction TabText")) +
  "\nglobalThis.tabCategories = categories; globalThis.periodRangeWidth = periodRangeWidth;", { target: ts.ScriptTarget.ES2022 }), context);
const transition = vm.runInNewContext(`(${source.match(/const interfaceTransition = ([^;]+) satisfies Transition/)[1]})`);
const curve = keyframes({ keyframes: [0, 1], duration: transition.duration * 1000, ease: transition.ease });
let samples = 0, oldReversals = 0;
for (const width of [377, 684, 1496, 2048]) for (let selected = 0; selected < 4; selected++) {
  const fromSizes = context.getTabSizes(width, selected);
  if (fromSizes[selected] !== "large") continue;
  const from = context.getTabWidths(width, fromSizes)[selected];
  const category = context.tabCategories[selected];
  const rangeWidth = context.periodRangeWidth(selected);
  const variables = { "--tab-icon-gap": category.iconGap, "--tab-label-width": category.labelWidth };
  const left = vm.runInNewContext(mask.left.replaceAll(/var\((--[\w-]+)\)/g, (_, name) => variables[name])
    .replaceAll("calc", "").replaceAll("px", ""));
  const to = context.getTabWidths(width, context.getTabSizes(width, (selected + 1) % 4))[selected];
  const oldOrigin = progress => Math.max(from + (to - from) * progress - 2 - rangeWidth - 12, left) + rangeWidth * progress;
  let oldPrevious = oldOrigin(0);
  let previousVisible = rangeWidth;
  for (let ms = 0; ms <= 680; ms++) {
    const progress = curve.next(ms).value;
    const tabWidth = from + (to - from) * progress;
    const right = tabWidth - 2 - parseFloat(mask.right);
    const origin = right - rangeWidth + rangeWidth * progress;
    const visible = Math.max(0, right - Math.max(left, origin));
    assert(visible <= previousVisible + 1e-7, "closing text disappears continuously, without a second reveal");
    if (right > left) {
      // The text's world-space path stays one linear function of the shared
      // eased resize progress, even as its mask reaches the name's boundary.
      const expected = from - 2 - 12 - rangeWidth + (to - from + rangeWidth) * progress;
      assert(Math.abs(origin - expected) < 1e-7, "no anchor clamp can produce a late change of direction");
    }
    const old = oldOrigin(progress);
    if (old > oldPrevious + 1e-7) oldReversals++;
    oldPrevious = old;
    previousVisible = visible;
    samples++;
  }
  assert.equal(previousVisible, 0, "no fragment remains before AnimatePresence removes the text");
  const restingLeft = from - 2 - 12 - rangeWidth;
  assert(restingLeft >= left, "the unchanged expanded state preserves the name gap and right alignment");
}
assert(oldReversals > 0, "the previous clamped mask reproduces the two-stage exit");
console.log(`PASS: reproduced the old mask's late direction reversal; ${samples} resize frames keep the week text right-anchored, continuously clipped and fully hidden across mobile/desktop and every period.`);
