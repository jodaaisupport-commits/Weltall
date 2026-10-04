import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ============ CONFIG ============ */
const GRID = 12, TILE = 2;
const SAVE_KEY = 'weltall-tycoon-v1';

const BUILDINGS = {
  hq:      { name:'👑 Kommandozentrale', icon:'👑', desc:'Herz deines Imperiums. +Steuern & schaltet alles frei.', base:{credits:0}, prod:{credits:2}, energy:0, pop:0, color:0xffd23e },
  solar:   { name:'☀️ Solarpanel', icon:'☀️', desc:'+6 Energie. Basis jeder Expansion. Braucht keine Energie.', base:{credits:50}, prod:{energy:6}, energy:0, pop:0, color:0x4cc9ff },
  mine:    { name:'⛏️ Erz-Mine', icon:'⛏️', desc:'Bohrt Voxel-Erz. +3 Erz /s. Verbraucht 2⚡.', base:{credits:120}, prod:{erz:3}, energy:-2, pop:0, color:0xd97b3f },
  crystal: { name:'💎 Kristall-Bohrer', icon:'💎', desc:'Seltene Kristalle. +1 Kristall /s. Verbraucht 4⚡.', base:{credits:400,erz:20}, prod:{kristall:1}, energy:-4, pop:0, color:0xb388ff },
  habitat: { name:'🏠 Wohnmodul', icon:'🏠', desc:'+8 Einwohner. Einwohner zahlen Steuern (⏣). Verbraucht 1⚡.', base:{credits:150,erz:10}, prod:{}, energy:-1, pop:8, color:0x4ade80 },
  labor:   { name:'🔬 Labor', icon:'🔬', desc:'+1 Forschung /s. Schaltet Upgrades frei. Verbraucht 3⚡.', base:{credits:350,erz:30}, prod:{forschung:1}, energy:-3, pop:0, color:0x7ef9ff },
  trade:   { name:'💰 Handelsstation', icon:'💰', desc:'Verkauft auto: 1 Erz→4⏣, 1 Kristall→18⏣. Verbraucht 2⚡.', base:{credits:500,erz:40}, prod:{credits:4}, energy:-2, pop:0, autoTrade:true, color:0xffd23e },
  rocket:  { name:'🚀 Raketenrampe', icon:'🚀', desc:'Klick → Expedition starten (20s): Beute bis 800⏣ + XP. Verbraucht 5⚡.', base:{credits:800,erz:80,kristall:5}, prod:{}, energy:-5, pop:0, action:true, color:0xff5d5d },
  shield:  { name:'🛡️ Schildgenerator', icon:'🛡️', desc:'+50% Produktion im Umkreis + schicker Schirm. Verbraucht 3⚡.', base:{credits:600,kristall:8}, prod:{}, energy:-3, pop:0, boost:true, color:0x4cc9ff },
  farm:    { name:'🌱 Bio-Kuppel', icon:'🌱', desc:'+4 Einwohner, +1⏣/s Steuern, hübsch. Verbraucht 1⚡.', base:{credits:250,erz:15}, prod:{credits:1}, energy:-1, pop:4, color:0x7bff9e },
};

const QUESTS = [
  { id:'q1', text:'Baue 2 Solarpanels', check:s=>count('solar')>=2, prog:s=>Math.min(count('solar'),2)+'/2', reward:{credits:200} },
  { id:'q2', text:'Baue 2 Erz-Minen', check:s=>count('mine')>=2, prog:s=>Math.min(count('mine'),2)+'/2', reward:{credits:300,erz:20} },
  { id:'q3', text:'Erreiche 12 Einwohner', check:s=>s.pop>=12, prog:s=>Math.min(s.pop,12)+'/12', reward:{credits:400} },
  { id:'q4', text:'Baue ein Labor', check:s=>count('labor')>=1, prog:s=>count('labor')+'/1', reward:{forschung:10,credits:300} },
  { id:'q5', text:'Besitze 1000 Credits', check:s=>s.credits>=1000, prog:s=>Math.floor(Math.min(s.credits,1000))+'/1000', reward:{kristall:5} },
  { id:'q6', text:'Baue Handelsstation + Raketenrampe', check:s=>count('trade')>=1&&count('rocket')>=1, prog:s=>(count('trade')+count('rocket'))+'/2', reward:{credits:1200} },
  { id:'q7', text:'Erreiche Level 5', check:s=>s.level>=5, prog:s=>s.level+'/5', reward:{credits:2000,kristall:10} },
];

/* ============ STATE ============ */
let S = freshState();
function freshState(){
  return { credits:350, erz:20, kristall:0, forschung:0, energie:0, pop:0, popCap:6,
    level:1, xp:0, totalEarned:0, speed:1, sound:true, rotate:false, questsDone:[], built:{}, sel:null, buildMode:null };
}
function count(t){ let n=0; for(const k in grid) if(grid[k]?.type===t) n++; return n; }
function load(){ try{ const r=localStorage.getItem(SAVE_KEY); if(r){ const d=JSON.parse(r); if(!localStorage.getItem(SAVE_KEY+'-hide-tut')){} S={...freshState(),...d}; } }catch{} }
function save(){ try{ const {sel,buildMode,...rest}=S; localStorage.setItem(SAVE_KEY,JSON.stringify(rest)); localStorage.setItem(SAVE_KEY+'-grid',JSON.stringify(serializeGrid())); }catch{} }
function serializeGrid(){ const o={}; for(const k in grid){ const c=grid[k]; if(c) o[k]={type:c.type,level:c.level}; } return o; }

/* ============ AUDIO ============ */
let AC=null;
function beep(f=600,d=.08,type='square',v=.06){ if(!S.sound) return; try{ AC=AC||new (window.AudioContext||window.webkitAudioContext)(); const o=AC.createOscillator(),g=AC.createGain(); o.type=type;o.frequency.value=f;g.gain.value=v;o.connect(g);g.connect(AC.destination);o.start();g.gain.exponentialRampToValueAtTime(.0001,AC.currentTime+d);o.stop(AC.currentTime+d);}catch{} }
const sfx={ build:()=>{beep(300,.1);setTimeout(()=>beep(500,.12),90)}, coin:()=>beep(950,.07,'square',.05), err:()=>beep(140,.2,'sawtooth',.07), up:()=>{beep(500,.08);setTimeout(()=>beep(750,.1),80)}, quest:()=>{[660,880,1100].forEach((f,i)=>setTimeout(()=>beep(f,.12),i*110))}, launch:()=>{beep(150,.6,'sawtooth',.09);setTimeout(()=>beep(600,.4,'square',.06),400)} };

/* ============ THREE SETUP ============ */
const canvas=document.getElementById('scene');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFShadowMap;
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x04060f);
scene.fog=new THREE.Fog(0x04060f,90,220);
const camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.1,600);
camera.position.set(17,15,17);
const controls=new OrbitControls(camera,renderer.domElement);
controls.target.set(0,1,0);
controls.enableDamping=true; controls.maxPolarAngle=Math.PI/2.05; controls.minDistance=8; controls.maxDistance=90;
controls.autoRotate=false; controls.autoRotateSpeed=.8;

scene.add(new THREE.AmbientLight(0xaabbff,.95));
const hemi=new THREE.HemisphereLight(0x4cc9ff,0x2a1f3a,.9); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff2cc,2.2);
sun.position.set(30,40,10); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-30;sun.shadow.camera.right=30;sun.shadow.camera.top=30;sun.shadow.camera.bottom=-30;
scene.add(sun);
const rim=new THREE.PointLight(0xb388ff,60,120); rim.position.set(-25,10,-25); scene.add(rim);

/* Stars */
function makeStars(){
  const g=new THREE.BufferGeometry(), N=2500, pos=new Float32Array(N*3), col=new Float32Array(N*3);
  const c=new THREE.Color();
  for(let i=0;i<N;i++){ const r=180+Math.random()*180, th=Math.random()*Math.PI*2, ph=Math.acos(2*Math.random()-1);
    pos[i*3]=r*Math.sin(ph)*Math.cos(th); pos[i*3+1]=Math.abs(r*Math.cos(ph))-20; pos[i*3+2]=r*Math.sin(ph)*Math.sin(th);
    c.setHSL(Math.random()<.15?.55+Math.random()*.15:Math.random(),.8,.6+Math.random()*.35);
    col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b; }
  g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('color',new THREE.BufferAttribute(col,3));
  scene.add(new THREE.Points(g,new THREE.PointsMaterial({size:1.1,vertexColors:true,sizeAttenuation:false,transparent:true,opacity:.95})));
}
makeStars();

/* Nebula sprites (canvas) */
function nebula(color,x,y,z,s){
  const cv=document.createElement('canvas');cv.width=cv.height=128;const ctx=cv.getContext('2d');
  const gr=ctx.createRadialGradient(64,64,4,64,64,64);gr.addColorStop(0,color+'cc');gr.addColorStop(1,color+'00');
  ctx.fillStyle=gr;ctx.fillRect(0,0,128,128);
  const t=new THREE.CanvasTexture(cv);const m=new THREE.SpriteMaterial({map:t,transparent:true,opacity:.5,depthWrite:false});
  const sp=new THREE.Sprite(m);sp.position.set(x,y,z);sp.scale.set(s,s,1);scene.add(sp);
}
nebula('#7b2ff7',-120,40,-100,140); nebula('#00c3ff',130,20,-80,120); nebula('#ff2f92',20,60,-150,160);

/* Voxel planets */
function voxelPlanet(x,y,z,r,base,spot){
  const grp=new THREE.Group();
  const n=Math.max(5,Math.round(r*1.4));
  for(let ix=-n;ix<=n;ix++)for(let iy=-n;iy<=n;iy++)for(let iz=-n;iz<=n;iz++){
    const d=Math.sqrt(ix*ix+iy*iy+iz*iz);
    if(d>n||d<n-1.4) continue;
    const s=r/n;
    const m=new THREE.Mesh(new THREE.BoxGeometry(s*.96,s*.96,s*.96),
      new THREE.MeshLambertMaterial({color:Math.random()<.18?spot:base}));
    m.position.set(ix*s,iy*s,iz*s); grp.add(m);
  }
  grp.position.set(x,y,z); scene.add(grp); return grp;
}
const planets=[voxelPlanet(-70,25,-60,7,0x3fa7ff,0x9be7ff),voxelPlanet(75,35,-70,9,0xff7b4d,0xffd23e),voxelPlanet(10,55,-130,6,0xb388ff,0xead9ff)];

/* ============ PIXEL TEXTURES ============ */
function pixTex(base,fn){
  const s=16,cv=document.createElement('canvas');cv.width=cv.height=s;const x=cv.getContext('2d');
  x.fillStyle=base;x.fillRect(0,0,s,s);
  const c=new THREE.Color(base);
  for(let i=0;i<s;i++)for(let j=0;j<s;j++){
    const v=(Math.random()-.5)*44;
    const r=Math.max(0,Math.min(255,Math.round(c.r*255+v)));
    const g=Math.max(0,Math.min(255,Math.round(c.g*255+v)));
    const b=Math.max(0,Math.min(255,Math.round(c.b*255+v)));
    x.fillStyle=`rgb(${r},${g},${b})`;
    x.fillRect(i,j,1,1);
  }
  if(fn)fn(x,s);
  const t=new THREE.CanvasTexture(cv);t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;t.colorSpace=THREE.SRGBColorSpace;return t;
}
const TEX={
  top: pixTex('#5d8a6b',(x,s)=>{x.fillStyle='#5df2b8aa';for(let i=0;i<30;i++)x.fillRect(Math.random()*s|0,Math.random()*s|0,2,1);x.fillStyle='#2a4a38';for(let i=0;i<12;i++)x.fillRect(Math.random()*s|0,Math.random()*s|0,1,1);}),
  side: pixTex('#3d4468',(x,s)=>{x.fillStyle='#4cc9ff55';x.fillRect(0,2,s,2);x.fillStyle='#00000055';for(let i=0;i<s;i+=4)x.fillRect(i,6,1,s);}),
  bottom: pixTex('#141726'),
  metal: pixTex('#8a93b2'),
  dark: pixTex('#232842'),
  gold: pixTex('#ffd23e'),
  solar: pixTex('#123a8f',(x,s)=>{x.fillStyle='#4cc9ff';for(let i=0;i<s;i+=4){x.fillRect(i,0,1,s);x.fillRect(0,i,s,1);}x.fillStyle='#bfe9ff';for(let i=0;i<10;i++)x.fillRect(Math.random()*s|0,Math.random()*s|0,2,1);}),
  rust: pixTex('#a3552e'),
  crystal: pixTex('#b388ff',(x,s)=>{x.fillStyle='#fff';for(let i=0;i<14;i++)x.fillRect(Math.random()*s|0,Math.random()*s|0,1,1);}),
  leaf: pixTex('#2f9e5f'),
  white: pixTex('#dfe6ff'),
};

/* ============ BASE PLATFORM ============ */
const grid={}; const tileMeshes={};
const baseGroup=new THREE.Group(); scene.add(baseGroup);
const hoverBox=new THREE.Mesh(new THREE.BoxGeometry(TILE*.98,.3,TILE*.98),
  new THREE.MeshBasicMaterial({color:0x5df2b8,transparent:true,opacity:.45}));
hoverBox.visible=false; scene.add(hoverBox);

function tileKey(ix,iz){return ix+','+iz;}
function tilePos(ix,iz){return {x:(ix-(GRID-1)/2)*TILE, z:(iz-(GRID-1)/2)*TILE};}

function buildPlatform(){
  const topM=new THREE.MeshLambertMaterial({map:TEX.top});
  const sideM=new THREE.MeshLambertMaterial({map:TEX.side});
  const botM=new THREE.MeshLambertMaterial({map:TEX.bottom});
  const mats=[sideM,sideM,topM,botM,sideM,sideM];
  for(let ix=0;ix<GRID;ix++)for(let iz=0;iz<GRID;iz++){
    const {x,z}=tilePos(ix,iz);
    const t=new THREE.Mesh(new THREE.BoxGeometry(TILE,1,TILE),mats);
    t.position.set(x,-.5,z); t.receiveShadow=true; t.userData={ix,iz};
    baseGroup.add(t); tileMeshes[tileKey(ix,iz)]=t;
    // under-rock (random voxel stalactite)
    if(Math.random()<.8){
      const h=1+Math.random()*3|0;
      for(let k=0;k<h;k++){
        const r=new THREE.Mesh(new THREE.BoxGeometry(TILE*(.7-k*.12),1,TILE*(.7-k*.12)),
          new THREE.MeshLambertMaterial({color:Math.random()<.2?0x4cc9ff:0x232842}));
        r.position.set(x+(Math.random()-.5)*.4,-1.5-k,z+(Math.random()-.5)*.4);
        baseGroup.add(r);
      }
    }
  }
  // rim lights
  const half=GRID*TILE/2;
  [[-half,0],[half,0],[0,-half],[0,half]].forEach(([x,z])=>{
    const l=new THREE.PointLight(0x5df2b8,12,20); l.position.set(x*.9,2,z*.9); scene.add(l);
  });
  // glow ring
  const ring=new THREE.Mesh(new THREE.TorusGeometry(half+3,.18,8,64),
    new THREE.MeshBasicMaterial({color:0x5df2b8,transparent:true,opacity:.7}));
  ring.rotation.x=Math.PI/2; ring.position.y=-.6; scene.add(ring);
}
buildPlatform();

/* ============ VOXEL BUILDERS ============ */
function box(w,h,d,mat,x=0,y=0,z=0,shadow=true){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  m.position.set(x,y,z); m.castShadow=shadow; m.receiveShadow=true; return m;
}
const M=(c,e=0)=>new THREE.MeshLambertMaterial({color:c,emissive:e});
const ME=(c,e,ei=.7)=>new THREE.MeshLambertMaterial({color:c,emissive:e,emissiveIntensity:ei});
const MT=(t)=>new THREE.MeshLambertMaterial({map:t});

function makeBuilding(type){
  const g=new THREE.Group(); g.userData.anim={t:Math.random()*10,type};
  const L=(lvl)=>1+(lvl-1)*.18;
  if(type==='hq'){
    g.add(box(2.6,.5,2.6,MT(TEX.dark),0,.25,0));
    g.add(box(1.8,1.4,1.8,MT(TEX.metal),0,1.2,0));
    g.add(box(2,.4,2,M(0xffd23e),0,2.1,0));
    g.add(box(1.2,1,1.2,M(0x2b3f8f),0,2.8,0));
    const glow=box(1.25,.2,1.25,ME(0x4cc9ff,0x4cc9ff),0,2.55,0,false); g.add(glow);
    g.add(box(.35,1.2,.35,M(0x8a93b2),0,3.7,0));
    const orb=box(.55,.55,.55,ME(0x5df2b8,0x5df2b8,1),0,4.5,0,false); orb.name='orb'; g.add(orb);
    // corner lights
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a,b])=>g.add(box(.25,.7,.25,ME(0x5df2b8,0x5df2b8,.8),a*1.2,.85,b*1.2,false)));
  }
  else if(type==='solar'){
    g.add(box(1.6,.3,1.6,MT(TEX.dark),0,.35,0));
    g.add(box(.3,1,.3,M(0x8a93b2),0,1,0));
    const panel=new THREE.Group(); panel.name='panel';
    panel.add(box(2.4,.15,1.8,MT(TEX.solar),0,0,0));
    panel.add(box(2.5,.08,1.9,M(0x232842),0,-.1,0));
    panel.position.y=1.7; panel.rotation.x=-.5; g.add(panel);
  }
  else if(type==='mine'){
    g.add(box(2,.5,2,MT(TEX.rust),0,.25,0));
    g.add(box(1.4,.8,1.4,M(0x5a3418),0,.9,0));
    const drill=new THREE.Group(); drill.name='drill';
    drill.add(box(.4,1.6,.4,M(0x8a93b2),0,0,0));
    drill.add(box(.7,.5,.7,ME(0xffb347,0xff6a00,.9),0,-1,0,false));
    drill.position.y=2; g.add(drill);
    g.add(box(.9,1.1,.3,M(0x232842),-.6,1.2,.8));
    g.add(box(.5,.5,.5,ME(0xffd23e,0xffd23e,.8),.5,1.5,.5,false));
    // ore pile
    for(let i=0;i<4;i++) g.add(box(.4,.4,.4,M(0xd97b3f),.9+Math.random()*.5,.2,-.6+Math.random()*.8));
  }
  else if(type==='crystal'){
    g.add(box(2,.4,2,MT(TEX.dark),0,.2,0));
    const crys=new THREE.Group(); crys.name='crys';
    [[0,0,1.4,0xb388ff],[-.6,.2,.9,0x7ef9ff],[.6,.1,1,0xe0aaff]].forEach(([x,y,h,c])=>{
      const m=box(.45,h,.45,ME(c,c,.9),x,y+h/2,0,false); m.rotation.y=.4; crys.add(m);
    });
    g.add(crys);
    g.add(box(1.8,.25,1.8,ME(0xb388ff,0x6a3df5,.5),0,.5,0,false));
  }
  else if(type==='habitat'){
    g.add(box(2.2,.4,2.2,MT(TEX.dark),0,.2,0));
    g.add(box(1.9,1.2,1.4,MT(TEX.white),0,1,0));
    g.add(box(2,.3,1.5,M(0x4ade80),0,1.75,0));
    for(let i=-1;i<=1;i++) g.add(box(.4,.5,.1,ME(0xffe9a3,0xffd23e,.7),i*.6,1,.72,false));
    g.add(box(.5,.9,.2,M(0x232842),0,.65,.72));
    g.add(box(.3,.5,.3,ME(0x5df2b8,0x5df2b8),.8,2.1,0,false));
  }
  else if(type==='labor'){
    g.add(box(2,.4,2,MT(TEX.dark),0,.2,0));
    g.add(box(1.2,1.8,1.2,MT(TEX.white),-.4,1.3,0));
    const dome=box(1.1,.7,1.1,ME(0x7ef9ff,0x1899bb,.8),.55,1.1,.4,false); dome.name='dome'; g.add(dome);
    g.add(box(.25,2.2,.25,M(0x8a93b2),.55,1.5,.4));
    g.add(box(.2,.9,1.6,ME(0x7ef9ff,0x7ef9ff,.6),-.4,1.4,0,false));
  }
  else if(type==='trade'){
    g.add(box(2.2,.4,2.2,M(0x3a2f10),0,.2,0));
    g.add(box(1.6,1,1.6,MT(TEX.gold),0,.9,0));
    g.add(box(1.7,.25,1.7,M(0x232842),0,1.55,0));
    const beam=box(.35,4,.35,ME(0xffd23e,0xffd23e,1),0,3,0,false); beam.name='beam'; g.add(beam);
    g.add(box(.8,.5,.8,ME(0x5df2b8,0x5df2b8),0,1.9,0,false));
  }
  else if(type==='rocket'){
    g.add(box(2.4,.4,2.4,MT(TEX.dark),0,.2,0));
    g.add(box(1.6,.3,1.6,M(0xff5d5d),0,.55,0));
    const rk=new THREE.Group(); rk.name='rocket';
    rk.add(box(.8,1.6,.8,MT(TEX.white),0,0,0));
    rk.add(box(.82,.4,.82,M(0xff5d5d),0,-.6,0));
    rk.add(box(.4,.5,.4,M(0xff5d5d),0,1,0));
    rk.add(box(.3,.5,.1,M(0x232842),0,.2,.42));
    [[-.55,0],[.55,0],[0,-.55],[0,.55]].forEach(([a,b])=>rk.add(box(.25,.6,.25,M(0x232842),a,-.7,b)));
    rk.position.y=1.6; g.add(rk);
    const flame=box(.5,.6,.5,ME(0xffb347,0xff6a00,1.2),0,.5,0,false); flame.name='flame'; flame.visible=false; rk.add(flame);
  }
  else if(type==='shield'){
    g.add(box(1.4,.4,1.4,MT(TEX.dark),0,.2,0));
    g.add(box(.8,1.2,.8,M(0x2b3f8f),0,1,0));
    g.add(box(.4,.5,.4,ME(0x4cc9ff,0x4cc9ff,1),0,1.9,0,false));
    const dome=new THREE.Mesh(new THREE.SphereGeometry(1.9,12,10,0,Math.PI*2,0,Math.PI/2.2),
      new THREE.MeshBasicMaterial({color:0x4cc9ff,transparent:true,opacity:.16,side:THREE.DoubleSide,depthWrite:false}));
    dome.position.y=0; dome.name='shield'; g.add(dome);
  }
  else if(type==='farm'){
    g.add(box(2.2,.35,2.2,MT(TEX.dark),0,.17,0));
    const dome=new THREE.Mesh(new THREE.SphereGeometry(1.1,14,10,0,Math.PI*2,0,Math.PI/2),
      new THREE.MeshPhysicalMaterial({color:0xbfe9ff,transparent:true,opacity:.35,roughness:.1}));
    dome.position.y=.35; g.add(dome);
    for(let i=0;i<5;i++) g.add(box(.25,.5,.25,ME(0x4ade80,0x1d7a44,.5),-.7+Math.random()*1.4,.6,-.5+Math.random(),false));
    g.add(box(.3,.4,.3,M(0x8a5a2b),.3,.5,.3));
  }
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;}});
  return g;
}

/* astronaut + rover */
let astro, rover;
function makeAstro(){
  astro=new THREE.Group();
  const suit=M(0xf2f5ff), visor=ME(0x4cc9ff,0x4cc9ff,.9), acc=M(0xff8c42);
  astro.add(box(.6,.7,.35,suit,0,.95,0));
  astro.add(box(.5,.5,.4,suit,0,1.6,0));
  astro.add(box(.4,.3,.05,visor,0,1.62,.22,false));
  astro.add(box(.2,.6,.2,suit,-.42,.95,0)); astro.add(box(.2,.6,.2,suit,.42,.95,0));
  astro.add(box(.22,.55,.22,acc,-.2,.3,0)); astro.add(box(.22,.55,.22,acc,.2,.3,0));
  astro.add(box(.25,.5,.1,acc,0,1,-.25));
  scene.add(astro);
}
function makeRover(){
  rover=new THREE.Group();
  rover.add(box(1.2,.4,.8,M(0xffd23e),0,.5,0));
  rover.add(box(.7,.4,.7,M(0x232842),-.1,.85,0));
  rover.add(box(.5,.2,.1,ME(0x4cc9ff,0x4cc9ff),-.1,.85,.38,false));
  [[-.4,-.5],[.4,-.5],[-.4,.5],[.4,.5]].forEach(([a,b])=>{
    const w=box(.35,.35,.25,M(0x141726),a,.25,b); rover.add(w);
  });
  scene.add(rover);
}
makeAstro(); makeRover();
let astroT=0, roverT=0;

/* particles */
const particles=[];
function burst(pos,color,n=14,spread=2.4,up=4){
  for(let i=0;i<n;i++){
    const m=new THREE.Mesh(new THREE.BoxGeometry(.16,.16,.16),new THREE.MeshBasicMaterial({color}));
    m.position.copy(pos);
    m.userData.v=new THREE.Vector3((Math.random()-.5)*spread,Math.random()*up,(Math.random()-.5)*spread);
    m.userData.life=1;
    scene.add(m); particles.push(m);
  }
}

/* ============ GAME LOGIC ============ */
load();
const savedGrid=(()=>{try{return JSON.parse(localStorage.getItem(SAVE_KEY+'-grid')||'{}')}catch{return{}}})();

function placeBuilding(ix,iz,type,level=1,animate=true){
  const key=tileKey(ix,iz);
  if(grid[key]) scene.remove(grid[key].mesh);
  const {x,z}=tilePos(ix,iz);
  const mesh=makeBuilding(type);
  mesh.position.set(x,0,z);
  const s=1+(level-1)*.12; mesh.scale.set(s,s,s);
  scene.add(mesh);
  grid[key]={type,level,mesh,ix,iz,cool:0};
  if(animate){ mesh.position.y=-3; burst(new THREE.Vector3(x,1,z),0x5df2b8,18); sfx.build(); }
}

function costOf(type,level=1){
  const b=BUILDINGS[type]; const mult=Math.pow(1.7,level-1);
  const o={};
  for(const k in b.base) o[k]=Math.ceil(b.base[k]*mult);
  if(level>1){ o.credits=Math.ceil((b.base.credits||100)*mult); if(!o.erz&&level>2)o.erz=Math.ceil(level*8); if(!o.kristall&&level>3)o.kristall=Math.ceil(level*2); }
  return o;
}
function canAfford(c){ for(const k in c) if((S[k]??0)<c[k]) return false; return true; }
function pay(c){ for(const k in c) S[k]-=c[k]; }
function costText(c){
  return Object.entries(c).map(([k,v])=>{
    const ic={credits:'⏣',erz:'🟧',kristall:'💎',forschung:'🔬'}[k]||k;
    return `${v}${ic}`;
  }).join(' · ');
}

function economyTick(dt){
  let prod={credits:0,erz:0,kristall:0,forschung:0,energy:0};
  let eUse=0,eProd=0,popCap=6,pop=0;
  for(const k in grid){
    const c=grid[k]; if(!c)continue;
    const b=BUILDINGS[c.type]; const m=c.level;
    const boost=nearShield(c)?1.5:1;
    for(const r in (b.prod||{})){
      let v=b.prod[r]*m*boost;
      if(r==='energy') eProd+=v; else prod[r]=(prod[r]||0)+v;
    }
    if(b.energy<0) eUse+=-b.energy*m;
    if(b.pop) popCap+=b.pop*m;
    if(b.autoTrade){ /* handled below */ }
  }
  const energyOK=eProd>=eUse;
  const eff=energyOK?1:.4;
  S.energie=Math.max(0,Math.min(9999,S.energie+(eProd-eUse)*dt*eff));
  // auto-trade: sell resources
  let tradeBonus=0;
  for(const k in grid){
    const c=grid[k];
    if(c&&BUILDINGS[c.type].autoTrade){
      const sellErz=Math.min(S.erz,5*c.level*dt*eff), sellK=Math.min(S.kristall,2*c.level*dt*eff);
      S.erz-=sellErz; S.kristall-=sellK;
      tradeBonus+=sellErz*4+sellK*18;
    }
  }
  S.pop=Math.min(popCap,popCap); // pop fills cap over time below
  S.popCap=popCap;
  if(S.pop<popCap) S.pop=Math.min(popCap,S.pop+dt*.25);
  const taxes=S.pop*.12*eff;
  const gain=(prod.credits||0)*eff+taxes+tradeBonus;
  S.credits+=gain*dt; S.totalEarned+=gain*dt;
  S.erz=Math.max(0,S.erz+(prod.erz||0)*eff*dt);
  S.kristall=Math.max(0,S.kristall+(prod.kristall||0)*eff*dt);
  S.forschung=Math.max(0,S.forschung+(prod.forschung||0)*eff*dt);
  // XP
  addXP(gain*dt*.15+dt*.6);
  S._flow={eProd,eUse,energyOK,gain,tradeBonus,taxes};
}
function nearShield(c){
  for(const k in grid){ const o=grid[k]; if(o&&o.type==='shield'){
    const d=Math.hypot(o.ix-c.ix,o.iz-c.iz); if(d<=3) return true;
  }} return false;
}
function addXP(n){
  S.xp+=n;
  const need=S.level*100;
  if(S.xp>=need){ S.xp-=need; S.level++; S.credits+=S.level*150; S.forschung+=5;
    toast(`⬆ LEVEL ${S.level}! Bonus: +${S.level*150}⏣`,'gold'); sfx.quest(); burst(new THREE.Vector3(0,6,0),0xffd23e,30,6,8); }
}

/* quests */
function checkQuests(){
  QUESTS.forEach(q=>{
    if(S.questsDone.includes(q.id))return;
    if(q.check(S)){ S.questsDone.push(q.id);
      for(const k in q.reward) S[k]=(S[k]||0)+q.reward[k];
      toast(`🎯 Mission geschafft! +${costText(q.reward)}`,'gold'); sfx.quest();
    }
  });
}

/* ============ UI ============ */
const $=id=>document.getElementById(id);
function toast(msg,cls=''){
  const d=document.createElement('div'); d.className='toast '+cls; d.textContent=msg;
  $('toasts').appendChild(d); setTimeout(()=>{d.style.opacity='0';d.style.transition='.4s';setTimeout(()=>d.remove(),400)},2600);
}
function fmt(n){ if(n>=1e6)return (n/1e6).toFixed(1)+'M'; if(n>=1e4)return (n/1e3).toFixed(1)+'K'; return Math.floor(n).toString(); }

function renderResources(){
  const f=S._flow||{eProd:0,eUse:0,gain:0};
  const eBal=f.eProd-f.eUse;
  $('resources').innerHTML=`
    <div class="res gold"><div class="r-top">⏣ CREDITS</div><div class="r-val">${fmt(S.credits)}</div><div class="r-sub" style="color:var(--green)">+${f.gain.toFixed(1)}/s</div></div>
    <div class="res ${eBal<0?'neg':''}"><div class="r-top">⚡ ENERGIE</div><div class="r-val">${fmt(S.energie)}</div><div class="r-sub">${f.eProd.toFixed(0)}⚡ ⇄ ${f.eUse.toFixed(0)}⚡</div></div>
    <div class="res"><div class="r-top">🟧 ERZ</div><div class="r-val">${fmt(S.erz)}</div></div>
    <div class="res"><div class="r-top">💎 KRISTALL</div><div class="r-val">${fmt(S.kristall)}</div></div>
    <div class="res"><div class="r-top">🔬 FORSCHUNG</div><div class="r-val">${fmt(S.forschung)}</div></div>`;
  $('lvl-num').textContent=S.level;
  $('lvl-fill').style.width=Math.min(100,S.xp/(S.level*100)*100)+'%';
  $('lvl-text').textContent=`${Math.floor(S.xp)} / ${S.level*100} XP`;
  $('stat-pop').textContent=`👥 ${Math.floor(S.pop)}/${S.popCap}`;
  $('stat-income').textContent=`+${f.gain.toFixed(1)} ⏣/s`;
}

function renderBuildMenu(){
  const el=$('build-list'); el.innerHTML='';
  Object.entries(BUILDINGS).forEach(([key,b])=>{
    if(key==='hq')return;
    const lvl=(S.built[key]||1);
    const c=costOf(key, (window._ghostLevel?.[key])||1);
    // actual cost uses count-based scaling
    const owned=count(key);
    const cc=costOf(key,owned+1);
    const ok=canAfford(cc);
    const btn=document.createElement('button');
    btn.className='bcard'+(ok?'':' cant')+(S.buildMode===key?' selected':'');
    btn.innerHTML=`<div class="ico">${b.icon}</div>
      <div><b>${b.name}</b><small>${b.desc}</small><div class="cost">${costText(cc)}</div></div>
      <div class="build-btn">${owned>0?'x'+owned:'BAU'}</div>`;
    btn.onclick=()=>{ S.buildMode=S.buildMode===key?null:key; S.sel=null; hideInfo(); renderBuildMenu(); if(S.buildMode)toast(`${b.icon} Platziere: ${b.name} — klicke eine freie Kachel`); beep(700,.05); };
    el.appendChild(btn);
  });
}

function renderQuests(){
  $('quests').innerHTML=QUESTS.map(q=>{
    const done=S.questsDone.includes(q.id);
    return `<div class="quest ${done?'done':''}">${done?'✅':'🎯'} ${q.text}<br><small style="color:var(--dim)">${done?'Belohnung abgeholt':q.prog(S)+' • +'+costText(q.reward)}</small>${done?'':'<div class="q-bar"><i style="width:40%"></i></div>'}</div>`;
  }).join('');
}

/* selection */
const ray=new THREE.Raycaster(), mouse=new THREE.Vector2();
let downPos=null;
renderer.domElement.addEventListener('pointerdown',e=>{downPos=[e.clientX,e.clientY]});
renderer.domElement.addEventListener('pointerup',e=>{
  if(!downPos) return;
  const dx=e.clientX-downPos[0],dy=e.clientY-downPos[1];
  if(Math.hypot(dx,dy)>6) return; // was drag
  handleClick(e);
});
function handleClick(e){
  mouse.x=(e.clientX/innerWidth)*2-1; mouse.y=-(e.clientY/innerHeight)*2+1;
  ray.setFromCamera(mouse,camera);
  const tiles=Object.values(tileMeshes);
  const hits=ray.intersectObjects(tiles);
  // building meshes?
  const bMeshes=[]; for(const k in grid) if(grid[k]) bMeshes.push(grid[k].mesh);
  const bh=ray.intersectObjects(bMeshes,true);
  let cell=null;
  if(bh.length){ let o=bh[0].object; while(o&&!o.userData.cellKey){ if(o.parent&&grid[keyOf(o.parent.position)]){o=o.parent;break;} o=o.parent; }
    // find cell by position
    cell=cellFromPos(bh[0].point);
  }
  if(hits.length) cell={ix:hits[0].object.userData.ix,iz:hits[0].object.userData.iz};
  if(bh.length&&!hits.length) cell=cellFromPos(bh[0].point);
  if(!cell) return;
  const key=tileKey(cell.ix,cell.iz);
  const existing=grid[key];
  if(S.buildMode && !existing){ tryBuild(cell.ix,cell.iz,S.buildMode); }
  else if(existing){ selectCell(key); }
  else { // empty, no build mode: quick hint + ghost select
    S.sel=null; hideInfo();
    hoverBox.position.set(tilePos(cell.ix,cell.iz).x,.2,tilePos(cell.ix,cell.iz).z);
    hoverBox.visible=true; setTimeout(()=>hoverBox.visible=false,600);
  }
}
function keyOf(p){ return null; }
function cellFromPos(p){
  const ix=Math.round(p.x/TILE+(GRID-1)/2), iz=Math.round(p.z/TILE+(GRID-1)/2);
  if(ix<0||iz<0||ix>=GRID||iz>=GRID) return null;
  return {ix,iz};
}
function tryBuild(ix,iz,type){
  const c=costOf(type,count(type)+1);
  if(!canAfford(c)){ toast('❌ Nicht genug Ressourcen! '+costText(c),'warn'); sfx.err(); return; }
  pay(c); placeBuilding(ix,iz,type,1);
  S.built[type]=(S.built[type]||0)+1;
  addXP(25); selectCell(tileKey(ix,iz));
  renderBuildMenu();
}
function selectCell(key){
  const c=grid[key]; if(!c)return;
  S.sel=key; S.buildMode=null; renderBuildMenu();
  const b=BUILDINGS[c.type];
  $('infopanel').classList.remove('hidden');
  $('info-title').textContent=`${b.icon} ${b.name} • STUFE ${c.level}`;
  $('info-desc').textContent=b.desc;
  const prod=Object.entries(b.prod||{}).map(([k,v])=>`${k}: +${(v*c.level).toFixed(1)}/s`).join('<br>')||'—';
  $('info-stats').innerHTML=`
    <div class="statbox">Produktion<b>${prod}</b></div>
    <div class="statbox">Energie<b>${b.energy>0?'+'+b.energy:b.energy}⚡</b></div>
    <div class="statbox">Stufe<b>${c.level}</b></div>
    <div class="statbox">Boost<b>${nearShield(c)?'🛡️ +50%':'—'}</b></div>`;
  const up=costOf(c.type,c.level+1);
  $('btn-upgrade').textContent=`⬆ Upgrade (${costText(up)})`;
  $('btn-upgrade').disabled=!canAfford(up);
  const sellVal=Math.floor((c.level*75));
  $('btn-sell').textContent=`💰 Abreißen (+${sellVal}⏣)`;
  const ab=$('btn-action');
  if(b.action){ ab.classList.remove('hidden'); ab.textContent=c.cool>0?`⏳ ${Math.ceil(c.cool)}s …`:'🚀 Expedition starten'; ab.disabled=c.cool>0; }
  else ab.classList.add('hidden');
  beep(800,.05,'square',.04);
}
function hideInfo(){ $('infopanel').classList.add('hidden'); }

$('btn-upgrade').onclick=()=>{
  const c=grid[S.sel]; if(!c)return;
  const up=costOf(c.type,c.level+1);
  if(!canAfford(up)){toast('❌ Zu teuer!','warn');sfx.err();return;}
  pay(up); c.level++; const s=1+(c.level-1)*.12; c.mesh.scale.set(s,s,s);
  burst(c.mesh.position.clone().add(new THREE.Vector3(0,2,0)),0xffd23e,16);
  addXP(40); sfx.up(); selectCell(S.sel); renderBuildMenu();
};
$('btn-sell').onclick=()=>{
  const c=grid[S.sel]; if(!c)return;
  if(c.type==='hq'){toast('👑 HQ kann nicht abgerissen werden!','warn');return;}
  S.credits+=c.level*75; scene.remove(c.mesh); delete grid[S.sel];
  hideInfo(); renderBuildMenu(); sfx.coin(); save();
};
$('btn-action').onclick=()=>{
  const c=grid[S.sel]; if(!c||c.cool>0)return;
  c.cool=20; sfx.launch();
  const rk=c.mesh.getObjectByName('rocket'); const flame=c.mesh.getObjectByName('flame');
  if(flame)flame.visible=true;
  toast('🚀 Expedition gestartet! Rückkehr in 20s …','gold');
  const startY=c.mesh.position.y;
  c.exped={t:0};
  const iv=setInterval(()=>{
    c.cool-=1;
    if(c.cool<=0){ clearInterval(iv);
      const loot=300+Math.random()*500+S.level*60;
      const kr=Math.floor(Math.random()*4+S.level/2);
      S.credits+=loot; S.kristall+=kr; addXP(120);
      toast(`🛬 Expedition zurück! +${Math.floor(loot)}⏣ +${kr}💎`,'gold'); sfx.quest();
      burst(c.mesh.position.clone().add(new THREE.Vector3(0,3,0)),0xffd23e,26);
      if(flame)flame.visible=false;
      if(S.sel&&grid[S.sel]===c)selectCell(S.sel);
    } else if(S.sel&&grid[S.sel]===c)selectCell(S.sel);
  },1000);
};
$('info-close').onclick=hideInfo;

/* top buttons */
const SPEEDS=[1,2,4]; let spdIdx=0;
$('btn-speed').onclick=e=>{spdIdx=(spdIdx+1)%3;S.speed=SPEEDS[spdIdx];e.target.textContent='▶ '+S.speed+'x';beep(600,.05)};
$('btn-rotate').onclick=e=>{S.rotate=!S.rotate;controls.autoRotate=S.rotate;e.target.classList.toggle('on',S.rotate);};
$('btn-sound').onclick=e=>{S.sound=!S.sound;e.target.textContent=S.sound?'🔊':'🔇';};
$('btn-help').onclick=()=>$('tutorial').classList.remove('hidden');
$('btn-reset').onclick=()=>{if(confirm('Wirklich alles abreißen und neu starten?')){localStorage.removeItem(SAVE_KEY);localStorage.removeItem(SAVE_KEY+'-grid');location.reload();}};
$('btn-start').onclick=()=>{ $('tutorial').classList.add('hidden'); if($('chk-tut').checked)localStorage.setItem(SAVE_KEY+'-hide-tut','1'); sfx.quest(); };

/* hover */
renderer.domElement.addEventListener('pointermove',e=>{
  mouse.x=(e.clientX/innerWidth)*2-1; mouse.y=-(e.clientY/innerHeight)*2+1;
  ray.setFromCamera(mouse,camera);
  const hits=ray.intersectObjects(Object.values(tileMeshes));
  if(hits.length){
    const {ix,iz}=hits[0].object.userData;
    const {x,z}=tilePos(ix,iz);
    hoverBox.visible=true; hoverBox.position.set(x,.2,z);
    const occ=grid[tileKey(ix,iz)];
    hoverBox.material.color.set(occ?0xff5d5d:(S.buildMode?0xffd23e:0x5df2b8));
  } else hoverBox.visible=false;
});

/* ============ INIT WORLD ============ */
function initWorld(){
  // HQ center + starter buildings
  const cx=Math.floor(GRID/2)-1, cz=Math.floor(GRID/2)-1;
  const hasSave=Object.keys(savedGrid).length>0;
  if(hasSave){
    for(const k in savedGrid){ const [ix,iz]=k.split(',').map(Number); placeBuilding(ix,iz,savedGrid[k].type,savedGrid[k].level,false); }
  } else {
    placeBuilding(cx,cz,'hq',1,false);
    placeBuilding(cx+1,cz,'solar',1,false);
    placeBuilding(cx,cz+1,'mine',1,false);
    placeBuilding(cx+1,cz+1,'solar',1,false);
    S.built={solar:2,mine:1};
  }
  if(localStorage.getItem(SAVE_KEY+'-hide-tut')) $('tutorial').classList.add('hidden');
}
initWorld();

/* ============ LOOP ============ */
const clock=new THREE.Clock();
let acc=0, uiAcc=0;
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.1);
  const t=clock.elapsedTime;
  controls.update();

  // building anims
  for(const k in grid){
    const c=grid[k]; if(!c)continue;
    const a=c.mesh.userData.anim.t+t;
    const orb=c.mesh.getObjectByName('orb'); if(orb){orb.rotation.y+=dt*2;orb.position.y=4.5+Math.sin(a*2)*.15;}
    const panel=c.mesh.getObjectByName('panel'); if(panel)panel.rotation.y=Math.sin(a*.5)*.5;
    const drill=c.mesh.getObjectByName('drill'); if(drill){drill.rotation.y+=dt*6;drill.position.y=2+Math.sin(a*6)*.15;}
    const crys=c.mesh.getObjectByName('crys'); if(crys){crys.rotation.y+=dt*.8;crys.position.y=Math.sin(a*2)*.1;}
    const beam=c.mesh.getObjectByName('beam'); if(beam){beam.scale.x=beam.scale.z=1+Math.sin(a*4)*.15;beam.rotation.y+=dt;}
    const sh=c.mesh.getObjectByName('shield'); if(sh){sh.material.opacity=.12+Math.sin(a*3)*.06;}
    const dome=c.mesh.getObjectByName('dome'); if(dome&&c.type==='labor'){dome.position.y=1.1+Math.sin(a*2)*.06;}
    if(c.mesh.position.y<0)c.mesh.position.y=Math.min(0,c.mesh.position.y+dt*6);
    if(c.cool>0&&c.type==='rocket'){ const rk=c.mesh.getObjectByName('rocket'); if(rk)rk.position.y=1.6+Math.sin(a*20)*.08; if(Math.random()<.3)burst(c.mesh.position.clone().add(new THREE.Vector3((Math.random()-.5),0.5,(Math.random()-.5))),0xffb347,1,1,1); }
  }
  // ambient life
  astroT+=dt*.5;
  if(astro){ const r=GRID*TILE/2+3; astro.position.set(Math.cos(astroT)*r,Math.sin(t*2)*.3+1.5,Math.sin(astroT)*r); astro.rotation.y=-astroT; astro.position.y+=Math.sin(t*3)*.1; }
  roverT+=dt*.25;
  if(rover){ const r=GRID*TILE/2+1.2; rover.position.set(Math.cos(-roverT)*r,0,Math.sin(-roverT)*r); rover.rotation.y=roverT+Math.PI/2; }
  planets.forEach((p,i)=>{p.rotation.y+=dt*.05*(i+1);p.position.y+=Math.sin(t*.5+i)*dt*.3;});
  // particles
  for(let i=particles.length-1;i>=0;i--){ const p=particles[i];
    p.userData.life-=dt*1.2; p.userData.v.y-=dt*6;
    p.position.addScaledVector(p.userData.v,dt); p.rotation.x+=dt*4;p.rotation.y+=dt*4;
    p.material.transparent=true; p.material.opacity=Math.max(0,p.userData.life);
    if(p.userData.life<=0){scene.remove(p);particles.splice(i,1);}
  }
  // economy
  acc+=dt*S.speed;
  const step=.25;
  while(acc>step){ economyTick(step); acc-=step; }
  uiAcc+=dt;
  if(uiAcc>.25){ uiAcc=0; renderResources(); renderQuests(); checkQuests();
    if(S.sel&&grid[S.sel]){ /* refresh upgrade affordability */ const c=grid[S.sel]; if(c)$('btn-upgrade').disabled=!canAfford(costOf(c.type,c.level+1)); }
  }
  renderer.render(scene,camera);
}
animate();
setInterval(save,4000);
addEventListener('beforeunload',save);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
renderBuildMenu(); renderResources(); renderQuests();
setTimeout(()=>$('loading').classList.add('hidden'),600);
setTimeout(()=>{ if(!localStorage.getItem(SAVE_KEY+'-hide-tut')&&Object.keys(savedGrid).length===0) toast('🧱 Wähle links ein Gebäude und klicke eine Kachel!'); },1500);
