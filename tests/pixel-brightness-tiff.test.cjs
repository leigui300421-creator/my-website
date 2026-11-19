// Run: node tests/pixel-brightness-tiff.test.cjs
// Generate real TIFF byte streams, decode with the embedded browser library,
// then feed the original scalar data into the actual filter worker.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {deflateSync}=require('node:zlib');
const html=fs.readFileSync(path.join(__dirname,'..','pixel-brightness-filter.html'),'utf8');
const script=id=>html.match(new RegExp('<script id="'+id+'"[^>]*>([\\s\\S]*?)<\\/script>'))[1];
const context={TextDecoder,TextEncoder,URL,Blob,ArrayBuffer,DataView,Uint8Array,Uint8ClampedArray,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array,Float32Array,Float64Array,console,setTimeout,clearTimeout,Worker:class {constructor(){throw Error('Decoder must not start an external worker');}}};
vm.createContext(context);
function fixture({data,bits=16,format=1,photo=1,channels=1,compressed=false,compression=compressed?8:1,pages=1,noData=null,bigEndian=false,extras=null}) {
  const endian=bigEndian?'BE':'LE',total=data.length/channels;
  const raw=Buffer.alloc(data.length*bits/8);
  data.forEach((value,i)=>{
    const method=format===3?(bits===64?'writeDouble':'writeFloat'):format===2?'writeInt'+bits:'writeUInt'+bits;
    raw[method+(bits===8?'':endian)](value,i*bits/8);
  });
  let pixels=compression===8?deflateSync(raw):raw;
  if(compression===32773)pixels=Buffer.concat([Buffer.from([raw.length-1]),raw]); // Literal PackBits block.
  if(compression===5) {
    // A valid short LZW stream: clear, literal codes, end; all codes remain 9-bit.
    const codes=[256,...raw,257];pixels=Buffer.alloc(Math.ceil(codes.length*9/8));
    codes.forEach((code,i)=>{for(let bit=0;bit<9;bit++)if(code&(1<<(8-bit)))pixels[Math.floor((i*9+bit)/8)]|=1<<(7-(i*9+bit)%8);});
  }
  const tags=[[256,4,[total]],[257,4,[1]],[258,3,Array(channels).fill(bits)],[259,3,[compression]],[262,3,[photo]],[273,4,[0]],[277,3,[channels]],[278,4,[1]],[279,4,[pixels.length]],[284,3,[1]],[339,3,Array(channels).fill(format)]];
  if(noData!==null)tags.push([42113,2,Array.from(Buffer.from(String(noData)+'\0'))]);
  if(extras)tags.push([338,3,extras]);
  tags.sort((a,b)=>a[0]-b[0]);
  const ifdSize=2+tags.length*12+4;
  const extraSize=tags.reduce((n,[,type,values])=>n+(values.length*(type===3?2:type===4?4:1)>4?values.length*(type===3?2:type===4?4:1):0),0);
  const pixelOffset=8+ifdSize*pages+extraSize*pages;
  const buffer=Buffer.alloc(pixelOffset+pixels.length);
  const w16=(value,offset)=>buffer['writeUInt16'+endian](value,offset),w32=(value,offset)=>buffer['writeUInt32'+endian](value,offset);
  buffer.write(bigEndian?'MM':'II');w16(42,2);w32(8,4);
  let extraOffset=8+ifdSize*pages;
  for(let page=0;page<pages;page++) {
    const offset=8+ifdSize*page;w16(tags.length,offset);
    tags.forEach(([tag,type,input],index)=>{
      const values=tag===273?[pixelOffset]:input,pos=offset+2+index*12,size=values.length*(type===3?2:type===4?4:1);
      w16(tag,pos);w16(type,pos+2);w32(values.length,pos+4);
      let dest=pos+8;if(size>4){w32(extraOffset,dest);dest=extraOffset;extraOffset+=size;}
      values.forEach((value,i)=>{if(type===3)w16(value,dest+i*2);else if(type===4)w32(value,dest+i*4);else buffer[dest+i]=value;});
    });
    w32(page+1<pages?offset+ifdSize:0,offset+2+tags.length*12);
  }
  pixels.copy(buffer,pixelOffset);
  return {name:'test.TIFF',type:'image/tiff',arrayBuffer:async()=>buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength)};
}
function filter(values,range,percent,direction) {
  let output;
  const sandbox={self:{postMessage:message=>{output=message;}}};vm.createContext(sandbox);vm.runInContext(script('workerSource'),sandbox);
  sandbox.self.onmessage({data:{type:'load',width:values.length,height:1,valuesBuffer:values.slice().buffer,range}});
  assert.equal(output.type,'ready');
  sandbox.self.onmessage({data:{type:'render',id:9,percent,direction,stops:[[23,80,120],[23,80,120]],reverse:false}});
  assert.equal(output.type,'result');
  return {...output,mask:Array.from(new Uint8ClampedArray(output.buffer)).filter((_,i)=>i%4===0).map(v=>v===23)};
}
async function run() {
  vm.runInContext(script('tiffDecoder'),context);
  vm.runInContext(script('tiffSupport'),context);
  assert.equal(context.isTiff({name:'UPPER.TIF'}),true);
  assert.equal(context.isTiff({name:'no-extension',type:'image/tiff'}),true);
  let checks=0;
  const cases=[
    {data:[1000,1001,1002,65535]}, // Adjacent 16-bit values must stay distinct.
    {data:[-10,-9,20,32767],format:2},
    {data:[.100000001,.100000002,1,2],bits:64,format:3},
    {data:[.1,.1001,2,5],bits:32,format:3,compressed:true},
    {data:[0,1,254,255],bits:8,photo:0},
    {data:[0,1024,2048,65535],compressed:true,bigEndian:true},
    {data:[0,1024,2048,65535],compression:5},
    {data:[0,1024,2048,65535],compression:32773},
    {data:[100,200,300,400],pages:2},
    {data:[10,10,10,10]},
    {data:[0,1,2,65535],noData:65535},
    {data:[-Infinity,NaN,-.01,.01,Infinity],bits:32,format:3},
    {data:[65535,0,0,0,65535,0,0,0,65535,65535,65535,65535],channels:3,photo:2},
    {data:[100,0,100,65535,200,65535,300,65535],channels:2,extras:[2]}
  ];
  for(const options of cases) {
    const decoded=await context.decodeTiffRaster(fixture(options));
    const expected=options.channels===3?Array.from({length:options.data.length/3},(_,i)=>options.data[i*3]*.2126+options.data[i*3+1]*.7152+options.data[i*3+2]*.0722):options.channels===2?[0,100,200,300]:options.data.map(v=>options.photo===0?255-v:v);
    const actual=Array.from(decoded.values);
    assert.equal(actual.length,expected.length);
    expected.forEach((value,i)=>{if(!Number.isFinite(value)||value===options.noData)assert.ok(Number.isNaN(actual[i]));else assert.ok(Math.abs(actual[i]-value)<=Math.max(1e-8,Math.abs(value)*1e-6));});
    assert.equal(decoded.rgba.length,expected.length*4);
    assert.ok(decoded.range[1]>=decoded.range[0]);
    if(options.pages===2)assert.ok(decoded.note.includes('1/2'));
    for(const direction of ['asc','desc'])for(const percent of [0,25,50,75,100]) {
      const sorted=actual.map((value,index)=>({value,index})).filter(p=>Number.isFinite(p.value)).sort((a,b)=>(direction==='asc'?a.value-b.value:b.value-a.value)||a.index-b.index);
      const keep=Math.round(sorted.length*percent/100),selected=new Set(sorted.slice(0,keep).map(p=>p.index));
      const result=filter(decoded.values,decoded.range,percent,direction);
      assert.equal(result.keep,keep);assert.equal(result.total,sorted.length);
      assert.deepEqual(result.mask,actual.map((_,i)=>selected.has(i)));
      checks++;
    }
  }
  await assert.rejects(()=>context.decodeTiffRaster(fixture({data:[NaN,Infinity],bits:32,format:3})),/没有有效像素/);
  await assert.rejects(()=>context.decodeTiffRaster({name:'broken.tif',arrayBuffer:async()=>new ArrayBuffer(20)}));
  console.log(`PASS: ${cases.length} real TIFF fixtures and ${checks} raw-value filtering cases; invalid TIFF and all-invalid raster errors.`);
}
run().catch(error=>{console.error(error.name+': '+error.message);process.exitCode=1;});
