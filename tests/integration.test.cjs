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
