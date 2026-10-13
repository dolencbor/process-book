import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";
import {getSvgPath} from "figma-squircle";
import {keyframes} from "motion";
const hookSource=fs.readFileSync('src/components/use-smooth-corners.ts','utf8');
const componentSource=fs.readFileSync('src/components/process-book.tsx','utf8');
const start=componentSource.indexOf('function TabSurface(');
const end=componentSource.indexOf('\nconst CategoryTabs',start);
const elementTree=(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)});
let id=0;
const context={React:{createElement:elementTree},useId:()=>`surface-${id++}`,styles:new Proxy({},{get:(_,k)=>k})};
vm.createContext(context);vm.runInContext(ts.transpile(componentSource.slice(start,end).replace(/\n}\);\s*$/, '\n}'),{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}),context);
const all=(tree,predicate)=>[...(predicate(tree)?[tree]:[]),...(tree.children||[]).flatMap(n=>typeof n==='object'&&n?all(n,predicate):[])];
let resize,mutation,cleanup,reads=0,calculations=0,rootScans=0;
class FakeElement { matches(){return false;} querySelectorAll(){return [];} }
const elements=[];
const listeners={};
const root={addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener(){},contains:e=>elements.includes(e),querySelectorAll:()=>{rootScans++;return elements;}};
function control(surface,fill,strokeOpacity){
 const values=new Map(),attrs=new Map();
 const e={matches:()=>false,dataset:{smoothCorners:'0.6'},hasAttribute:name=>(surface&&name==='data-smooth-surface')||attrs.has(name),setAttribute:(name,value)=>attrs.set(name,value),style:{setProperty:(name,value)=>{assert(!surface,'tabs must not create CSS images or clip paths on resize');values.set(name,value);}},values,attrs};
 e.computed={width:'371px',height:'32px',borderTopWidth:'1px',getPropertyValue:name=>({'--corner-radius':'10','--corner-stroke-opacity':String(strokeOpacity)})[name]||''};
 if(surface){
  const tree=context.TabSurface({fill,strokeOpacity});
  const defs=all(tree,n=>n.type==='defs')[0];
  const fillPath=all(tree,n=>n.type==='path'&&n.props.fill===fill)[0];assert(fillPath);
  const stops=all(tree,n=>n.type==='stop');assert.deepEqual(stops.map(n=>n.props.stopOpacity),[strokeOpacity,strokeOpacity/2]);
  const clip=all(tree,n=>n.type==='clipPath')[0];const gradient=all(tree,n=>n.type==='linearGradient')[0];
  const border=all(tree,n=>n.type==='path'&&n.props.strokeWidth==='2')[0];
  assert.equal(border.props.clipPath,`url(#${clip.props.id})`);assert.equal(border.props.stroke,`url(#${gradient.props.id})`);
  const curves=all(tree,n=>n.type==='path').map(n=>({node:n,attrs:new Map(),setAttribute(name,value){this.attrs.set(name,value);}}));
  const svg={attrs:new Map(),curves,defs,setAttribute(name,value){this.attrs.set(name,value);},querySelectorAll:()=>curves};
  e.querySelector=()=>svg;e.svg=svg;
 }
 elements.push(e);return e;
}
const tabs=[control(true,'#000000',.1),control(true,'#ff00ff',.2),control(true,'#22e300',.2),control(true,'#ff00ff',.2)];
const other=control(false,'',.5);
Object.assign(context,{window:{addEventListener(){},removeEventListener(){}},requestAnimationFrame:()=>0,cancelAnimationFrame(){},Element:FakeElement,getSvgPath:options=>{calculations++;return getSvgPath(options);},useRef:()=>({current:root}),useLayoutEffect:fn=>{cleanup=fn();},getComputedStyle:e=>{reads++;return e.computed;},ResizeObserver:class{constructor(fn){resize=fn;}observe(){}unobserve(){}disconnect(){}},MutationObserver:class{constructor(fn){mutation=fn;}observe(){}disconnect(){}}});
vm.runInContext(ts.transpile(hookSource.slice(hookSource.indexOf('export function')).replace('export function','function'),{target:ts.ScriptTarget.ES2022}),context);context.useSmoothCorners();
const references=tabs.map(e=>({svg:e.svg,curves:e.svg.curves.slice(),defs:e.svg.defs}));
for(const e of tabs)assert.equal(e.attrs.get('data-surface-ready'),'true');
assert(other.values.has('--smooth-border'),'other smoothed controls retain the previous renderer');
// Use real Motion keyframe samples, with fractional widths, a mid-flight
// retarget, all three sizes, and both resize directions.
for(const [from,to] of [[1061,113],[113,32],[32,269],[269,1061],[638.37,32],[32,113]]){
 const timeline=keyframes({keyframes:[from,to],duration:680,ease:[.22,1,.36,1]});
 for(let t=0;t<=700;t+=1000/60){
  const width=timeline.next(t).value;
  resize(tabs.map(e=>({target:e,borderBoxSize:[{inlineSize:width,blockSize:32}]})));
  tabs.forEach((e,i)=>{
   assert.equal(e.svg,references[i].svg);assert.equal(e.svg.defs,references[i].defs);
   assert.equal(e.svg.attrs.get('viewBox'),`0 0 ${width} 32`);
   const expected=getSvgPath({width,height:32,cornerRadius:10,cornerSmoothing:.6});
   e.svg.curves.forEach((curve,j)=>{assert.equal(curve,references[i].curves[j]);assert.equal(curve.attrs.get('d'),expected);assert(!/NaN|Infinity/.test(expected));});
   assert.equal(e.values.size,0,'no image URL or changing CSS mask is written');
  });
 }
}
const previous=tabs[0].svg.curves[0].attrs.get('d');
resize([{target:tabs[0],borderBoxSize:[{inlineSize:0,blockSize:0}]}]);assert.equal(tabs[0].svg.curves[0].attrs.get('d'),previous);
const before=reads, scansBefore=rootScans;mutation([{type:"childList",addedNodes:[new FakeElement(),{}]}]);assert.equal(rootScans,scansBefore,"unrelated child changes must not scan the app");assert.equal(reads,before,'hover-related child changes cannot remount surfaces or reset paths');
const noOpBefore=reads, noOpCalculations=calculations;
const stablePath=tabs[0].svg.curves[0].attrs.get('d');
resize([{target:tabs[0],borderBoxSize:[{inlineSize:113,blockSize:32}]}]);
assert.equal(reads,noOpBefore);assert.equal(calculations,noOpCalculations,"unchanged dimensions must not recompute a curve");
assert.equal(tabs[0].svg.curves[0].attrs.get('d'),stablePath);
assert.equal(other.values.get('--smooth-focus'),'none','unfocused controls must not encode focus images every frame');
other.matches=()=>true;listeners.focus({target:other,type:'focus'});
assert(other.values.get('--smooth-focus').startsWith('url('),'keyboard focus retains its exact curved ring');
listeners.blur({target:other,type:'blur'});assert.equal(other.values.get('--smooth-focus'),'none');
other.matches=()=>false;
const oldStyle=other.computed.getPropertyValue;
other.computed.getPropertyValue=name=>name==='--corner-radius'?'14':oldStyle(name);
mutation([{type:'attributes',target:other}]);
assert.equal(other.values.get('--smooth-path'),`path('${getSvgPath({width:371,height:32,cornerRadius:14,cornerSmoothing:.6})}')`,'class/profile changes refresh corner radii even at the same size');
const afterFrames=reads;
resize(tabs.map(e=>({target:e,borderBoxSize:[{inlineSize:113,blockSize:32}]})));
assert.equal(reads,afterFrames,'size frames must not read computed styles');
const css=fs.readFileSync('src/components/process-book.module.css','utf8');
assert(css.includes('[data-smooth-corners]:not([data-smooth-surface])[style*="--smooth-path"]::after'));
assert(!css.includes('--smooth-fill'),'tab fill cannot decode a new background image per frame');
assert(css.includes('.category:focus-visible .categorySurfaceFocus { opacity: 1; }'));
const ids=tabs.flatMap(e=>all(e.svg.defs,n=>Boolean(n.props?.id)).map(n=>n.props.id));assert.equal(new Set(ids).size,ids.length,'each tab has independent stable gradient/clip definitions');
cleanup();
console.log('PASS: all four tabs keep the same inline SVG, gradients and path nodes through Motion resize/retarget samples; no image URLs or whole-button clips are written, 60% curves and inside strokes remain exact, hover mutations and empty measurements preserve paint, focus and other smoothed controls are retained.');
