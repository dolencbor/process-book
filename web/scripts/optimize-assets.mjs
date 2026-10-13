import sharp from "sharp";
import fs from "node:fs";
import assert from "node:assert/strict";
(async()=>{
 const names=['selected-cover','foundation','personal-project','playgrounds-one','playgrounds-two','bor-dolenc','mobile-logo','rail-fade','mobile-rail-fade'];
 let before=0,after=0;
 for(const name of names){
  const src=`public/design/${name}.png`, dst=`public/design/${name}.webp`;
  await sharp(src).webp({lossless:true,effort:6}).toFile(dst);
  const [original,compressed]=await Promise.all([sharp(src).ensureAlpha().raw().toBuffer(),sharp(dst).ensureAlpha().raw().toBuffer()]);
  assert.equal(original.length,compressed.length);
  for(let i=0;i<original.length;i+=4){
   assert.equal(original[i+3],compressed[i+3],`${name}: alpha must be identical`);
   if(original[i+3]>0) assert(original.subarray(i,i+3).equals(compressed.subarray(i,i+3)),`${name}: visible RGB pixels must be identical`);
  }
  const a=fs.statSync(src).size,b=fs.statSync(dst).size;
  before+=a;after+=b;console.log(name,a,b);
 }
 console.log(JSON.stringify({before,after,savedPercent:100*(1-after/before)}));
})().catch(e=>{console.error(e);process.exitCode=1});
