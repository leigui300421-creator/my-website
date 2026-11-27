/* Deterministic image-to-bead conversion. No network or AI calls. */
(function (root) {
  'use strict';
  const EMPTY = -1;
  function lab(rgb) {
    const [r,g,b]=rgb.map(v=>{v/=255;return v>.04045?((v+.055)/1.055)**2.4:v/12.92;});
    const f=t=>t>216/24389?Math.cbrt(t):(24389/27*t+16)/116;
    const x=f((.4124564*r+.3575761*g+.1804375*b)/.95047),y=f(.2126729*r+.7151522*g+.072175*b),z=f((.0193339*r+.119192*g+.9503041*b)/1.08883);
    return [116*y-16,500*(x-y),200*(y-z)];
  }
  const distance=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;
  // CIEDE2000, kL=kC=kH=1. Independently implemented from Sharma/Wu/Dalal.
  // Formula and verification data: https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/
  function deltaE2000(a,b) {
    const rad=Math.PI/180,deg=180/Math.PI;
    const c1=Math.hypot(a[1],a[2]),c2=Math.hypot(b[1],b[2]),c=(c1+c2)/2;
    const G=.5*(1-Math.sqrt(c**7/(c**7+25**7)));
    const a1=(1+G)*a[1],a2=(1+G)*b[1],C1=Math.hypot(a1,a[2]),C2=Math.hypot(a2,b[2]);
    const hue=(x,y)=>(Math.atan2(y,x)*deg+360)%360;
    const h1=C1===0?0:hue(a1,a[2]),h2=C2===0?0:hue(a2,b[2]);
    const dL=b[0]-a[0],dC=C2-C1;
    let dh=h2-h1;if(C1*C2===0)dh=0;else if(dh>180)dh-=360;else if(dh< -180)dh+=360;
    const dH=2*Math.sqrt(C1*C2)*Math.sin(dh/2*rad),L=(a[0]+b[0])/2,C=(C1+C2)/2;
    let H;if(C1*C2===0)H=h1+h2;else if(Math.abs(h1-h2)<=180)H=(h1+h2)/2;else H=(h1+h2+(h1+h2<360?360:-360))/2;
    const T=1-.17*Math.cos((H-30)*rad)+.24*Math.cos(2*H*rad)+.32*Math.cos((3*H+6)*rad)-.20*Math.cos((4*H-63)*rad);
    const SL=1+.015*(L-50)**2/Math.sqrt(20+(L-50)**2),SC=1+.045*C,SH=1+.015*C*T;
    const RT=-2*Math.sqrt(C**7/(C**7+25**7))*Math.sin(60*Math.exp(-(((H-275)/25)**2))*rad);
    return Math.sqrt(Math.max(0,(dL/SL)**2+(dC/SC)**2+(dH/SH)**2+RT*(dC/SC)*(dH/SH)));
  }
  function dimensions(w,h,columns) {
    if (!Number.isInteger(columns)||columns<8||columns>300) throw Error('横向格数须为 8–300 的整数。');
    const rows=Math.max(1,Math.round(columns*h/w));
    if(rows>600||rows*columns>120000)throw Error('网格过大，请降低横向格数或裁剪图片（最多 600 行、12 万格）。');
    return {width:columns,height:rows};
  }
  function backgroundMask(data,w,h,mode,color,tolerance) {
    const mask=new Uint8Array(w*h);
    const fits=i=>data[i*4+3]<128||Math.hypot(data[i*4]-color[0],data[i*4+1]-color[1],data[i*4+2]-color[2])<=tolerance;
    for(let i=0;i<mask.length;i++)if(data[i*4+3]<128)mask[i]=1;
    if(mode==='keep')return mask;
    if(mode==='all'){for(let i=0;i<mask.length;i++)if(fits(i))mask[i]=1;return mask;}
    const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
    const add=i=>{if(!seen[i]&&fits(i)){seen[i]=1;mask[i]=1;queue[tail++]=i;}};
    for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
    while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);if(x)add(i-1);if(x<w-1)add(i+1);if(y)add(i-w);if(y<h-1)add(i+w);}
    return mask;
  }
  function sample(data,w,h,rect,W,H,mask,method) {
    const out=new Array(W*H);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      if(method==='nearest'){
        const sx=Math.min(w-1,Math.floor(rect.x+(x+.5)*rect.w/W)),sy=Math.min(h-1,Math.floor(rect.y+(y+.5)*rect.h/H)),i=sy*w+sx;
        out[y*W+x]=mask[i]?null:[data[i*4],data[i*4+1],data[i*4+2]];
      }else if(method==='area'){
        // Integrate fractional pixel coverage: no omitted strips or repeated border pixels.
        const ax=rect.x+x*rect.w/W,bx=rect.x+(x+1)*rect.w/W,ay=rect.y+y*rect.h/H,by=rect.y+(y+1)*rect.h/H;
        let r=0,g=0,b=0,weight=0,covered=0;
        for(let sy=Math.floor(ay);sy<Math.min(h,Math.ceil(by));sy++)for(let sx=Math.floor(ax);sx<Math.min(w,Math.ceil(bx));sx++){
          const i=sy*w+sx;if(mask[i])continue;
          const area=(Math.min(bx,sx+1)-Math.max(ax,sx))*(Math.min(by,sy+1)-Math.max(ay,sy));covered+=area;
          const a=area*data[i*4+3]/255;weight+=a;r+=data[i*4]*a;g+=data[i*4+1]*a;b+=data[i*4+2]*a;
        }
        out[y*W+x]=covered+1e-12>=(bx-ax)*(by-ay)*.5&&weight?[Math.round(r/weight+1e-9),Math.round(g/weight+1e-9),Math.round(b/weight+1e-9)]:null;
      }else{
        const x0=Math.floor(rect.x+x*rect.w/W),x1=Math.min(w,Math.max(x0+1,Math.floor(rect.x+(x+1)*rect.w/W)));
        const y0=Math.floor(rect.y+y*rect.h/H),y1=Math.min(h,Math.max(y0+1,Math.floor(rect.y+(y+1)*rect.h/H)));
        let r=0,g=0,b=0,n=0,total=0;
        for(let sy=y0;sy<y1;sy++)for(let sx=x0;sx<x1;sx++){const i=sy*w+sx;total++;if(mask[i])continue;r+=data[i*4];g+=data[i*4+1];b+=data[i*4+2];n++;}
        out[y*W+x]=n>=total*.5&&n?[Math.round(r/n),Math.round(g/n),Math.round(b/n)]:null;
      }
    }return out;
  }
  async function matchColors(samples,palette,maxColors,onProgress=()=>{},options={}) {
    const metric=options.metric==='lab'?distance:(a,b)=>deltaE2000(a,b)**2;
    const labs=palette.map(p=>lab(p.rgb)),cache=new Map(),grid=new Int16Array(samples.length).fill(EMPTY);
    const nearest=(rgb,allowed)=>{let best=-1,d=Infinity;const v=lab(rgb);for(const j of allowed){const t=metric(v,labs[j]);if(t<d){d=t;best=j;}}return best;};
    const all=palette.map((_,i)=>i);
    for(let i=0;i<samples.length;i++){
      const rgb=samples[i];if(rgb){const key=rgb.join(',');if(!cache.has(key))cache.set(key,nearest(rgb,all));grid[i]=cache.get(key);}
      if(i%512===0){onProgress(i/samples.length);await new Promise(r=>setTimeout(r,0));}
    }
    if(maxColors>0){
      const freq=new Uint32Array(palette.length);for(const v of grid)if(v>=0)freq[v]++;
      const used=all.filter(i=>freq[i]);
      if(used.length>maxColors){
        const chosen=[used.reduce((a,b)=>freq[a]>=freq[b]?a:b)],remaining=new Set(used.filter(i=>i!==chosen[0]));
        const residual=new Float64Array(palette.length).fill(Infinity);
        while(chosen.length<maxColors){const last=chosen[chosen.length-1];let best=-1,score=-1;for(const i of remaining){residual[i]=Math.min(residual[i],metric(labs[i],labs[last]));const s=residual[i]*freq[i];if(s>score){score=s;best=i;}}chosen.push(best);remaining.delete(best);}
        // Refine representative colors within each weighted cluster (palette medoids).
        // Keep the most frequent source match, usually the background, fixed.
        for(let pass=0;pass<2;pass++){
          const clusters=chosen.map(()=>[]);
          for(const i of used){let slot=0,best=Infinity;chosen.forEach((j,k)=>{const e=metric(labs[i],labs[j]);if(e<best){slot=k;best=e;}});clusters[slot].push(i);}
          for(let k=1;k<chosen.length;k++){let best=chosen[k],cost=Infinity;for(const candidate of clusters[k]){let sum=0;for(const i of clusters[k])sum+=freq[i]*metric(labs[i],labs[candidate]);if(sum<cost){cost=sum;best=candidate;}}chosen[k]=best;}
        }
        cache.clear();for(let i=0;i<samples.length;i++){if(samples[i]){const key=samples[i].join(',');if(!cache.has(key))cache.set(key,nearest(samples[i],chosen));grid[i]=cache.get(key);}if(i%1024===0)await new Promise(r=>setTimeout(r,0));}
      }
    }return grid;
  }
  function cleanup(grid,w,h,level){
    const out=grid.slice();if(!level)return out;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x;if(grid[i]===EMPTY)continue;
      const counts=new Map();let valid=0,same=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const v=grid[ny*w+nx];if(v<0)continue;valid++;if(v===grid[i])same++;counts.set(v,(counts.get(v)||0)+1);}
      if(valid<5||same>=(level===1?1:2))continue;
      let v=grid[i],best=0;for(const [c,n] of counts)if(n>best){v=c;best=n;}
      if(best>=(level===1?5:4))out[i]=v;
    }return out;
  }
  function statistics(grid,palette){const counts=new Uint32Array(palette.length);let total=0;for(const v of grid)if(v>=0){counts[v]++;total++;}return {total,used:palette.map((p,i)=>({...p,index:i,count:counts[i]})).filter(p=>p.count)};}
  function flood(grid,w,h,start,value){const old=grid[start];if(old===value)return;const q=[start];grid[start]=value;for(let t=0;t<q.length;t++){const i=q[t],x=i%w,y=Math.floor(i/w);for(const j of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(j>=0&&grid[j]===old){grid[j]=value;q.push(j);}}}
  function components(grid,w,h){const seen=new Uint8Array(grid.length),groups=[];for(let i=0;i<grid.length;i++){if(grid[i]<0||seen[i])continue;const q=[i];seen[i]=1;for(let t=0;t<q.length;t++){const j=q[t],x=j%w,y=Math.floor(j/w);for(const k of [x?j-1:-1,x<w-1?j+1:-1,y?j-w:-1,y<h-1?j+w:-1])if(k>=0&&!seen[k]&&grid[k]>=0){seen[k]=1;q.push(k);}}groups.push(q);}groups.sort((a,b)=>b.length-a.length);return groups;}
  function validateDraft(d,palette){
    if(!d||d.version!==1||d.format!=='pindou-workbench'||d.palette!=='MARD221-anqstar-20261121')throw Error('不支持的草稿格式或色卡版本。');
    if(!Number.isInteger(d.width)||!Number.isInteger(d.height)||d.width<8||d.width>300||d.height<1||d.height>600||d.width*d.height>120000)throw Error('草稿网格尺寸不合法。');
    if(!Array.isArray(d.grid)||d.grid.length!==d.width*d.height||!d.grid.every(v=>Number.isInteger(v)&&v>=-1&&v<palette.length))throw Error('草稿包含无效的格子或色号。');
    if(typeof d.source!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(d.source)||d.source.length>16000000)throw Error('草稿原图格式或大小不合法。');
    if(!d.crop||!['x','y','w','h'].every(k=>Number.isFinite(d.crop[k]))||d.crop.x<0||d.crop.y<0||d.crop.w<=0||d.crop.h<=0||d.crop.x+d.crop.w>1.000001||d.crop.y+d.crop.h>1.000001)throw Error('草稿裁剪范围不合法。');
    return d;
  }
  const api={EMPTY,lab,distance,deltaE2000,dimensions,backgroundMask,sample,matchColors,cleanup,statistics,flood,components,validateDraft};
  if(typeof module!=='undefined')module.exports=api;root.PindouCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
