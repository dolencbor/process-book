import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";
import { keyframes, motionValue } from "motion";

const component = fs.readFileSync("src/components/process-book.tsx", "utf8");
const transition = vm.runInNewContext(`(${component.match(/const tabResizeTransition = ([^;]+) satisfies Transition/)[1]})`, {
  interfaceTransition: vm.runInNewContext(`(${component.match(/const interfaceTransition = ([^;]+) satisfies Transition/)[1]})`),
});
const sizing = {};
vm.createContext(sizing);
vm.runInContext(ts.transpile(component.slice(component.indexOf("const categories ="), component.indexOf("\nfunction TabText")), {
  target: ts.ScriptTarget.ES2022,
}), sizing);
const targetFor = (width, selected) => Array.from(sizing.getTabWidths(width, sizing.getTabSizes(width, selected)));

// Reproduce the missed case: Motion keeps an existing property's animation
// when its destination is unchanged. Only the other widths restart on a new
// selection, unlike the previous regression test's artificial all-tab restart.
let independent = targetFor(1500, 0);
let destinations = [...independent];
const timelines = [];
let now = 0;
function oldSelect(selected) {
  const next = targetFor(1500, selected);
  next.forEach((to, i) => {
    if (to !== destinations[i]) timelines[i] = { start: now, timeline: keyframes({ keyframes: [independent[i], to], duration: 680, ease: transition.ease }) };
  });
  destinations = next;
}
function oldAdvance(ms) {
  now += ms;
  independent = independent.map((width, i) => timelines[i] ? timelines[i].timeline.next(now - timelines[i].start).value : width);
}
oldSelect(1); oldAdvance(60); oldSelect(2); oldAdvance(60);
const oldGap = 1500 - independent.reduce((sum, width) => sum + width, 12);
assert(oldGap > 10, "independent interrupted tweens reproduce a visible contraction at the right edge");

function harness() {
  const state = [], pending = [], animations = [];
  let index = 0, time = 0;
  const hook = make => state[index++] ??= make();
  const api = {
    useState(initial) { return [hook(() => typeof initial === "function" ? initial() : initial)]; },
    useLayoutEffect(effect, deps) {
      const record = hook(() => ({ deps: null, cleanup: null }));
      if (!record.deps || deps.some((value, i) => value !== record.deps[i])) pending.push(() => {
        record.cleanup?.(); record.cleanup = effect(); record.deps = deps;
      });
    },
  };
  const motion = {
    motionValue,
    animate(from, to, config) {
      assert.equal(from, 0); assert.equal(to, 1);
      assert.equal(config.type, "tween"); assert.equal(config.duration, .68);
      const animation = { active: true, start: time, config, timeline: keyframes({ keyframes: [from, to], duration: config.duration * 1000, ease: config.ease }) };
      animations.push(animation);
      return { stop() { animation.active = false; } };
    },
  };
  const compiledModule = { exports: {} };
  vm.runInNewContext(ts.transpile(fs.readFileSync("src/components/use-tab-widths.ts", "utf8"), {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  }), { module: compiledModule, exports: compiledModule.exports, require: name => name === "react" ? api : motion });
  return {
    render(target, config = transition) {
      index = 0;
      const result = compiledModule.exports.useTabWidths(target, config);
      pending.splice(0).forEach(effect => effect());
      return result;
    },
    advance(ms) {
      time += ms;
      for (const animation of animations) if (animation.active) {
        const frame = animation.timeline.next(time - animation.start);
        animation.config.onUpdate(frame.value);
        if (frame.done) animation.active = false;
      }
    },
    active: () => animations.filter(animation => animation.active).length,
  };
}
let interruptions = 0;
for (const width of [377, 684, 1500, 2048]) {
  const runtime = harness();
  let values = runtime.render(targetFor(width, 0), { type: "tween", duration: 0 });
  const read = () => Array.from(values, value => parseFloat(value.get()));
  for (let i = 0; i < 240; i++) {
    const selected = [1, 2, 3, 0, 2, 1, 0, 3][i % 8];
    const target = targetFor(width, selected), from = read();
    values = runtime.render(target);
    assert.deepEqual(read(), from, "retargeting starts from the actual current widths without a jump");
    assert.equal(runtime.active(), 1, "exactly one clock owns the complete bar");
    let previous = from;
    for (let ms = 0; ms < [16, 33, 60, 83][i % 4]; ms++) {
      runtime.advance(1);
      const current = read();
      assert(Math.abs(current.reduce((sum, value) => sum + value, 12) - width) < 1e-7, "the right edge must stay fixed on every frame");
      current.forEach((value, tab) => {
        assert(value >= Math.min(from[tab], target[tab]) - 1e-7 && value <= Math.max(from[tab], target[tab]) + 1e-7, "no width overshoots");
        assert((value - previous[tab]) * (target[tab] - from[tab]) >= -1e-7, "every tab approaches its destination monotonically");
      });
      previous = current;
    }
    interruptions++;
  }
  runtime.advance(680);
  assert.deepEqual(read(), targetFor(width, 3), "all widths finish exactly at their destinations");
  values = runtime.render(targetFor(width, 1)); runtime.advance(33);
  values = runtime.render(targetFor(width, 2), { type: "tween", duration: 0 });
  assert.deepEqual(read(), targetFor(width, 2), "reduced motion and first measurement place the whole bar instantly");
  assert.equal(runtime.active(), 0, "instant placement cancels the previous timeline");
}
console.log(`PASS: reproduced ${oldGap.toFixed(1)}px right-edge gap with independent tweens; actual shared width hook keeps the edge fixed through ${interruptions} rapid interruptions at mobile/desktop sizes, preserving timing, easing, continuity, exact endpoints and reduced motion.`);
