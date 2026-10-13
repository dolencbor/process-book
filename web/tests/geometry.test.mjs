import { book } from "./fixtures/book.mjs";
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";
import {motionValue,transform,keyframes} from "motion";
const source=fs.readFileSync('src/components/process-book.tsx','utf8');
const context={useProcessBookContent:()=>book,weeks:Array.from({length:28}),useTransform:(input,a,b)=>({get:()=>{
 if(typeof input==='function')return input();
 if(typeof a==='function')return a(input.get());
 return transform(input.get(),a,b);
}})};
vm.createContext(context);
const constants=source.slice(source.indexOf('const wrapWeek'),source.indexOf('\nfunction railScreenReveal'));
const start=source.indexOf('function RailCard('),end=source.indexOf('  return <MotionLink',start);
vm.runInContext(ts.transpile(constants+'\n'+source.slice(start,end)+'return { top, left, width, height, opacity };\n}\nglobalThis.entries=visibleRailEntries;', {target:ts.ScriptTarget.ES2022}),context);
let samples=0;
for(const reducedMotion of [false,true])for(let progress=-28;progress<56;progress+=.125){
 const position=motionValue(progress), week=((Math.round(progress)%28)+28)%28;
 const included=new Set(context.entries(week,28));assert.equal(included.size,11);
 for(let arrival=0;arrival<=4;arrival+=.25){
  const value=motionValue(arrival);
  for(let entry=0;entry<28;entry++){
   const geometry=context.RailCard({entry,position,arrival:value,cardSize:530,slot:0,reducedMotion,cardPointerHandlers:{},cursorActive:false});
   if(!included.has(entry))assert.equal(geometry.opacity.get(),0,'unmounted cards must be fully invisible during scrolling, arrival, and exit, including loop boundaries');
   for(const property of ['top','left','width','height','opacity'])assert(Number.isFinite(geometry[property].get()));
   samples++;
  }
 }
}
// Responsive layouts preserve the exact component widths and fill the bar.
const sizing=source.slice(source.indexOf('const categories ='),source.indexOf('\nfunction TabText'));
vm.runInContext(ts.transpile(sizing+'\nglobalThis.tabCategories=categories;', {target:ts.ScriptTarget.ES2022}),context);
for(const width of [144,320,377,684,1496,2048])for(let selected=0;selected<4;selected++){
 const sizes=context.getTabSizes(width,selected),widths=context.getTabWidths(width,sizes);
 assert(widths.every(w=>w>=32));
 assert(widths.reduce((a,b)=>a+b,12)<=width+.00001);
 sizes.forEach((size,index)=>{if(size==='medium')assert.equal(widths[index],width<=684?width-108:context.tabCategories[index].tabWidth);});
}
// The resized 393x852 mobile rail keeps the same scroll animation and 6px gaps.
// Its five resting cards start at page y=246,302,383,721,802.
for (let slot=-2;slot<=2;slot++) {
 const geometry=context.RailCard({entry:14+slot,position:motionValue(14),arrival:motionValue(0),cardSize:332,gap:6,slot,mobile:true,reducedMotion:false,cardPointerHandlers:{},cursorActive:false});
 const expected=[0,56,137,475,556][slot+2];
 assert(Math.abs(geometry.top.get()-expected)<.001);
 assert(Math.abs(geometry.width.get()-[256,294,332,294,256][slot+2])<.001);
 assert(Math.abs(geometry.height.get()-[50,75,332,75,50][slot+2])<.001);
}
const tween=source.match(/const interfaceTransition = ([^;]+) satisfies Transition/)[1];
const transition=vm.runInNewContext('('+tween+')');
assert.equal(transition.type,'tween');assert.equal(transition.duration,.68);
assert.deepEqual(Array.from(transition.ease),[.22,1,.36,1]);
const timeline=keyframes({keyframes:[113,1061],duration:680,ease:transition.ease});
let last=113;for(let ms=0;ms<=680;ms++){const x=timeline.next(ms).value;assert(x>=last&&x<=1061,'tab resize remains monotonic, with no spring overshoot');last=x;}
assert(source.includes('style={{ top: 0, left: 0, x: left, y: top, width, height, opacity }}'));
console.log(`PASS: ${samples} actual rail geometry samples preserve every visible card with 11 buffered nodes instead of 28; scrolling, arrival, exit, reduced motion and loop boundaries remain finite. All responsive tab sizes fit and the unchanged 680ms tween has no bounce.`);
