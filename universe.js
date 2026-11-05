(() => {
'use strict';
const canvas=document.querySelector('#cosmos'),ctx=canvas.getContext('2d');
if(!ctx){location.replace('classic.html');return;}
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const world=document.querySelector('#world'),origin=document.querySelector('#origin'),dialog=document.querySelector('#destination'),content=document.querySelector('#content');
let w=innerWidth,h=innerHeight,seed=42;
const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const camera={x:0,y:0,z:1100},target={...camera};
const destinations=[
{id:'releases',name:'RELEASES',note:'14 transmissions / 2013 — 2026',x:650,y:100,z:80,sections:['.latest','.disco','.elsewhere']},
{id:'live',name:'LIVE',note:'Sound & light / in the dark',x:100,y:-430,z:-100,sections:['.live']},
{id:'about',name:'ABOUT',note:'The source / Istanbul',x:-630,y:60,z:50,sections:['.about']},
{id:'contact',name:'CONTACT',note:'Send a signal',x:80,y:440,z:0,sections:['.contact']}];
destinations.forEach(d=>{d.el=document.createElement('button');d.el.className='beacon';d.el.textContent=d.name;const sub=document.createElement('span');sub.textContent=d.note;d.el.append(sub);d.el.onclick=()=>location.hash=d.id;world.append(d.el);});
const stars=Array.from({length:matchMedia('(pointer:coarse)').matches?2400:6500},()=>{
const r=Math.pow(rand(),.65)*2200,a=rand()*Math.PI*2,arm=Math.floor(rand()*3)*Math.PI*2/3,angle=a*.22+arm+r*.003;
return {x:Math.cos(angle)*r,y:Math.sin(angle)*r*.43+(rand()-.5)*r*.22,z:(rand()-.5)*420,s:rand()*1.5+.3,c:rand()>.65?'#b0c4df':'#e5b99b',a:rand()*.65+.15};
});
const distant=Array.from({length:450},()=>({x:(rand()-.5)*9000,y:(rand()-.5)*6000,z:-1000-rand()*2200,s:rand()+.4,c:'#c6cfdf',a:rand()*.6}));
const clouds=Array.from({length:100},()=>{const r=rand()*1800,a=r*.003+Math.floor(rand()*3)*Math.PI*2/3;return{x:Math.cos(a)*r,y:Math.sin(a)*r*.43,z:-180+rand()*180,r:100+rand()*240,blue:rand()>.7};});
function resize(){w=innerWidth;h=innerHeight;const dpr=Math.min(devicePixelRatio||1,1.6);canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);}
addEventListener('resize',resize);resize();
function project(p){const depth=Math.max(100,camera.z-p.z),scale=Math.min(w,h)*1.3/depth;return{x:w/2+(p.x-camera.x)*scale,y:h/2+(p.y-camera.y)*scale,scale};}
let previous=0,raf;
function frame(now){raf=0;const dt=Math.min((now-previous)/1000,.05)||.016;previous=now;const ease=reduced?1:1-Math.exp(-dt*5);
for(const k of ['x','y','z'])camera[k]+=(target[k]-camera[k])*ease;
ctx.fillStyle='#05060a';ctx.fillRect(0,0,w,h);
ctx.globalCompositeOperation='screen';
for(const p of clouds){const q=project(p),r=p.r*q.scale;if(q.x+r<0||q.x-r>w||q.y+r<0||q.y-r>h)continue;const g=ctx.createRadialGradient(q.x,q.y,0,q.x,q.y,r);g.addColorStop(0,p.blue?'rgba(50,73,110,.045)':'rgba(146,72,45,.055)');g.addColorStop(.4,'rgba(75,45,43,.025)');g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(q.x-r,q.y-r,2*r,2*r);}
for(const p of distant.concat(stars)){const q=project(p);if(q.x<0||q.y<0||q.x>w||q.y>h)continue;ctx.globalAlpha=p.a;ctx.fillStyle=p.c;const s=Math.min(3,p.s*q.scale);ctx.fillRect(q.x,q.y,s,s);}
ctx.globalAlpha=1;
const core=project({x:0,y:0,z:0}),r=220*core.scale,g=ctx.createRadialGradient(core.x,core.y,0,core.x,core.y,r);g.addColorStop(0,'rgba(255,218,168,.23)');g.addColorStop(.12,'rgba(212,142,95,.10)');g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(core.x-r,core.y-r,2*r,2*r);
ctx.globalCompositeOperation='source-over';
origin.style.left=core.x+'px';origin.style.top=core.y+'px';origin.style.transform='translate(-50%,-50%) scale('+Math.min(1.3,core.scale)+')';origin.style.opacity=Math.max(0,1-Math.hypot(camera.x,camera.y)/800);
destinations.forEach(d=>{const q=project(d);d.el.style.left=q.x+'px';d.el.style.top=q.y+'px';d.el.style.visibility=q.x < -100||q.x>w+100||q.y < -50||q.y>h+50?'hidden':'visible';});
document.querySelector('#coordinates').textContent=Math.round(camera.x)+' / '+Math.round(camera.y)+' / '+Math.round(camera.z);
if(!document.hidden&&!dialog.open&&(!reduced||Math.abs(target.x-camera.x)+Math.abs(target.y-camera.y)+Math.abs(target.z-camera.z)>.1))raf=requestAnimationFrame(frame);
}
function wake(){if(!raf)raf=requestAnimationFrame(frame);}
addEventListener('visibilitychange',()=>{if(!document.hidden)wake();});
let drag=null;
canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';});
canvas.addEventListener('pointermove',e=>{if(!drag)return;const scale=camera.z/(Math.min(w,h)*1.3);target.x=Math.max(-2200,Math.min(2200,target.x-(e.clientX-drag.x)*scale));target.y=Math.max(-1500,Math.min(1500,target.y-(e.clientY-drag.y)*scale));drag={x:e.clientX,y:e.clientY};wake();});
function stop(){drag=null;canvas.style.cursor='grab';}
canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);
function zoom(delta){target.z=Math.max(550,Math.min(2400,target.z+delta));wake();}
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY*.6);},{passive:false});
document.querySelector('#zoom-in').onclick=()=>zoom(-200);document.querySelector('#zoom-out').onclick=()=>zoom(200);
let timer,returnFocus;
function route(){clearTimeout(timer);const id=location.hash.slice(1),d=destinations.find(d=>d.id===id);if(dialog.open)dialog.close();if(!d){Object.assign(target,{x:0,y:0,z:1100});wake();return;}
returnFocus=document.activeElement;Object.assign(target,{x:d.x,y:d.y,z:850});wake();
timer=setTimeout(()=>{content.replaceChildren();for(const selector of d.sections){const node=document.querySelector('#archive '+selector).cloneNode(true);content.append(node);}document.querySelector('#destination-name').textContent=d.name;dialog.showModal();dialog.scrollTop=0;document.querySelector('#close').focus();},reduced?0:850);
}
function close(){location.hash='home';returnFocus?.focus();}
document.querySelector('#close').onclick=close;
dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
document.querySelector('#home').onclick=()=>{location.hash='home';route();};
addEventListener('hashchange',route);wake();if(location.hash)route();
})();