const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','pixel-brightness-filter.html'),'utf8');
const script=id=>html.match(new RegExp('<script id="'+id+'"[^>]*>([\\s\\S]*?)<\\/script>'))[1];
const workerSource=script('uniformWorkerSource');
class TestWorker {
  constructor(){this.stopped=false;this.context={self:{postMessage:data=>queueMicrotask(()=>{if(!this.stopped)this.onmessage?.({data});})}};vm.createContext(this.context);vm.runInContext(workerSource,this.context);}
  postMessage(data){queueMicrotask(()=>{if(!this.stopped)this.context.self.onmessage({data});});}
  terminate(){this.stopped=true;}
}
function element(){const classes=new Set(),attrs={};return {children:[],handlers:{},style:{removeProperty(key){delete this[key];}},value:'',textContent:'',hidden:false,width:1,height:1,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},setAttribute(k,v){attrs[k]=v;},getAttribute(k){return attrs[k];},removeAttribute(k){delete attrs[k];},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},addEventListener(k,fn){this.handlers[k]=fn;},getBoundingClientRect:()=>({width:640,height:320,left:0,top:0}),getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true}),checkValidity:()=>true,click(){this.clicked=true;}};}
const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
const context={document:{getElementById:get,createElement:element},window:{addEventListener(){}},Worker:TestWorker,Blob:class{},URL:{createObjectURL:()=> 'blob:test'},attachDrop(){},supported:f=>/\.tif$/i.test(f.name),decode:async file=>({naturalWidth:file.w,naturalHeight:file.h,values:Float64Array.from(file.values),source:{}}),formatValue:String,number:new Intl.NumberFormat('zh-CN')};
vm.createContext(context);vm.runInContext(script('uniformityUI'),context);
const evaluate=code=>vm.runInContext(code,context),settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
async function run(){
  const a={name:'A.tif',w:3,h:2,values:[1,2,3,3,4,5]},b={name:'B.tif',w:3,h:2,values:[2,4,6,6,8,10]};
  get('uniformAdd').onclick();assert.equal(get('uniformFile').clicked,true);
  await context.addUniformImages([a,b]);await settle();
  assert.equal(evaluate('uniformImages.length'),2);assert.equal(get('uniformImageCount').textContent,'2 张');
  assert.equal(evaluate('profileSeries().length'),2);assert.equal(evaluate('uniformImages[0].metric.n'),6);
  assert.equal(get('compareMetricRows').children.length,2);assert.equal(evaluate('activeUniformImage.file.name'),'A.tif');
  evaluate('uniform.roi={x0:1,y0:0,x1:2,y1:1};requestUniformAnalysis();setProfileRows(1,1);');await settle();
  near(evaluate('uniformImages[0].metric.mean'),3.5);near(evaluate('uniformImages[1].metric.mean'),7);
  near(evaluate('uniformImages[0].metric.rsd'),evaluate('uniformImages[1].metric.rsd'));
  assert.deepEqual(Array.from(evaluate('uniformImages[0].profile.means')),[3,4,5]);assert.deepEqual(Array.from(evaluate('uniformImages[1].profile.means')),[6,8,10]);
  const check=get('uniformImageList').children[0].children[0];check.checked=false;check.onchange();
  assert.equal(evaluate('profileSeries().length'),1);assert.equal(evaluate('profileSeries()[0].name'),'B.tif');assert.equal(get('compareMetricRows').children.length,2);
  await get('uniformImageList').children[1].children[2].onclick();await settle();
  assert.equal(evaluate('activeUniformImage.file.name'),'B.tif');assert.equal(evaluate('JSON.stringify(uniform.roi)'),'{"x0":1,"y0":0,"x1":2,"y1":1}');assert.equal(evaluate('rowProfile.start+":"+rowProfile.end'),'1:1');
  await context.addUniformImages([{name:'wrong-size.tif',w:2,h:2,values:[1,2,3,4]},a]);await settle();assert.equal(evaluate('uniformImages.length'),2);assert.ok(get('uniformImportStatus').textContent.includes('不一致'));
  await context.addUniformImages([{name:'C.tif',w:3,h:2,values:[3,6,9,9,12,15]}]);await settle();assert.equal(evaluate('uniformImages.length'),3);near(evaluate('uniformImages[2].metric.mean'),10.5);assert.deepEqual(Array.from(evaluate('uniformImages[2].profile.means')),[9,12,15]);
  assert.equal(evaluate('JSON.stringify(uniform.roi)'),'{"x0":1,"y0":0,"x1":2,"y1":1}');assert.equal(get('compareMetricRows').children.length,3);
  console.log('PASS: plus-button append, multi-image worker results, shared ROI/rows, colored series selection, metric table, reference switching, dimension rejection and preserved selections.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
