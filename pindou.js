'use strict';
(() => {
const $=id=>document.getElementById(id), C=PindouCore, P=PindouPalette;
const S={source:null,name:'拼豆作品',crop:{x:0,y:0,w:1,h:1},grid:null,w:0,h:0,tool:'pan',color:0,undo:[],redo:[],groups:null,busy:false,dirty:false,edited:false,cropping:false,picking:false};
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const notice=(msg,type='')=>{$('status').textContent=msg;$('status').className=type;};
const pitch=()=>Number($('pitch').value==='custom'?$('customPitch').value:$('pitch').value);
const sizeText=(w,h)=>Number.isFinite(pitch())&&pitch()>=.5&&pitch()<=20?`${(w*pitch()/10).toFixed(1)} × ${(h*pitch()/10).toFixed(1)} cm`:'—（格距须为 0.5–20 mm）';
const contrast=p=>(p.rgb[0]*.2126+p.rgb[1]*.7152+p.rgb[2]*.0722)<140?'#fff':'#263342';
const hexRGB=v=>[1,3,5].map(i=>parseInt(v.slice(i,i+2),16));
const nextFrame=()=>new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));
function availability(){
 for(const id of ['generate','crop','resetCrop','rotate','mirror','pickBackground','fidelityPreset'])$(id).disabled=!S.source||S.busy;
 for(const id of ['saveDraft','checkConnections','exportCsv','exportPng'])$(id).disabled=!S.grid||S.busy;
 $('replaceColor').disabled=!S.grid||!$('replaceFrom').options.length||S.busy;
 $('undo').disabled=!S.undo.length||S.busy;$('redo').disabled=!S.redo.length||S.busy;
}
async function locked(fn){
 if(S.busy)return;S.busy=true;const nodes=[...document.querySelectorAll('button,input,select')],previous=nodes.map(el=>el.disabled);nodes.forEach(el=>el.disabled=true);
 try{await fn();}catch(e){console.error(e);notice(e.message||'处理失败，请尝试更小的图片。','error');}finally{S.busy=false;nodes.forEach((el,i)=>el.disabled=previous[i]);availability();}
}
function dirty(){S.dirty=true;updateDimensions();if(S.source)notice('参数已修改，点击「生成拼豆图纸」应用。现有结果仍可编辑、保存与导出。');}
function updateDimensions(){
 $('customPitchLabel').hidden=$('pitch').value!=='custom';
 $('simplifyOptions').hidden=$('mode').value!=='simplify';$('backgroundOptions').hidden=$('background').value==='keep';$('toleranceValue').textContent=$('tolerance').value;
 if(!S.source)return;
 try{const d=C.dimensions(S.source.width*S.crop.w,S.source.height*S.crop.h,Number($('columns').value));$('rows').value=d.height;$('physicalSize').textContent=`当前参数：${d.width} × ${d.height} 格，约 ${sizeText(d.width,d.height)}`;}catch(e){$('rows').value='';$('physicalSize').textContent=e.message;}
 if(S.grid)$('sizeStat').textContent=sizeText(S.w,S.h);
 updateExportInfo();
}
function fitCanvases(){
 const zoom=Number($('zoom').value)/100;$('zoomValue').textContent=Math.round(zoom*100)+'%';
 for(const [c,v] of [[$('sourceCanvas'),$('sourceViewport')],[$('resultCanvas'),$('resultViewport')]]){
  if(c.hidden)continue;const ratio=Math.min((v.clientWidth-2)/c.width,(v.clientHeight-2)/c.height);c.style.width=Math.max(1,c.width*ratio*zoom)+'px';c.style.height=Math.max(1,c.height*ratio*zoom)+'px';
 }
}
function drawSource(rect=S.crop){
 if(!S.source)return;const c=$('sourceCanvas');c.width=S.source.width;c.height=S.source.height;const ctx=c.getContext('2d');ctx.drawImage(S.source,0,0);
 if(rect.x!==0||rect.y!==0||rect.w!==1||rect.h!==1){const x=rect.x*c.width,y=rect.y*c.height,w=rect.w*c.width,h=rect.h*c.height;ctx.fillStyle='#172f3b88';ctx.beginPath();ctx.rect(0,0,c.width,c.height);ctx.rect(x,y,w,h);ctx.fill('evenodd');ctx.strokeStyle='#ff9d51';ctx.lineWidth=Math.max(2,c.width/300);ctx.strokeRect(x,y,w,h);}
 c.hidden=false;$('sourceEmpty').hidden=true;$('cropInfo').textContent=rect.w===1&&rect.h===1?'完整原图':`裁剪 ${Math.round(rect.w*100)}% × ${Math.round(rect.h*100)}%`;
 c.style.cursor=S.picking?'crosshair':S.cropping?'crosshair':'default';fitCanvases();
}
function renderGrid(ctx,grid,w,h,cell,mode,options={}){
 const {codes=true,major=10,highlight=false,disconnected=false}=options;
 const marked=disconnected&&S.groups?new Set(S.groups.slice(1).flat()):null;
 ctx.clearRect(0,0,w*cell,h*cell);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,v=grid[i],xx=x*cell,yy=y*cell;
  if(v<0){if(mode==='chart'){ctx.fillStyle='#f4f6f7';ctx.fillRect(xx,yy,cell,cell);}continue;}
  const p=P[v];ctx.globalAlpha=highlight&&v!==S.color ? .14 : 1;ctx.fillStyle=p.hex;
  if(mode==='beads'){ctx.beginPath();ctx.arc(xx+cell/2,yy+cell/2,cell*.46,0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.arc(xx+cell/2,yy+cell/2,cell*.13,0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation='source-over';}
  else ctx.fillRect(xx,yy,cell,cell);
  ctx.globalAlpha=1;
  if(mode==='chart'&&codes){ctx.fillStyle=contrast(p);ctx.font=`${Math.max(6,cell*.35)}px "Microsoft YaHei",sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.id,xx+cell/2,yy+cell*.53);}
  if(marked&&marked.has(i)){ctx.fillStyle='#fa38d999';ctx.fillRect(xx,yy,cell,cell);}
 }
 if(mode==='chart'){
  for(let x=0;x<=w;x++){ctx.strokeStyle=x%major?'#9da6aa99':'#d58d3b';ctx.lineWidth=x%major?.55:1.5;ctx.beginPath();ctx.moveTo(x*cell,0);ctx.lineTo(x*cell,h*cell);ctx.stroke();}
  for(let y=0;y<=h;y++){ctx.strokeStyle=y%major?'#9da6aa99':'#d58d3b';ctx.lineWidth=y%major?.55:1.5;ctx.beginPath();ctx.moveTo(0,y*cell);ctx.lineTo(w*cell,y*cell);ctx.stroke();}
 }
}
function drawResult(){
 if(!S.grid)return;const c=$('resultCanvas'),mode=$('view').value,requestedCell=mode==='chart'?24:mode==='beads'?14:8,cell=Math.min(requestedCell,Math.floor(Math.sqrt(16000000/(S.w*S.h))));
 c.width=S.w*cell;c.height=S.h*cell;renderGrid(c.getContext('2d'),S.grid,S.w,S.h,cell,mode,{major:Number($('majorGrid').value),highlight:$('highlightColor').checked,disconnected:$('highlightDisconnected').checked});
 c.hidden=false;$('resultEmpty').hidden=true;c.style.cursor=S.tool==='pan'?'grab':S.tool==='pick'?'crosshair':'cell';fitCanvases();
}
function selectColor(i){S.color=i;$('paintColor').value=i;$('paintSwatch').style.background=P[i].hex;document.querySelectorAll('.color-chip').forEach(el=>el.classList.toggle('selected',Number(el.dataset.index)===i));if($('highlightColor').checked)drawResult();}
function updateStats(){
 if(!S.grid)return;const stats=C.statistics(S.grid,P),used=stats.used,spare=Number($('spare').value)/100;
 $('gridStat').textContent=`${S.w} × ${S.h}`;$('colorStat').textContent=used.length+' 色';$('beadStat').textContent=stats.total.toLocaleString()+' 颗';$('sizeStat').textContent=sizeText(S.w,S.h);$('paletteCount').textContent=used.length+' 色';
 $('resultInfo').textContent=`${S.w} × ${S.h} · ${used.length} 色`;$('usedPalette').replaceChildren();const previous=$('replaceFrom').value;$('replaceFrom').replaceChildren();
 for(const p of used){const b=document.createElement('button');b.className='color-chip'+(p.index===S.color?' selected':'');b.dataset.index=p.index;b.title=`${p.id}：${p.count} 颗，建议准备 ${Math.ceil(p.count*(1+spare))} 颗`;const t=document.createElement('span');t.className='chip-top';t.style.background=p.hex;t.style.color=contrast(p);t.textContent=p.id;const n=document.createElement('span');n.textContent=p.count.toLocaleString()+' 颗';t.append(n);const foot=document.createElement('span');foot.className='chip-bottom';foot.textContent='建议备豆 '+Math.ceil(p.count*(1+spare)).toLocaleString()+' 颗';b.append(t,foot);b.onclick=()=>selectColor(p.index);$('usedPalette').append(b);$('replaceFrom').add(new Option(p.id,p.index));}
 if(used.some(p=>String(p.index)===previous))$('replaceFrom').value=previous;
 $('replaceColor').disabled=!used.length;updateExportInfo();availability();
}
function invalidateConnections(){S.groups=null;$('connectionInfo').textContent='图案已改变，可重新检查连接。';}
function commit(before){if(!before.some((v,i)=>v!==S.grid[i]))return;S.undo.push(before);if(S.undo.length>30)S.undo.shift();S.redo=[];S.edited=true;invalidateConnections();updateStats();drawResult();}
function change(fn){if(!S.grid||S.busy)return;const before=S.grid.slice();fn();commit(before);}
function imageFromURL(url){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('图片无法解码，请使用有效的 PNG、JPG、WebP 或 BMP。'));im.src=url;});}
function discardOK(){return !S.edited||confirm('当前图纸有手动修改。继续会替换这些修改，建议先保存草稿。是否继续？');}
function resetResult(){S.grid=null;S.undo=[];S.redo=[];S.groups=null;S.edited=false;$('resultCanvas').hidden=true;$('resultEmpty').hidden=false;$('usedPalette').replaceChildren();$('replaceFrom').replaceChildren();for(const id of ['gridStat','colorStat','beadStat','sizeStat'])$(id).textContent='—';$('paletteCount').textContent='0 色';$('resultInfo').textContent='等待生成';$('hoverInfo').textContent='移动到拼豆图上可查看行列与色号。';$('connectionInfo').textContent='只检查，不自动改变图案。';}
function setSource(c,name){resetResult();S.source=c;S.name=name;S.crop={x:0,y:0,w:1,h:1};S.cropping=false;S.picking=false;S.dirty=true;$('crop').setAttribute('aria-pressed','false');$('pickBackground').setAttribute('aria-pressed','false');$('zoom').value=100;drawSource();updateDimensions();availability();}
async function loadImage(file){
 if(!file||S.busy||!discardOK())return;
 await locked(async()=>{
  if(!/\.(png|jpe?g|webp|bmp)$/i.test(file.name)||file.size>20*1024*1024)throw Error('请选择 20 MB 以内的 PNG、JPG、WebP 或 BMP 图片。');
  notice('正在读取图片…','busy');const url=URL.createObjectURL(file);let im;try{im=await imageFromURL(url);}finally{URL.revokeObjectURL(url);}
  if(im.naturalWidth*im.naturalHeight>40000000)throw Error('图片超过 4000 万像素，请先缩小图片。');
  const scale=Math.min(1,1800/Math.max(im.naturalWidth,im.naturalHeight)),c=canvas(Math.max(1,Math.round(im.naturalWidth*scale)),Math.max(1,Math.round(im.naturalHeight*scale)));c.getContext('2d').drawImage(im,0,0,c.width,c.height);
  setSource(c,file.name.replace(/\.[^.]+$/,''));$('sourceInfo').textContent=`${file.name} · ${im.naturalWidth} × ${im.naturalHeight}${scale<1?'；已等比例缩至最长边 1800 像素处理':''}`;notice('图片已载入。可先裁剪或调整参数，再生成图纸。');
 });$('imageFile').value='';
}
async function generate(){
 if(!S.source||S.busy||!discardOK())return;
 await locked(async()=>{
  const r=S.crop,sw=Math.max(1,Math.round(S.source.width*r.w)),sh=Math.max(1,Math.round(S.source.height*r.h)),d=C.dimensions(sw,sh,Number($('columns').value));
  const mode=$('mode').value,background=$('background').value,sampling=$('sampling').value;
  notice('正在取色和匹配 MARD 色卡…','busy');await nextFrame();
  const work=canvas(sw,sh);work.getContext('2d').drawImage(S.source,r.x*S.source.width,r.y*S.source.height,r.w*S.source.width,r.h*S.source.height,0,0,sw,sh);
  const data=work.getContext('2d').getImageData(0,0,sw,sh).data,mask=C.backgroundMask(data,sw,sh,background,hexRGB($('backgroundColor').value),Number($('tolerance').value));
  const samples=C.sample(data,sw,sh,{x:0,y:0,w:sw,h:sh},d.width,d.height,mask,sampling);
  const matched=await C.matchColors(samples,P,mode==='simplify'?Number($('maxColors').value):0,p=>notice(`正在匹配 MARD 色卡… ${Math.round(p*100)}%`,'busy'),{metric:$('colorMetric').value});
  S.grid=C.cleanup(matched,d.width,d.height,mode==='simplify'?Number($('cleanup').value):0);S.w=d.width;S.h=d.height;S.undo=[];S.redo=[];S.edited=false;S.dirty=false;invalidateConnections();updateStats();drawResult();
  const stats=C.statistics(S.grid,P);notice(`已生成 ${S.w} × ${S.h} 格，${stats.used.length} 色，${stats.total.toLocaleString()} 颗豆${stats.total?'。点击色块可选色，进入画笔或橡皮修正。':'。当前图案全为空格，请检查透明区域或去背参数。'}`);
 });
}
function transform(kind){if(!S.source||S.busy)return;if(!discardOK())return;const src=S.source,c=canvas(kind==='rotate'?src.height:src.width,kind==='rotate'?src.width:src.height),ctx=c.getContext('2d');if(kind==='rotate'){ctx.translate(c.width,0);ctx.rotate(Math.PI/2);}else{ctx.translate(c.width,0);ctx.scale(-1,1);}ctx.drawImage(src,0,0);setSource(c,S.name);notice('方向已调整，请重新生成图纸。');}
function point(e,c){const r=c.getBoundingClientRect();return {x:Math.max(0,Math.min(.999999,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(.999999,(e.clientY-r.top)/r.height))};}
let cropStart=null,cropEnd=null;
$('sourceCanvas').addEventListener('pointerdown',e=>{
 if(S.busy||!S.source)return;const p=point(e,$('sourceCanvas'));
 if(S.picking){const d=S.source.getContext('2d').getImageData(Math.floor(p.x*S.source.width),Math.floor(p.y*S.source.height),1,1).data;$('backgroundColor').value='#'+[...d.slice(0,3)].map(v=>v.toString(16).padStart(2,'0')).join('');S.picking=false;$('pickBackground').setAttribute('aria-pressed','false');dirty();drawSource();return;}
 if(!S.cropping)return;cropStart=p;cropEnd=p;$('sourceCanvas').setPointerCapture(e.pointerId);
});
const cropRect=()=>{
 let w=Math.abs(cropStart.x-cropEnd.x),h=Math.abs(cropStart.y-cropEnd.y);const sx=cropEnd.x>=cropStart.x?1:-1,sy=cropEnd.y>=cropStart.y?1:-1,choice=$('cropRatio').value;
 if(choice!=='free'&&(w||h)){const ratio=choice==='original'?1:Number(choice)*S.source.height/S.source.width;if(w>h*ratio)h=w/ratio;else w=h*ratio;const maxW=sx>0?1-cropStart.x:cropStart.x,maxH=sy>0?1-cropStart.y:cropStart.y,factor=Math.min(1,maxW/w,maxH/h);w*=factor;h*=factor;}
 return {x:sx>0?cropStart.x:cropStart.x-w,y:sy>0?cropStart.y:cropStart.y-h,w,h};
};
$('sourceCanvas').addEventListener('pointermove',e=>{if(!cropStart)return;cropEnd=point(e,$('sourceCanvas'));drawSource(cropRect());});
function endCrop(e){if(!cropStart)return;cropEnd=point(e,$('sourceCanvas'));const r=cropRect();cropStart=null;if(r.w*S.source.width>=3&&r.h*S.source.height>=3){S.crop=r;dirty();}drawSource();}
$('sourceCanvas').addEventListener('pointerup',endCrop);$('sourceCanvas').addEventListener('pointercancel',()=>{cropStart=null;drawSource();});
let stroke=null,lastCell=null,panStart=null;
function cellAt(e){const p=point(e,$('resultCanvas'));return {x:Math.floor(p.x*S.w),y:Math.floor(p.y*S.h)};}
function paintLine(a,b){let x=a.x,y=a.y,dx=Math.abs(b.x-x),dy=-Math.abs(b.y-y),sx=x<b.x?1:-1,sy=y<b.y?1:-1,err=dx+dy;for(;;){S.grid[y*S.w+x]=S.tool==='erase'?-1:S.color;if(x===b.x&&y===b.y)break;const e=2*err;if(e>=dy){err+=dy;x+=sx;}if(e<=dx){err+=dx;y+=sy;}}}
$('resultCanvas').addEventListener('pointerdown',e=>{
 if(!S.grid||S.busy)return;const p=cellAt(e),i=p.y*S.w+p.x,c=$('resultCanvas');c.setPointerCapture(e.pointerId);
 if(S.tool==='pan'){panStart={x:e.clientX,y:e.clientY,left:$('resultViewport').scrollLeft,top:$('resultViewport').scrollTop};return;}
 if(S.tool==='pick'){if(S.grid[i]>=0)selectColor(S.grid[i]);return;}
 if(S.tool==='fill'){change(()=>C.flood(S.grid,S.w,S.h,i,S.color));return;}
 stroke=S.grid.slice();lastCell=p;paintLine(p,p);drawResult();
});
$('resultCanvas').addEventListener('pointermove',e=>{
 if(!S.grid)return;const p=cellAt(e),v=S.grid[p.y*S.w+p.x];$('hoverInfo').textContent=`第 ${p.y+1} 行 · 第 ${p.x+1} 列 · ${v<0?'空白，不放豆':P[v].id}`;
 if(panStart){$('resultViewport').scrollLeft=panStart.left+panStart.x-e.clientX;$('resultViewport').scrollTop=panStart.top+panStart.y-e.clientY;}
 if(stroke){paintLine(lastCell,p);lastCell=p;drawResult();}
});
function endStroke(){if(stroke){const before=stroke;stroke=null;lastCell=null;commit(before);}panStart=null;}
$('resultCanvas').addEventListener('pointerup',endStroke);$('resultCanvas').addEventListener('pointercancel',endStroke);
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function getSettings(){const ids=['columns','pitch','customPitch','mode','sampling','maxColors','cleanup','background','backgroundColor','tolerance','view','spare','exportMode','cellSize','majorGrid','cropRatio','colorMetric'];return Object.fromEntries(ids.map(id=>[id,$(id).value]));}
function applySettings(settings){if(!settings||typeof settings!=='object')return;for(const [id,value] of Object.entries(settings)){const el=$(id);if(!el||typeof value!=='string'||!Object.hasOwn(getSettings(),id))continue;if(el.tagName==='SELECT'){if([...el.options].some(o=>o.value===value))el.value=value;}else if(el.type==='color'){if(/^#[0-9a-f]{6}$/i.test(value))el.value=value;}else{const v=Number(value);if(Number.isFinite(v)&&v>=Number(el.min)&&v<=Number(el.max))el.value=value;}}}
$('saveDraft').onclick=()=>{if(!S.grid)return;const d={format:'pindou-workbench',version:1,palette:'MARD221-anqstar-20261121',name:S.name,source:S.source.toDataURL('image/png'),crop:S.crop,width:S.w,height:S.h,grid:Array.from(S.grid),settings:getSettings()};download(new Blob([JSON.stringify(d)],{type:'application/json'}),S.name+'_拼豆草稿.json');notice('草稿已下载，包含处理用原图、参数与逐格修改。下次点击「打开草稿」继续。');};
$('loadDraft').onclick=()=>$('draftFile').click();
$('draftFile').onchange=async()=>{const file=$('draftFile').files[0];if(!file||!discardOK())return;await locked(async()=>{if(file.size>20*1024*1024)throw Error('草稿超过 20 MB。');const d=C.validateDraft(JSON.parse(await file.text()),P),im=await imageFromURL(d.source);if(im.naturalWidth>1800||im.naturalHeight>1800)throw Error('草稿原图尺寸超出上限。');const c=canvas(im.naturalWidth,im.naturalHeight);c.getContext('2d').drawImage(im,0,0);setSource(c,typeof d.name==='string'?d.name.slice(0,100):'导入草稿');S.crop=d.crop;applySettings(d.settings);S.w=d.width;S.h=d.height;S.grid=Int16Array.from(d.grid);S.dirty=false;S.edited=true;drawSource();updateDimensions();updateStats();drawResult();$('sourceInfo').textContent='已恢复草稿原图、裁剪与图纸。';notice('草稿已恢复，可以继续逐格修改或导出。');});$('draftFile').value='';};
function exportLayout(){if(!S.grid)return null;const cell=Number($('cellSize').value),chart=$('exportMode').value==='chart',margin=chart?64:24,header=chart?112:0,stats=C.statistics(S.grid,P),cols=Math.max(1,Math.min(8,Math.floor(S.w*cell/190))),legend=$('exportLegend').checked?Math.ceil(stats.used.length/cols)*64+98:0;return {cell,chart,margin,header,stats,cols,width:S.w*cell+margin*2,height:S.h*cell+margin*2+header+legend,legend};}
function updateExportInfo(){const d=exportLayout();if(!d)return;$('exportInfo').textContent=`导出 ${d.width.toLocaleString()} × ${d.height.toLocaleString()} 像素 · ${S.w} × ${S.h} 格 · ${d.stats.used.length} 色${d.width*d.height>48000000?'。图片过大，请降低每格像素或网格尺寸。':''}${S.dirty?'；当前导出的是上一次生成及手动修改后的结果。':''}`;}
function write(ctx,t,x,y,size=20,color='#263342',align='left'){ctx.font=`${size}px "Microsoft YaHei",sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillText(t,x,y);}
$('exportPng').onclick=()=>locked(async()=>{
 const d=exportLayout();if(!d)return;if(d.width*d.height>48000000||d.width>16000||d.height>16000)throw Error('导出图超过 4800 万像素或单边 16000 像素，请降低每格像素或网格尺寸。');
 notice('正在生成高清 PNG…','busy');await nextFrame();const out=canvas(d.width,d.height),ctx=out.getContext('2d');
 if(d.chart||d.legend){ctx.fillStyle='#fff';ctx.fillRect(0,0,out.width,out.height);}
 const layer=canvas(S.w*d.cell,S.h*d.cell);renderGrid(layer.getContext('2d'),S.grid,S.w,S.h,d.cell,$('exportMode').value,{codes:$('exportCodes').checked,major:Number($('majorGrid').value)});
 const ox=d.margin,oy=d.margin+d.header;ctx.drawImage(layer,ox,oy);
 if(d.chart){write(ctx,S.name.slice(0,28)+' · 拼豆图纸',ox,46,Math.min(30,(out.width-ox*2)/22));write(ctx,`MARD 221 · ${S.w} × ${S.h} 格 · ${d.stats.used.length} 色 · ${d.stats.total.toLocaleString()} 颗`,ox,82,18);if($('exportCoords').checked){for(let x=0;x<S.w;x++){write(ctx,x+1,ox+(x+.5)*d.cell,oy-10,Math.min(14,d.cell*.4),'#52616a','center');write(ctx,x+1,ox+(x+.5)*d.cell,oy+S.h*d.cell+24,Math.min(14,d.cell*.4),'#52616a','center');}for(let y=0;y<S.h;y++){write(ctx,y+1,ox-9,oy+(y+.65)*d.cell,14,'#52616a','right');write(ctx,y+1,ox+S.w*d.cell+9,oy+(y+.65)*d.cell,14,'#52616a');}}}
 if(d.legend){const startY=oy+S.h*d.cell+52,cw=S.w*d.cell/d.cols;d.stats.used.forEach((p,i)=>{const x=ox+(i%d.cols)*cw,y=startY+Math.floor(i/d.cols)*64;ctx.fillStyle=p.hex;ctx.fillRect(x,y,cw-10,50);ctx.strokeStyle='#adb7be';ctx.lineWidth=1;ctx.strokeRect(x,y,cw-10,50);write(ctx,`${p.id} · ${p.count.toLocaleString()} 颗`,x+(cw-10)/2,y+32,Math.min(21,cw/9),contrast(p),'center');});const foot=startY+Math.ceil(d.stats.used.length/d.cols)*64;write(ctx,'每格一颗；空白格不放豆。MARD 221 参考色卡：pd.anqstar.com/colors',ox,foot+12,Math.min(19,(out.width-ox*2)/41));write(ctx,'颜色以实物为准；图中数量为实际用量，不含备用量。',ox,foot+40,Math.min(18,(out.width-ox*2)/32));}
 const blob=await new Promise(r=>out.toBlob(r,'image/png'));if(!blob)throw Error('浏览器无法生成此尺寸 PNG，请降低尺寸。');download(blob,S.name+'_MARD221_'+$('exportMode').value+'.png');notice(`PNG 已导出：${out.width} × ${out.height} 像素，${d.stats.total.toLocaleString()} 颗豆。`);out.width=1;layer.width=1;
});
$('exportCsv').onclick=()=>{const stats=C.statistics(S.grid,P),spare=Number($('spare').value)/100;const csv='\uFEFFMARD色号,参考HEX,实际颗数,建议备豆量\r\n'+stats.used.map(p=>`${p.id},${p.hex},${p.count},${Math.ceil(p.count*(1+spare))}`).join('\r\n');download(new Blob([csv],{type:'text/csv;charset=utf-8'}),S.name+'_配色用量.csv');};
$('fidelityPreset').onclick=()=>{if(!S.source||S.busy)return;$('columns').value=200;$('sampling').value='area';$('colorMetric').value='ciede2000';$('mode').value='original';$('background').value='keep';$('cleanup').value='0';$('maxColors').value='0';dirty();notice('已设置更接近原图：200 列、整格取色、精细配色、不减色、不去背。点击生成应用；用豆数量也会增加。');};
$('generate').onclick=generate;$('imageFile').onchange=()=>loadImage($('imageFile').files[0]);
const drop=$('dropzone');drop.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('imageFile').click();}};['dragenter','dragover'].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('dragover');}));['dragleave','drop'].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove('dragover');}));drop.addEventListener('drop',e=>loadImage(e.dataTransfer.files[0]));window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
$('demo').onclick=async()=>{if(S.busy||!discardOK())return;const c=canvas(640,640),ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,640,640);ctx.lineCap='round';ctx.strokeStyle='#36734f';ctx.lineWidth=26;ctx.beginPath();ctx.moveTo(320,310);ctx.quadraticCurveTo(350,460,320,540);ctx.stroke();for(const [x,y,angle] of [[265,445,-.6],[378,486,.6]]){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle='#65ad74';ctx.beginPath();ctx.ellipse(0,0,70,27,0,0,Math.PI*2);ctx.fill();ctx.restore();}for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.fillStyle=i%2?'#ffb5bd':'#f87e91';ctx.beginPath();ctx.ellipse(320+Math.cos(a)*90,265+Math.sin(a)*90,76,46,a,0,Math.PI*2);ctx.fill();}ctx.fillStyle='#ffda64';ctx.beginPath();ctx.arc(320,265,72,0,Math.PI*2);ctx.fill();ctx.fillStyle='#513b33';for(const x of [297,343]){ctx.beginPath();ctx.arc(x,252,7,0,Math.PI*2);ctx.fill();}ctx.strokeStyle='#513b33';ctx.lineWidth=6;ctx.beginPath();ctx.arc(320,265,23,.15*Math.PI,.85*Math.PI);ctx.stroke();setSource(c,'微笑花朵示例');$('sourceInfo').textContent='内置示例 · 640 × 640 · 可练习裁剪与边缘去背';await generate();};
$('crop').onclick=()=>{S.cropping=!S.cropping;S.picking=false;$('crop').setAttribute('aria-pressed',String(S.cropping));$('pickBackground').setAttribute('aria-pressed','false');drawSource();notice(S.cropping?'在左侧原图上拖动框选裁剪范围。':'已退出裁剪。');};
$('resetCrop').onclick=()=>{S.crop={x:0,y:0,w:1,h:1};drawSource();dirty();};$('rotate').onclick=()=>transform('rotate');$('mirror').onclick=()=>transform('mirror');$('pickBackground').onclick=()=>{S.picking=!S.picking;S.cropping=false;$('crop').setAttribute('aria-pressed','false');$('pickBackground').setAttribute('aria-pressed',String(S.picking));drawSource();notice(S.picking?'点击左侧原图，选取要去除的背景颜色。':'已退出背景取色。');};
for(const id of ['columns','mode','sampling','maxColors','cleanup','background','backgroundColor','tolerance','colorMetric'])$(id).addEventListener('input',dirty);
for(const id of ['pitch','customPitch'])$(id).addEventListener('input',updateDimensions);
document.querySelectorAll('[data-width]').forEach(el=>el.onclick=()=>{$('columns').value=el.dataset.width;dirty();});
for(const id of ['view','highlightColor','highlightDisconnected','majorGrid'])$(id).addEventListener('change',()=>{if(id==='highlightDisconnected'&&$('highlightDisconnected').checked&&!S.groups)checkConnections();drawResult();updateExportInfo();});
for(const id of ['cellSize','exportMode','exportLegend','exportCodes','exportCoords'])$(id).addEventListener('change',updateExportInfo);
$('spare').onchange=updateStats;$('zoom').oninput=fitCanvases;$('fit').onclick=()=>{$('zoom').value=100;fitCanvases();};
for(const [i,p] of P.entries())$('paintColor').add(new Option(p.id,i));$('paintColor').onchange=()=>selectColor(Number($('paintColor').value));selectColor(0);
document.querySelectorAll('[data-tool]').forEach(el=>el.onclick=()=>{S.tool=el.dataset.tool;document.querySelectorAll('[data-tool]').forEach(b=>{b.classList.toggle('active',b===el);b.setAttribute('aria-pressed',String(b===el));});drawResult();});
$('replaceColor').onclick=()=>change(()=>{const old=Number($('replaceFrom').value);for(let i=0;i<S.grid.length;i++)if(S.grid[i]===old)S.grid[i]=S.color;});
$('undo').onclick=()=>{if(!S.undo.length)return;S.redo.push(S.grid.slice());S.grid=S.undo.pop();S.edited=true;invalidateConnections();updateStats();drawResult();};$('redo').onclick=()=>{if(!S.redo.length)return;S.undo.push(S.grid.slice());S.grid=S.redo.pop();S.edited=true;invalidateConnections();updateStats();drawResult();};
function checkConnections(){if(!S.grid)return;S.groups=C.components(S.grid,S.w,S.h);const singles=S.groups.filter(g=>g.length===1).length;$('connectionInfo').textContent=S.groups.length?`${S.groups.length} 个四方向连接区域；单颗孤立豆 ${singles} 颗。${S.groups.length===1?'整体连通。':'非最大区域可标亮，斜角接触不算连接。'}`:'图案为空，没有可检查的豆子。';}
$('checkConnections').onclick=()=>{checkConnections();drawResult();};
let sync=false;for(const [a,b] of [[$('sourceViewport'),$('resultViewport')],[$('resultViewport'),$('sourceViewport')]])a.addEventListener('scroll',()=>{if(sync||!$('syncScroll').checked)return;sync=true;b.scrollLeft=a.scrollLeft/Math.max(1,a.scrollWidth-a.clientWidth)*(b.scrollWidth-b.clientWidth);b.scrollTop=a.scrollTop/Math.max(1,a.scrollHeight-a.clientHeight)*(b.scrollHeight-b.clientHeight);requestAnimationFrame(()=>sync=false);});
new ResizeObserver(fitCanvases).observe($('sourceViewport'));window.addEventListener('beforeunload',e=>{if(S.edited){e.preventDefault();e.returnValue='';}});
window.addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();(e.shiftKey?$('redo'):$('undo')).click();}});
updateDimensions();availability();
})();

// Fidelity preset changes parameters only; existing edits remain until regeneration.
