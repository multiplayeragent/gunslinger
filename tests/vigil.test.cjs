const {test}=require('node:test');
const assert=require('node:assert/strict');
// Values built inside the vm belong to another realm, so structures are compared as JSON.
const same=(a,b,msg)=>assert.equal(JSON.stringify(a),JSON.stringify(b),msg);
const vm=require('node:vm');
const fs=require('node:fs');

// The engine with its boot call swapped for an export, as the weapon harness does, plus the vigil sources.
function load({map=true}={}) {
  const noop=()=>{};
  const ctx2d=new Proxy({measureText:s=>({width:s.length*12}),createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop}),getImageData:()=>({data:new Uint8ClampedArray(4)}),canvas:{}},{get:(o,k)=>o[k]??noop});
  const el=()=>({style:{},dataset:{},classList:{add:noop,remove:noop,toggle:noop},getContext:()=>ctx2d,addEventListener:noop,setAttribute:noop,appendChild:noop,append:noop,prepend:noop,querySelector:()=>null,querySelectorAll:()=>[],getBoundingClientRect:()=>({width:1280,height:720}),width:1,height:1,textContent:''});
  const store=new Map();
  const window={addEventListener:noop};
  const context=vm.createContext({window,document:{querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>el(),createElement:el,createElementNS:el,addEventListener:noop,documentElement:el(),body:el()},
    console:{log:noop,warn:noop,error:console.error},AbortController,performance,URLSearchParams,URL,location:{search:map?'?map=vigil':'',hash:'',href:'http://localhost/'},navigator:{userAgent:'test'},
    localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))},addEventListener:noop,setTimeout:noop,requestAnimationFrame:noop,Image:class{},Math,Float32Array,Uint8Array,Uint16Array,Int32Array});
  for (const f of ['map','kit','materials','church','yard','forest','ground','lighting','figure','phys','ragdoll','destruct','zombies','audio','crystal','defenses','ui','director','level']) vm.runInContext(fs.readFileSync(`src/vigil/${f}.js`,'utf8'),context,{filename:f});
  vm.runInContext(fs.readFileSync('src/maps.js','utf8'),context);
  const source=fs.readFileSync('vendor/gunslinger-engine.js','utf8').replace('cL().catch(n=>yT(n&&n.stack||n));','window.testEngine={THREE:ut,nav:()=>({Ll,wk,ru,Ek,f0,co})};');
  vm.runInContext(source,context);
  return {window,V:window.Vigil,engine:window.testEngine,store};
}

test('the harbor is the default map and leaves the engine untouched',()=>{
  const {window,V}=load({map:false});
  assert.equal(window.GunslingerMapSelect.id,'harbor');
  assert.equal(window.GunslingerMap,null);
  assert.equal(V.I,undefined,'no map: the engine must not hand out its internals');
  same(window.GunslingerMapSelect.order,['harbor','vigil']);
  same(window.testEngine.nav(),{Ll:-40,wk:31,ru:-32,Ek:30,f0:142,co:124});
});

test('choosing the churchyard reconfigures the engine before it boots',()=>{
  const {window,V,engine}=load();
  assert.equal(window.GunslingerMap.id,'vigil');
  const I=V.I;
  for (const key of ['THREE','bounds','sun','sky','texSets','matDefs','texFns','patchStd','sounds','bindings','noiseGLSL','makeRain','holdout','flow','radio','explosiveSpots','setNav']) assert.ok(I[key]!==undefined,`engine internals expose ${key}`);
  // a 128 m square of navigation at half-metre cells, no sea, a moon instead of a sunrise
  same(engine.nav(),{Ll:-64,wk:64,ru:-64,Ek:64,f0:256,co:256});
  assert.equal(I.bounds.max.x,64); assert.ok(I.bounds.quayX>1e5);
  assert.ok(I.sun.intensity<3 && I.sun.color.b>I.sun.color.r,'cool, dim moonlight');
  assert.equal(I.explosiveSpots.length,0);
  assert.equal(I.holdout.firstDelay,Infinity,'the engine never starts its own waves here');
  assert.equal(I.bindings.KeyF,undefined); assert.equal(I.bindings.KeyV,'melee'); assert.equal(I.bindings.Enter,undefined);
  assert.equal(window.GunslingerMap.shadowBounds.length,4);
  assert.match(window.GunslingerMap.skyFragment(),/GUNSLINGER_SKY/);
  // every vigil sound is in the engine's table, and the harbor ambience has been revoiced
  for (const name of ['groan','screech','growl','zombie_die','flesh_hit','bell','wave_clear','crystal_hit','crystal_break','crystal_hum','vg_shot','purchase','deny']) assert.ok(I.sounds[name]&&typeof I.sounds[name].gen==='function',name);
});

test('every synthesised sound is finite and audible',()=>{
  const {V}=load();
  let seed=7; const rng=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for (const name of ['groan','screech','growl','zombie_die','zombie_die_big','zombie_hit','flesh_hit','body_fall','spit','acid','bell','wave_clear','purchase','deny','crystal_hit','crystal_break','crystal_hum','vg_shot','flare_pop','heal','shock','aegis','limb_tear','gib_land','stone_break','stone_hit','wood_break','wood_hit','foghorn','gull_cry','halyard','container_bang','sea']) {
    const def=V.I.sounds[name];
    for (let v=0;v<def.n;v++) {
      const out=def.gen(def.sr,rng,v);
      assert.ok(out instanceof Float32Array&&out.length>def.sr*0.05,`${name}#${v} has samples`);
      let peak=0; for (let i=0;i<out.length;i++){ assert.ok(Number.isFinite(out[i]),`${name}#${v} sample ${i} is finite`); peak=Math.max(peak,Math.abs(out[i])); }
      assert.ok(peak>1e-3,`${name}#${v} is not silent`);
    }
  }
});

test('waves grow, cap, and bring runners, spitters, brutes and bosses on schedule',()=>{
  const {V}=load();
  const count=(w,t)=>w.list.filter(x=>x===t).length;
  const w1=V.composeWave(1); assert.equal(count(w1,'walker'),w1.list.length,'wave 1 is walkers only'); assert.equal(w1.riserChance,0);
  const w4=V.composeWave(4); assert.equal(count(w4,'brute'),0); assert.equal(count(w4,'boss'),0);
  const w5=V.composeWave(5); assert.equal(count(w5,'boss'),1); assert.equal(count(w5,'brute'),1); assert.ok(w5.riserChance>0);
  const w10=V.composeWave(10); assert.equal(count(w10,'boss'),2); assert.ok(w10.hpMult>w5.hpMult);
  for (let n=1;n<=60;n++){ const w=V.composeWave(n); assert.ok(w.list.length<=95+Math.floor(n/5)); assert.ok(w.maxAlive<=52); assert.ok(w.interval>=0.28); assert.ok(w.speedMult<=1.3); for (const t of w.list) assert.ok(V.ZOMBIES[t],t); }
  for (const id of V.CLASS_ORDER) assert.ok(V.KITS[V.CLASSES[id].kit],`${id} starts with a real kit`);
  same(V.KIT_ORDER.map(id=>V.KITS[id].slot),[3,4,5,6,7]);
});

test('geometry kit: arches, bevelled blocks and world-space UVs',()=>{
  const {V}=load(); const kit=V.kit;
  const pts=kit.archPts(1.5,4.75,6.35,7);
  assert.equal(pts.length,15);
  assert.ok(Math.abs(pts[0][0]+0.75)<1e-9&&Math.abs(pts[0][1]-4.75)<1e-9,'starts at the left spring');
  assert.ok(Math.abs(pts[7][0])<1e-9&&Math.abs(pts[7][1]-6.35)<1e-6,'peaks at the apex');
  assert.ok(Math.abs(pts[14][0]-0.75)<1e-9,'ends at the right spring');
  for (let i=1;i<=7;i++) assert.ok(pts[i][1]>pts[i-1][1],'rises to the apex');
  const box=kit.bevelBox(2,1,0.5,0.05), p=box.attributes.position, n=box.attributes.normal;
  assert.equal(p.count,44*3);
  for (let i=0;i<p.count;i+=3){ const cx=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,cy=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3,cz=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3; assert.ok(cx*n.getX(i)+cy*n.getY(i)+cz*n.getZ(i)>0,'every face points outward'); }
  // a 3 m wall face maps one-to-one onto metres whatever its position
  const face=kit.xf(kit.box(3,2,0.4),{p:[10,1,-5]}); kit.boxUV(face);
  let uMin=1e9,uMax=-1e9; const uv=face.attributes.uv,fp=face.attributes.position;
  for (let i=0;i<uv.count;i+=3){ if ([0,1,2].every(k=>Math.abs(fp.getZ(i+k)-(-4.8))<1e-6)) for (let k=0;k<3;k++){ uMin=Math.min(uMin,uv.getX(i+k)); uMax=Math.max(uMax,uv.getX(i+k)); } }
  assert.ok(Math.abs(uMax-uMin-3)<1e-6);
  // a mirrored piece keeps its faces outward
  const mirrored=kit.xf(kit.bevelBox(1,1,1,0.05),{s:[-1,1,1]}), mp=mirrored.attributes.position, mn=mirrored.attributes.normal;
  mirrored.computeVertexNormals();
  for (let i=0;i<mp.count;i+=3) assert.ok(mp.getX(i)*mn.getX(i)+mp.getY(i)*mn.getY(i)+mp.getZ(i)*mn.getZ(i)>0);
});

// A stand-in for the engine: just the collider list the loose-object code reads.
function fakeGame(T) {
  const boxes=[];
  return {THREE:T,scene:{add(){}},events:{emit(){}},fx:{},time:{t:0},
    physics:{boxes,addBox(a,b,o={}){const v=q=>q.isVector3?q.clone():new T.Vector3(q[0],q[1],q[2]); const bx={min:v(a),max:v(b),surface:o.surface||'concrete',noNav:!!o.noNav,bulletOnly:!!o.bulletOnly,playerOnly:!!o.playerOnly}; boxes.push(bx); return bx;},
      removeBox(b){const i=boxes.indexOf(b); if(i>=0) boxes.splice(i,1);}}};
}
// volume of a closed triangle soup
const volume=g=>{ const p=g.attributes.position; let v=0; for (let i=0;i<p.count;i+=3){ const ax=p.getX(i),ay=p.getY(i),az=p.getZ(i),bx=p.getX(i+1),by=p.getY(i+1),bz=p.getZ(i+1),cx=p.getX(i+2),cy=p.getY(i+2),cz=p.getZ(i+2); v+=ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx); } return v/6; };

test('every body is a valid skinned mesh unwrapped into one atlas',()=>{
  const {V}=load(); const T=V.THREE, F=V.figure;
  assert.equal(F.BONES.length,18);
  F.BONES.forEach(([name,parent],i)=>{ assert.ok(parent<i,`${name} comes after its parent`); assert.equal(F.BI[name],i); });
  for (const type of Object.keys(V.ZOMBIES)) { const z=V.ZOMBIES[type]; assert.ok(z.hp>0&&z.speed[0]<=z.speed[1]&&z.reward>0&&z.r>0.2); assert.ok(F.KINDS[type].length>0,`${type} has a body`); for (const k of F.KINDS[type]) assert.ok(F.LOOKS[k],k); }
  for (const kind of Object.keys(F.LOOKS)) {
    const {geo,glow}=F.build(T,V.kit,kind), a=geo.attributes, count=a.position.count;
    assert.ok(count>2000&&count<9000,`${kind}: sensible vertex count (${count})`);
    for (const k of ['normal','uv','skinIndex','skinWeight']) assert.equal(a[k].count,count,`${kind} ${k}`);
    let lo=1e9;
    for (let i=0;i<count;i++) {
      for (const v of [a.position.getX(i),a.position.getY(i),a.position.getZ(i),a.normal.getX(i),a.normal.getY(i),a.normal.getZ(i)]) assert.ok(Number.isFinite(v),`${kind}: finite`);
      lo=Math.min(lo,a.position.getY(i));
      assert.ok(a.uv.getX(i)>=0&&a.uv.getX(i)<=1&&a.uv.getY(i)>=0&&a.uv.getY(i)<=1,`${kind}: inside the atlas`);
      assert.ok(a.skinIndex.getX(i)<18&&a.skinIndex.getY(i)<18);
      assert.ok(Math.abs(a.skinWeight.getX(i)+a.skinWeight.getY(i)-1)<1e-6,'weights sum to one');
    }
    assert.ok(lo>-0.05&&lo<0.08,`${kind}: feet on the ground (${lo})`);
    for (let i=0;i<geo.index.count;i++) assert.ok(geo.index.getX(i)<count);
    // no two tubes share atlas space unless they mean to
    const rects=[...new Set(geo.userData.bake.tubes.map(t=>t.rect))];
    for (let i=0;i<rects.length;i++) { const r=rects[i]; assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=F.ATLAS.w&&r.y+r.h<=F.ATLAS.h,`${kind}: rectangle inside the atlas`);
      for (let j=i+1;j<rects.length;j++){ const q=rects[j]; assert.ok(r.x+r.w<=q.x||q.x+q.w<=r.x||r.y+r.h<=q.y||q.y+q.h<=r.y,`${kind}: rectangles ${i} and ${j} overlap`); } }
    // every limb that can come off exists as its own piece, and the painted pose is computable without a GPU
    for (const limb of Object.keys(F.LIMBS)) for (const bones of [F.LIMBS[limb].bones,F.LIMBS[limb].lowerBones]) assert.ok(F.extract(T,geo,bones,[0,0,0]).attributes.position.count>60,`${kind} ${limb}`);
    const posed=F.posed(T,geo,F.APOSE); assert.equal(posed.position.length,count*3); for (const v of posed.position) assert.ok(Number.isFinite(v));
    if (kind!=='guard') assert.ok(glow.attributes.position.count>0,'the dead have eyes');
  }
});

test('cutting a solid caps both halves and keeps its volume',()=>{
  const {V}=load(); const T=V.THREE, kit=V.kit;
  const block=kit.xf(kit.bevelBox(0.6,1.2,0.16,0.02),{p:[3,0.6,-2]}); kit.boxUV(block);
  const whole=volume(block); assert.ok(whole>0.1);
  for (const [n,d] of [[new T.Vector3(0,1,0),0.5],[new T.Vector3(0.3,1,0.1).normalize(),0.9],[new T.Vector3(1,0.2,0).normalize(),2.95]]) {
    const [f,b]=V.destructs.slice(T,block,n,d,1.2);
    assert.ok(f&&b,'both sides exist');
    const fp=f.attributes.position, bp=b.attributes.position;
    for (let i=0;i<fp.count;i++) assert.ok(fp.getX(i)*n.x+fp.getY(i)*n.y+fp.getZ(i)*n.z>=d-1e-4,'front stays in front');
    for (let i=0;i<bp.count;i++) assert.ok(bp.getX(i)*n.x+bp.getY(i)*n.y+bp.getZ(i)*n.z<=d+1e-4,'back stays behind');
    assert.ok(Math.abs(volume(f)+volume(b)-whole)<whole*0.01,`volume is kept (${volume(f)}+${volume(b)} vs ${whole})`);
    assert.ok(volume(f)>0&&volume(b)>0,'both halves are closed and face outward');
  }
  // a plane that misses leaves the block on one side only
  const [f,b]=V.destructs.slice(T,block,new T.Vector3(0,1,0),5,1.2); assert.equal(f,null); assert.ok(b);
});

test('stone snaps to a stump, timber goes entirely, and a new run restores both',()=>{
  const {V}=load(); const T=V.THREE, kit=V.kit, g=fakeGame(T);
  const mat=new T.MeshStandardMaterial(), mats={get:()=>mat};
  V.loose=V.phys.create(g);
  const B=new kit.Builder(g,mats);
  B.begin({kind:'stone',hp:150,yaw:0.4}); B.box('rock',0.6,1.1,0.14,5,0.55,5,{r:[0,0.4,0]}); B.colBox(5,5,0.35,0.2,0,1.15); B.end();
  B.begin({kind:'wood',hp:100}); B.box('plank',3,0.06,0.4,-4,0.45,2); B.box('plank',3,0.7,0.05,-4,0.85,2.2); B.colBox(-4,2,1.5,0.3,0,1.1,'wood'); B.end();
  B.begin({kind:'stone',hp:50}); B.box('rock',1,1,1,0,0.5,-9); B.end();                     // no collider: it stays part of the static level
  assert.equal(B.objects.length,2);
  const D=V.destructs.create(g,mats,B.objects,new T.Group()), [stone,pew]=D.objects, dir=new T.Vector3(0,0,-1);
  assert.equal(g.physics.boxes.length,2);
  // chips first, then the break
  assert.ok(D.hitBox(stone.boxes[0],new T.Vector3(5.2,1.0,5.1),dir,120)); assert.equal(stone.state,'worn'); assert.equal(stone.chips,1);
  D.hit(stone,new T.Vector3(5,0.6,5),dir,600); assert.equal(stone.state,'stump');
  assert.equal(stone.boxes.length,1); assert.ok(stone.boxes[0].max.y<0.8,'the collider shrinks to the stump');
  D.hit(pew,new T.Vector3(-4,0.6,2),dir,300); assert.equal(pew.state,'gone'); assert.equal(pew.boxes.length,0);
  assert.equal(g.physics.boxes.length,1);
  assert.ok(V.loose.bodies.length>=6,`pieces are thrown (${V.loose.bodies.length})`);
  for (let i=0;i<600;i++) { V.loose.updateBodies(1/60); D.update(1/60); }
  for (const b of V.loose.bodies) { assert.ok(Number.isFinite(b.pos.x+b.pos.y+b.pos.z)); assert.ok(b.pos.y>-0.6&&b.pos.y<3,`pieces end on the ground (${b.pos.y})`); }
  D.reset(); V.loose.clearBodies();
  assert.equal(stone.state,'whole'); assert.equal(pew.state,'whole'); assert.equal(stone.hp,150); assert.equal(g.physics.boxes.length,2); assert.equal(V.loose.bodies.length,0);
  assert.ok(D.hitBox(pew.boxes[0],new T.Vector3(-4,0.6,2),dir,10),'restored objects can be hit again');
});

test('a loose body falls, lands on what is under it and comes to rest',()=>{
  const {V}=load(); const T=V.THREE, g=fakeGame(T);
  g.physics.addBox([-1,0,-1],[1,0.8,1]);
  const W=V.phys.create(g);
  assert.equal(W.ground(0,0,5),0.8); assert.equal(W.ground(3,0,5),0); assert.equal(W.ground(0,0,0.5),0,'only what is below counts');
  const mk=(x,z)=>W.spawn({mesh:new T.Group(),pos:new T.Vector3(x,3,z),half:new T.Vector3(0.2,0.1,0.15),mass:5,vel:new T.Vector3(0.3,0,0),ang:new T.Vector3(2,1,3),life:Infinity});
  const onBox=mk(0,0), onGround=mk(4,4);
  for (let i=0;i<900;i++) W.updateBodies(1/60);
  assert.ok(onBox.asleep&&onGround.asleep,'both settle');
  assert.ok(onGround.pos.y>0.05&&onGround.pos.y<0.3,`rests on the ground (${onGround.pos.y})`);
  assert.ok((onBox.pos.y>0.85&&onBox.pos.y<1.15)||onBox.pos.y<0.3,`rests on the box or beside it (${onBox.pos.y})`);
  const p=new T.Vector3(0,0.5,0), n=new T.Vector3(); assert.ok(W.collide(p,0.1,n)>0); assert.ok(p.y>=0.9-1e-6||Math.abs(p.x)>=1.1-1e-6||Math.abs(p.z)>=1.1-1e-6,'a point inside a collider is pushed out');
});

test('a body handed to the ragdoll falls down and stays in one piece',()=>{
  const {V}=load(); const T=V.THREE, F=V.figure, g=fakeGame(T);
  const W=V.phys.create(g), R=V.ragdoll.create(g,W);
  const {geo}=F.build(T,V.kit,'walkerA'), {mesh,bones}=F.rig(T,geo,null), B={}; for (const k in F.BI) B[k]=bones[F.BI[k]];
  mesh.position.set(2,0,3); mesh.rotation.y=0.7;
  let done=false;
  const z={mesh,bones:B,scale:1.05,mass:1,limbs:{armL:0,armR:2,legL:1,legR:0},vel:new T.Vector3(1,0,0),onRagdollDone(){done=true;}};
  mesh.scale.setScalar(z.scale);
  const r=R.start(z,{dir:new T.Vector3(0,0,1),point:new T.Vector3(2,1.3,3),power:4});
  for (let i=0;i<420;i++) R.update(1/60);
  assert.ok(r.asleep,'it comes to rest');
  for (const v of r.P) assert.ok(Number.isFinite(v));
  for (let i=0;i<r.P.length;i+=3) if (r.rad[i/3]>0) assert.ok(r.P[i+1]>-0.01&&r.P[i+1]<0.75,`every part is down (${r.P[i+1]})`);   // points of severed limbs carry no body
  assert.ok(Math.hypot(r.P[0]-2,r.P[2]-3)<4,'and near where it fell');
  // bones still the right length apart: nothing stretched
  const d=(i,j)=>Math.hypot(r.P[i*3]-r.P[j*3],r.P[i*3+1]-r.P[j*3+1],r.P[i*3+2]-r.P[j*3+2]);
  assert.ok(Math.abs(d(10,11)-0.43*1.05)<0.06,`thigh length ${d(10,11)}`); assert.ok(Math.abs(d(4,5)-0.29*1.05)<0.05,`upper arm length ${d(4,5)}`);
  for (const k in B) { const q=B[k].quaternion; assert.ok(Number.isFinite(q.x+q.y+q.z+q.w),k); }
  R.clear(); assert.ok(done); assert.equal(R.list.length,0);
});

test('the dead are packed for the wire without losing where they stand',()=>{
  const {V}=load(); const {e64,d64,qPos,uPos,REC}=V.zpack;
  assert.equal(REC,12);
  for (const n of [0,1,63,64,4095]) { const s=e64(n,2); assert.equal(s.length,2); assert.equal(d64(s,0,2),n); assert.ok(!/^\d+$/.test('Z'+s),'never reads as a number'); }
  for (const x of [-64,-12.34,0,0.02,33.3,64]) assert.ok(Math.abs(uPos(qPos(x))-x)<0.02,`position ${x} survives to within 2 cm`);
  assert.equal(qPos(-999),0); assert.equal(qPos(999),4095);
  // a full house of zombies fits one field of room state
  assert.ok(3+76*REC<2048);
});
