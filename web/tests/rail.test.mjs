import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";
import { motionValue, keyframes, spring, inertia } from "motion";
const source = fs.readFileSync('src/components/process-book.tsx', 'utf8');
const start = source.indexOf('function WeekScrollView(');
const end = source.indexOf('  return <div ref={viewport}', start);
const component = source.slice(start, end) + '  return { interruptTravel, goTo, scroll, beginTouch, moveTouch, endTouch, cancelTouch, captureTouchClick, inputPosition, position };\n}';
const navigationStart = source.indexOf('const tabNavigationTransition');
const navigationEnd = source.indexOf('\n});', navigationStart) + 4;
const springStart = source.indexOf('const railSpring =');
const springEnd = source.indexOf('\n\nconst categories', springStart);
const js = ts.transpile(source.slice(springStart, springEnd) + '\n' + source.slice(navigationStart, navigationEnd) + '\n' + component, { target: ts.ScriptTarget.ES2022 });
function createRail(initialWeek = 0, reduced = false, mobile = false) {
  const hooks = [], effects = [], subscriptions = [];
  let index = 0, animation = null, commands = 0, props, now = 0;
  const seen = [], periods = [], resizeCallbacks = []; let selected = Math.floor(initialWeek / 7);
  const element = { clientHeight: 900, scrollTop: 0, dataset: {}, style: { setProperty() {} }, scrollTo({top}) { this.scrollTop = top; }, focus() {} };
  const cards = { clientWidth: 530 };
  const hook = make => { const i = index++; return hooks[i] ??= make(); };
  const context = {
    useIsPresent: () => true,
    useRef: value => hook(() => ({ current: value })),
    useState: value => { const entry = hook(() => ({value})); return [entry.value, next => {entry.value = next;}]; },
    useReducedMotion: () => reduced,
    useMobileLayout: () => mobile,
    useMotionValue: value => hook(() => {
      const m = motionValue(value);
      const stop = m.stop.bind(m);
      m.stop = () => { if (animation?.value === m) animation.stopped = true; stop(); };
      return m;
    }),
    useLayoutEffect: (fn, deps) => {
      const state = hook(() => ({ deps: null, cleanup: null }));
      if (!state.deps || deps.some((v, i) => v !== state.deps[i])) effects.push(() => {
        state.cleanup?.(); state.cleanup = fn(); state.deps = deps;
      });
    },
    useMotionValueEvent: (value, event, callback) => { subscriptions.push(value.on(event, callback)); },
    animate: (value, target, options) => {
      commands++;
      animation = { value, target, options, stopped: false, time: 0,
        generator: options.type === 'spring'
          ? spring({ keyframes: [value.get(), target], ...options })
          : options.type === 'inertia'
            ? inertia({ keyframes: [value.get(), target], ...options })
            : keyframes({ keyframes: [value.get(), target], duration: options.duration * 1000, ease: options.ease }) };
    },
    weeks: Array.from({length: 28}),
    wrapWeek: n => ((n % 28) + 28) % 28,
    periodForWeek: n => Math.floor(n / 7),
    railRevealDistance: 4,
    interfaceTransition: { type: 'tween', duration: .68, ease: [.22, 1, .36, 1] },
    Date: { now: () => now },
    ResizeObserver: class { constructor(callback) { resizeCallbacks.push(callback); } observe() {} disconnect() {} }, setTimeout, clearTimeout,
  };
  context.useProcessBookContent = () => ({ weeks: context.weeks, periodForWeek: context.periodForWeek });
  vm.createContext(context); vm.runInContext(js, context);
  const render = () => {
    subscriptions.splice(0).forEach(fn => fn()); index = 0;
    const handlers = context.WeekScrollView(props);
    hooks[0].current = element; hooks[1].current = cards;
    effects.splice(0).forEach(fn => fn());
    return handlers;
  };
  props = { week: initialWeek, jumpWeek: initialWeek, jumpVersion: 0, active: true,
    onWeekChange: week => { props.week = week; seen.push(week); },
    onPeriodChange: period => { selected = period; periods.push(period); }, cardPointerHandlers: {}, cursorActive: false };
  render();
  return {
    seen, element, periods,
    tick(ms) { now += ms; },
    get selected() { return selected; },
    resize(height) { if (height) element.clientHeight = height; resizeCallbacks.forEach(fn => fn()); render(); },
    get commands() { return commands; }, get animation() { return animation; },
    jump(week) { selected = Math.floor(week / 7); props.jumpWeek = week; props.jumpVersion++; return render(); },
    advance(ms = 10000) {
      const a = animation;
      while (a && !a.stopped && a.time < ms) {
        a.time = Math.min(ms, a.time + 1000 / 60);
        const sample = a.generator.next(a.time);
        a.value.set(sample.value); render();
        if (sample.done) { a.options.onComplete?.(); break; }
      }
    },
    handlers: render,
  };
}
for (const [start, target] of [[0,7],[0,21],[21,0],[27,0],[14,7]]) {
  const rail = createRail(start); rail.jump(target);
  assert.equal(rail.element.dataset.travelling,'true','period travel blocks native momentum while Motion owns scroll');
  const sign = Math.sign(target - start);
  assert.equal(rail.animation.value.get(), 28 + start, 'command must not jump');
  rail.advance();
  assert.deepEqual(rail.seen, Array.from({length: Math.abs(target-start)}, (_,i) => start + (i+1)*sign), 'visit every intervening week in order');
  assert.equal(rail.animation.value.get(), 28 + target);
  assert.equal(rail.element.scrollTop, (28 + target)*180);
  assert.equal(rail.element.dataset.travelling,undefined,'period travel restores native scrolling at its landing');
  assert.equal(rail.commands, 1, 'intermediate week renders must not restart travel');
  assert.deepEqual(rail.periods, [Math.floor(target / 7)], 'only final destination may update indicators during travel');
}
const locked = createRail(); locked.jump(21); locked.advance(200);
assert(locked.seen.length > 0 && locked.seen.at(-1) < 21);
assert.equal(locked.selected, 3); assert.deepEqual(locked.periods, []);
const moving = locked.animation; const beforeResize = moving.value.get();
locked.resize(); assert.equal(moving.value.get(), beforeResize); assert(!moving.stopped);
locked.resize(1200); assert.equal(moving.value.get(), beforeResize); assert(!moving.stopped);
assert.equal(locked.element.scrollTop, beforeResize * 220);
locked.advance(); assert.equal(locked.selected, 3); assert.equal(moving.value.get(), 49);
assert.equal(locked.element.scrollTop,49*220);
const rapid = createRail(); rapid.jump(21); rapid.advance(200);
const from = rapid.animation.value.get(); const previous = rapid.animation;
rapid.jump(0); assert(previous.stopped); assert.equal(rapid.animation.value.get(), from);
assert.equal(rapid.element.dataset.travelling,'true','retargeting keeps the scroll under Motion control');
rapid.advance(); assert.equal(rapid.animation.value.get(), 28);
const manual = createRail(); manual.jump(21); manual.advance(200);
const interrupted = manual.animation; const current = interrupted.value.get();
manual.handlers().interruptTravel(); assert(interrupted.stopped);
assert.equal(manual.element.dataset.travelling,undefined,'a user gesture releases the native scroller immediately');
assert.equal(manual.selected, Math.floor((((Math.round(current) % 28) + 28) % 28) / 7));
assert.equal(manual.element.scrollTop, current*180);
manual.element.scrollTop += 180; manual.handlers().scroll(); assert.equal(manual.commands, 2);
const reduced = createRail(0,true); reduced.jump(21);
assert.equal(reduced.commands,0); assert.deepEqual(reduced.seen,[21]);
assert.equal(reduced.element.scrollTop,49*180);
const mobileTap=createRail(5,false,true);
const tapStart=mobileTap.element.scrollTop;
mobileTap.handlers().beginTouch({touches:[{clientX:200,clientY:500}]});
assert.equal(mobileTap.handlers().position.get(),33,'a finger resting on the rail cannot drag a card');
mobileTap.handlers().endTouch({changedTouches:[{clientX:200,clientY:497}]});
assert.equal(mobileTap.commands,0,'a tap leaves the selected week in place');
assert.equal(mobileTap.element.scrollTop,tapStart);
mobileTap.handlers().beginTouch({touches:[{clientX:200,clientY:500}]});
mobileTap.tick(300);
mobileTap.handlers().endTouch({changedTouches:[{clientX:201,clientY:440}]});
assert.equal(mobileTap.commands,1,'one upward swipe starts one week transition after release');
assert.equal(mobileTap.animation.target,34);
assert.equal(mobileTap.element.scrollTop,34*180,'the native scroller is aligned to the chosen card');
assert.equal(mobileTap.handlers().position.get(),33,'the rail animates after the gesture rather than following the finger');
let prevented=false, stopped=false;
mobileTap.handlers().captureTouchClick({preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
assert(prevented&&stopped,'a swipe cannot accidentally open a week link');
const mobileReverse=createRail(0,false,true);
mobileReverse.handlers().beginTouch({touches:[{clientX:200,clientY:400}]});
mobileReverse.tick(300);
mobileReverse.handlers().endTouch({changedTouches:[{clientX:200,clientY:460}]});
assert.equal(mobileReverse.animation.target,27,'swiping down from Week 01 wraps to Week 28');
assert(mobileReverse.animation.options.velocity < 0, 'reverse swipes carry velocity toward the previous card');

function swipeWithDuration(duration) {
  const rail = createRail(5, false, true);
  rail.handlers().beginTouch({ touches: [{ clientX: 200, clientY: 500 }] });
  rail.tick(duration * 0.6);
  rail.handlers().moveTouch({ touches: [{ clientX: 200, clientY: 460 }] });
  assert(rail.handlers().position.get() > 33 && rail.handlers().position.get() < 33.2,
    'a touchmove follows the finger with strong resistance');
  rail.tick(duration * 0.4);
  rail.handlers().endTouch({ changedTouches: [{ clientX: 200, clientY: 440 }] });
  return rail;
}
const slowSwipe = swipeWithDuration(300);
const fastSwipe = swipeWithDuration(70);
assert.equal(slowSwipe.animation.target, fastSwipe.animation.target, 'speed changes timing, not the selected week');
assert(fastSwipe.animation.options.velocity > slowSwipe.animation.options.velocity, 'a flick gives the spring more initial speed');
assert(fastSwipe.animation.options.velocity <= 0.75 * Math.sqrt(fastSwipe.animation.options.stiffness / fastSwipe.animation.options.mass),
  'gesture velocity is capped below overshoot');
const slowFrame = slowSwipe.animation.generator.next(100).value;
const fastFrame = fastSwipe.animation.generator.next(100).value;
assert(fastFrame > slowFrame, 'the quicker flick progresses farther within the first 100ms');
for (const rail of [slowSwipe, fastSwipe, mobileReverse]) {
  const from = rail.animation.value.get(), to = rail.animation.target;
  const low = Math.min(from, to), high = Math.max(from, to);
  let previous = from;
  for (let time = 0; time <= 650; time += 1000 / 60) {
    const sample = rail.animation.generator.next(time);
    assert(sample.value >= low - 0.0001 && sample.value <= high + 0.0001, 'the snap never overshoots a card');
    assert((sample.value - previous) * Math.sign(to - from) >= -0.0001, 'the snap remains monotonic');
    previous = sample.value;
    if (sample.done) break;
  }
}

const resisted = createRail(5, false, true);
resisted.handlers().beginTouch({ touches: [{ clientX: 200, clientY: 500 }] });
resisted.tick(40);
resisted.handlers().moveTouch({ touches: [{ clientX: 200, clientY: 320 }] });
assert(resisted.handlers().position.get() > 33.2 && resisted.handlers().position.get() < 33.45,
  'even a full card of finger travel reveals less than half a week');
resisted.tick(40);
resisted.handlers().moveTouch({ touches: [{ clientX: 200, clientY: 80 }] });
assert(resisted.handlers().position.get() <= 33.45, 'drag preview never selects the next week');
assert.deepEqual(resisted.seen, [], 'text and period indicators stay on the current week during drag');
resisted.handlers().cancelTouch();
assert.equal(resisted.animation.target, 33, 'a cancelled gesture springs back to the original week');

const horizontal = createRail(5, false, true);
horizontal.handlers().beginTouch({ touches: [{ clientX: 200, clientY: 500 }] });
horizontal.tick(60);
horizontal.handlers().moveTouch({ touches: [{ clientX: 260, clientY: 490 }] });
horizontal.handlers().endTouch({ changedTouches: [{ clientX: 270, clientY: 480 }] });
assert.equal(horizontal.handlers().position.get(), 33);
assert.equal(horizontal.commands, 0, 'horizontal touch gestures never scroll the card stack');

function strongFlick(week, direction) {
  const rail = createRail(week, false, true);
  const startY = direction > 0 ? 500 : 200;
  rail.handlers().beginTouch({ touches: [{ clientX: 200, clientY: startY }] });
  rail.tick(40);
  rail.handlers().moveTouch({ touches: [{ clientX: 200, clientY: startY - direction * 140 }] });
  rail.tick(30);
  rail.handlers().endTouch({ changedTouches: [{ clientX: 200, clientY: startY - direction * 260 }] });
  return rail;
}
for (const [week, direction, expected] of [[26, 1, [27, 0, 1]], [0, -1, [27, 26, 25]]]) {
  const rail = strongFlick(week, direction);
  const base = 28 + week;
  assert.equal(rail.animation.options.type, 'inertia', 'strong flicks use Motion inertia');
  assert.equal(rail.animation.target, base + direction * 3, 'momentum is capped at three weeks');
  assert.equal(rail.animation.options.modifyTarget(rail.animation.value.get() + rail.animation.options.velocity * rail.animation.options.power),
    rail.animation.target, 'Motion quantizes the projected inertia target to the same selected week');
  assert.equal(rail.element.scrollTop, rail.animation.target * 180, 'native scroll and the visual destination agree');
  rail.advance(2000);
  assert.deepEqual(rail.seen, expected, 'all intervening weeks remain visible across the loop seam');
  assert.equal(rail.animation.value.get(), rail.animation.target, 'inertia lands exactly on its snapped week');
}

const mediumFlick = createRail(5, false, true);
mediumFlick.handlers().beginTouch({ touches: [{ clientX: 200, clientY: 500 }] });
mediumFlick.tick(50);
mediumFlick.handlers().moveTouch({ touches: [{ clientX: 200, clientY: 450 }] });
mediumFlick.tick(50);
mediumFlick.handlers().endTouch({ changedTouches: [{ clientX: 200, clientY: 400 }] });
assert.equal(mediumFlick.animation.target, 35, 'a medium flick crosses two weeks');
assert.equal(mediumFlick.animation.options.type, 'inertia');

const midFlight = strongFlick(5, 1);
midFlight.advance(180);
const interruptedMomentum = midFlight.animation;
const beforeTouch = interruptedMomentum.value.get();
midFlight.handlers().beginTouch({ touches: [{ clientX: 200, clientY: 450 }] });
assert(interruptedMomentum.stopped, 'a new finger gesture takes over inertia');
assert.equal(midFlight.handlers().position.get(), beforeTouch, 'taking over an in-flight flick does not jump the cards');

const pinch = createRail(5, false, true);
pinch.handlers().beginTouch({ touches: [{ clientX: 200, clientY: 500 }] });
pinch.tick(50);
pinch.handlers().moveTouch({ touches: [{ clientX: 200, clientY: 350 }] });
assert(pinch.handlers().position.get() > 33);
pinch.handlers().beginTouch({ touches: [{ clientX: 200, clientY: 350 }, { clientX: 240, clientY: 350 }] });
assert.equal(pinch.animation.target, 33, 'adding a second finger cancels the card drag');
pinch.handlers().endTouch({ touches: [{ clientX: 200, clientY: 350 }], changedTouches: [{ clientX: 240, clientY: 350 }] });
pinch.handlers().endTouch({ touches: [], changedTouches: [{ clientX: 200, clientY: 350 }] });
assert.equal(pinch.animation.target, 33, 'pinch release cannot trigger a week change');

const reducedDrag = createRail(5, true, true);
reducedDrag.handlers().beginTouch({ touches: [{ clientX: 200, clientY: 500 }] });
reducedDrag.tick(40);
reducedDrag.handlers().moveTouch({ touches: [{ clientX: 200, clientY: 350 }] });
assert.equal(reducedDrag.handlers().position.get(), 33, 'reduced motion disables the drag preview');
reducedDrag.tick(30);
reducedDrag.handlers().endTouch({ changedTouches: [{ clientX: 200, clientY: 240 }] });
assert.equal(reducedDrag.commands, 0, 'reduced motion jumps directly to the selected week');
assert.equal(reducedDrag.handlers().position.get(), 36, 'reduced motion still selects the flick destination');

console.log('PASS: tab travel, loops, resizing and reduced motion remain intact. Mobile cards resist finger drag, cancel cleanly, and use bounded Motion inertia to snap strong flicks through every intervening week.');
