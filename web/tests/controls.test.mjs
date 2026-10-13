import { book } from "./fixtures/book.mjs";
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";
import { motionValue } from "motion";

const source = fs.readFileSync("src/components/process-book.tsx", "utf8");
function hooks() {
  const values = [], effects = [];
  let index = 0;
  const hook = make => values[index++] ??= make();
  const memo = (make, deps) => {
    const state = hook(() => ({ value: make(), deps }));
    if (deps.some((value, i) => value !== state.deps[i])) {
      state.value = make(); state.deps = deps;
    }
    return state.value;
  };
  return {
    values, reset: () => { index = 0; }, clear: () => { values.length = 0; effects.length = 0; index = 0; }, commit: () => effects.splice(0).forEach(fn => fn()),
    api: {
      useRef: value => hook(() => ({ current: value })),
      useState: value => {
        const state = hook(() => ({ value: typeof value === "function" ? value() : value }));
        state.set ??= next => { state.value = typeof next === "function" ? next(state.value) : next; };
        return [state.value, state.set];
      },
      useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
      useLayoutEffect: (fn, deps) => {
        const state = hook(() => ({ deps: null, cleanup: null }));
        if (!state.deps || deps.some((value, i) => value !== state.deps[i])) effects.push(() => {
          state.cleanup?.(); state.cleanup = fn(); state.deps = deps;
        });
      },
      useReducedMotion: () => false,
      useMotionValue: value => hook(() => motionValue(value)), useSpring: value => value,
    },
  };
}
const appHooks = hooks();
const history = { position: null, setPosition(next) { history.position = typeof next === "function" ? next(history.position) : next; } };
const appStart = source.indexOf("function ProcessBookApp()");
const appEnd = source.indexOf("\n  return (", appStart);
const appContext = {
  ...appHooks.api, useProcessBookContent:()=>book, preload() {}, useSmoothCorners: () => ({}),
  useProcessBookHistory: () => history,
  resolveBookPosition: saved => saved ? { view: saved.view, week: book.weeks.findIndex(week => week.id === saved.weekId), selected: saved.selected, list: null, restored: true }
    : { view: "scroll", week: 0, selected: 0, list: null, restored: false },
  saveBookPosition() {},
  firstWeekInPeriod: period => period * 7, periodForWeek: week => Math.floor(week / 7),
  exploreCursorSpring: {}, window: { addEventListener() {}, removeEventListener() {} },
};
appContext.useEffect = appContext.useLayoutEffect;
vm.createContext(appContext);
vm.runInContext(ts.transpile(source.slice(appStart, appEnd).replace("export function", "function") +
  "return { select, changeView, changeWeek, trackCursor, cardPointerHandlers, reset, view, week, selected, jumpWeek, jumpVersion };\n}",
{ target: ts.ScriptTarget.ES2022 }), appContext);
const render = () => { appHooks.reset(); const result = appContext.ProcessBookApp(); appHooks.commit(); return result; };
let app = render();
const select = app.select, changeView = app.changeView, handlers = app.cardPointerHandlers;
app.changeWeek(10); app = render();
assert.equal(app.select, select); assert.equal(app.changeView, changeView); assert.equal(app.cardPointerHandlers, handlers);
app.select(3); app = render();
assert.equal(app.selected, 3); assert.equal(app.jumpWeek, 21); assert.equal(app.week, 10);
assert.equal(app.view, "scroll");
app.changeWeek(21); app = render(); app.changeView("table"); app = render();
assert.equal(app.view, "table"); assert.equal(app.jumpWeek, 21);
app.select(1); app = render();
assert.equal(app.selected, 1); assert.equal(app.jumpWeek, 7); assert.equal(app.week, 21);
assert.equal(app.view, "table", "a period click has the same command semantics in both views");
app.changeWeek(9); app = render();
assert.equal(app.selected, 1, "intermediate week updates cannot override clicked selection");
app.changeView("scroll"); app = render();
assert.equal(app.week, 9, "the Scroll card reopens on the List's selected week");
app.changeView("table"); app = render();
assert.equal(app.jumpWeek, 9, "the List row reopens on the Scroll card's selected week");
appHooks.clear(); app = render();
assert.equal(app.view, "table", "browser Back restores the active view");
assert.equal(app.week, 9, "browser Back restores the visible week");
assert.equal(app.selected, 1, "browser Back restores the selected period");
const restoredSelect = app.select, restoredChangeView = app.changeView, restoredHandlers = app.cardPointerHandlers;
app.reset(); app = render();
assert.equal(app.week, 0); assert.equal(app.selected, 0); assert.equal(app.view, "scroll");
assert.equal(app.select, restoredSelect); assert.equal(app.changeView, restoredChangeView); assert.equal(app.cardPointerHandlers, restoredHandlers);

const tabHooks = hooks();
let resize;
const sizing = source.slice(source.indexOf("const categories ="), source.indexOf("\nfunction TabText"));
const tabStart = source.indexOf("function CategoryTabs(");
const tabEnd = source.indexOf("  return <nav", tabStart);
const tabsContext = {
  ...tabHooks.api, useProcessBookContent:()=>book, interfaceTransition: { duration: .68 },
  instantTabTransition: { type: "tween", duration: 0 }, tabResizeTransition: { type: "tween", duration: .68 },
  useTabWidths: widths => widths,
  ResizeObserver: class { constructor(fn) { resize = fn; } observe() {} disconnect() {} },
};
vm.createContext(tabsContext);
vm.runInContext(ts.transpile(sizing + "\n" + source.slice(tabStart, tabEnd) +
  "return { width, animateWidths, sizes, tabWidths };\n}", { target: ts.ScriptTarget.ES2022 }), tabsContext);
function renderTabs() {
  tabHooks.reset(); const result = tabsContext.CategoryTabs({ selected: 0, onSelect() {} });
  tabHooks.values[0].current = { clientWidth: 377 }; tabHooks.commit(); return result;
}
const firstTabs = renderTabs();
assert.equal(firstTabs.width, 1500);
assert.deepEqual(Array.from(firstTabs.tabWidths), [1065, 140, 141, 142]);
let tabs = renderTabs();
assert.equal(tabs.width, 377); assert.equal(tabs.animateWidths, false);
assert.deepEqual(Array.from(tabs.tabWidths), [269, 32, 32, 32]);
resize([{ contentRect: { width: 377 } }]); tabs = renderTabs(); assert.equal(tabs.animateWidths, true);
resize([{ contentRect: { width: 1496 } }]); tabs = renderTabs();
assert.equal(tabs.animateWidths, true); assert.deepEqual(Array.from(tabs.tabWidths), [1061, 140, 141, 142]);
resize([{ contentRect: { width: 0 } }]); tabs = renderTabs();
assert.equal(tabs.width, 1496, "a transient empty measurement cannot collapse the bar");
console.log("PASS: tab commands behave identically in both views; callbacks stay stable across week/hover updates; view switching and reset preserve their intent; first mobile tab placement is immediate and later resizing retains animation.");
