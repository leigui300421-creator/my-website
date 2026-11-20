const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','pixel-brightness-filter.html'),'utf8');
const extract=id=>html.match(new RegExp('<script id="'+id+'"[^>]*>([\\s\\S]*?)<\\/script>'))[1];
new vm.Script(extract('uniformityUI'));
let result;const sandbox={self:{postMessage:m=>{result=m;}}};vm.createContext(sandbox);vm.runInContext(extract('uniformWorkerSource'),sandbox);
const near=(a,b)=>assert.ok(Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(b)),`${a} != ${b}`);let checks=0;
function run(data,w,h,roi) {const values=Float64Array.from(data);sandbox.self.onmessage({data:{type:'load',width:w,height:h,buffer:values.buffer}});assert.equal(result.type,'ready');sandbox.self.onmessage({data:{type:'analyze',id:77,roi}});checks++;return result;}
let r=run([8,8,8,8],2,2,{x0:0,y0:0,x1:1,y1:1});near(r.mean,8);near(r.std,0);near(r.rsd,0);near(r.uniformity,1);
r=run([1,2,3,4],2,2,{x0:0,y0:0,x1:1,y1:1});near(r.mean,2.5);near(r.std,Math.sqrt(1.25));near(r.rsd,Math.sqrt(1.25)/2.5);near(r.uniformity,1-Math.sqrt(1.25)/2.5);
r=run([1,100,3,200],2,2,{x0:0,y0:0,x1:0,y1:1});near(r.mean,2);near(r.std,1);near(r.uniformity,.5);assert.equal(r.n,2);
r=run([1,2,3,4],2,2,{x0:1,y0:1,x1:1,y1:1});near(r.mean,4);near(r.uniformity,1);assert.equal(r.area,1);
r=run([0,0],2,1,{x0:0,y0:0,x1:1,y1:0});assert.equal(r.rsd,null);assert.equal(r.uniformity,null);
r=run([-1,1],2,1,{x0:0,y0:0,x1:1,y1:0});assert.equal(r.uniformity,null);
r=run([NaN,Infinity,2,4],2,2,{x0:0,y0:0,x1:1,y1:1});assert.equal(r.n,2);assert.equal(r.area,4);near(r.mean,3);near(r.std,1);
r=run([NaN,-Infinity],2,1,{x0:0,y0:0,x1:1,y1:0});assert.equal(r.n,0);assert.equal(r.uniformity,null);
r=run([-2,-4],2,1,{x0:0,y0:0,x1:1,y1:0});near(r.rsd,-1/3);near(r.uniformity,4/3);
r=run([0,0,0,100],4,1,{x0:0,y0:0,x1:3,y1:0});assert.ok(r.uniformity<0);
r=run([1e-100,2e-100],2,1,{x0:0,y0:0,x1:1,y1:0});near(r.rsd,1/3);
r=run([1000,1001],2,1,{x0:0,y0:0,x1:1,y1:0});near(r.std,.5);near(r.mean,1000.5);
for(const roi of [{x0:-1,y0:0,x1:0,y1:0},{x0:0,y0:0,x1:2,y1:0},{x0:1,y0:0,x1:0,y1:0},{x0:.5,y0:0,x1:1,y1:0}]){r=run([1,2],2,1,roi);assert.equal(r.type,'error');}
const data=Array.from({length:63},(_,i)=>i%11===0?NaN:((i*7919)%199)+20),roi={x0:2,y0:1,x1:6,y1:5};r=run(data,9,7,roi);const chosen=[];for(let y=1;y<=5;y++)for(let x=2;x<=6;x++)if(Number.isFinite(data[y*9+x]))chosen.push(data[y*9+x]);const mean=chosen.reduce((a,b)=>a+b,0)/chosen.length,std=Math.sqrt(chosen.reduce((a,b)=>a+(b-mean)**2,0)/chosen.length);near(r.mean,mean);near(r.std,std);near(r.uniformity,1-std/mean);
console.log(`PASS: ${checks} uniformity cases, inclusive ROI, zero/negative means, invalid pixels, scalar precision and UI syntax.`);
