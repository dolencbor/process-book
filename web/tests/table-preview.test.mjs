import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";
import {motionValue} from "motion";
const source = fs.readFileSync('src/components/process-book.tsx','utf8');
const start = source.indexOf('function WeekTableView(');
const end = source.indexOf('\nconst maskedText',start);
const component = source.slice(start,end).replace(/\n}\);\s*$/, '\n}');
const rowStart=source.indexOf('function TableRow(');
const rowEnd=source.indexOf('\n// Tutorial 030:',rowStart);
const rowComponent=source.slice(rowStart,rowEnd).replace(/\n}\);\s*$/, '\n}');
function fixture(code, reduced=false, mobile=false) {
  const hooks=[], effects=[], periods=[];
  let cursor=0, tree, scrollTop=0, geometry, stateDirty=false, frameId=0, timerId=0;const frames=new Map(), timers=new Map();
  const flush=()=>{const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn());};
  const h=(type,props,...children)=>typeof type==='function'?type(props):({type,props:props||{},children:children.flat(Infinity).filter(Boolean)});
  const find=(node,cls)=>node?.props?.className===cls?node:(node?.children||[]).map(n=>find(n,cls)).find(Boolean);
  const contains=(node,child)=>node===child||(node?.children||[]).some(n=>contains(n,child));
  const hook=make=>hooks[cursor++]??=make();
  const viewport={dataset:{},clientHeight:619,getBoundingClientRect:()=>({top:281,bottom:900})};
  const rows=Array.from({length:84},(_,i)=>({offsetTop:i*54.5,offsetHeight:54.5,dataset:{tableWeek:String(i%28),tableEntry:String(i)},getBoundingClientRect:()=>({top:281+i*54.5-scrollTop,height:54.5})}));
  const table={querySelector:s=>rows[Number(s.match(/"(\d+)"/)[1])],querySelectorAll:()=>rows,contains:row=>rows.includes(row),getBoundingClientRect:()=>({top:281-scrollTop})};
  const fixedHost={getBoundingClientRect:()=>({top:find(tree,'rowPreviewViewport')?281:0})};
  const media={clientWidth:371,offsetParent:fixedHost};
  const context={
    document:{elementFromPoint:(x,y)=>({closest:()=>rows[Math.max(0,Math.min(83,Math.floor((y-281+scrollTop)/54.5)))]})},
    React:{createElement:h}, Link:'a', motion:new Proxy({},{get:(_,tag)=>'motion.'+tag}),
    AnimatePresence:'presence',TablePeriodHeading:'heading',WeekNumber:'number',PreviewImage:'image',
    useIsPresent:()=>true,useReducedMotion:()=>reduced,useMobileLayout:()=>mobile,
    requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),
    setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
    ResizeObserver:class{observe(){}disconnect(){}},
    useCallback:(fn,deps)=>{const state=hook(()=>({fn,deps}));if(deps.some((v,i)=>v!==state.deps[i])){state.fn=fn;state.deps=deps;}return state.fn;},
    useRef:v=>hook(()=>({current:v})),
    useState:v=>{const state=hook(()=>({value:v}));return[state.value,next=>{const value=typeof next==='function'?next(state.value):next;if(value!==state.value)stateDirty=true;state.value=value;}];},
    useMotionValue:v=>hook(()=>motionValue(v)),useSpring:v=>v,
    useLayoutEffect:(fn,deps)=>{const state=hook(()=>({deps:null,cleanup:null}));if(!state.deps||deps.some((v,i)=>v!==state.deps[i]))effects.push(()=>{state.cleanup?.();state.cleanup=fn();state.deps=deps;});},
    animate(){throw Error('Unexpected animation in pointer regression');},
    styles:new Proxy({},{get:(_,key)=>key}),
    weeks:Array.from({length:28},(_,i)=>({number:String(i+1).padStart(2,'0'),title:'Week title'})),
    periodForWeek:w=>Math.floor(w/7),screenReveal:()=>({}),revealStep:.12,maskedText:{},interfaceTransition:{},
    listRowRevealCount:18,listRowReveal:()=>({}),
    mobileRowHighlightTransition:{type:'tween',duration:.16},mobileRowSettleDelay:80,
  };
  context.useProcessBookContent = () => ({ weeks: context.weeks, periodForWeek: context.periodForWeek });
  context.useEffect=context.useLayoutEffect;
  vm.createContext(context);vm.runInContext(ts.transpile(rowComponent+'\n'+code,{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}),context);
  const props={category:3,jumpWeek:27,jumpVersion:0,active:true,onWeekSelect(){},onWeekChange(){},onPeriodChange:p=>{props.category=p;periods.push(p);}};
  Object.defineProperties(viewport,{
    scrollHeight:{get:()=>{
      // CSS transforms on an absolute box inside a scroll container add to
      // its overflow area, even when that box's child is centered upward.
      const node=find(tree,'rowPreview');
      return geometry.inside?Math.max(4578,node.props.style.y.get()+371):4578;
    }},
    scrollTop:{get:()=>scrollTop,set:v=>{scrollTop=Math.max(0,Math.min(viewport.scrollHeight-viewport.clientHeight,v));}},
  });
  function render(){
    cursor=0;stateDirty=false;tree=context.WeekTableView(props);
    const scroller=find(tree,'tableScroll'), preview=find(tree,'rowPreview');
    geometry={inside:contains(scroller,preview)};
    hooks[0].current=viewport;hooks[1].current=table;hooks[2].current=media;
    effects.splice(0).forEach(fn=>fn());
  }
  render();if(stateDirty)render();
  return {
    get preview(){return hooks[10].value;},
    get movingImage(){return find(tree,'rowPreviewImage');},
    get imageContainer(){return find(tree,'rowPreviewReveal').children[0].type;},
    get highlightOpacity(){return find(tree,'mobileTopRowHighlight').props.animate.opacity;},
    get highlightTransition(){return find(tree,'mobileTopRowHighlight').props.transition;},
    get category(){return props.category;},get max(){return viewport.scrollHeight-viewport.clientHeight;},
    get y(){return find(tree,'rowPreview').props.style.y.get();},get previewInside(){return geometry.inside;},
    hover(index,y){const visit=n=>{if(n.props?.role==='rowgroup')n.props.onPointerMove({pointerType:'mouse',clientX:950,clientY:y,target:{closest:()=>rows[index]}});else(n.children||[]).forEach(visit);};visit(tree);flush();if(stateDirty)render();},
    scroll(top){viewport.scrollTop=top;find(tree,'tableScroll').props.onScroll();flush();if(stateDirty)render();},
    touchStart(){find(tree,'tableScroll').props.onTouchStart();if(stateDirty)render();},
    // Force the native scroll event after the preview affects overflow.
    indicate(){viewport.scrollTop-=.75;find(tree,'tableScroll').props.onScroll();flush();if(stateDirty)render();},
    periods,
  };
}
const mobile=fixture(component,false,true);
assert.equal(mobile.highlightOpacity,1,'an aligned row starts selected');
mobile.touchStart();
assert.equal(mobile.highlightOpacity,1,'touching the list keeps the top selection visible');
mobile.scroll(3052+5);
assert.equal(mobile.imageContainer,'div','mobile keeps one persistent thumbnail shell');
assert.equal(mobile.movingImage.props.key,undefined,'week changes do not remount or reanimate the thumbnail shell');
assert.equal(mobile.movingImage.children[0].props.week,0,'the new image is present immediately inside that shell');
assert.equal(mobile.preview.week,0,'the preview tracks the top row before scroll settles');
mobile.scroll(3052-20);
assert.equal(mobile.imageContainer,'div','upward scrolling retains the same thumbnail shell');
assert.equal(mobile.movingImage.children[0].props.week,27,'upward scrolling swaps the image immediately');
assert.equal(mobile.highlightOpacity,1,'the top-row selection stays visible between snap positions');
assert.equal(mobile.highlightTransition.duration,.16,'the selection keeps its Motion entrance timing without flickering during scroll');
assert.equal(mobile.preview.week,27,'the preview tracks the top row in both directions');
for(const reduced of [false,true]){
 const current=fixture(component,reduced);
 assert.equal(current.previewInside,false,'preview must be a sibling of scroller');
 current.hover(64,800);assert.equal(current.max,3959);assert.equal(current.y,369.5);
 current.indicate();assert.equal(current.category,3);
 for(const top of [1526,1907.5,2289,2997.5]){
  current.scroll(top);
  current.hover(Math.min(83,Math.floor((top+519)/54.5)),800);
  assert.equal(current.max,3959,'hover must not change scroll bounds');
  assert.equal(current.y,369.5,'fixed pointer stays in fixed preview coordinates');
 }
 for(let i=0;i<10;i++){current.scroll(2997.5+1);current.hover(64,800);current.indicate();assert.equal(current.category,3);assert.equal(current.max,3959);}
 current.scroll(2997.5);current.hover(55,291);
 assert.equal(current.y,185.5,'the hovered image stops at the Week / Title divider');
 assert.equal(current.preview.week,27);
 current.scroll(3052+5);
 assert.equal(current.preview.week,0);assert.equal(current.preview.direction,1,'scrolling down brings the next picture from below across the year boundary');
 current.scroll(1526-20);
 assert.equal(current.preview.week,27);assert.equal(current.preview.direction,-1,'scrolling up brings the previous picture from above across the year boundary');
 assert.equal(current.movingImage.props['data-smooth-corners'],'0.6','the moving image has its own smoothing, independent of the outer mask');
 assert.equal(current.movingImage.props.custom,current.preview.direction,'Motion receives the physical scroll direction');
}
console.log('PASS: List preview retains fixed bounds, matching image smoothing, and directional Motion inputs across both year boundaries, with and without reduced motion.');
