import fs from "node:fs";
import assert from "node:assert/strict";
import postcss from "postcss";
const sheet=postcss.parse(fs.readFileSync('src/components/process-book.module.css','utf8'));
let scrollTravelOverflow;
sheet.walkRules('.scrollViewport[data-travelling="true"]', rule => {
 rule.walkDecls('overflow-y', declaration => { scrollTravelOverflow=declaration.value; });
});
assert.equal(scrollTravelOverflow,'hidden','Scroll cards retain their existing tab-travel behavior');
for (const state of ['[data-travelling="true"]','[data-snapping]']) {
 let listOverflow;
 sheet.walkRules(`.tableScroll${state}`, rule => rule.walkDecls('overflow-y', declaration => { listOverflow=declaration.value; }));
 assert.equal(listOverflow,undefined,'mobile List must stay scrollable through tab travel and detents');
}
function declarations(selector,width,height){
 const props={};sheet.walkRules(selector,rule=>{
  const condition=rule.parent.type==='atrule'?rule.parent.params:'';
  if(condition.includes('max-width: 700px')&&width>700)return;
  if(condition.includes('max-height: 500px')&&height>500)return;
  rule.walkDecls(d=>{props[d.prop]=d.value;});
 });return props;
}
function length(value,vars){
 let text=value;
 for(let i=0;text.includes('var(')&&i<5;i++)text=text.replace(/var\((--[\w-]+)\)/g,(_,name)=>vars[name]);
 text=text.replaceAll('calc','').replaceAll('px','');
 assert(/^[\d.\s()+-]+$/.test(text),text);return Function('return ('+text+')')();
}
for(const [width,height] of [[1512,900],[393,852],[844,390],[393,400],[1920,1200]]){
 const view=declarations('.tableView',width,height), canvas=declarations('.tableCanvas',width,height);
 const header=declarations('.tableHeader',width,height), scroller=declarations('.tableScroll',width,height);
 const labels=declarations('.tableHeader .tableHeading',width,height), nav=declarations('.categories',width,height);
 const vars=Object.fromEntries(Object.entries(view).filter(([k])=>k.startsWith('--')));
 const viewInset=view.inset.replaceAll('var(--table-top)',vars['--table-top']).split(' ').map(v=>length(v,vars));
 const listTop=viewInset[0], tabBottom=length(nav.top,vars)+length(nav.height,vars);
 assert.equal(listTop,tabBottom,'List clip starts exactly below the tabs');
 assert.equal(view.overflow,'hidden');assert.equal(view.isolation,'isolate');
 // The full-width clipped shell restores the old 8px canvas inset. Header
 // paint reaches both page edges, and row/preview coordinates stay unchanged.
 const shellLeft=8+viewInset[1], shellWidth=width-16-2*viewInset[1];
 assert.equal(shellLeft,0);assert.equal(shellWidth,width);assert.equal(canvas.inset,'0 8px');
 const headingEnd=length(vars['--table-heading-height'],vars);
 assert.equal(listTop+length(header.height,vars),headingEnd);
 const previewClip=declarations('.rowPreviewViewport',width,height);
 assert.equal(previewClip.overflow,'hidden','the floating image cannot paint behind the fixed heading');
 assert.equal(listTop+length(previewClip.inset.split(' 0 ')[0],vars),headingEnd,'the image clip starts at the Week / Title divider');
 const titleTop=listTop+length(header['padding-top']||postcss.list.space(header.padding)[0],vars);
 assert.equal(titleTop,height<=500?104:124);
 assert.equal(listTop+length(labels.top,vars),headingEnd-29);
 const scrollTop=listTop+length(postcss.list.space(scroller.inset)[0],vars);
 assert.equal(scrollTop,headingEnd);
 const content=declarations('.tableContent',width,height);
 assert.equal(content['padding-bottom'],undefined,'looping rows have no finite-list end spacer');
 assert.equal(content['margin-top'],undefined,'looping rows fill the viewport from its top');
 // Even a composited child extending above its parent cannot paint or
 // receive pointer hits within the tab band through the clipped shell.
 for(const pointerY of [43,44,60,75.99])assert(pointerY<listTop);
}
console.log('PASS: List paint/hit-test bounds exclude the tab bar at desktop, mobile and short heights; title, column header, row viewport, full-width background, preview canvas, keep their previous coordinates; looping rows have no end spacer.');
