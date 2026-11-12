const vm=require('vm'),fs=require('fs');
const noop=()=>{};
const ctx=new Proxy({measureText:s=>({width:s.length*12}),createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop}),getImageData:()=>({data:new Uint8ClampedArray(1024*1024*4)}),canvas:{}},{get:(o,k)=>o[k]??noop});
const el=()=>({style:{},classList:{add:noop,remove:noop,toggle:noop},getContext:()=>ctx,addEventListener:noop,setAttribute:noop,appendChild:noop,append:noop,querySelector:()=>el(),querySelectorAll:()=>[],getBoundingClientRect:()=>({width:1280,height:720}),width:1,height:1});
const doc={querySelector:()=>null,getElementById:()=>el(),createElement:el,createElementNS:el,addEventListener:noop,documentElement:el()};
const listeners={}; const window={addEventListener:(name,fn)=>(listeners[name]??=[]).push(fn)};
const context=vm.createContext({window,document:doc,console:{log:noop,warn:noop,error:console.error},AbortController,performance,URLSearchParams,location:{search:'',hash:''},navigator:{userAgent:'test'},addEventListener:noop,setTimeout:noop,requestAnimationFrame:noop,Image:class{}});
let source=fs.readFileSync('vendor/gunslinger-engine.js','utf8').replace('cL().catch(n=>yT(n&&n.stack||n));','window.testEngine={THREE:ut,weapon:I5,inputBindings:fE,events:BM,ground:Nw};');
vm.runInContext(source,context);
const {THREE:T,weapon,events}=window.testEngine;
module.exports=async function(){
const g={THREE:T,events:events(),rng:()=>.5,params:{},time:{t:0},camera:new T.PerspectiveCamera(),viewCamera:new T.PerspectiveCamera(),mats:{get:()=>new T.MeshStandardMaterial()},player:{alive:true,eye:new T.Vector3(),pos:new T.Vector3(),vel:new T.Vector3(),onGround:true,speed:0,addRecoil:noop,addShake:noop},input:{fire:false,ads:false,look:{dx:0,dy:0},move:{x:0,y:0},pressed:()=>false},physics:{raycast:()=>null},combat:{playerShot:()=>null},fx:{},render:{},scene:new T.Scene()};

Object.assign(g.player,{tuning:{},enabled:true,health:100,maxHealth:100,reset(){},update(){},heal(){}});
g.render.frame=noop;g.render.post={};g.game={state:'playing'};g.combat.stats={shots:0,hits:0};
g.weapon=await weapon(g);g.weapon.reset();g.weapon.snap();
vm.runInContext(fs.readFileSync('src/ballistics.js','utf8'),context);
vm.runInContext(fs.readFileSync('src/visuals.js','utf8'),context);
vm.runInContext(fs.readFileSync('src/gunslinger.js','utf8'),context);
window.Gunslinger.install(g);
return {g,visuals:window.GunslingerVisuals,groundFactory:window.testEngine.ground,bindings:window.testEngine.inputBindings,key(code){for(const fn of listeners.keydown||[])fn({code,target:{tagName:'BODY'},repeat:false});},tick(seconds,fps=60){for(let i=0;i<Math.round(seconds*fps);i++){g.time.t+=1/fps;g.weapon.update(1/fps);}}};
};
