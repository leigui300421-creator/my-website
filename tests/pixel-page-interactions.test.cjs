const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','pixel-brightness-filter.html'),'utf8');
const script=id=>html.match(new RegExp('<script id="'+id+'"[^>]*>([\\s\\S]*?)<\\/script>'))[1];
const visible=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
assert.ok(!/\?{2,}|\uFFFD/.test(visible),'No corrupted question-mark placeholders in page text');
function node(hidden=false) {
  const classes=new Set(hidden?['hidden']:[]),attributes={};
  return {value:'',textContent:'',handlers:{},style:{},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},addEventListener(type,handler){this.handlers[type]=handler;},setAttribute:(k,v)=>{attributes[k]=v;},removeAttribute:k=>{delete attributes[k];},select(){this.selected=true;}};
}
function login(storageValue=null,blocked=false) {
  const nodes={accessGate:node(),app:node(true),accessForm:node(),accessPassword:node(),accessError:node()},saved={};
  vm.runInNewContext(script('accessControl'),{document:{getElementById:id=>nodes[id]},sessionStorage:{getItem(){if(blocked)throw Error('blocked');return storageValue;},setItem(k,v){if(blocked)throw Error('blocked');saved[k]=v;}}});
  return {nodes,saved,submit(password){nodes.accessPassword.value=password;nodes.accessForm.handlers.submit({preventDefault(){}});}};
}
let gate=login();assert.ok(gate.nodes.app.classList.contains('hidden'));
gate.submit('wrong');assert.ok(gate.nodes.app.classList.contains('hidden'));assert.ok(gate.nodes.accessError.textContent);assert.ok(gate.nodes.accessPassword.selected);
gate.submit('123456');assert.ok(!gate.nodes.app.classList.contains('hidden'));assert.ok(gate.nodes.accessGate.classList.contains('hidden'));assert.equal(gate.nodes.accessPassword.value,'');assert.equal(Object.values(gate.saved)[0],'ok');
gate=login('ok');assert.ok(!gate.nodes.app.classList.contains('hidden'));
gate=login(null,true);gate.submit('123456');assert.ok(!gate.nodes.app.classList.contains('hidden'));
const main=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const dropCode=main.slice(main.indexOf('async function readEntry('),main.indexOf('function download('));
function event(files,items=[]) {return {preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},dataTransfer:{files,items}};}
async function run() {
  const context={importEpoch:0,notice:message=>{throw Error(message);}};vm.createContext(context);vm.runInContext(dropCode,context);
  let received;const zone=node();context.attachDrop(zone,files=>{received=files;});
  const file={name:'test.tiff'};
  const e=event([file],[{webkitGetAsEntry(){throw Error('Browser entry API unavailable');}}]);
  await zone.handlers.drop(e);assert.equal(received[0],file);assert.ok(e.prevented&&e.stopped);
  received=null;await zone.handlers.drop(event([],[{getAsFile:()=>file}]));assert.equal(received[0],file);
  received=null;let called=false;const entry={isDirectory:true,createReader(){return {readEntries(resolve){if(called)resolve([]);else {called=true;resolve([{isFile:true,file:resolve=>resolve(file)}]);}}};}};
  await zone.handlers.drop(event([],[{webkitGetAsEntry:()=>entry}]));assert.equal(received[0],file);
  let error='';const errorZone=node();context.attachDrop(errorZone,()=>{throw Error('decode failed');},{onError:message=>{error=message;}});
  await errorZone.handlers.drop(event([file]));assert.ok(error.includes('decode failed'));
  // The whole second section receives bubbled drops, including its preview canvas.
  const nodes=new Map(),registrations=[];const uiContext={document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}},Blob:class{},URL:{createObjectURL:()=> 'blob:uniform-test'},window:{addEventListener(){}},attachDrop:(zone,callback,options)=>registrations.push({zone,callback,options}),supported:file=>/\.tiff?$/i.test(file.name)};
  vm.createContext(uiContext);vm.runInContext(script('uniformityUI'),uiContext);
  assert.equal(registrations.length,1);assert.equal(registrations[0].zone,nodes.get('uniformity'));assert.equal(registrations[0].options.independent,true);
  vm.runInContext('loadUniformFile=async file=>{globalThis.receivedFile=file;}',uiContext);
  await registrations[0].callback([file]);assert.equal(uiContext.receivedFile,file);
  // Selecting profile rows must not change the two-dimensional uniformity ROI.
  const view=nodes.get('uniformView');view.getBoundingClientRect=()=>({left:0,top:0,width:800,height:400});view.setPointerCapture=()=>{};view.releasePointerCapture=()=>{};
  vm.runInContext("globalThis.sent=[];uniform.ready=true;uniform.width=8;uniform.height=10;uniform.roi={x0:1,y0:2,x1:6,y1:8};uniform.worker={postMessage:m=>sent.push(m)};rowProfile.start=0;rowProfile.end=9;",uiContext);
  const rowView=view;nodes.get('selectProfileRows').onclick();
  const pointer=(x,y)=>({pointerId:1,button:0,clientX:x,clientY:y,preventDefault(){}});
  rowView.handlers.pointerdown(pointer(100,300));nodes.get('selectMetricRoi').onclick();rowView.handlers.pointerup(pointer(400,80));
  assert.equal(uiContext.sent.at(-1).type,'profile');assert.equal(uiContext.sent.at(-1).start,2);assert.equal(uiContext.sent.at(-1).end,7);
  assert.equal(vm.runInContext('JSON.stringify(uniform.roi)',uiContext),'{"x0":1,"y0":2,"x1":6,"y1":8}');
  nodes.get('selectMetricRoi').onclick();view.handlers.pointerdown(pointer(100,80));view.handlers.pointerup(pointer(500,200));
  assert.equal(uiContext.sent.at(-1).type,'analyze');assert.equal(vm.runInContext('rowProfile.start+":"+rowProfile.end',uiContext),'2:7');
  const savedRoi=vm.runInContext('JSON.stringify(uniform.roi)',uiContext);
  nodes.get('selectProfileRows').onclick();
  rowView.handlers.pointerdown(pointer(0,0));rowView.handlers.pointermove(pointer(0,399));rowView.handlers.pointercancel(pointer(0,399));
  assert.equal(vm.runInContext('rowProfile.start+":"+rowProfile.end',uiContext),'2:7');assert.equal(vm.runInContext('JSON.stringify(uniform.roi)',uiContext),savedRoi);
  rowView.handlers.pointerdown(pointer(0,-100));rowView.handlers.pointerup(pointer(0,999));
  assert.equal(uiContext.sent.at(-1).start,0);assert.equal(uiContext.sent.at(-1).end,9);
  assert.ok(!html.includes('id="rowSelectView"')&&!html.includes('id="rowSelectCanvas"'),'Only one image preview is needed for both selections');
  assert.match(html,/id="selectMetricRoi"[^>]*>指标计算</);assert.match(html,/id="selectProfileRows"[^>]*>一维曲线</);
  // Exercise the real plotting function against a canvas recorder, including NaN gaps.
  const plot=nodes.get('rowProfileCanvas'),commands=[];
  plot.getBoundingClientRect=()=>({left:0,top:0,width:640,height:320});
  plot.getContext=()=>new Proxy({}, {get:(_,method)=>(...args)=>commands.push([method,...args]),set:()=>true});
  uiContext.formatValue=String;uiContext.number=new Intl.NumberFormat('zh-CN');
  vm.runInContext('rowProfile.result={means:new Float64Array([1,NaN,3]),counts:new Uint32Array([6,0,6])};drawRowProfile();',uiContext);
  assert.equal(plot.hidden,false);assert.equal(plot.width,640);assert.equal(plot.height,320);
  assert.ok(commands.some(([method,label])=>method==='fillText'&&label.includes('X')));
  assert.ok(commands.some(([method])=>method==='arc'),'Isolated valid columns remain visible');
  vm.runInContext("invalidateProfile('changed');",uiContext);assert.equal(plot.hidden,true);
  console.log('PASS: page text, password rejection/unlock/session/storage fallback, file and folder drops, preview routing and local error reporting.');
  console.log('PASS: independent row/ROI drag routing, reverse drag, curve axes, missing-value points and stale-curve clearing.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
