(() => {
'use strict';
const canvas = document.querySelector('#cosmos'), ctx = canvas.getContext('2d');
if (!ctx) { location.replace('classic.html'); return; }
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const world = document.querySelector('#world'), origin = document.querySelector('#origin');
const dialog = document.querySelector('#destination'), content = document.querySelector('#content');
const closeButton = document.querySelector('#close'), status = document.querySelector('#coordinates');
const hero = document.createElement('div'); hero.className = 'destination-hero';
const heroImage = document.createElement('img'); heroImage.alt = ''; hero.append(heroImage);
const heroTitle = document.createElement('div'); heroTitle.className = 'destination-title'; hero.append(heroTitle);
dialog.insertBefore(hero, content);
const next = document.createElement('button'); next.className = 'next-destination'; dialog.append(next);
const destinations = [
 {id:'releases',name:'Releases',note:'14 transmissions · 2013 — 2026',x:420,y:40,z:80,image:'img/covers/arisen-1200.webp',title:'Fourteen transmissions.',sections:['.latest','.disco','.elsewhere']},
 {id:'live',name:'Live',note:'Sound & light · in the dark',x:0,y:-270,z:-100,image:'img/photos/p15-1600.webp',title:'Sound. Light. Presence.',sections:['.live']},
 {id:'about',name:'About',note:'The source · Istanbul',x:-420,y:50,z:50,image:'img/photos/p08-1600.webp',title:'An inner universe.',sections:['.about']},
 {id:'contact',name:'Contact',note:'Send a signal',x:70,y:260,z:0,image:'img/photos/p11-1600.webp',title:'Across the void.',sections:['.contact']}
];
if(innerWidth<650){const positions={releases:[370,350],live:[0,-530],about:[-370,350],contact:[0,760]};destinations.forEach(d=>{[d.x,d.y]=positions[d.id];});}
let w=innerWidth,h=innerHeight,seed=42,raf=0,previous=0,travel=null,returnFocus=null,scene=null,sceneFrame=0;
const homeZ=innerWidth<650?1700:1100;
const camera={x:0,y:0,z:homeZ},target={...camera};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*t*(t*(t*6-15)+10);
const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const galaxy=new Image(); galaxy.onload=wake; galaxy.src='img/universe/galaxy.webp';
const stars=Array.from({length:coarse?1000:2200},()=>({x:(rand()-.5)*6500,y:(rand()-.5)*4000,z:-1200+rand()*1600,s:rand()*1.1+.2,a:rand()*.55+.15,c:rand()>.7?'#e2bfa7':'#b7c5dc'}));
const footer=document.querySelector('.flight-footer');
const map=document.createElement('nav');map.className='star-map';map.setAttribute('aria-label','Universe map');
map.innerHTML='<span>ATLAS / 01—04</span>';
destinations.forEach((d,i)=>{
 d.el=document.createElement('button');d.el.className='beacon';d.el.setAttribute('aria-label','Explore '+d.name);
 const img=document.createElement('img');img.src=d.image;img.alt='';img.decoding='async';
 const label=document.createElement('span');label.className='beacon-label';label.textContent=String(i+1).padStart(2,'0')+' / '+d.name;
 const note=document.createElement('small');note.textContent=d.note;
 d.el.append(img,label,note);d.el.onclick=()=>navigate(d);world.append(d.el);
 const button=document.createElement('button');button.textContent=String(i+1).padStart(2,'0');button.setAttribute('aria-label',d.name);button.onclick=()=>navigate(d);map.append(button);
});footer.before(map);
function project(p,cam=camera){const scale=Math.min(w,h)*1.3/Math.max(100,cam.z-p.z);return{x:w/2+(p.x-cam.x)*scale,y:h/2+(p.y-cam.y)*scale,scale};}
function beaconRect(d,cam=camera){const q=project(d,cam),width=clamp(180*q.scale,100,250),height=width*.68;return{x:q.x-width/2,y:q.y-height/2,width,height};}
function resize(){w=innerWidth;h=innerHeight;const dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);wake();}
addEventListener('resize',resize);
function draw(){
 ctx.globalAlpha=1;ctx.fillStyle='#04060a';ctx.fillRect(0,0,w,h);
 if(galaxy.complete&&galaxy.naturalWidth){const q=project({x:0,y:0,z:-800});const size=Math.max(w,h*1.5)*1.3*(homeZ+800)/(camera.z+800);ctx.globalAlpha=.65;ctx.drawImage(galaxy,q.x-size*.48,q.y-size/3,size,size/1.5);ctx.globalAlpha=1;}
 const vignette=ctx.createRadialGradient(w*.5,h*.5,h*.1,w*.5,h*.5,Math.max(w,h)*.7);vignette.addColorStop(0,'rgba(4,6,10,.10)');vignette.addColorStop(1,'rgba(4,6,10,.92)');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
 for(const p of stars){if(camera.z-p.z<90)continue;const q=project(p);if(q.x<0||q.y<0||q.x>w||q.y>h)continue;ctx.globalAlpha=p.a;ctx.fillStyle=p.c;const s=Math.min(2.5,p.s*q.scale);ctx.fillRect(q.x,q.y,s,s);}ctx.globalAlpha=1;
 const core=project({x:0,y:0,z:0});origin.style.left=core.x+'px';origin.style.top=core.y+'px';origin.style.transform='translate(-50%,-50%) scale('+clamp(core.scale,.85,1.3)+')';origin.style.opacity=travel?1-smooth(travel.p):1;
 destinations.forEach(d=>{const r=beaconRect(d);d.el.style.left=r.x+'px';d.el.style.top=r.y+'px';d.el.style.width=r.width+'px';d.el.style.height=r.height+'px';d.el.style.opacity=travel?(travel.d===d?0:1-smooth(travel.p)):1;});
 status.textContent=travel?travel.d.name.toUpperCase()+' / '+Math.round(travel.p*100)+'%':'CORE / '+Math.round(camera.x)+' : '+Math.round(camera.y);
}
function renderTravel(){
 const t=travel,e=smooth(t.p),r=beaconRect(t.d,t.from);
 for(const k of ['x','y','z'])camera[k]=mix(t.from[k],({x:t.d.x,y:t.d.y,z:t.d.z+280})[k],e);
 const left=mix(r.x,0,e),top=mix(r.y,0,e),width=mix(r.width,w,e),height=mix(r.height,h,e);
 dialog.style.clipPath='inset('+top+'px '+Math.max(0,w-left-width)+'px '+Math.max(0,h-top-height)+'px '+left+'px)';
 // One image persists from the destination thumbnail through the entire approach.
 hero.style.left=left+'px';hero.style.top=top+'px';hero.style.width=width+'px';hero.style.height=height+'px';
 dialog.style.setProperty('--arrival',clamp((t.p-.8)/.2,0,1));
 dialog.classList.toggle('arrived',t.p>=.999);
 if(t.p>=.999&&!t.settled){t.settled=true;dialog.style.clipPath='none';hero.removeAttribute('style');content.inert=false;closeButton.focus({preventScroll:true});}
}
function frame(now){raf=0;const dt=Math.min((now-previous)/1000,.05)||.016;previous=now;
 if(travel){const t=travel;if(!t.settled||t.goal<1){t.p=reduced?t.goal:mix(t.p,t.goal,1-Math.exp(-dt*5));if(Math.abs(t.p-t.goal)<.001)t.p=t.goal;renderTravel();if(t.p===0&&t.goal===0){finishExit();}}}
 else for(const k of ['x','y','z'])camera[k]=mix(camera[k],target[k],reduced?1:1-Math.exp(-dt*6));
 draw();
 const moving=travel?Math.abs(travel.p-travel.goal)>.0001:Object.keys(camera).some(k=>Math.abs(camera[k]-target[k])>.05);
 if(moving&&!document.hidden)wake();
}
function wake(){if(!raf&&!document.hidden)raf=requestAnimationFrame(frame);}
addEventListener('visibilitychange',wake);
function prepare(d){
 content.replaceChildren();scene=null;
 d.sections.forEach(selector=>{const source=document.querySelector('#archive '+selector);if(!source)return;const node=source.cloneNode(true);node.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));node.removeAttribute('id');content.append(node);});
 if(d.id==='live'){
  scene=document.createElement('section');scene.className='film-sequence';
  const stage=document.createElement('div');stage.className='film-stage';
  const frames=[['img/photos/p15-1600.webp','01 / THE SIGNAL','A pulse in the darkness.'],['img/photos/p04-1600.webp','02 / THE BODY','Sound becomes physical.'],['img/photos/p12-1600.webp','03 / THE SPACE','We disappear into it.']];
  frames.forEach(([src,label,line],i)=>{const frame=document.createElement('figure');frame.className='film-frame';const image=document.createElement('img');image.src=src;image.alt=line;image.loading='lazy';const caption=document.createElement('figcaption');const small=document.createElement('small');small.textContent=label;const text=document.createElement('p');text.textContent=line;caption.append(small,text);frame.append(image,caption);frame.style.opacity=i===0?1:0;stage.append(frame);});
  scene.append(stage);content.prepend(scene);
 }
 heroImage.src=d.image;heroTitle.replaceChildren();
 const eyebrow=document.createElement('p');eyebrow.textContent=d.note;const title=document.createElement('h2');title.textContent=d.title;heroTitle.append(eyebrow,title);
 document.querySelector('#destination-name').textContent=d.name;
 const following=destinations[(destinations.indexOf(d)+1)%destinations.length];next.textContent='Continue to '+following.name+' ↗';next.onclick=()=>navigate(following);
}
function begin(d,goal=1){
 if(travel?.d===d){travel.goal=goal;wake();return;}
 if(travel)finishExit(false);
 returnFocus=document.activeElement;prepare(d);travel={d,p:0,goal,from:{...camera},settled:false};
 content.inert=true;dialog.classList.remove('arrived');dialog.style.setProperty('--arrival',0);dialog.showModal();dialog.scrollTop=0;renderTravel();wake();
}
function updateFilm(){
 sceneFrame=0;if(!scene||!travel?.settled)return;
 const r=scene.getBoundingClientRect(),progress=clamp(-r.top/Math.max(1,r.height-h),0,1)*2;
 [...scene.querySelectorAll('.film-frame')].forEach((frame,i)=>{
  const opacity=i===0?1:clamp((progress-i+.4)/.4,0,1);
  frame.style.opacity=opacity;frame.setAttribute('aria-hidden',Math.round(progress)!==i);
  frame.querySelector('img').style.transform=reduced?'none':'scale('+mix(1.12,1,clamp(progress-i+1,0,1))+')';
 });
}
dialog.addEventListener('scroll',()=>{if(!sceneFrame)sceneFrame=requestAnimationFrame(updateFilm);},{passive:true});
function navigate(d,goal=1){if(location.hash!=='#'+d.id)history.pushState(null,'','#'+d.id);begin(d,goal);}
function exit(){if(!travel)return;history.pushState(null,'','#home');startExit();}
function startExit(){if(!travel)return;travel.settled=false;travel.goal=0;dialog.classList.remove('arrived');dialog.scrollTop=0;content.inert=true;wake();}
function finishExit(focus=true){if(!travel)return;const old=travel;Object.assign(camera,old.from);Object.assign(target,old.from);travel=null;dialog.close();dialog.classList.remove('arrived');dialog.style.clipPath='none';hero.removeAttribute('style');content.replaceChildren();scene=null;if(focus)(returnFocus?.isConnected?returnFocus:document.querySelector('#home')).focus({preventScroll:true});wake();}
function route(){const d=destinations.find(d=>d.id===location.hash.slice(1));if(d)begin(d);else if(travel)startExit();else{Object.assign(target,{x:0,y:0,z:homeZ});wake();}}
addEventListener('hashchange',route);
document.querySelectorAll('.flight-header a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const d=destinations.find(d=>'#'+d.id===a.hash);e.preventDefault();if(d)navigate(d);else home();}));
function home(){if(travel){exit();return;}history.pushState(null,'','#home');Object.assign(target,{x:0,y:0,z:homeZ});wake();}
closeButton.onclick=exit;dialog.addEventListener('cancel',e=>{e.preventDefault();exit();});document.querySelector('#home').onclick=home;
function zoom(delta){if(travel)return;target.z=clamp(target.z+delta,650,2200);wake();}
document.querySelector('#zoom-in').onclick=()=>zoom(-180);document.querySelector('#zoom-out').onclick=()=>zoom(180);
function wheelPixels(e){return e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?h:1);}
canvas.addEventListener('wheel',e=>{if(e.ctrlKey)return;e.preventDefault();const delta=wheelPixels(e);if(delta<=0){zoom(-delta*.5);return;}const d=destinations.reduce((best,d)=>Math.hypot(d.x-camera.x,d.y-camera.y)<Math.hypot(best.x-camera.x,best.y-camera.y)?d:best,destinations[0]);navigate(d,clamp(delta/900,.12,1));},{passive:false});
dialog.addEventListener('wheel',e=>{if(e.ctrlKey||!travel||travel.settled)return;e.preventDefault();travel.goal=clamp(travel.goal+wheelPixels(e)/900,0,1);if(travel.goal===0)history.replaceState(null,'','#home');wake();},{passive:false});
// Pointer capture preserves free exploration; two fingers control distance.
const pointers=new Map();let pinch=0;
canvas.addEventListener('pointerdown',e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';});
canvas.addEventListener('pointermove',e=>{const old=pointers.get(e.pointerId);if(!old||travel)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(pinch)zoom((pinch-distance)*3);pinch=distance;return;}const scale=camera.z/(Math.min(w,h)*1.3);target.x=clamp(target.x-(e.clientX-old.x)*scale,-2000,2000);target.y=clamp(target.y-(e.clientY-old.y)*scale,-1400,1400);wake();});
function release(e){pointers.delete(e.pointerId);pinch=0;canvas.style.cursor='grab';}canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
// Keyboard navigation remains available without pointer gestures.
addEventListener('keydown',e=>{if(dialog.open||/INPUT|TEXTAREA/.test(e.target.tagName))return;const keys={ArrowLeft:[-100,0],ArrowRight:[100,0],ArrowUp:[0,-100],ArrowDown:[0,100]};if(keys[e.key]){e.preventDefault();target.x=clamp(target.x+keys[e.key][0],-2000,2000);target.y=clamp(target.y+keys[e.key][1],-1400,1400);wake();}});
resize();route();
})();
