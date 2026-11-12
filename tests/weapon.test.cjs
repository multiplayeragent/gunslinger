const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('./weapon-harness.cjs');
test('actual weapon: held auto trigger, semi edges, selector, reload and sidearm',async()=>{
 const {g,bindings,key,tick}=await harness();
 assert.notEqual(bindings.KeyV,'melee','selector must not also interrupt the rifle with melee');
 let fired=0,melee=0;g.events.on('weapon:fire',()=>fired++);g.events.on('weapon:melee',()=>melee++);
 assert.equal(g.realism.semi,false);
 g.input.fire=true;tick(1);
 assert.equal(fired,12,'one second held fire should yield 12 shots at 720 RPM');
 assert.equal(g.weapon.ammo,18);assert.equal(melee,0);
 g.input.fire=false;tick(.2);key('KeyV');assert.equal(g.realism.semi,true);
 const before=fired;g.input.fire=true;tick(1);assert.equal(fired-before,1,'held semi trigger must fire once');
 g.input.fire=false;tick(.2);g.input.fire=true;tick(.2);assert.equal(fired-before,2);
 g.input.fire=false;tick(.2);key('KeyV');g.input.fire=true;tick(2);
 assert.equal(g.weapon.ammo,0,'automatic fire must drain the magazine');
 g.input.fire=false;tick(.2);g.weapon.reloadNow();tick(5);
 assert.equal(g.weapon.ammo,30,'reload must refill after continuous fire');
 g.input.fire=true;const afterReload=fired;tick(.5);assert.equal(fired-afterReload,6);
 g.input.fire=false;g.weapon.equip('pistol');tick(.4);const beforePistol=fired;
 g.input.fire=true;tick(1);assert.equal(fired-beforePistol,1,'pistol remains semi even with rifle set to auto');
});
test('automatic cadence survives a slow frame rate',async()=>{
 const {g,tick}=await harness();let shots=0;g.events.on('weapon:fire',()=>shots++);
 g.input.fire=true;tick(1,20);assert.equal(shots,12);
});
