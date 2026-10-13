import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";
import { motionValue, keyframes } from "motion";
const source = fs.readFileSync('src/components/process-book.tsx', 'utf8');
const start = source.indexOf('function WeekTableView(');
const end = source.indexOf('  return <div className={styles.tableView}', start);
const component = source.slice(start, end) + '  return { handleScroll, interruptTravel, indicatePeriod, schedulePointer, trackPointer, focusWeek, blurWeek, captureListPosition };\n}';
const navigationStart = source.indexOf('const tabNavigationTransition');
const navigationEnd = source.indexOf('\n});', navigationStart) + 4;
const js = ts.transpile(source.slice(navigationStart, navigationEnd) + '\n' + component, { target: ts.ScriptTarget.ES2022 });
function createTable(height = 900, week = 0, reduced = false, mobile = false, initialListLocation = null) {
  const hooks = [], effects = [], periods = [], visibleWeeks = [], navigations = []; let geometryReads=0, rowReads=0;
  let cursor = 0, commands = 0, animation = null, top = 0, frameId = 0, handlers, activeElement = null; const frames = new Map();
  const flush = () => { const jobs = [...frames.values()]; frames.clear(); jobs.forEach(fn=>fn()); };
  const heading = mobile ? 263 : 281;
  const element = { dataset:{},clientHeight: height - heading, scrollHeight: 0, getBoundingClientRect(){geometryReads++;return{top:heading,bottom:height};} };
  const media={clientWidth:371,offsetParent:{getBoundingClientRect(){geometryReads++;return{top:76};}}};
  Object.defineProperty(element,'scrollTop',{get:()=>top,set:v=>{top=Math.max(0,Math.min(element.scrollHeight-element.clientHeight,v));}});
  const rows = [];
  function buildRows(copies = 3) {
    if (rows.length === copies * 28) return;
    rows.length = 0;
    let rowTop = 0;
    for (let i = 0; i < copies * 28; i++) {
      const button = { focus() { handlers.blurWeek(); activeElement = button; handlers.focusWeek(i); } };
      const row = {offsetTop:rowTop,offsetHeight:mobile ? (i % 28 === 1 ? 108.5 : 57.5) : 54.5,
        dataset:{tableWeek:String(i % 28),tableEntry:String(i)},contains:node=>node===button,querySelector:()=>button};
      row.getBoundingClientRect = () => ({top:heading+row.offsetTop-element.scrollTop,height:row.offsetHeight});
      rowTop += row.offsetHeight; rows.push(row);
    }
    element.scrollHeight = rowTop;
  }
  buildRows();
  const table = {contains:row=>rows.includes(row),querySelector:selector=>rows[Number(selector.match(/"(\d+)"/)[1])],querySelectorAll:()=>{rowReads++;return rows;}};
  const hook = make => {const i=cursor++;return hooks[i]??=make();};
  const context = {
    useIsPresent:()=>true, useReducedMotion:()=>reduced, useMobileLayout:()=>mobile,
    requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),
    ResizeObserver:class{observe(){}disconnect(){}},
    useCallback:(fn,deps)=>{const state=hook(()=>({fn,deps}));if(deps.some((v,i)=>v!==state.deps[i])){state.fn=fn;state.deps=deps;}return state.fn;},
    useRef:value=>hook(()=>({current:value})),
    useState:value=>{const state=hook(()=>({value}));return[state.value,v=>{state.value=typeof v==='function'?v(state.value):v;}];},
    useMotionValue:value=>hook(()=>motionValue(value)),useSpring:value=>value,
    useLayoutEffect:(fn,deps)=>{const state=hook(()=>({deps:null,cleanup:null}));if(!state.deps||deps.some((v,i)=>v!==state.deps[i]))effects.push(()=>{state.cleanup?.();state.cleanup=fn();state.deps=deps;});},
    animate:(from,target,options)=>{
      commands++;animation={target,options,time:0,stopped:false,generator:keyframes({keyframes:[from,target],duration:options.duration*1000,ease:options.ease})};
      const a=animation;return{stop(){a.stopped=true;}};
    },
    document:{get activeElement(){return activeElement;},elementFromPoint:()=>({closest:()=>rows[42]})},
    weeks:Array.from({length:28},(_,index)=>({id:`fixture-${index}`})),periodForWeek:n=>Math.floor(n/7),
    interfaceTransition:{type:'tween',duration:.68,ease:[.22,1,.36,1]},
  };
  context.useProcessBookContent = () => ({ weeks: context.weeks, periodForWeek: context.periodForWeek });
  context.useEffect=context.useLayoutEffect;
  vm.createContext(context);vm.runInContext(js,context);
  const props={category:Math.floor(week/7),jumpWeek:week,jumpVersion:0,initialListLocation,active:true,onWeekSelect(){},
    onNavigate:(week,location)=>navigations.push({week,location}),
    onWeekChange:week=>visibleWeeks.push(week),onPeriodChange:period=>{props.category=period;periods.push(period);}};
  const render=()=>{cursor=0;handlers=context.WeekTableView(props);hooks[0].current=element;hooks[1].current=table;hooks[2].current=media;buildRows(hooks[16].value);effects.splice(0).forEach(fn=>fn());return handlers;};
  render(); render();
  return {
    element,periods,visibleWeeks,rows,navigations,
    get cycleHeight(){return rows[28].offsetTop;},
    at(week){return rows[28+week];},
    get preview(){return hooks[9].value;},
    focus(entry){ render(); rows[entry].querySelector().focus(); render(); },
    get focusedEntry(){return hooks[6].current;},
    get activeEntry(){return rows.findIndex(row=>row.contains(activeElement));},
    burst(count,top=rows[42].offsetTop){
      const handlers=render(); const before=geometryReads,queries=rowReads;
      element.scrollTop=top;
      for(let i=0;i<count;i++){
        hooks[7].current={x:950,y:600+i/100};
        handlers.handleScroll();handlers.schedulePointer(false,42);
      }
      const queued=frames.size;flush();render();
      return{queued,reads:geometryReads-before,queries:rowReads-queries};
    },
    get animation(){return animation;},get commands(){return commands;},get category(){return props.category;},
    jump(week){props.category=Math.floor(week/7);props.jumpWeek=week;props.jumpVersion++;render();},
    advance(ms=10000){const a=animation;while(a&&!a.stopped&&a.time<ms){a.time=Math.min(ms,a.time+1000/60);const sample=a.generator.next(a.time);a.options.onUpdate(sample.value);render().handleScroll();flush();if(sample.done){a.options.onComplete();render().handleScroll();flush();break;}}},
    manual(top){element.scrollTop=top;render().handleScroll();flush();render();},
    capture(){render().captureListPosition();},
    interrupt(){render().interruptTravel();render();},
  };
}
const table=createTable();assert.equal(table.element.scrollTop,table.cycleHeight);
const restoredTable=createTable(900,13,false,false,{week:13,offset:0.42});
assert(Math.abs(restoredTable.element.scrollTop-(restoredTable.at(13).offsetTop+restoredTable.at(13).offsetHeight*0.42))<0.001,
  'browser Back restores the same fractional position inside a List row before paint');
restoredTable.capture();
assert.equal(restoredTable.navigations[0].week,13);
assert.equal(restoredTable.navigations[0].location.weekId,'fixture-13');
assert(Math.abs(restoredTable.navigations[0].location.offset-0.42)<0.001);
table.jump(21);assert.equal(table.animation.target,table.at(21).offsetTop);table.advance(200);
assert.equal(table.category,3);assert.deepEqual(table.periods,[]);assert.equal(table.commands,1);
assert(table.visibleWeeks.length>1,'tab travel visually visits the intervening weeks');
table.advance();assert.equal(table.element.scrollTop,table.at(21).offsetTop);assert.deepEqual(table.periods,[]);
table.manual(table.at(7).offsetTop);assert.equal(table.category,1);assert.equal(table.visibleWeeks.at(-1),7);
table.manual(table.at(27).offsetTop);assert.equal(table.category,3);assert.equal(table.visibleWeeks.at(-1),27);
table.jump(0);table.advance();assert.equal(table.element.scrollTop,table.cycleHeight);assert.equal(table.category,0);
const rapid=createTable();rapid.jump(21);rapid.advance(200);const previous=rapid.animation;const current=rapid.element.scrollTop;
rapid.jump(7);assert(previous.stopped);assert.equal(rapid.element.scrollTop,current);rapid.advance();assert.equal(rapid.element.scrollTop,rapid.at(7).offsetTop);
const manual=createTable();manual.jump(21);manual.advance(200);manual.interrupt();assert(manual.animation.stopped);
manual.manual(manual.at(14).offsetTop);assert.equal(manual.category,2);assert.equal(manual.visibleWeeks.at(-1),14);
const repeated=createTable(); repeated.manual(repeated.cycleHeight+.75); repeated.jump(21); repeated.advance(10); repeated.interrupt();
assert.equal(repeated.category,0,'interrupting a click must restore the visible period even if it was indicated before the click');
const reduced=createTable(900,0,true);reduced.jump(21);assert.equal(reduced.commands,0);assert.equal(reduced.element.scrollTop,reduced.at(21).offsetTop);
console.log('PASS: List tab navigation visits intervening weeks, locks destination indicators, ignores its own scroll writes, retargets continuously and supports interruption/reduced motion.');

const workload=createTable();
const burst=workload.burst(1000);
assert.equal(burst.queued,1,'1000 pointer and scroll events must coalesce into one display-frame job');
assert.equal(burst.reads,2,'one preview pass reads only the fixed viewport and host boxes');
assert.equal(burst.queries,0,'scroll/hover must not query or measure the full row list');
assert.equal(workload.category,2,'a pointer move in the same frame must not discard scroll indication');
console.log('PASS: 1000 mixed hover/scroll events use one frame job, two box reads, zero row-list queries, and preserve the scroll indicator.');

const resting=createTable(); resting.jump(0);
assert.equal(resting.commands,0,'a tab already at its destination must not start a redundant scroll animation');

for (const reducedMotion of [false,true]) {
  const mobile=createTable(852,0,reducedMotion,true);
  assert.equal(mobile.preview.visible,true);
  assert.equal(mobile.preview.week,0,'first row is selected and pictured immediately');
  assert.equal(mobile.element.dataset.travelling,undefined);
  mobile.manual(mobile.at(7).offsetTop);
  assert.equal(mobile.preview.week,7); assert.equal(mobile.category,1);
  mobile.manual(mobile.at(14).offsetTop-1);
  assert.equal(mobile.preview.week,13,'variable row heights determine the first visible row');
  const beforeFocusTop=mobile.element.scrollTop, beforeFocusCommands=mobile.commands;
  mobile.focus(49);
  assert.equal(mobile.element.scrollTop,beforeFocusTop,'focusing a navigation link must not move it during a tap');
  assert.equal(mobile.commands,beforeFocusCommands,'link focus updates its preview without starting scroll travel');
  assert.equal(mobile.preview.week,21);
  mobile.jump(21);
  assert.equal(mobile.category,3);
  if (!reducedMotion) {
    assert.equal(mobile.element.dataset.travelling,'true','native snap is suspended during Motion writes');
    mobile.advance(100);assert.equal(mobile.category,3,'travel keeps the selected destination tab');
  }
  mobile.advance();
  assert.equal(mobile.element.scrollTop,mobile.at(21).offsetTop);
  assert.equal(mobile.preview.week,21);
  assert.equal(mobile.element.dataset.travelling,undefined,'snapping is restored at the destination');
  mobile.manual(mobile.at(27).offsetTop);
  assert.equal(mobile.preview.week,27);
  assert(mobile.element.scrollHeight-mobile.element.clientHeight>mobile.at(27).offsetTop,'rows continue beyond Week 28');
  mobile.jump(0);mobile.advance();
  assert.equal(mobile.preview.week,0);assert.equal(mobile.element.scrollTop,mobile.cycleHeight);
}
const mobileInterrupted=createTable(852,0,false,true);
mobileInterrupted.jump(21);mobileInterrupted.advance(100);mobileInterrupted.interrupt();
assert.equal(mobileInterrupted.element.dataset.travelling,undefined);
assert(mobileInterrupted.animation.stopped);
mobileInterrupted.manual(mobileInterrupted.at(7).offsetTop);
assert.equal(mobileInterrupted.preview.week,7);assert.equal(mobileInterrupted.category,1);
console.log('PASS: mobile preview follows the top row across variable heights, link focus and tab travel; native snapping is restored on arrival/interruption.');

// Boundary crossings preserve sub-row position, update the correct period,
// and recycle a fixed-size DOM rather than adding rows each lap.
for (const mobile of [false,true]) for (const height of [400,600,900,1200,2200,4000]) {
  const looping=createTable(height,0,false,mobile), h=looping.cycleHeight, count=looping.rows.length;
  assert(count>=84);assert(count<=28*(2+Math.ceil(looping.element.clientHeight/h)) || count===84);
  assert.equal(looping.element.scrollTop,h);
  looping.manual(2*h+12.25);
  assert.equal(looping.element.scrollTop,h+12.25);assert.equal(looping.visibleWeeks.at(-1),0);assert.equal(looping.category,0);
  if (mobile) assert.equal(looping.preview.direction,1,'Week 28 → 01 enters in the downward scroll direction');
  looping.manual(h-12.25);
  assert.equal(looping.element.scrollTop,2*h-12.25);assert.equal(looping.visibleWeeks.at(-1),27);assert.equal(looping.category,3);
  if (mobile) assert.equal(looping.preview.direction,-1,'Week 01 → 28 enters in the upward scroll direction');
  for(let lap=0;lap<100;lap++) {
    looping.manual(2*h+3.75);assert.equal(looping.element.scrollTop,h+3.75);
    looping.manual(h-3.75);assert.equal(looping.element.scrollTop,2*h-3.75);
  }
  assert.equal(looping.rows.length,count,'scrolling must not grow the DOM');
  looping.jump(7);looping.advance();
  assert.equal(looping.element.scrollTop,looping.at(7).offsetTop);assert.equal(looping.category,1);
}
console.log('PASS: List loops seamlessly in both directions for 100 laps, preserves fractional offsets and mobile image direction, stays bounded, fills tall viewports and retains tab navigation after wrapping.');

for (const mobile of [false,true]) {
  const keyboard=createTable(852,27,false,mobile);
  keyboard.focus(56);
  // Native link focus scrolls the browser viewport; it no longer starts an
  // application-owned selection animation on mobile.
  keyboard.manual(2*keyboard.cycleHeight);
  assert.equal(keyboard.element.scrollTop,keyboard.cycleHeight);
  assert.equal(keyboard.activeEntry,28,'focus transfers to the identical recycled row without scrolling');
  assert.equal(keyboard.focusedEntry,28);
  assert.equal(keyboard.commands,0,'recycling link focus must not start a navigation animation');
  if(mobile) {assert.equal(keyboard.preview.week,0); assert.equal(keyboard.category,0);}
  for(let lap=0;lap<5;lap++) {
    keyboard.manual(2*keyboard.cycleHeight+12.25);
    assert.equal(keyboard.activeEntry,28,'offscreen focused rows stay in the canonical cycle across multiple laps');
    assert.equal(keyboard.focusedEntry,28);
  }
}
console.log('PASS: keyboard focus crosses the loop seam, transfers to the matching row without scrolling, and does not restart tab travel.');
