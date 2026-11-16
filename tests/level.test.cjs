const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('./weapon-harness.cjs');

// Runs the real perimeter-fence builder against a recording stub and returns its colliders.
function fenceColliders(fence){
 const colliders=[];
 const node=()=>({scale:{x:1,y:1,z:1},position:{set(){}},rotation:{set(){}},userData:{}});
 const builder=new Proxy({},{get:(_,key)=>key==='col'
  ?(x0,y0,z0,x1,y1,z1,surface,opts={})=>colliders.push({x0,z0,x1,z1,playerOnly:!!opts.playerOnly})
  :()=>node()});
 fence(builder);
 return colliders;
}

test('world bounds, nav grid, wetness mask, markings and quay all enclose the perimeter fence',async()=>{
 const {world}=await harness();
 const fence=fenceColliders(world.fence).filter(c=>c.playerOnly);
 assert.ok(fence.length>=4,'fence builder emits player-blocking colliders');
 const minX=Math.min(...fence.map(c=>c.x0)),maxX=Math.max(...fence.map(c=>c.x1));
 const minZ=Math.min(...fence.map(c=>c.z0)),maxZ=Math.max(...fence.map(c=>c.z1));
 // South Stack Yard expansion: the terminal now runs to z = 76.
 assert.ok(maxZ>75&&maxZ<77,`south fence at z=${maxZ.toFixed(2)}`);
 const {nav,bounds,mask,marks,quay}=world;
 assert.ok(nav.x0<=minX&&nav.z0<=minZ&&nav.z1>=maxZ+1,'navigation grid covers the fenced terminal');
 assert.ok(bounds.min.z<=nav.z0&&bounds.max.z>=nav.z1,'physics bounds cover the navigation grid');
 assert.ok(mask.x0<=minX&&mask.z0<=minZ&&mask.z0+mask.size>=maxZ,'puddle/wetness mask covers the terminal');
 assert.ok(marks.x0<=minX+2&&marks.z0+marks.h>=maxZ,'painted markings texture covers the terminal');
 assert.ok(quay.Z1>=maxZ-.5,'quay wall runs all the way to the south fence (no gap to the sea)');
});
