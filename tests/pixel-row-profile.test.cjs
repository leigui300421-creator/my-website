const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','pixel-brightness-filter.html'),'utf8');
const worker=html.match(/<script id="uniformWorkerSource"[^>]*>([\s\S]*?)<\/script>/)[1];
let result,cases=0;const ctx={self:{postMessage:m=>{result=m;}}};vm.createContext(ctx);vm.runInContext(worker,ctx);
function profile(data,width,height,start,end) {const values=Float64Array.from(data);ctx.self.onmessage({data:{type:'load',width,height,buffer:values.buffer}});assert.equal(result.type,'ready');ctx.self.onmessage({data:{type:'profile',id:9,start,end}});cases++;return result;}
function verify(data,w,h,start,end,expected,counts) {const r=profile(data,w,h,start,end);assert.equal(r.type,'profile');assert.equal(r.id,9);const means=Array.from(new Float64Array(r.buffer));assert.equal(means.length,w);means.forEach((value,x)=>{if(Number.isNaN(expected[x]))assert.ok(Number.isNaN(value));else assert.ok(Math.abs(value-expected[x])<1e-10*Math.max(1,Math.abs(expected[x])));});assert.deepEqual(Array.from(new Uint32Array(r.countsBuffer)),counts);}
verify([1,10,100,3,30,300,5,50,500],3,3,0,2,[3,30,300],[3,3,3]);
verify([1,10,100,3,30,300,5,50,500],3,3,1,2,[4,40,400],[2,2,2]);
verify([1,10,100,3,30,300],3,2,1,1,[3,30,300],[1,1,1]);
verify([NaN,2,Infinity,4,NaN,-Infinity],3,2,0,1,[4,2,NaN],[1,1,0]);
verify([NaN,Infinity],2,1,0,0,[NaN,NaN],[0,0]);
verify([1000,1001,1001,1002],2,2,0,1,[1000.5,1001.5],[2,2]);
verify([-.125,.125,.125,-.125],2,2,0,1,[0,0],[2,2]);
verify([2,4,6],1,3,0,2,[4],[3]);
for(const [start,end] of [[-1,0],[0,3],[2,1],[.5,1]]){const r=profile([1,2,3,4,5,6],2,3,start,end);assert.equal(r.type,'error');assert.equal(r.request,'profile');}
const data=Array.from({length:77},(_,i)=>i%7===0?NaN:i/13),expected=[],counts=[];
for(let x=0;x<11;x++){const column=[];for(let y=2;y<=5;y++)if(Number.isFinite(data[y*11+x]))column.push(data[y*11+x]);counts.push(column.length);expected.push(column.length?column.reduce((a,b)=>a+b,0)/column.length:NaN);}
verify(data,11,7,2,5,expected,counts);
console.log(`PASS: ${cases} row-profile cases: full/partial/single rows, per-column averaging, missing values, TIFF scalar precision and invalid row ranges.`);
