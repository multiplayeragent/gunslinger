const {test}=require('node:test');
const assert=require('node:assert/strict');
const Ballistics=require('../src/ballistics.js');
const origin={x:0,y:2,z:0}, dir={x:1,y:0,z:0};
test('projectiles travel over time and fall under gravity',()=>{
 const b=new Ballistics({trace:()=>null,impact:()=>{}});
 b.fire(origin,dir,{speed:100,range:100}); b.update(.1);
 assert.ok(Math.abs(b.projectiles[0].position.x-10)<1e-6);
 assert.ok(Math.abs(b.projectiles[0].position.y-(2-.5*9.81*.1**2))<1e-6);
});
test('swept collision catches thin cover at high velocity, once',()=>{
 let hits=0;const b=new Ballistics({trace:(o,d,r)=>o.x<=1&&o.x+d.x*r>=1?{dist:(1-o.x)/d.x}:null,impact:()=>hits++});
 b.fire(origin,dir);b.update(.05);b.update(.05);
 assert.equal(hits,1);assert.equal(b.projectiles.length,0);
});
test('range is respected exactly and projectiles expire',()=>{
 let furthest=0;const b=new Ballistics({trace:(o,d,r)=>{furthest=Math.max(furthest,o.x+d.x*r);return null;},impact:()=>{}});
 b.fire(origin,dir,{speed:820,range:3});b.update(.05);
 assert.ok(furthest<=3);assert.equal(b.projectiles.length,0);
});
test('damage falls off and owner is preserved',()=>{
 let result;const b=new Ballistics({trace:(o,d,r,owner)=>({dist:1,owner}),impact:(hit,bullet,damage)=>result={hit,bullet,damage}});
 b.fire(origin,dir,{damage:40,owner:'enemy'});b.update(.01);
 assert.equal(result.bullet.owner,'enemy');assert.ok(result.damage<40&&result.damage>=20);
});
test('pause and reset do not advance or retain projectiles',()=>{
 const b=new Ballistics({trace:()=>null,impact:()=>{}});b.fire(origin,dir);b.update(0);
 assert.deepEqual(b.projectiles[0].position,origin);b.reset();assert.equal(b.projectiles.length,0);
});
