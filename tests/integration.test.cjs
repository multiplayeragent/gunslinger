const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function harness(){
 const elements=new Map(),listeners={},events={};
 const element=()=>({hidden:false,style:{},classList:{toggle(){}},append(){},prepend(){},remove(){},textContent:''});
 const document={createElement:element,getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);},querySelector:()=>null};
 let shots=0,updates=0;
 const g={THREE:{},camera:{rotation:{x:0,y:0}},player:{tuning:{},enabled:true,alive:true,health:50,speed:0,ads:0,sprinting:false,crouching:false,reset(){this.health=100;},update(){updates++;},heal(n){this.health=Math.min(100,this.health+n);}},weapon:{current:'rifle',update(){if(g.input.fire)shots++;}},combat:{stats:{shots:0,hits:0}},events:{on:(name,fn)=>(events[name]??=[]).push(fn)},input:{fire:false,sprint:false},time:{t:20},game:{state:'playing'},render:{post:{},frame(){}},enemies:{},physics:{}};
 const window={addEventListener:(name,fn)=>listeners[name]=fn};
 vm.runInNewContext(fs.readFileSync('src/ballistics.js','utf8'),{window});
 vm.runInNewContext(fs.readFileSync('src/gunslinger.js','utf8'),{window,document,Math});window.Gunslinger.install(g);
 return {g,elements,events,keydown:code=>listeners.keydown({code,target:{tagName:'BODY'}}),get shots(){return shots;},get updates(){return updates;}};
}
test('difficulty cannot restore auto healing; exhaustion prevents sprinting',()=>{
 const {g}=harness();g.player.tuning.regenRate=25;g.realism.stamina=.01;g.input.sprint=true;g.player.update(.016);
 assert.equal(g.player.tuning.regenRate,0);assert.equal(g.input.sprint,false);
 g.realism.stamina=.1;g.input.sprint=true;g.player.update(.016);assert.equal(g.input.sprint,false);
 g.realism.stamina=.4;g.input.sprint=true;g.player.update(.016);assert.equal(g.input.sprint,true);
});
test('pause freezes flight and endurance; restart clears combat state',()=>{
 const {g}=harness();g.realism.stamina=.5;g.player.sprinting=true;g.game.state='paused';
 g.ballistics.fire({x:0,y:2,z:0},{x:1,y:0,z:0});g.render.frame(.05);
 assert.equal(g.realism.stamina,.5);assert.equal(g.ballistics.projectiles[0].distance,0);
 g.player.reset();assert.equal(g.realism.stamina,1);assert.equal(g.realism.bandages,2);assert.equal(g.ballistics.projectiles.length,0);
});
test('dressing consumes one charge only after three stationary seconds; damage interrupts',()=>{
 const {g,keydown,events}=harness();keydown('KeyB');g.render.frame(1);g.render.frame(1);assert.equal(g.player.health,50);
 events['player:hit'][0]();assert.equal(g.realism.bandaging,0);
 g.time.t+=2;g.render.frame(1);g.render.frame(1);g.render.frame(1);
 assert.equal(g.player.health,85);assert.equal(g.realism.bandages,1);
});

test('a dash lunges the way you move, level, on the ground or in the air, and has to recover before the next',()=>{
 const {g,keydown}=harness(),p=g.player;
 p.vel={x:0,y:-4,z:0};p.yaw=0;g.input.move={x:0,y:1};
 keydown('GsDash');p.update(1/60);
 assert.ok(Math.abs(p.vel.z+g.dash.speed)<1e-9&&Math.abs(p.vel.x)<1e-9,'forward, at the dash\'s speed');assert.equal(p.vel.y,0,'falling stops while it lasts');
 // a second press during it, or before it has recovered, does nothing
 keydown('GsDash');let t=1/60;while(t<g.dash.time+0.02){p.vel.y=-2;p.update(1/60);t+=1/60;}
 assert.ok(Math.abs(Math.hypot(p.vel.x,p.vel.z)-g.dash.keep)<1e-9,'let go at a sprint\'s pace, not left sliding');
 p.vel.x=p.vel.z=0;p.vel.y=-2;keydown('GsDash');p.update(1/60);assert.equal(p.vel.z,0,'not again yet');assert.equal(p.vel.y,-2);
 while(t<g.dash.time+g.dash.cooldown+0.05){p.update(1/60);t+=1/60;}
 // sideways, and turned: the stick's right is the world's -z when facing +x... (yaw a quarter turn)
 g.input.move={x:1,y:0};p.yaw=0;keydown('GsDash');p.update(1/60);assert.ok(Math.abs(p.vel.x-g.dash.speed)<1e-9&&Math.abs(p.vel.z)<1e-9,'to the right');
 for(let i=0;i<90;i++)p.update(1/60);
 // standing still it goes the way you face; not while paused, not when down
 g.input.move={x:0,y:0};p.yaw=Math.PI/2;p.vel.x=p.vel.z=0;keydown('GsDash');p.update(1/60);assert.ok(Math.abs(p.vel.x+g.dash.speed)<1e-6&&Math.abs(p.vel.z)<1e-6,'the way you face');
 for(let i=0;i<90;i++)p.update(1/60);
 p.vel.x=p.vel.z=0;g.game.state='paused';keydown('GsDash');p.update(1/60);assert.equal(Math.hypot(p.vel.x,p.vel.z),0);
 g.game.state='playing';p.alive=false;keydown('GsDash');p.update(1/60);assert.equal(Math.hypot(p.vel.x,p.vel.z),0);
 p.alive=true;g.dashOk=()=>false;keydown('GsDash');p.update(1/60);assert.equal(Math.hypot(p.vel.x,p.vel.z),0,'a map may refuse it');
 g.dashOk=null;keydown('GsDash');p.update(1/60);assert.ok(Math.hypot(p.vel.x,p.vel.z)>18);
});
