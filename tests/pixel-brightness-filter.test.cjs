// Run: node tests/pixel-brightness-filter.test.cjs
// Exercise the actual embedded worker against an independent sort-based oracle.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'pixel-brightness-filter.html'), 'utf8');
const worker = html.match(/<script id="workerSource" type="text\/plain">([\s\S]*?)<\/script>/)[1];
const main = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(main); // Catch syntax errors in the browser entry point as well.
let checks = 0;
function makeWorker(rgb) {
  const messages = [];
  const sandbox = { self: { postMessage: message => messages.push(message) } };
  vm.createContext(sandbox);
  vm.runInContext(worker, sandbox);
  const rgba = Uint8ClampedArray.from(rgb.flatMap(c => [...c, 255]));
  sandbox.self.onmessage({data:{type:'load',width:rgb.length,height:1,buffer:rgba.buffer}});
  assert.equal(messages.pop().type, 'ready');
  return options => {
    sandbox.self.onmessage({data:{type:'render',id:123,stops:[[23,80,120],[23,80,120]],reverse:false,...options}});
    const result = messages.pop();
    assert.equal(result.type, 'result');
    assert.equal(result.id, 123);
    return {...result, output:new Uint8ClampedArray(result.buffer)};
  };
}
function verifyFixture(rgb) {
  const render = makeWorker(rgb);
  const keys = rgb.map(([r,g,b]) => r*2126+g*7152+b*722);
  for (const direction of ['asc','desc']) for (const percent of [0,0.01,1,12.5,20,33.33,50,75,99.99,100]) {
    const keep = Math.round(rgb.length*percent/100);
    const sorted = keys.map((key,index)=>({key,index})).sort((a,b)=>(direction==='asc'?a.key-b.key:b.key-a.key)||a.index-b.index);
    const selected = new Set(sorted.slice(0,keep).map(p=>p.index));
    const result = render({direction,percent});
    assert.equal(result.keep,keep);
    assert.equal(result.cutoff,keep?sorted[keep-1].key/10000:null);
    for(let i=0;i<rgb.length;i++) {
      assert.deepEqual(Array.from(result.output.slice(i*4,i*4+4)), selected.has(i)?[23,80,120,255]:[0,0,0,255],`${direction} ${percent}% pixel ${i}`);
    }
    checks++;
  }
}
verifyFixture([[0,0,0],[255,255,255],[255,0,0],[0,255,0],[0,0,255],[127,127,127],[127,127,127],[128,128,128]]);
verifyFixture(Array.from({length:17},()=>[80,80,80])); // Equal-brightness ties.
verifyFixture([[0,0,0]]);
verifyFixture([[255,255,255]]);
let seed=123456;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>>>24;};
verifyFixture(Array.from({length:601},()=>[random(),random(),random()]));
const gray=makeWorker([0,64,128,255].map(v=>[v,v,v]));
for(const reverse of [false,true]) {
  const result=gray({direction:'desc',percent:100,stops:[[0,0,0],[255,255,255]],reverse});
  assert.deepEqual(Array.from(result.output),[0,64,128,255].flatMap(v=>{const x=reverse?255-v:v;return [x,x,x,255];}));
  checks++;
}
const home=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
assert.ok(home.includes('href="./pixel-brightness-filter.html"'));
assert.ok(!/<script[^>]+src=|<link[^>]+href="https?:/i.test(html),'Page must remain self-contained');
console.log(`PASS: ${checks} worker cases, browser-script syntax, homepage entry and no external dependencies.`);
