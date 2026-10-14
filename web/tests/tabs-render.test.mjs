import { book } from "./fixtures/book.mjs";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Exercise React + the installed Motion components, rather than only the
// sizing helper. The previous regression passed sizing tests but rendered
// buttons with flex-grow:0 and no flex-basis, collapsing them to 32px.
const require = createRequire(import.meta.url);
const source = fs.readFileSync("src/components/process-book.tsx", "utf8") + "\nexport { CategoryTabs as TestCategoryTabs, ViewSwitcher as TestViewSwitcher, PreviewImage as TestPreviewImage, RailCard as TestRailCard, TableRow as TestTableRow, TablePeriodHeading as TestHeading, getTabSizes, getTabWidths };";
const compiledModule = { exports: {} };
const captured = [];
let measured = false;
let measuredWidth = 1500;
let reducedMotion = false;
let currentContent = book;
const actualMotion = require("motion/react");
const hookModule = { exports: {} };
vm.runInNewContext(ts.transpile(fs.readFileSync("src/components/use-tab-widths.ts", "utf8"), {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
}), { module: hookModule, exports: hookModule.exports, require });
const surfaceModule = { exports: {} };
vm.runInNewContext(ts.transpile(fs.readFileSync("src/components/switcher-surface.tsx", "utf8"), {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
}), { module: surfaceModule, exports: surfaceModule.exports, require });
const widthTransitions = [];
const components = new Map();
const trackedMotion = new Proxy(actualMotion.motion, {
  get(target, tag) {
    if (tag !== "button" && tag !== "span") return target[tag];
    if (!components.has(tag)) components.set(tag, function TrackedMotion(props) {
      captured.push({ tag, ...props });
      return React.createElement(target[tag], props);
    });
    return components.get(tag);
  },
});
const context = {
  module: compiledModule, exports: compiledModule.exports, process, console,
  require(name) {
    if (name === "./process-book-content") return { useProcessBookContent:()=>currentContent };
    if (name === "motion/react") return { ...actualMotion, motion: trackedMotion, useReducedMotion: () => reducedMotion };
    if (name === "./switcher-surface") return surfaceModule.exports;
    if (name === "./use-mobile-layout") return { useMobileLayout: () => false };
    if (name === "./selection-haptics") return { pulseSelectionHaptic() {} };
    if (name === "./use-tab-widths") return { useTabWidths(target, transition) {
      widthTransitions.push(transition);
      return hookModule.exports.useTabWidths(target, transition);
    } };
    if (name === "react") return { ...React, useState(initial) {
      // Simulate the bar's completed first measurement for transition-prop
      // checks, while keeping the initial-render regression below intact.
      return React.useState(measured && initial?.width === 1500 ? { width: measuredWidth, animateWidths: true } : initial);
    } };
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name === "./use-smooth-corners") return { useSmoothCorners: () => React.useRef(null) };
    if (name === "./process-book-history") return {};
    return require(name);
  },
};
vm.createContext(context);
vm.runInContext(ts.transpile(source, {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
}), context);
for (let selected = 0; selected < 4; selected++) {
  const html = renderToStaticMarkup(React.createElement(compiledModule.exports.TestCategoryTabs, { selected, onSelect() {} }));
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map(match => match[0]);
  assert.equal(buttons.length, 4);
  const widths = buttons.map(button => {
    const style = button.match(/style="([^"]*)"/)?.[1];
    assert(style?.includes("flex-grow:0"));
    assert.match(style, /flex-basis:\d+(\.\d+)?px/, "every tab must render an explicit pixel width before observers/hydration");
    return Number(style.match(/flex-basis:([\d.]+)px/)[1]);
  });
  assert.equal(widths.reduce((sum, width) => sum + width, 12), 1500);
  assert(widths[selected] > 1000, "the active tab starts expanded");
  buttons.forEach((button, index) => assert(button.includes(`aria-pressed="${selected === index}"`)));
}
console.log("PASS: actual React/Motion output gives every tab an explicit pixel width on first render, preserves the selected expanded tab, and fills the bar for all four selections.");

measured = true;
captured.length = 0;
renderToStaticMarkup(React.createElement(actualMotion.MotionConfig, { transition: { type: "spring", bounce: 0.8 } },
  React.createElement(compiledModule.exports.TestCategoryTabs, { selected: 2, onSelect() {} })));
const buttons = captured.filter(props => props.tag === "button");
assert.equal(buttons.length, 4);
for (const button of buttons) {
  assert.equal(button.layout, false, "width changes must not also trigger layout projection");
  assert.equal(button.animate, undefined, "independent targets must not compete with the shared width timeline");
  assert.equal(typeof button.style.flexBasis.get, "function", "every width comes from the shared hook's Motion value");
}
assert.equal(widthTransitions.at(-1).type, "tween", "the shared timeline overrides even a spring MotionConfig");
assert.equal(widthTransitions.at(-1).duration, 0.68);
const texts = captured.filter(props => props.variants?.visible?.transition?.x);
assert(texts.length > 0);
for (const text of texts) for (const state of ["visible", "exit"]) {
  assert.equal(text.variants[state].transition.x.type, "tween");
  assert.equal(text.variants[state].transition.x.duration, 0.68);
}

const seenSizes = new Set();
for (const width of [140, 221, 249, 250, 377, 684, 1500]) for (let selected = 0; selected < 4; selected++) {
  measuredWidth = width;
  captured.length = 0;
  renderToStaticMarkup(React.createElement(actualMotion.MotionConfig, { transition: { type: "spring", bounce: 0.8 } },
    React.createElement(compiledModule.exports.TestCategoryTabs, { selected, onSelect() {} })));
  const sizes = Array.from(compiledModule.exports.getTabSizes(width, selected));
  if (width <= 684) {
    assert(!sizes.includes("large"), "mobile tabs never show the week range in either view");
    sizes.forEach((size, index) => {
      if (index !== selected) assert.equal(size, "small", "inactive mobile tabs show only their icons");
    });
    assert(!captured.some(props => props.children?.startsWith?.("Week ")), "the rendered mobile tabs contain no week text");
  }
  sizes.forEach(size => seenSizes.add(size));
  const animatedText = captured.filter(props => props.variants?.visible?.transition?.x);
  assert.equal(animatedText.length, sizes.reduce((count, size) => count + (size === "small" ? 0 : size === "medium" ? 1 : 2), 0));
  for (const text of animatedText) {
    const { enter, visible, exit } = text.variants;
    const hidden = text.children.startsWith("Week ") ? "100%" : "-100%";
    assert.equal(exit.x, hidden, "names exit left and week ranges exit right for every period and size");
    assert.equal(enter.x, exit.x, "entrance retraces the exit path");
    assert.equal(visible.x, 0);
    for (const state of [enter, visible, exit]) assert.equal(state.y, undefined, "tab text never moves vertically");
    for (const state of [visible, exit]) {
      assert.equal(state.transition.x.type, "tween", "text cannot inherit a spring");
      assert.equal(state.transition.x.duration, 0.68, "text uses the full resize duration");
      assert.deepEqual(Array.from(state.transition.x.ease), [0.22, 1, 0.36, 1], "the existing curve is preserved");
      assert.equal(state.transition.x.delay, undefined, "no separate reveal delay");
    }
  }
}
assert.deepEqual([...seenSizes].sort(), ["large", "medium", "small"]);
reducedMotion = true;
measuredWidth = 1500;
captured.length = 0;
renderToStaticMarkup(React.createElement(compiledModule.exports.TestCategoryTabs, { selected: 0, onSelect() {} }));
for (const text of captured.filter(props => props.variants?.visible?.transition?.x)) {
  assert.equal(text.variants.enter.x, 0);
  assert.equal(text.variants.exit.x, 0);
  assert.equal(text.variants.visible.transition.x.duration, 0);
  assert.equal(text.variants.exit.transition.x.duration, 0);
}
reducedMotion = false;
console.log("PASS: all four periods use the annotated horizontal text paths across large, medium and small layouts, preserving full resize timing, easing and reduced motion.");

for (const view of ["scroll", "table"]) {
  captured.length = 0;
  const html = renderToStaticMarkup(React.createElement(compiledModule.exports.TestViewSwitcher, { view, onViewChange() {} }));
  assert.match(html, />List<\/span>/, "List is the shared visible and accessible label at every viewport size");
  assert(!html.includes(">Table<"));
  const handle = captured.find(props => props.className === "activeView");
  assert.equal(handle.layout, false);
  assert.equal(handle.animate.x, view === "table" ? 96 : 0);
  assert.equal(handle.transition.x.type, "tween");
  assert.equal(handle.transition.x.duration, 0.3);
}

console.log("PASS: rendered tabs bind widths to the shared timeline without independent animate targets or layout projection; the timeline, text and switcher explicitly override springs.");

currentContent = {
  ...book,
  weeks: book.weeks.map((week, index) => index === 0 ? { ...week, title: "A published CMS post", image: "https://cdn.sanity.io/images/6ny2t94o/production/test.png?w=1060", imageAlt: "Published artwork" } : week),
  periods: book.periods.map((period, index) => index === 0 ? { ...period, title: "CMS period title", start: "03", end: "11", range: "Week 3-11" } : period),
};
const preview = renderToStaticMarkup(React.createElement(compiledModule.exports.TestPreviewImage, { week: 0 }));
assert.match(preview, /alt="Published artwork"/);
assert.match(preview, /src="https:\/\/cdn.sanity.io\//);
assert.match(preview, /class="cmsCrop"/);
assert(!preview.includes("selected-cover"), "cards and List previews no longer use the local mock image");
const row = renderToStaticMarkup(React.createElement(compiledModule.exports.TestTableRow, { index: 0, entryIndex: 0, preview: false, mobile: false, onSelect() {}, onFocus() {}, onBlur() {} }));
assert.match(row, />A published CMS post<\/span>/);
const heading = renderToStaticMarkup(React.createElement(compiledModule.exports.TestHeading, { period: 0, reducedMotion: true }));
assert.match(heading, /aria-label="CMS period title"/);
assert.match(heading, /aria-label="Week 03 - 11"/);
const cmsTabs = renderToStaticMarkup(React.createElement(compiledModule.exports.TestCategoryTabs, { selected: 0, onSelect() {} }));
assert.match(cmsTabs, /CMS period title/);
assert.match(cmsTabs, /Week 3-11/);
console.log("PASS: actual React components render the CMS post title/image/alt and category heading/range in cards, List rows and tabs.");

const card = renderToStaticMarkup(React.createElement(compiledModule.exports.TestRailCard, {
  entry: 0, position: actualMotion.motionValue(0), arrival: actualMotion.motionValue(0), cardSize: 318,
  slot: 0, reducedMotion: false, cardPointerHandlers: {}, cursorActive: false,
}));
const rowHref=row.match(/<a\b[^>]*href="([^"]+)"/)[1], cardHref=card.match(/<a\b[^>]*href="([^"]+)"/)[1];
assert.equal(cardHref,currentContent.weeks[0].href);
assert.equal(rowHref,cardHref,"the card and List row open exactly the same post URL");
assert.match(card,/<a\b/); assert.match(row,/<a\b/);
assert(!row.includes("<button"),"List rows use native navigation links");
const offCenterCard = renderToStaticMarkup(React.createElement(compiledModule.exports.TestRailCard, {
  entry: 1, position: actualMotion.motionValue(0), arrival: actualMotion.motionValue(0), cardSize: 332,
  slot: 1, mobile: true, reducedMotion: false, cardPointerHandlers: {}, cursorActive: false,
}));
assert(!offCenterCard.includes('data-smooth-corners'), 'moving non-center cards use native circular corners without per-frame SVG path work');
const mobileRow = renderToStaticMarkup(React.createElement(compiledModule.exports.TestTableRow, { index: 0, entryIndex: 28, preview: false, mobile: true, onFocus() {}, onBlur() {} }));
assert.equal(mobileRow.match(/<a\b[^>]*href="([^"]+)"/)[1],cardHref,"mobile and recycled copies preserve the same destination");
console.log("PASS: Scroll cards, desktop/mobile List rows and recycled rows are native links to the same CMS week page.");
