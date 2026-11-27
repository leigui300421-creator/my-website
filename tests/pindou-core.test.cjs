const assert=require('node:assert/strict');
const C=require('../pindou-core.js'),P=require('../pindou-palette.js');
const fs=require('node:fs'),path=require('node:path');
const rgba=arr=>Uint8ClampedArray.from(arr.flatMap(rgb=>[...rgb,255]));
(async()=>{
 assert.equal(P.length,221);assert.equal(new Set(P.map(p=>p.id)).size,221);
 // Published 34-pair verification dataset: Sharma, Wu & Dalal (2005).
 // Source: https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/
 const pairs=fs.readFileSync(path.join(__dirname,'fixtures/ciede2000-sharma.txt'),'utf8').trim().split(/\r?\n/).map(line=>line.trim().split(/\s+/).map(Number));
 assert.equal(pairs.length,34);for(const p of pairs){assert.ok(Math.abs(C.deltaE2000(p.slice(0,3),p.slice(3,6))-p[6])<.00005,'Published CIEDE2000 reference pair: '+p);assert.ok(Math.abs(C.deltaE2000(p.slice(3,6),p.slice(0,3))-p[6])<.00005);}
 for(const p of P)assert.equal(p.hex.toLowerCase(),'#'+p.rgb.map(v=>v.toString(16).padStart(2,'0')).join(''));
 assert.deepEqual(C.dimensions(966,1256,160),{width:160,height:208});assert.throws(()=>C.dimensions(1,1000,300));assert.throws(()=>C.dimensions(100,100,3));
 // A dark ring encloses white: edge removal must protect that interior white.
 const pixels=rgba(Array.from({length:49},(_,i)=>{const x=i%7,y=Math.floor(i/7);return (x===2||x===4)&&y>=2&&y<=4||(y===2||y===4)&&x>=2&&x<=4?[0,0,0]:[255,255,255];}));
 const edge=C.backgroundMask(pixels,7,7,'edge',[255,255,255],0),all=C.backgroundMask(pixels,7,7,'all',[255,255,255],0);
 assert.equal(edge[0],1);assert.equal(edge[24],0);assert.equal(all[24],1);assert.equal(edge[16],0);
 pixels[24*4+3]=0;assert.equal(C.backgroundMask(pixels,7,7,'keep',[255,255,255],0)[24],1);
 const pixels2=rgba([[255,0,0],[0,0,255],[255,0,0],[0,0,255]]),mask=new Uint8Array(4);
 assert.deepEqual(C.sample(pixels2,2,2,{x:0,y:0,w:2,h:2},1,1,mask,'average'),[[128,0,128]]);
 assert.deepEqual(C.sample(pixels2,2,2,{x:0,y:0,w:2,h:2},1,1,mask,'nearest'),[[0,0,255]]);
 assert.deepEqual(C.sample(pixels2,2,2,{x:0,y:0,w:2,h:2},3,1,mask,'area'),[[255,0,0],[128,0,128],[0,0,255]],'Fractional pixel coverage must preserve both sides of a boundary');
 const alphaPixels=rgba([[255,0,0],[0,0,255]]);alphaPixels[7]=128;const blended=C.sample(alphaPixels,2,1,{x:0,y:0,w:2,h:1},1,1,new Uint8Array(2),'area')[0];assert.deepEqual(blended,[170,0,85]);
 mask.fill(1);assert.deepEqual(C.sample(pixels2,2,2,{x:0,y:0,w:2,h:2},1,1,mask,'average'),[null]);
 const samples=P.map(p=>p.rgb).concat([null]);const exact=await C.matchColors(samples,P,0);assert.equal(exact[221],-1);for(let i=0;i<221;i++)assert.equal(exact[i],i,'Exact palette color must map to its own code');
 const limited=await C.matchColors(samples,P,16);assert.ok(new Set([...limited].filter(v=>v>=0)).size<=16);assert.equal(limited[221],-1);
 const colors=[[148,68,105],[40,165,190],[240,133,117],[210,201,100]],fast=await C.matchColors(colors,P,0,()=>{},{metric:'lab'}),fine=await C.matchColors(colors,P,0);
 for(let i=0;i<colors.length;i++)assert.ok(C.deltaE2000(C.lab(colors[i]),C.lab(P[fine[i]].rgb))<=C.deltaE2000(C.lab(colors[i]),C.lab(P[fast[i]].rgb))+1e-10,'Fine mapping must not increase perceptual error against the same source sample');
 const nine=Int16Array.from([0,0,0,0,1,0,0,0,-1]);const cleaned=C.cleanup(nine,3,3,1);assert.equal(cleaned[4],0);assert.equal(cleaned[8],-1);assert.equal(nine[4],1);
 const grid=Int16Array.from([1,-1,-1,-1,2,-1,-1,-1,3]);assert.equal(C.components(grid,3,3).length,3,'Diagonal contact is not connected');
 const fill=Int16Array.from([1,1,2,1,-1,2]);C.flood(fill,3,2,0,4);assert.deepEqual([...fill],[4,4,2,4,-1,2]);C.flood(fill,3,2,4,0);assert.equal(fill[4],0);
 const stats=C.statistics(fill,P);assert.equal(stats.total,6);assert.equal(stats.used.reduce((s,p)=>s+p.count,0),6);
 const draft={format:'pindou-workbench',version:1,palette:'MARD221-anqstar-20261121',width:8,height:1,grid:Array(8).fill(0),source:'data:image/png;base64,AAAA',crop:{x:0,y:0,w:1,h:1}};
 assert.equal(C.validateDraft(draft,P),draft);assert.throws(()=>C.validateDraft({...draft,grid:[999]},P));assert.throws(()=>C.validateDraft({...draft,crop:{x:.5,y:0,w:1,h:1}},P));assert.throws(()=>C.validateDraft({...draft,source:'https://example.com/image.png'},P));
 console.log('PASS: 34 published color-difference pairs, fractional-area/alpha sampling, perceptual matching, 221 palette entries, dimensions, background protection, color limits, cleanup, connectivity, fill, statistics and drafts.');
})().catch(e=>{console.error(e);process.exitCode=1;});
