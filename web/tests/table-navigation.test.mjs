import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";
import { motionValue, keyframes } from "motion";
const source = fs.readFileSync('src/components/process-book.tsx', 'utf8');
const start = source.indexOf('function WeekTableView(');
const end = source.indexOf('  return <div className={styles.tableView}', start);
const component = source.slice(start, end) + '  return { handleScroll, handleWheel, beginListTouch, interruptTravel, indicatePeriod, schedulePointer, trackPointer, focusWeek, blurWeek, captureListPosition, settleMobileList, mobileSnapped, listTouching };\n}';
const motionTokens = source.slice(source.indexOf('const interfaceTransition'), source.indexOf('// Tab controls'));
const navigationStart = source.indexOf('const tabNavigationTransition');
const navigationEnd = source.indexOf('\n});', navigationStart) + 4;
const js = ts.transpile(motionTokens + '\n' + source.slice(navigationStart, navigationEnd) + '\n' + component, { target: ts.ScriptTarget.ES2022 });
function createTable(height = 900, week = 0, reduced = false, mobile = false, initialListLocation = null, roundedGeometry = false) {
  const hooks = [], effects = [], periods = [], visibleWeeks = [], navigations = []; let geometryReads=0, rowReads=0;
  let cursor = 0, commands = 0, animation = null, top = 0, frameId = 0, timerId = 0, lastTimerDelay = null, handlers, activeElement = null, haptics = 0; const frames = new Map(), timers = new Map();
  const flush = () => { const jobs = [...frames.values()]; frames.clear(); jobs.forEach(fn=>fn()); };
  const flushTimers = () => { const jobs = [...timers.values()]; timers.clear(); jobs.forEach(fn=>fn()); };
  const heading = mobile ? 263 : 281;
  const canvasStyles = new Map(); let highlightWrites = 0;
  const canvas = { style: { getPropertyValue: key => canvasStyles.get(key) ?? '', setProperty: (key,value) => { highlightWrites++; canvasStyles.set(key,value); } } };
  const element = { dataset:{},parentElement:canvas,clientHeight: height - heading, scrollHeight: 0, getBoundingClientRect(){geometryReads++;return{top:heading,bottom:height};} };
  const media={clientWidth:371,offsetParent:{getBoundingClientRect(){geometryReads++;return{top:76};}}};
  Object.defineProperty(element,'scrollTop',{get:()=>top,set:v=>{top=Math.max(0,Math.min(element.scrollHeight-element.clientHeight,v));}});
  const rows = [];
  function buildRows(copies = 3) {
    if (rows.length === copies * 28) return;
    rows.length = 0;
    let rowTop = 0;
    for (let i = 0; i < copies * 28; i++) {
      const button = { focus() { handlers.blurWeek(); activeElement = button; handlers.focusWeek(i); } };
      const actualHeight = mobile ? (i % 28 === 1 ? 108.5 : 57.5) : 54.5;
      const row = {offsetTop:roundedGeometry ? Math.round(rowTop) : rowTop,offsetHeight:roundedGeometry ? Math.round(actualHeight) : actualHeight,
        dataset:{tableWeek:String(i % 28),tableEntry:String(i)},contains:node=>node===button,querySelector:()=>button};
      row.getBoundingClientRect = () => ({top:heading+row.offsetTop-element.scrollTop,height:actualHeight});
      rowTop += actualHeight; rows.push(row);
    }
    element.scrollHeight = rowTop;
  }
  buildRows();
  const table = {contains:row=>rows.includes(row),querySelector:selector=>rows[Number(selector.match(/"(\d+)"/)[1])],querySelectorAll:()=>{rowReads++;return rows;}};
  const hook = make => {const i=cursor++;return hooks[i]??=make();};
  const context = {
    useIsPresent:()=>true, useReducedMotion:()=>reduced, useMobileLayout:()=>mobile,
    requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),
    setTimeout:(fn,delay)=>{lastTimerDelay=delay;timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
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
    pulseSelectionHaptic: () => { haptics++; },
  };
  context.useProcessBookContent = () => ({ weeks: context.weeks, periodForWeek: context.periodForWeek });
  context.useEffect=context.useLayoutEffect;
  vm.createContext(context);vm.runInContext(js,context);
  const props={category:Math.floor(week/7),jumpWeek:week,jumpVersion:0,initialListLocation,active:true,onWeekSelect(){},
    onNavigate:(week,location)=>navigations.push({week,location}),
    onWeekChange:week=>visibleWeeks.push(week),onPeriodChange:period=>{props.category=period;periods.push(period);}};
  const render=()=>{cursor=0;handlers=context.WeekTableView(props);hooks[0].current=element;hooks[1].current=table;hooks[2].current=media;buildRows(hooks[18].value);effects.splice(0).forEach(fn=>fn());return handlers;};
  render(); render();
  return {
    element,periods,visibleWeeks,rows,navigations,
    get highlightHeight(){return canvasStyles.get('--mobile-top-row-height');},
    get highlightWrites(){return highlightWrites;},
    get snapped(){return handlers.mobileSnapped.current;},
    get cycleHeight(){return rows[28].offsetTop;},
    at(week){return rows[28+week];},
    get preview(){return hooks[10].value;},
    focus(entry){ render(); rows[entry].querySelector().focus(); render(); },
    get focusedEntry(){return hooks[7].current;},
    get activeEntry(){return rows.findIndex(row=>row.contains(activeElement));},
    burst(count,top=rows[42].offsetTop){
      const handlers=render(); const before=geometryReads,queries=rowReads;
      element.scrollTop=top;
      for(let i=0;i<count;i++){
        hooks[8].current={x:950,y:600+i/100};
        handlers.handleScroll();handlers.schedulePointer(false,42);
      }
      const queued=frames.size;flush();render();
      return{queued,reads:geometryReads-before,queries:rowReads-queries};
    },
    get animation(){return animation;},get commands(){return commands;},get category(){return props.category;},get haptics(){return haptics;},
    get settleDelay(){return lastTimerDelay;},
    jump(week){props.category=Math.floor(week/7);props.jumpWeek=week;props.jumpVersion++;render();},
    advance(ms=10000){const a=animation;while(a&&!a.stopped&&a.time<ms){a.time=Math.min(ms,a.time+1000/60);const sample=a.generator.next(a.time);a.options.onUpdate(sample.value);render().handleScroll();flush();if(sample.done){a.options.onComplete();render().handleScroll();flush();break;}}},
    manual(top,settle=true){element.scrollTop=top;render().handleScroll();flush();render();if(settle){flushTimers();render();}},
    settle(){flushTimers();render();},
    lateSettle(){render().settleMobileList();render();},
    wheel(deltaY=1){render().handleWheel({deltaY});render();},
    touchStart(){render().beginListTouch();render();},
    hold(value){handlers.listTouching.current=value;},
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
const boundaryTrip=createTable(852,21,false,true);
boundaryTrip.jump(0);
const interruptedBoundaryTrip=boundaryTrip.animation;
boundaryTrip.element.scrollTop=boundaryTrip.cycleHeight-0.75;
boundaryTrip.jump(21);
assert(interruptedBoundaryTrip.stopped,'retargeting stops the first tab trip');
assert.equal(boundaryTrip.animation.target,boundaryTrip.at(21).offsetTop,
  'a rapid second tab click stays in the same repeated year at a cycle boundary');
boundaryTrip.advance();
assert.equal(boundaryTrip.element.scrollTop,boundaryTrip.at(21).offsetTop);
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
  assert.equal(mobile.highlightHeight,'57.5px','one fixed highlight covers the first snapped row');
  assert.equal(mobile.element.dataset.travelling,undefined);
  mobile.manual(mobile.at(1).offsetTop);
  assert.equal(mobile.highlightHeight,'108.5px','the fixed highlight grows for a wrapped top row');
  mobile.manual(mobile.at(7).offsetTop);
  assert.equal(mobile.highlightHeight,'57.5px','the highlight returns to a single-line height');
  assert.equal(mobile.preview.week,7); assert.equal(mobile.category,1);
  mobile.manual(mobile.at(14).offsetTop-1,false);
  assert.equal(mobile.snapped,false,'the row remains in motion between snap points');
  assert.equal(mobile.preview.week,13,'the top visible row changes the preview before scrolling rests');
  assert.equal(mobile.highlightHeight,'57.5px','the top-row highlight follows the visible row height before snapping');
  assert.equal(mobile.visibleWeeks.at(-1),13,'switching views uses the top visible week');
  mobile.manual(mobile.at(14).offsetTop,false);
  assert.equal(mobile.snapped,false,'passing a row start is not a completed snap');
  assert.equal(mobile.preview.week,14);
  assert.equal(mobile.visibleWeeks.at(-1),14);
  mobile.manual(mobile.at(14).offsetTop-1,false);
  assert.equal(mobile.preview.week,13,'upward scrolling selects the top row immediately');
  assert.equal(mobile.preview.direction,-1,'upward selection animates in the reverse direction');
  mobile.manual(mobile.at(14).offsetTop,false);
  assert.equal(mobile.preview.week,14,'downward scrolling selects the top row immediately');
  assert.equal(mobile.preview.direction,1,'downward selection animates in the forward direction');
  mobile.hold(true);
  mobile.settle();
  assert.equal(mobile.snapped,false,'List never snaps under a finger held on the rows');
  mobile.hold(false);
  mobile.manual(mobile.at(14).offsetTop+32,false);
  assert.equal(mobile.settleDelay,80,'the List starts its row detent promptly after input stops');
  mobile.settle();
  if (!reducedMotion) {
    assert.equal(mobile.animation.options.duration,.16,'the Motion row detent lands in 160ms without changing its curve');
    assert.equal(mobile.animation.target,mobile.at(15).offsetTop,'the nearest row becomes the only landing target after momentum');
    assert.equal(mobile.snapped,false,'the snap state stays pending until the row reaches its slot');
    assert.equal(mobile.element.dataset.snapping,'true','native scrolling pauses while Motion owns the row detent');
    mobile.advance();
  }
  assert.equal(mobile.element.scrollTop,mobile.at(15).offsetTop,'the controller actually lands on the next row');
  if (!reducedMotion) {
    assert.equal(mobile.element.dataset.snapping,undefined,'the detent releases native scrolling for the next gesture');
  }
  assert.equal(mobile.snapped,true,'the landed row is always highlighted');
  assert.equal(mobile.preview.week,15);
  mobile.manual(mobile.at(14).offsetTop,false);
  mobile.settle();
  assert.equal(mobile.element.scrollTop,mobile.at(14).offsetTop);
  assert.equal(mobile.preview.week,14,'the nearest row becomes selected only after it aligns');
  assert.equal(mobile.snapped,true,'the row is marked settled after it aligns');
  const beforeFocusTop=mobile.element.scrollTop, beforeFocusCommands=mobile.commands;
  mobile.focus(49);
  assert.equal(mobile.element.scrollTop,beforeFocusTop,'focusing a navigation link must not move it during a tap');
  assert.equal(mobile.commands,beforeFocusCommands,'link focus updates its preview without starting scroll travel');
  assert.equal(mobile.preview.week,21);
  mobile.jump(21);
  assert.equal(mobile.category,3);
  if (!reducedMotion) {
    assert.equal(mobile.element.dataset.travelling,'true','tab travel owns its scroll writes');
    mobile.advance(100);assert.equal(mobile.category,3,'travel keeps the selected destination tab');
  }
  mobile.advance();
  assert.equal(mobile.element.scrollTop,mobile.at(21).offsetTop);
  assert.equal(mobile.preview.week,21);
  assert.equal(mobile.element.dataset.travelling,undefined,'tab travel releases the List at the destination');
  mobile.manual(mobile.at(27).offsetTop);
  assert.equal(mobile.preview.week,27);
  assert(mobile.element.scrollHeight-mobile.element.clientHeight>mobile.at(27).offsetTop,'rows continue beyond Week 28');
  mobile.jump(0);mobile.advance();
  assert.equal(mobile.preview.week,0);assert.equal(mobile.element.scrollTop,mobile.cycleHeight);
}
const fromScroll=createTable(852,17,false,true);
assert.equal(fromScroll.element.scrollTop,fromScroll.at(17).offsetTop,'switching from Scroll places the same week at the List snap slot');
assert.equal(fromScroll.preview.week,17);
assert.equal(fromScroll.snapped,true);
const rounded=createTable(852,0,false,true,null,true);
assert.equal(rounded.at(1).offsetTop+rounded.at(1).offsetHeight,rounded.at(2).offsetTop+1,
  'real browser geometry can overlap by one pixel when fractional rows are rounded separately');
rounded.manual(rounded.at(2).offsetTop);
assert.equal(rounded.preview.week,2,'a snapped row wins at its own start despite the previous rounded height');
assert.equal(rounded.snapped,true,'the highlighted row returns at the browser snap position');
assert.equal(rounded.highlightHeight,'57.5px','the highlight uses the rendered fractional row height');
const endOfList=createTable(852,0,false,true);
endOfList.manual(endOfList.element.scrollHeight-endOfList.element.clientHeight,false);
endOfList.settle();endOfList.advance();
assert.equal(endOfList.snapped,true,'even a fast flick to the physical end lands on a reachable row');
assert.equal(endOfList.element.dataset.snapping,undefined,'an edge rebase releases native scrolling after its atomic jump');
assert.equal(endOfList.element.scrollTop,endOfList.at(endOfList.preview.week).offsetTop,
  'the final row is recycled to the canonical cycle without a stranded unhighlighted position');
const wheelEdge=createTable(852,0,false,true);
wheelEdge.manual(wheelEdge.element.scrollHeight-wheelEdge.element.clientHeight,false);
wheelEdge.wheel();
assert(wheelEdge.element.scrollTop>=wheelEdge.cycleHeight && wheelEdge.element.scrollTop<2*wheelEdge.cycleHeight,
  'a clamped wheel input immediately moves the identical row away from the physical boundary');
wheelEdge.lateSettle();
assert.equal(wheelEdge.commands,0,'an early scrollend cannot start a competing snap during wheel momentum');
wheelEdge.settle();wheelEdge.advance();
assert.equal(wheelEdge.element.scrollTop,wheelEdge.at(wheelEdge.preview.week).offsetTop,
  'a clamped wheel event at the physical edge still triggers the loop handoff');
for (const entry of [5, 2*28+15]) {
  const touchLoop=createTable(852,0,false,true);
  touchLoop.manual(touchLoop.rows[entry].offsetTop,false);
  const week=entry%28;
  touchLoop.touchStart();
  assert.equal(touchLoop.element.scrollTop,touchLoop.at(week).offsetTop,
    'a new touch begins on the matching middle-copy row before the edge can clamp it');
  assert.equal(touchLoop.preview.week,week,'rebasing at touchstart retains the selected week image');
  const wheelLoop=createTable(852,0,false,true);
  wheelLoop.manual(wheelLoop.rows[entry].offsetTop,false);
  wheelLoop.wheel(entry<28?-1:1);
  assert.equal(wheelLoop.element.scrollTop,wheelLoop.at(week).offsetTop,
    'a wheel gesture rebases before its next delta instead of stopping at an outer-copy edge');
}
const continuousLoop=createTable(852,0,false,true);
const nearTop=continuousLoop.rows[1].offsetTop+8;
continuousLoop.manual(nearTop,false);
assert.equal(continuousLoop.element.scrollTop,continuousLoop.cycleHeight+nearTop,
  'a continuing upward swipe gains room before the native top edge can clamp');
assert.equal(continuousLoop.preview.week,1,'upward guard preserves the visible week image');
const nearBottom=continuousLoop.element.scrollHeight-continuousLoop.element.clientHeight-8;
const bottomWeek=continuousLoop.rows.findIndex((row,index)=>index+1===continuousLoop.rows.length || continuousLoop.rows[index+1].offsetTop>nearBottom)%28;
continuousLoop.manual(nearBottom,false);
assert.equal(continuousLoop.element.scrollTop,nearBottom-continuousLoop.cycleHeight,
  'a continuing downward flick gains room before the native bottom edge can clamp');
assert.equal(continuousLoop.preview.week,bottomWeek,'downward guard preserves the visible week image');
const edgeTab=createTable(852,0,false,true);
edgeTab.manual(edgeTab.element.scrollHeight-edgeTab.element.clientHeight,false);
edgeTab.jump(21);edgeTab.advance();
assert.equal(edgeTab.element.scrollTop,edgeTab.at(21).offsetTop,'tab navigation uses a reachable repeated row near the scroll boundary');
assert.equal(edgeTab.preview.week,21);
assert.equal(edgeTab.snapped,true);
const lastCopyTab=createTable(852,0,false,true);
lastCopyTab.manual(2*lastCopyTab.cycleHeight+40,false);
lastCopyTab.jump(0);lastCopyTab.advance();
assert.equal(lastCopyTab.element.scrollTop,2*lastCopyTab.cycleHeight,
  'a mobile tab trip stays in the repeated copy it visibly reached, without a one-year final-frame jump');
lastCopyTab.lateSettle();
assert.equal(lastCopyTab.element.scrollTop,2*lastCopyTab.cycleHeight,
  'a late browser scrollend cannot rebase the completed tab trip');
assert.equal(lastCopyTab.snapped,true);
const laterPeriodFromOuterCopy=createTable(852,0,false,true);
laterPeriodFromOuterCopy.manual(laterPeriodFromOuterCopy.rows[63].offsetTop);
assert.equal(laterPeriodFromOuterCopy.element.scrollTop,laterPeriodFromOuterCopy.rows[35].offsetTop,
  'a settled outer-copy row rebases to its identical center row before the next gesture');
laterPeriodFromOuterCopy.jump(21);
assert.equal(laterPeriodFromOuterCopy.animation.target,laterPeriodFromOuterCopy.at(21).offsetTop,
  'the next tab animation starts from the canonical repeated year');
assert(laterPeriodFromOuterCopy.animation.target>laterPeriodFromOuterCopy.element.scrollTop,
  'selecting a later period travels forward after the rebase');
laterPeriodFromOuterCopy.advance();
assert.equal(laterPeriodFromOuterCopy.element.scrollTop,laterPeriodFromOuterCopy.at(21).offsetTop);
const snapToTab=createTable(852,0,false,true);
snapToTab.manual(snapToTab.at(10).offsetTop+32,false);
snapToTab.settle();
const abandonedSnap=snapToTab.animation;
snapToTab.advance(65);
snapToTab.jump(21);
assert(abandonedSnap.stopped,'a period tab cancels the incomplete row detent');
const firstTabTrip=snapToTab.animation;
snapToTab.advance(100);
snapToTab.jump(7);
  assert.equal(snapToTab.haptics,0,'interrupted detents and passing rows stay silent');
assert(firstTabTrip.stopped,'a second period tab cancels the first tab trip');
snapToTab.settle();
assert.equal(snapToTab.animation.target,snapToTab.at(7).offsetTop,'an old settle callback cannot replace the latest tab destination');
snapToTab.advance();
  assert.equal(snapToTab.haptics,1,'the final selected row gives one tactile cue');
assert.equal(snapToTab.element.scrollTop,snapToTab.at(7).offsetTop);
assert.equal(snapToTab.preview.week,7);
assert.equal(snapToTab.snapped,true);
const mobileInterrupted=createTable(852,0,false,true);
mobileInterrupted.jump(21);mobileInterrupted.advance(100);mobileInterrupted.interrupt();
assert.equal(mobileInterrupted.element.dataset.travelling,undefined);
assert(mobileInterrupted.animation.stopped);
mobileInterrupted.manual(mobileInterrupted.at(7).offsetTop);
assert.equal(mobileInterrupted.preview.week,7);assert.equal(mobileInterrupted.category,1);
const mobileWorkload=createTable(852,14,false,true);
const highlightWrites=mobileWorkload.highlightWrites;
const mobileBurst=mobileWorkload.burst(1000,mobileWorkload.at(14).offsetTop);
assert.equal(mobileBurst.queued,1,'mobile scroll and touch-adjacent events share one frame');
assert.equal(mobileWorkload.highlightWrites,highlightWrites,'stationary mobile rows do not repaint the fixed highlight during rapid scroll events');
console.log('PASS: mobile top-row highlight and preview select immediately in both scroll directions, cover only the visible row, and settle without interrupting tab travel.');

// Boundary crossings preserve sub-row position, update the correct period,
// and recycle a fixed-size DOM rather than adding rows each lap.
for (const mobile of [false,true]) for (const height of [400,600,900,1200,2200,4000]) {
  const looping=createTable(height,0,mobile,mobile), h=looping.cycleHeight, count=looping.rows.length;
  assert(count>=84);assert(count<=28*(2+Math.ceil(looping.element.clientHeight/h)) || count===84);
  assert.equal(looping.element.scrollTop,h);
  if (mobile) {
    looping.manual(2*h+40,false);
    assert.equal(looping.element.scrollTop,2*h+40,'mobile momentum is not teleported while rows are moving');
    assert.equal(looping.snapped,false);
    looping.settle();looping.advance();
    assert.equal(looping.element.scrollTop,h+57.5,'a rested detent rebases to its identical center row with room ahead');
    looping.manual(h-40,false);
    looping.settle();looping.advance();
    assert.equal(looping.element.scrollTop,2*h-57.5,'upward movement also rebases to the center copy');
  } else {
    looping.manual(2*h+12.25,false);
    assert.equal(looping.element.scrollTop,h+12.25);assert.equal(looping.visibleWeeks.at(-1),0);assert.equal(looping.category,0);
    looping.manual(h-12.25,false);
    assert.equal(looping.element.scrollTop,2*h-12.25);assert.equal(looping.visibleWeeks.at(-1),27);assert.equal(looping.category,3);
  }
  for(let lap=0;lap<100;lap++) {
    if (mobile) {
      looping.manual(looping.element.scrollHeight-looping.element.clientHeight,false);
      looping.settle();looping.advance();
      assert(looping.element.scrollTop>=h && looping.element.scrollTop<2*h,'the physical bottom rebases to a reachable middle copy');
      looping.manual(0,false);looping.settle();looping.advance();
      assert.equal(looping.element.scrollTop,h,'the physical top rebases for upward infinite scrolling');
    } else {
      looping.manual(2*h+3.75,false);assert.equal(looping.element.scrollTop,h+3.75);
      looping.manual(h-3.75,false);assert.equal(looping.element.scrollTop,2*h-3.75);
    }
  }
  assert.equal(looping.rows.length,count,'scrolling must not grow the DOM');
  looping.jump(7);looping.advance();
  assert.equal(looping.element.scrollTop,looping.at(7).offsetTop);assert.equal(looping.category,1);
}
console.log('PASS: List loops in both directions for 100 laps, defers mobile recycling until the row settles, stays bounded, fills tall viewports and retains tab navigation after wrapping.');
const directionLoop=createTable(852,0,false,true);
directionLoop.manual(directionLoop.rows[27].offsetTop);
assert.equal(directionLoop.preview.week,27);
assert.equal(directionLoop.preview.direction,-1,'Week 01 → 28 enters upward after the snap');
directionLoop.manual(2*directionLoop.cycleHeight);
assert.equal(directionLoop.preview.week,0);
assert.equal(directionLoop.preview.direction,1,'Week 28 → 01 enters downward after the snap');

for (const mobile of [false,true]) {
  const keyboard=createTable(852,27,false,mobile);
  keyboard.focus(56);
  // Native link focus scrolls the browser viewport; it no longer starts an
  // application-owned selection animation on mobile.
  keyboard.manual(mobile ? keyboard.element.scrollHeight-keyboard.element.clientHeight : 2*keyboard.cycleHeight);
  if (mobile) { keyboard.settle(); keyboard.advance(); }
  if (mobile) assert(keyboard.element.scrollTop>=keyboard.cycleHeight && keyboard.element.scrollTop<2*keyboard.cycleHeight);
  else assert.equal(keyboard.element.scrollTop,keyboard.cycleHeight);
  assert.equal(keyboard.activeEntry,28,'focus transfers to the identical recycled row without scrolling');
  assert.equal(keyboard.focusedEntry,28);
  assert.equal(keyboard.commands,mobile ? 1 : 0,'recycling link focus must not add an animation beyond the mobile row detent');
  if(mobile) {assert.equal(keyboard.preview.week,keyboard.visibleWeeks.at(-1)); assert.equal(keyboard.category,Math.floor(keyboard.preview.week/7));}
  for(let lap=0;lap<5;lap++) {
    keyboard.manual(2*keyboard.cycleHeight+12.25,false);
    if(mobile) { keyboard.settle();keyboard.advance(); }
    assert.equal(keyboard.activeEntry,28,'offscreen focused rows stay in the canonical cycle across multiple laps');
    assert.equal(keyboard.focusedEntry,28);
  }
}
console.log('PASS: keyboard focus crosses the loop seam, transfers to the matching row without scrolling, and does not restart tab travel.');
