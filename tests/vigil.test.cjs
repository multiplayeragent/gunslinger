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
  for (const f of ['map','kit','materials','church','yard','forest','ground','lighting','figure','phys','ragdoll','destruct','zombies','beasts','fire','blood','shells','audio','skills','lifeforce','music','storm','crystal','defenses','ui','wild','director','level']) vm.runInContext(fs.readFileSync(`src/vigil/${f}.js`,'utf8'),context,{filename:f});
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
  same(window.testEngine.nav(),{Ll:-50,wk:31,ru:-40,Ek:78,f0:162,co:236});       // the terminal's own navigation rectangle
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
  for (const name of ['groan','screech','growl','zombie_die','zombie_die_big','zombie_hit','flesh_hit','body_fall','spit','acid','bell','wave_clear','purchase','deny','crystal_hit','crystal_break','crystal_hum','vg_shot','flare_pop','heal','shock','aegis','hurt','hurt_hard','heart','limb_tear','gib_land','stone_break','stone_hit','wood_break','wood_hit','demon_cry','skull_shriek','bat_squeak','spider_hiss','foghorn','gull_cry','halyard','container_bang','sea']) {
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
  // where they come from: the first wave is all out of the trees, later ones also rise from the ground and walk out of the mausoleums
  assert.equal(w1.cryptChance,0); assert.ok(w1.sectors>=3&&w1.strayChance>0,'even wave 1 comes from several sides');
  assert.ok(w5.cryptChance>0&&w10.sectors>w1.sectors&&w10.strayChance>w1.strayChance);
  for (let n=1;n<=60;n++){ const w=V.composeWave(n); assert.ok(w.sectors<=6&&w.strayChance<=0.5&&w.riserChance+w.cryptChance<=0.5,'most of every wave still walks in from the woods'); }
  for (let n=1;n<=60;n++){ const w=V.composeWave(n); assert.ok(w.list.length<=95+Math.floor(n/5)); assert.ok(w.maxAlive<=52); assert.ok(w.interval>=0.28); assert.ok(w.speedMult<=1.3); for (const t of w.list) assert.ok(V.ZOMBIES[t],t); }
  for (const id of V.CLASS_ORDER) assert.ok(!('kit' in V.CLASSES[id]),`${id} starts with the pistol like everyone: a class is not a rifle`);
  same(V.KIT_ORDER.map(id=>V.KITS[id].slot),[3,4,5,6,7,0,8,9]);
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
  for (const type of Object.keys(V.ZOMBIES)) { const z=V.ZOMBIES[type]; assert.ok(z.hp>0&&z.speed[0]<=z.speed[1]&&z.reward>0&&z.r>0.2); if (z.beast) { assert.ok(V.BEAST_HIT[z.beast]&&!z.body&&!F.KINDS[type],`${type} has a body of its own`); continue; } const kinds=F.KINDS[type]||[z.body]; assert.ok(kinds.length>0&&kinds[0],`${type} has a body`); for (const k of kinds) assert.ok(F.LOOKS[k],k); if (z.body) assert.ok(!F.KINDS[type]&&z.tint&&z.tint.length===3,`${type} borrows ${z.body} and is tinted`); }
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

// Buildings: a capture cut into cells, each a thing that breaks in two goes, with what rests on it following.
test('a wall cut into bays: each bay breaks on its own, its stump can be razed, and what rests on it comes down',()=>{
  const {V}=load(); const T=V.THREE, kit=V.kit, g=fakeGame(T);
  const mat=new T.MeshStandardMaterial(), mats={get:()=>mat};
  V.loose=V.phys.create(g);
  const B=new kit.Builder(g,mats);
  // a wall 12 m long, 4 m high and 0.6 m thick along x, in three bays, with a beam lying along its top
  B.begin({kind:'stone',hp:1000,raze:true,tag:'wall'});
  B.box('rock',12,4,0.6,0,2,0); B.col(-6,0,-0.3,6,4,0.3);
  const bays=B.endGrid({xs:[-2,2]});
  B.begin({kind:'wood',hp:200,rests:['wall'],tag:'beam'});
  B.box('plank',12,0.3,0.5,0,4.15,0);
  const beams=B.endGrid({xs:[-2,2]});
  assert.equal(bays.length,3); assert.equal(beams.length,3); assert.equal(B.objects.length,6);
  assert.equal(g.physics.boxes.length,3,'the one collider became one a bay');
  for (const o of bays) { assert.equal(o.boxes.length,1); assert.ok(Math.abs((o.boxes[0].max.x-o.boxes[0].min.x)-4)<1e-6); assert.equal(o.raze,true); assert.equal(o.tag,'wall'); }
  // the geometry of the three bays is the whole wall, and each end that was cut is closed
  const vol=bays.reduce((n,o)=>n+o.items.reduce((m,it)=>m+volume(it.geo),0),0);
  assert.ok(Math.abs(vol-12*4*0.6)<0.05,'the bays hold the volume of the wall ('+vol.toFixed(2)+')');
  const D=V.destructs.create(g,mats,B.objects,new T.Group()), dir=new T.Vector3(0,0,-1);
  const [left,mid,right]=D.tagged('wall').sort((a,b)=>a.c.x-b.c.x), beam=D.tagged('beam').sort((a,b)=>a.c.x-b.c.x);
  for (const b of beam) assert.equal(b.supports.length,1,'a length of beam rests on the bay under it, not on its neighbours');
  assert.equal(beam[1].supports[0],mid);
  // the dead do not break buildings
  assert.equal(D.smash(0,0.2,1.5,5000),false); assert.equal(mid.state,'whole'); assert.equal(mid.hp,1000);
  // a blast against the foot of the wall is measured to the face of the wall, not to its middle two metres up
  D.blast(new T.Vector3(0,0.3,0.6),1.5,400); assert.ok(mid.hp<1000-150,'the bay it went off against is hurt ('+mid.hp+')'); assert.equal(left.hp,1000,'a bay out of reach is not');
  // worn down, the middle bay snaps: a stump is left standing in the way, and the beam over it falls
  D.hit(mid,new T.Vector3(0,1.2,0.3),dir,4000); assert.equal(mid.state,'stump'); assert.equal(mid.boxes.length,1); assert.ok(mid.boxes[0].max.y<2.4&&mid.boxes[0].max.y>0.5,'the stump is lower and still there');
  assert.equal(mid.hp,500,'what is left has half the strength of the whole'); assert.equal(D.standing(mid),false); assert.equal(D.standing(left),true);
  assert.equal(beam[1].state,'whole'); for (let i=0;i<90;i++) { V.loose.updateBodies(1/60); D.update(1/60); }
  assert.equal(beam[1].state,'gone','what rested on the bay follows it down'); assert.equal(beam[0].state,'whole'); assert.equal(beam[2].state,'whole');
  // the stump can be worn down in turn, and then nothing stands there
  D.hit(mid,new T.Vector3(0,0.5,0.3),dir,400); assert.equal(mid.state,'stump'); D.hit(mid,new T.Vector3(0,0.5,0.3),dir,900); assert.equal(mid.state,'gone'); assert.equal(mid.boxes.length,0);
  assert.equal(g.physics.boxes.length,2); assert.equal(right.state,'whole');
  // what is down is told to a machine that was not there, and a new run puts everything back
  const told=D.netList(); assert.ok(told.indexOf('.w.')>0&&told.split(';').length>=3);
  D.reset(); V.loose.clearBodies();
  for (const o of D.objects) { assert.equal(o.state,'whole'); assert.equal(o.hp,o.hp0); }
  assert.equal(g.physics.boxes.length,3);
  D.netSync(told); assert.equal(mid.state,'gone'); assert.equal(beam[1].state,'gone'); assert.equal(left.state,'whole');
});

test('the church, its tower and the mausoleums are buildings that can be brought down, bay by bay',()=>{
  const {V}=load(); const T=V.THREE, kit=V.kit, g=navGame(T);
  const mat=new T.MeshStandardMaterial(), mats={get:()=>mat,cache:new Map()};
  V.loose=V.phys.create(g);
  const B=new kit.Builder(g,mats), church=V.church.build(B,{g,mats}), yard=V.yard.build(B,{g,mats,root:new T.Group(),dyn:new T.Group()});
  const D=V.destructs.create(g,mats,B.objects,new T.Group());
  const walls=D.tagged('church'), roof=D.tagged('church-roof'), tower=D.tagged('tower').sort((a,b)=>a.c.y-b.c.y), crypts=D.tagged('crypt');
  assert.equal(walls.length,16,'sixteen bays of wall'); assert.equal(roof.length,7,'seven bays of roof'); assert.equal(tower.length,4,'four tiers of tower'); assert.equal(crypts.length,4);
  for (const w of walls) { assert.ok(w.raze&&w.boxes.length>=1&&w.hp0>=2000,'a bay of wall is hard to bring down and has its own colliders'); assert.equal(w.supports,undefined); }
  for (const r of roof) assert.ok(r.supports.length>=2&&r.supports.every((q)=>q.tag==='church'),'a bay of roof stands on the walls ('+r.supports.length+')');
  assert.equal(tower[0].supports,undefined); for (let i=1;i<4;i++) { assert.equal(tower[i].supports.length,1); assert.equal(tower[i].supports[0],tower[i-1],'each tier stands on the one below'); }
  for (const c of yard.crypts) { assert.ok(crypts.includes(c.body),'each mausoleum the dead walk out of is one of them'); assert.equal(D.standing(c.body),true); }
  assert.equal(D.tagged('door').length,4); for (const d of D.tagged('door')) assert.ok(d.supports.length>=1,'a door hangs on its wall');
  for (const f of D.tagged('fitting')) assert.equal(f.supports.length,1,'a chandelier hangs from one bay of roof');
  // a bay of the east wall: closed to the dead while it stands, open once it has been razed, and the roof over it gone
  const free=(n,x,z)=>{ const c=n.idx(x,z); return c>=0&&!n.blocked[c]; };
  assert.equal(free(V.zombieNav(g,church.entrances),V.CH.hw-0.45,-4.5),false);
  const bay=walls.find((w)=>w.c.x>6&&Math.abs(w.c.z+4.5)<1), over=roof.find((r)=>Math.abs(r.c.z+4.5)<1);
  const at=new T.Vector3(V.CH.hw+0.8,1.2,-4.5); let n=0;
  while (bay.state!=='gone'&&n++<60) D.blast(at,4.9,420);
  assert.equal(bay.state,'gone'); assert.ok(n>=10&&n<=40,'it takes some doing: '+n+' grenades');
  for (let i=0;i<120;i++) { V.loose.updateBodies(1/60); D.update(1/60); }
  assert.equal(over.state,'gone'); assert.equal(roof.filter((r)=>r.state==='gone').length,1,'only the bay over it');
  assert.equal(free(V.zombieNav(g,church.entrances),V.CH.hw-0.45,-4.5),true,'the dead can come through where the wall was');
  // the tower: its base gone, the tiers above come down one after another
  while (tower[0].state!=='gone') D.hit(tower[0],null,null,5000);
  for (let i=0;i<300;i++) { V.loose.updateBodies(1/60); D.update(1/60); }
  same(tower.map((t)=>t.state),['gone','gone','gone','gone']);
  // a mausoleum with its top off no longer stands
  D.hit(crypts[0],null,null,9000); assert.equal(crypts[0].state,'stump'); assert.equal(D.standing(crypts[0]),false);
  D.reset(); V.loose.clearBodies();
  assert.ok(D.objects.every((o)=>o.state==='whole'));
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
  assert.equal(REC,14);
  // the last character is how high a flyer or a spider on a wall is: to within a tenth of a metre, up to above the airspace
  assert.ok(V.zpack.ALT/63<=0.1&&V.zpack.ALT>=V.FLY.top+1);
  for (const n of [0,1,63,64,4095]) { const s=e64(n,2); assert.equal(s.length,2); assert.equal(d64(s,0,2),n); assert.ok(!/^\d+$/.test('Z'+s),'never reads as a number'); }
  for (const x of [-64,-12.34,0,0.02,33.3,64]) assert.ok(Math.abs(uPos(qPos(x))-x)<0.02,`position ${x} survives to within 2 cm`);
  assert.equal(qPos(-999),0); assert.equal(qPos(999),4095);
  // a full house of zombies fits one field of room state
  assert.ok(3+76*REC<2048);
});

test('every vigil kit and sidearm is one of the arsenal\'s modelled weapons, on the right rig and in the map\'s roster',()=>{
  const {window,V}=load();
  const vm=require('node:vm');
  const ctx=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('src/arsenal.js','utf8'),ctx);
  const arsenal=ctx.window.GunslingerArsenal, roster=window.GunslingerMaps.vigil.arsenal.roster;
  const weapons=new Set();
  for (const id of V.KIT_ORDER) { const w=arsenal.byId(V.KITS[id].weapon); assert.ok(w,`${id} has a weapon`); assert.equal(w.rig,'rifle',id); assert.ok(roster.includes(w.id),id); weapons.add(w.id); }
  for (const id of Object.keys(V.SIDEARMS)) { const w=arsenal.byId(V.SIDEARMS[id].weapon); assert.ok(w,`${id} has a weapon`); assert.equal(w.rig,'pistol',id); assert.ok(roster.includes(w.id),id); weapons.add(w.id); }
  assert.equal(weapons.size,V.KIT_ORDER.length+Object.keys(V.SIDEARMS).length,'no two kits share a weapon');
  assert.deepEqual([...V.SIDEARM_ORDER].sort(),Object.keys(V.SIDEARMS).sort(),'2 cycles through every sidearm');
  assert.ok(V.KIT_ORDER.every(id=>roster.includes(V.KITS[id].weapon))&&roster.length===V.KIT_ORDER.length+V.SIDEARM_ORDER.length,'the roster is exactly the kits and sidearms a run carries');
  assert.equal(arsenal.byKey('Digit7'),undefined,'the support platform stays off the harbor\'s keys');
  assert.ok(!arsenal.weapons.some(w=>w.id==='support'),'and out of the harbor\'s six');
});

test('the flak cannon and the rocket launcher are kits a night must buy, on 8 and 9, and their shots are shells',()=>{
  const {V}=load();
  same(V.KIT_START,[],'a night starts with the pistol alone: every rifle is bought');
  for (const id of V.KIT_ORDER) { const k=V.KITS[id]; assert.ok(V.AMMO[k.ammo]&&k.gives>0&&k.gives<=V.AMMO[k.ammo].cap&&k.price>0,`${id} takes a kind of ammunition, comes with some, and has a price`); assert.ok(!('mag' in k)&&!('reserve' in k),`${id} has no magazine`); }
  same([V.KITS.carbine.ammo,V.KITS.dmr.ammo,V.KITS.lmg.ammo,V.KITS.buck.ammo,V.KITS.pump.ammo],['rifle','rifle','rifle','shell','shell'],'guns of a kind share their ammunition');
  // the pump gun: twelve pellets a shell against the KR-12's nine, each harder, fewer of them a minute, and no shell of its own
  { const pump=V.KITS.pump, buck=V.KITS.buck; assert.equal(pump.slot,0); assert.ok(!pump.buy&&!pump.shell&&!pump.auto); assert.ok(pump.pellets>buck.pellets&&pump.dmg>buck.dmg&&pump.rpm<buck.rpm*0.5,'it hits harder and is slower'); assert.ok(pump.dmg*pump.pellets*pump.rpm<buck.dmg*buck.pellets*buck.rpm,'and does less in a minute than the semi-automatic'); }
  for (const id of ['flak','rocket']) {
    const k=V.KITS[id];
    assert.ok(k.buy&&!V.KIT_START.includes(id)&&k.price>=4000,id); assert.ok(V.SHELLS[k.shell],`${id} throws a shell`); assert.equal(k.weapon,id);
    assert.ok(!k.auto&&k.move<1&&!k.pellets&&!k.pierce&&k.ammo===id,id);
  }
  same([V.KITS.flak.slot,V.KITS.rocket.slot],[8,9]);
  assert.ok(V.AMMO.flak.cap<=30&&V.AMMO.rocket.cap<=8&&V.KITS.rocket.rpm<V.KITS.flak.rpm,'few of them can be carried, and the rocket is the slower');
  assert.ok(V.KITS.rocket.dmg>V.KITS.flak.dmg*3&&V.SHELLS.rocket.radius>V.SHELLS.flak.radius,'the rocket is the big one');
  assert.ok(V.KITS.rocket.price>V.KITS.flak.price&&V.KITS.flak.price>V.KITS.dmr.price,'late purchases');
  // where the director uses them
  const src=fs.readFileSync('src/vigil/director.js','utf8');
  assert.ok(src.includes('for (const id of V.KIT_START) giveKit(id, false);'),'a night begins without them');
  assert.ok(src.includes('/^Digit[03-9]$/.test(code)'),'8, 9 and 0 are kit keys');
  const shot=src.slice(src.indexOf('g.combat.playerShot = '),src.indexOf('g.ballistics.impact = '));
  assert.ok(/if \(!pistol && k\.shell && V\.shells\) \{[\s\S]*V\.shells\.fire\(origin,[\s\S]*return null;\s*\}\s*for \(let i = 0; i < n; i\+\+\)/.test(shot),'a shell kit never reaches the pellet and pierce code');
  assert.ok(src.includes('explode: (pos, radius, damage, size) => V.defenses.explode(pos, radius, damage, size)'),'a burst is the grenade\'s own path');
  assert.ok(src.includes('weaponUpdate(dt);')&&!src.includes('weaponUpdate(dt * k)'),'nothing is reloaded, so nothing hurries or slows a reload');
  // the armory charges for the shells and rockets that are missing, and the page loads the shells before the director
  assert.ok(!fs.readFileSync('src/vigil/ui.js','utf8').includes("id: 'ammo'"),'the armory sells no ammunition: the pile does');
  const html=fs.readFileSync('index.html','utf8'); assert.ok(html.indexOf('src/vigil/shells.js')>0&&html.indexOf('src/vigil/shells.js')<html.indexOf('src/vigil/director.js'));
});

test('a shell in the air: the flak round drops, the rocket gathers speed, and the fuse is measured in three dimensions',()=>{
  const {V}=load(); const K=V.SHELLS, close=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} is not ${b}`);
  // the flak round: muzzle speed held, falling under its own weight
  const f={x:0,y:1.6,z:0,vx:0,vy:0,vz:-K.flak.speed,t:0,dist:0}; let d=0;
  for (let i=0;i<60;i++) d+=V.shellStep(f,K.flak,1/120);
  close(f.t,0.5,1e-9); close(f.z,-K.flak.speed*0.5,1e-6);
  const drop=1.6-f.y, half=0.5*K.flak.gravity*0.25; assert.ok(drop>half*0.95&&drop<half*1.08,'it has dropped about half g t squared: '+drop);
  close(f.dist,d,1e-9); assert.ok(f.dist>=K.flak.speed*0.5);
  // the rocket: thrown out slowly, then the motor takes it to its top speed and no further
  const r={x:0,y:1.6,z:0,vx:0,vy:0,vz:-K.rocket.speed,t:0,dist:0}, sp=()=>Math.hypot(r.vx,r.vy,r.vz);
  V.shellStep(r,K.rocket,0.1); assert.ok(sp()>K.rocket.speed+K.rocket.accel*0.1*0.95&&sp()<K.rocket.top);
  for (let i=0;i<200;i++) V.shellStep(r,K.rocket,1/120);
  assert.ok(sp()>=K.rocket.top*0.99&&sp()<K.rocket.top*1.03,'top speed '+sp()); assert.ok(r.y>-1.5&&r.y<1.6,'a rocket barely drops: '+r.y);
  assert.ok(K.rocket.speed<K.flak.speed&&K.rocket.top>90,'it leaves slower than a shell and ends as fast');
  // the fuse: a body beside the path, one above it (what flies), one too far, one already inside
  close(V.shellNear(0,0,0, 0,0,-10, 1,0,-5, 2),(5-Math.sqrt(3))/10,1e-9);
  close(V.shellNear(0,5,0, 0,5,-10, 0,6.5,-5, 2),(5-Math.sqrt(4-2.25))/10,1e-9);
  assert.equal(V.shellNear(0,0,0, 0,0,-10, 0,6.5,-5, 2),-1,'the same body from the ground is out of reach: height counts');
  assert.equal(V.shellNear(0,0,0, 0,0,-10, 3,0,-5, 2),-1); assert.equal(V.shellNear(0,0,0, 0,0,-10, 0,0,-13, 2),-1,'not reached on this step');
  assert.equal(V.shellNear(0,0,0, 0,0,-10, 0.5,0,0.5, 2),0,'already inside'); assert.equal(V.shellNear(1,1,1, 1,1,1, 9,9,9, 1),-1);
  // what ends a step: the nearest of a wall, a body struck, a body passed (once armed), or time
  const fate=(...a)=>{const q=V.shellFate(...a); return q?q.why+'@'+q.d:null;};
  assert.equal(fate(1,Infinity,Infinity,-1,true,false),null,'it flies on');
  assert.equal(fate(1,0.6,Infinity,-1,true,false),'wall@0.6'); assert.equal(fate(1,0.6,0.4,-1,true,false),'body@0.4'); assert.equal(fate(1,0.6,0.4,0.3,true,false),'near@0.3');
  assert.equal(fate(1,0.6,0.4,0.3,false,false),'body@0.4','unarmed, passing close does nothing'); assert.equal(fate(1,Infinity,Infinity,0.3,false,false),null);
  assert.equal(fate(1,1.4,Infinity,-1,true,false),null,'a wall beyond the step is next time\'s'); assert.equal(fate(1,Infinity,Infinity,-1,true,true),'spent@1'); assert.equal(fate(1,0.2,Infinity,-1,true,true),'wall@0.2');
  assert.ok(K.flak.fuse>1&&K.flak.arm>=4&&K.rocket.arm>=4&&K.rocket.fuse<K.flak.fuse&&K.flak.radius<K.rocket.radius);
});

test('shells in a made-up yard: one bursts on the wall, one beside a body it passes, each through the blast it is given, and a hit is counted once',()=>{
  const {V}=load(); const T=V.THREE, g=fakeGame(T), blasts=[], hits=[], noises=[];
  // a wall across z = -30; two bodies standing, one of them 1.2 m off the line of fire at z = -18
  const wallZ=-30, mk=(x,y,z)=>({pos:new T.Vector3(x,y,z),scale:1,r:0.34,alive:true});
  const list=[mk(1.2,0,-18),mk(-9,0,-18)];
  g.physics.raycast=(o,d,len)=>{ if(d.z>=0) return null; const t=(wallZ-o.z)/d.z; return t>=0&&t<=len?{dist:t,point:new T.Vector3(o.x+d.x*t,o.y+d.y*t,wallZ),normal:new T.Vector3(0,0,1)}:null; };
  g.enemies={list,raycast:()=>null,forEachInRadius(x,z,r,fn){for(const q of list) if(q.alive&&Math.hypot(q.pos.x-x,q.pos.z-z)<=r+q.r) fn(q);}};
  g.combat={stats:{shots:0,hits:0}}; g.player={pos:new T.Vector3(0,0,0),addShake(){}}; g.scene=new T.Scene();
  V.shells.install(g,{explode:(pos,radius,damage,size)=>{blasts.push({x:pos.x,y:pos.y,z:pos.z,radius,damage,size}); for(const q of list) if(Math.hypot(q.pos.x-pos.x,q.pos.z-pos.z)<2.5) q.alive=false;},noise:(x,z,r)=>noises.push(r),hit:(enemy,killed)=>hits.push(killed)});
  const run=(secs)=>{for(let i=0;i<secs*60;i++) V.shells.update(1/60);};
  // a rocket fired level down the yard, well wide of both bodies: it strikes the wall and bursts just clear of it
  assert.ok(V.shells.fire({x:-4,y:1.6,z:0},{x:0,y:0,z:-1},{kind:'rocket',damage:950})); assert.equal(V.shells.count(),1);
  V.shells.update(0); assert.equal(V.shells.count(),1,'a frame of no time moves nothing');
  run(1.2); assert.equal(V.shells.count(),0); assert.equal(blasts.length,1);
  assert.ok(Math.abs(blasts[0].z-(wallZ+0.15))<1e-6&&Math.abs(blasts[0].x+4)<1e-6,'at the wall, clear of it'); assert.equal(blasts[0].damage,950); assert.equal(blasts[0].radius,V.SHELLS.rocket.radius);
  assert.equal(V.shells.last.why,'wall'); assert.equal(g.combat.stats.hits,0,'nobody was in it'); same(hits,[]); same(noises,[V.SHELLS.rocket.noise]);
  // a flak round down the middle: it passes the nearer body inside its fuse and bursts there, short of the wall
  V.shells.fire({x:0,y:1.0,z:0},{x:0,y:0,z:-1},{kind:'flak',damage:250}); run(0.6);
  assert.equal(blasts.length,2); assert.equal(V.shells.last.why,'near'); assert.ok(blasts[1].z<-15&&blasts[1].z>-18.5,'beside the body, at '+blasts[1].z);
  assert.equal(blasts[1].radius,V.SHELLS.flak.radius); assert.equal(g.combat.stats.hits,1,'one shell, one hit'); same(hits,[true]); assert.equal(V.shells.last.killed,1);
  // inside its arming distance the fuse is dead: a body at arm's length is passed, not burst beside
  list.push(mk(1.2,0,-3)); V.shells.fire({x:0,y:1.0,z:0},{x:0,y:0,z:-1},{kind:'flak',damage:250}); run(0.6);
  assert.equal(blasts.length,3); assert.equal(V.shells.last.why,'wall','it went on to the wall'); assert.ok(list[2].alive);
  // one that meets nothing bursts by itself when its time is up; a new night clears the air
  g.physics.raycast=()=>null; V.shells.fire({x:40,y:30,z:0},{x:0,y:1,z:0},{kind:'flak',damage:1}); run(V.SHELLS.flak.life+0.2);
  assert.equal(V.shells.last.why,'spent'); assert.equal(V.shells.count(),0);
  V.shells.fire({x:40,y:30,z:0},{x:0,y:1,z:0},{kind:'rocket',damage:1}); assert.equal(V.shells.fire({x:41,y:30,z:0},{x:0,y:1,z:0},{kind:'nothing'}),null); assert.equal(V.shells.count(),1,'an unknown kind is not fired');
  V.shells.reset(); assert.equal(V.shells.count(),0); assert.equal(V.shells.last,null);
});

// A stand-in level for the zombies' own navigation: the engine's grid rectangle and a list of colliders.
function navGame(T) { const g=fakeGame(T); g.physics.nav={_grid:()=>({w:256,h:256,minX:-64,minZ:-64,cell:0.5})}; return g; }
// Follows a field downhill from (x, z) in quarter-metre steps. Reports whether it arrived and which ways in it crossed.
const SIZE_NAME=['small','brute','boss'];
function follow(nav,field,x,z,size=0) {
  const out={x:0,z:0}, zones=new Set(), blk=nav.blockedOf(size);
  for (let i=0;i<6000;i++) {
    const c=nav.idx(x,z); assert.ok(c>=0&&!blk[c],`never inside an obstacle (${x.toFixed(2)}, ${z.toFixed(2)})`);
    if (nav.zone[c]) zones.add(nav.zone[c]);
    if (field[c]<2.5) return {ok:true,zones,steps:i};
    if (!nav.dirAt(field,x,z,out,size)) return {ok:false,zones,x,z};
    assert.ok(Math.abs(Math.hypot(out.x,out.z)-1)<1e-6,'a unit direction');
    x+=out.x*0.25; z+=out.z*0.25;
  }
  return {ok:false,zones,x,z};
}

test('each of the dead is sent to a way in, and its field takes it through that one only',()=>{
  const {V}=load(); const T=V.THREE, g=navGame(T);
  // a square room round the crystal, 16 m across, with a 3 m door in the south wall and a 2 m door in the east
  const wall=(x0,z0,x1,z1)=>g.physics.addBox([x0,0,z0],[x1,4,z1]);
  wall(-8.5,-8.5,8.5,-7.5); wall(-8.5,-8.5,-7.5,8.5); wall(-8.5,7.5,-1.5,8.5); wall(1.5,7.5,8.5,8.5); wall(7.5,-8.5,8.5,-1); wall(7.5,1,8.5,8.5);
  const ways=[{id:'south',x0:-1.5,x1:1.5,z0:7.2,z1:8.8,wide:true},{id:'east',x0:7.2,x1:8.8,z0:-1,z1:1}];
  const nav=V.zombieNav(g,ways);
  assert.equal(nav.routes.length,2); assert.equal(nav.routes[0].fields.length,nav.LANES); assert.ok(nav.LANES>=2);
  // from every side, in every lane, each route arrives through its own door and never the other
  for (const [x,z] of [[0,30],[30,0],[-30,0],[0,-30],[25,25],[-28,-22]]) for (let r=0;r<2;r++) for (let k=0;k<nav.LANES;k++) {
    const res=follow(nav,nav.field(r,k),x,z);
    assert.ok(res.ok,`route ${ways[r].id} lane ${k} from (${x}, ${z}) arrives`);
    assert.deepEqual([...res.zones],[r+1],`route ${ways[r].id} lane ${k} from (${x}, ${z}) uses its own door`);
  }
  // lanes are different ground: the same journey costs differently in each
  const c=nav.idx(0,40), costs=nav.routes[0].fields.map(f=>f[c]); assert.ok(new Set(costs.map(v=>v.toFixed(1))).size>1,`lanes differ (${costs})`);
  // the nearer door is the likelier, the other is still taken, a crowd at one sends more to the other, and the biggest keep to the wide one
  const tally=(x,z,wide,load)=>{ const n=[0,0]; for (let i=0;i<4000;i++) n[nav.route(x,z,wide,load)]++; return n; };
  const fromSouth=tally(0,35), fromEast=tally(35,0);
  assert.ok(fromSouth[0]>fromSouth[1]&&fromSouth[1]>200,`from the south: ${fromSouth}`); assert.ok(fromEast[1]>fromEast[0]&&fromEast[0]>200,`from the east: ${fromEast}`);
  assert.ok(tally(0,35,false,[30,0])[1]>fromSouth[1]*1.3,'a crowded door is avoided');
  same(tally(35,0,true),[4000,0]);
  // nothing shuffles past an open door: bound for the south one but standing at the east one, it takes the east; from far off it keeps its choice
  assert.equal(nav.nearer(0,10.5,0,false),1); assert.equal(nav.nearer(0,34,0,false),0); assert.equal(nav.nearer(0,10.5,0,true),0,'unless it does not fit');
  // shut the south door: its route still arrives, round by the east one, once the fields have been brought up to date a slice at a time
  wall(-1.5,7.5,1.5,8.5); nav.rebuild();
  let slices=0; while (nav.tick()>0) slices++;
  assert.ok(slices>8,`the rebuild is spread over frames (${slices} slices)`);
  const round=follow(nav,nav.field(0,0),0,30); assert.ok(round.ok); assert.deepEqual([...round.zones],[2]);
});

test('the church has four ways in, all open to the dead and wide enough to come through abreast',()=>{
  const {V}=load(); const T=V.THREE, kit=V.kit, g=navGame(T);
  const mat=new T.MeshStandardMaterial(), mats={get:()=>mat,cache:new Map()};
  const B=new kit.Builder(g,mats), church=V.church.build(B,{g,mats});
  same(church.entrances.map(e=>e.id),['south','west','east','north']);
  const nav=V.zombieNav(g,church.entrances), free=(x,z)=>{ const c=nav.idx(x,z); return c>=0&&!nav.blocked[c]; };
  // the main door's leaves, swung out against the facade, are in the grid (the dead walked into them and stuck when they were not), and the doorway between them is open
  const hd=V.CH.hd; assert.ok(!free(3,hd+0.3)&&!free(-3,hd+0.3),'the open leaves are closed cells'); assert.ok(free(0,hd+0.3)&&free(1.2,hd+0.3)&&free(-1.2,hd+0.3),'the doorway is not');
  for (let r=0;r<4;r++) {
    const e=church.entrances[r], alongX=e.x1-e.x0>e.z1-e.z0;
    // the narrowest line across the threshold still leaves room for several bodies (half-metre cells, 0.34 m bodies)
    let narrow=1e9;
    if (alongX) for (let z=e.z0+0.25;z<e.z1;z+=0.5){ let n=0; for (let x=e.x0+0.25;x<e.x1;x+=0.5) if (free(x,z)) n++; narrow=Math.min(narrow,n); }
    else for (let x=e.x0+0.25;x<e.x1;x+=0.5){ let n=0; for (let z=e.z0+0.25;z<e.z1;z+=0.5) if (free(x,z)) n++; narrow=Math.min(narrow,n); }
    assert.ok(narrow>=4,`${e.id}: ${narrow} cells across at its narrowest`);
    // and from 25 m outside on its own side the route reaches the crystal through it and nothing else
    const from={south:[0,38],west:[-32,-4],east:[32,4],north:[3,-38]}[e.id], res=follow(nav,nav.field(r,0),from[0],from[1]);
    assert.ok(res.ok,`${e.id} leads to the crystal`); assert.deepEqual([...res.zones],[r+1],`${e.id} is entered by its own threshold`);
  }
  // inside, the nave is not a single file: three aisles run up it past the pews
  const open=[]; for (let x=-6.4;x<6.5;x+=0.5) open.push(free(x,5.2)?'.':'#');
  const runs=open.join('').split('#').filter(Boolean).map(s=>s.length);
  assert.ok(runs.length>=3&&Math.max(...runs)>=5,`aisles across the nave at the pews: ${open.join('')}`);
});

test('the big ones have grids of their own and are only sent where they fit',()=>{
  const {V}=load(); const T=V.THREE, kit=V.kit, g=navGame(T);
  const brute=V.zombieSize('brute'), boss=V.zombieSize('boss');
  same(['walker','runner','spitter','brute','boss','wolf','burster','pyre','demon','skull','bat','spider','greatspider'].map(V.zombieSize),[0,0,0,1,2,0,0,0,0,0,0,0,1]);
  // a room with a 3 m door to the south, a 1.4 m gap to the east that only the small fit, and a post in the south doorway's approach
  const wall=(x0,z0,x1,z1,o)=>g.physics.addBox([x0,0,z0],[x1,5,z1],o);
  wall(-8.5,-8.5,8.5,-7.5); wall(-8.5,-8.5,-7.5,8.5); wall(-8.5,7.5,-1.5,8.5); wall(1.5,7.5,8.5,8.5); wall(7.5,-8.5,8.5,-0.7); wall(7.5,0.7,8.5,8.5);
  const post=g.physics.addBox([-0.1,0,11.9],[0.1,2,12.1],{noNav:true});
  const ways=[{id:'south',x0:-1.5,x1:1.5,z0:7.2,z1:8.8,wide:true},{id:'east',x0:7.2,x1:8.8,z0:-0.7,z1:0.7,wide:true}];
  const nav=V.zombieNav(g,ways), at=(x,z)=>nav.idx(x,z);
  // the small slip through the gap and round the post; neither of the big ones is offered the gap
  { const res=follow(nav,nav.field(1,0),30,0); assert.ok(res.ok,'the small come in by the gap'); same([...res.zones],[2]); }
  same([0,1].map(r=>nav.usable(r,0)),[true,true]); same([0,1].map(r=>nav.usable(r,brute)),[true,false]); same([0,1].map(r=>nav.usable(r,boss)),[true,false]);
  for (const size of [brute,boss]) {
    for (let i=0;i<200;i++) assert.equal(nav.route(30,0,size),0,'standing at the gap, it still makes for the door');
    const res=follow(nav,nav.field(1,0,size),30,0,size); assert.ok(res.ok,'its field for the shut way leads round'); same([...res.zones],[1]);
    // the post is nothing to the small and solid to the big: their grid is closed round it, by their own girth
    assert.ok(!nav.blocked[at(0,12)]&&nav.blockedOf(size)[at(0,12)],'the post stands in the big grid only');
    const r=V.ZOMBIES[SIZE_NAME[size]].r; assert.ok(nav.blockedOf(size)[at(r,12)]&&!nav.blockedOf(size)[at(r+1.1,12)],'by about its radius');
    const way=follow(nav,nav.field(0,0,size),0,30,size); assert.ok(way.ok,'and the way past it is found'); same([...way.zones],[1]);
  }
  // a lintel the brute walks under stops the abomination: 3.2 m of headroom across the south door
  g.physics.addBox([-1.5,3.2,7.5],[1.5,5,8.5],{noNav:true}); nav.rebuild(); nav.settle();
  assert.ok(nav.usable(0,brute)&&!nav.usable(0,boss),'the low door is the brute\'s but not the abomination\'s');
  assert.ok(!nav.blockedOf(0)[at(0,8)]&&!nav.blockedOf(brute)[at(0,8)]&&nav.blockedOf(boss)[at(0,8)]);
  // with every way shut to it, it is still given something to walk toward
  assert.equal(nav.route(0,30,boss),0);
  // fields toward the living are kept for a size only while one of that size walks
  nav.buildFor('me',0,0); assert.ok(nav.fieldOf('me')&&!nav.fieldOf('me',brute));
  nav.live(brute,1); nav.buildFor('me',0,0); assert.ok(nav.fieldOf('me',brute)&&!nav.fieldOf('me',boss));
  assert.ok(nav.fieldOf('me',brute)[at(30,0)]>nav.fieldOf('me')[at(30,0)]+10,'the brute\'s way to a player inside is the long way round');
  nav.live(brute,0); nav.buildFor('me',0,0); assert.ok(!nav.fieldOf('me',brute));
  g.physics.removeBox(post);
});

test('a brute fits every way into the church, the abomination the main door and the breach, and neither meets the furniture',()=>{
  const {V}=load(); const T=V.THREE, kit=V.kit, g=navGame(T);
  const mat=new T.MeshStandardMaterial(), mats={get:()=>mat,cache:new Map()};
  const B=new kit.Builder(g,mats), church=V.church.build(B,{g,mats});
  const nav=V.zombieNav(g,church.entrances), brute=V.zombieSize('brute'), boss=V.zombieSize('boss'), ids=church.entrances.map(e=>e.id);
  same(ids.filter((id,r)=>nav.usable(r,brute)),['south','west','east','north']);
  same(ids.filter((id,r)=>nav.usable(r,boss)),['south','north'],'a side door is lower than the abomination\'s head');
  same(church.entrances.filter(e=>e.wide).map(e=>e.id),['south','north'],'and those are the two the level calls wide');
  const from={south:[[0,38],[14,36],[-14,36]],west:[[-32,-4],[-30,12]],east:[[32,4],[30,-12]],north:[[3,-38],[-12,-36],[14,-36]]};
  for (const size of [brute,boss]) for (let r=0;r<4;r++) {
    if (!nav.usable(r,size)) continue;
    const e=church.entrances[r], blk=nav.blockedOf(size), alongX=e.x1-e.x0>e.z1-e.z0;
    // room to come through: at least two of its cells across the threshold at the narrowest
    let narrow=1e9; const open=(x,z)=>{ const c=nav.idx(x,z); return c>=0&&!blk[c]; };
    if (alongX) for (let z=e.z0+0.25;z<e.z1;z+=0.5){ let n=0; for (let x=e.x0+0.25;x<e.x1;x+=0.5) if (open(x,z)) n++; narrow=Math.min(narrow,n); }
    else for (let x=e.x0+0.25;x<e.x1;x+=0.5){ let n=0; for (let z=e.z0+0.25;z<e.z1;z+=0.5) if (open(x,z)) n++; narrow=Math.min(narrow,n); }
    assert.ok(narrow>=2,`${SIZE_NAME[size]} at ${e.id}: ${narrow} cells across`);
    for (const [x,z] of from[e.id]) {
      const res=follow(nav,nav.field(r,0,size),x,z,size);
      assert.ok(res.ok,`${SIZE_NAME[size]} by ${e.id} from (${x}, ${z}) reaches the crystal`); same([...res.zones],[r+1],`${SIZE_NAME[size]} by ${e.id} comes in by its own threshold`);
    }
  }
  // the candelabra by the altar are thin enough for the small to slip round and are closed to the big by their girth
  { const c=nav.idx(-2.9,-9.3); assert.ok(!nav.blocked[c]&&nav.blockedOf(brute)[c]&&nav.blockedOf(boss)[c],'the standing candelabrum'); }
  // the one that stood in the way in from the breach is down, and the abomination walks where it was
  { const c=nav.idx(2.9,-9.3); assert.ok(!nav.blockedOf(brute)[c]&&!nav.blockedOf(boss)[c],'the way in from the breach is clear'); }
});

test('the music follows the night: the organ between waves, the fight during them, the boss theme while one walks',()=>{
  const {V}=load(); const cue=V.musicCue, base={state:'playing',phase:'prep',over:false,boss:false,bossWave:false,stacked:false,alive:0,crystal:1,cue:null,held:0};
  const at=(o)=>cue(Object.assign({},base,o));
  assert.equal(at({state:'title'}),'prep'); assert.equal(at({}),'prep'); assert.equal(at({state:'intro'}),'prep');
  assert.equal(at({phase:'active',alive:8}),'wave');
  // it steps up for a crowd, for waves on top of each other, for a crystal that is going, and for the whole of a wave that brings a boss
  for (const o of [{alive:22},{stacked:true},{crystal:0.3},{bossWave:true}]) assert.equal(at(Object.assign({phase:'active',alive:8},o)),'surge',JSON.stringify(o));
  assert.equal(at({phase:'active',bossWave:true,boss:true,alive:30}),'boss'); assert.equal(at({phase:'active',boss:true}),'boss','a boss in any wave');
  assert.equal(at({phase:'active',bossWave:true,boss:false,cue:'boss',held:40,alive:3}),'surge','the boss is down and the wave is not over');
  // once up it stays up until things have eased for a while: no flapping at the threshold
  assert.equal(at({phase:'active',alive:20,cue:'surge',held:5}),'surge'); assert.equal(at({phase:'active',alive:20,cue:'surge',held:60}),'surge');
  assert.equal(at({phase:'active',alive:10,cue:'surge',held:5}),'surge'); assert.equal(at({phase:'active',alive:10,cue:'surge',held:19}),'wave');
  assert.equal(at({phase:'active',alive:10,crystal:0.45,cue:'surge',held:60}),'surge');
  // the organ comes back when the wave is cleared, pause keeps what was playing, defeat is silence
  assert.equal(at({phase:'prep',cue:'surge',held:90}),'prep'); assert.equal(at({state:'paused',phase:'active',alive:9,cue:'wave'}),'wave');
  // the wild dead, woken between waves, bring the fight's music with them; a woken abomination brings its own, wave or no wave
  assert.equal(at({phase:'prep',hunted:2}),'wave'); assert.equal(at({phase:'prep',hunted:0}),'prep'); assert.equal(at({phase:'prep',hunted:1,boss:true}),'boss');
  for (const o of [{state:'dead'},{state:'complete'},{phase:'active',over:true,boss:true}]) assert.equal(at(o),null,JSON.stringify(o));
  // how they change: the boss arrives at once, a wave comes up from behind a closed filter, the organ returns slowly after the fight has drained away
  const f=V.musicFade; for (const from of [null,'prep','wave','surge','boss']) for (const to of [null,'prep','wave','surge','boss']) { const r=f(from,to); assert.ok(r.length===4&&r.slice(0,3).every(v=>v>=0&&v<=6),`${from} to ${to}`); }
  assert.ok(f('surge','boss')[2]<0.5&&f('surge','boss')[0]<=1,'the boss theme cuts in'); assert.ok(f('prep','wave')[3]===true&&f('prep','surge')[3]===true&&!f('wave','surge')[3]);
  assert.ok(f('wave','prep')[0]>=4&&f('wave','prep')[1]>=1&&f('wave','prep')[2]>=4,'the fight fades out and the organ fades in after it');
  // the files the game is told about are there, each with its loop inside it and room either side (a copy without the music has none to check)
  if (!fs.existsSync('assets/music/vigil.json')) return;
  const list=JSON.parse(fs.readFileSync('assets/music/vigil.json','utf8'));
  same(Object.keys(list),['prep','wave','surge','boss']);
  for (const id of Object.keys(list)) {
    const c=list[id], size=fs.statSync('assets/music/'+c.file).size, secs=size*8/112000;
    assert.ok(c.start>=0.4&&c.end-c.start>=30&&c.end-c.start<=125,`${id}: a loop of ${(c.end-c.start).toFixed(1)} s`);
    assert.ok(secs>c.end+0.35&&secs<c.end+0.8,`${id}: ${secs.toFixed(1)} s of file for a loop that ends at ${c.end}`);
    assert.ok(c.gain>0.2&&c.gain<=2.5,`${id}: level`);
  }
  assert.ok(list.prep.gain<list.wave.gain&&list.wave.gain<=list.surge.gain&&list.surge.gain<=list.boss.gain,'each step up is no quieter than the last');
});

test('the storm strikes oftener on the title and while a boss walks, never behind the pause screen, and its bolt is a jagged line between two points',()=>{
  const {V}=load();
  const gap=(state,boss,calm)=>[V.stormGap(state,boss,calm,0),V.stormGap(state,boss,calm,1)];
  const title=gap('title'), play=gap('playing',false), boss=gap('playing',true);
  assert.ok(title[0]>=5&&title[1]<=14,`title: ${title}`); assert.ok(play[0]>=12&&play[1]<=40,`in play: ${play}`);
  assert.ok(boss[1]<play[0],'a boss brings the storm closer together'); assert.ok(title[1]<play[0],'and the title has more of it than a quiet wave');
  assert.equal(V.stormGap('paused',false,false,0.5),Infinity); same(gap('intro',false),play);
  assert.ok(V.stormGap('dead',false,false,0.5)>0&&V.stormGap('dead',false,false,0.5)<30);
  assert.ok(V.stormGap('title',false,true,0.5)>V.stormGap('title',false,false,0.5)*2,'less of it when motion is to be reduced');
  // the flash: two strokes with a dark gap between and an afterglow, never brighter than 1, gone at the end; one plain fade when flicker is unwelcome
  const f=(q,calm)=>V.stormFlicker(q*0.5,0.5,calm);
  assert.ok(f(0.05)===1&&f(0.2)<0.1&&f(0.35)>0.6&&f(0.9)<0.15&&f(0.9)>0); assert.equal(f(1),0); assert.equal(V.stormFlicker(-0.1,0.5),0);
  let prev=1; for (let q=0;q<1;q+=0.05){ const v=f(q,true); assert.ok(v<=prev+1e-9&&v<=0.7,'a calm strike only fades'); prev=v; }
  let flips=0, on=false; for (let q=0;q<1;q+=0.01){ const lit=f(q)>0.3; if (lit&&!on) flips++; on=lit; } assert.ok(flips<=2,`no more than two flashes in a strike (${flips})`);
  // the bolt's path starts and ends where it is told, wanders to the side between, and comes down all the way
  let seed=7; const rng=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
  const a=[10,300,400], b=[-20,-4,400], pts=V.stormPath(a,b,[1,0,0],32,30,rng);
  assert.equal(pts.length,33); for (let k=0;k<3;k++){ assert.ok(Math.abs(pts[0][k]-a[k])<3); assert.ok(Math.abs(pts[32][k]-b[k])<3); }
  assert.ok(pts.every(q=>q.every(Number.isFinite))&&pts.every(q=>Math.abs(q[2]-400)<1e-9),'it stays in its plane');
  const off=pts.map((q,i)=>q[0]-(a[0]+(b[0]-a[0])*i/32)); assert.ok(Math.max(...off.map(Math.abs))>6,'it is not a ruled line');
  assert.ok(Math.max(...off.map(Math.abs))<90,'nor does it leave the sky');
  let turns=0; for (let i=2;i<33;i++) if ((off[i]-off[i-1])*(off[i-1]-off[i-2])<0) turns++; assert.ok(turns>=8,`it kinks (${turns} turns)`);
});

test('the wild dead: how many wander, which kind comes next, which grave a broken stone opens, and how a totem rises',()=>{
  const {V}=load(); const W=V.WILD;
  // a few at the start, one more a wave for six waves, never more than the cap
  same([0,1,3,6,12].map(V.wildWanted),[W.base,W.base+1,W.base+3,W.base+6,Math.min(W.max,W.base+6)]); assert.ok(V.wildWanted(99)<=W.max&&W.max<=20);
  // mostly walkers; brutes not before wave 2 and never more than two; an abomination only from wave 5, one at a time, when its time has come
  const pick=(wave,have,ready,r,r2)=>V.wildPick(wave,have,ready,r,r2), none={brute:0,boss:0};
  same([0,0.61,0.7,0.8,0.95].map(r=>pick(3,none,false,r,0.9)),['walker','walker','runner','spitter','brute']);
  assert.equal(pick(1,none,false,0.95,0.9),'walker','no brute before the waves have begun'); assert.equal(pick(3,{brute:2,boss:0},false,0.95,0.9),'walker','nor a third');
  assert.equal(pick(5,none,true,0.1,0.1),'boss'); assert.equal(pick(4,none,true,0.1,0.1),'walker','not before wave 5');
  assert.equal(pick(7,none,false,0.1,0.1),'walker','not until the last one has been gone a while'); assert.equal(pick(7,{brute:0,boss:1},true,0.1,0.1),'walker','not two at once');
  assert.equal(pick(7,none,true,0.1,0.5),'walker','and only now and then');
  let kinds={}; let seed=3; const rng=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
  for (let i=0;i<4000;i++){ const t=pick(4,none,false,rng(),rng()); kinds[t]=(kinds[t]||0)+1; }
  assert.ok(kinds.walker>2200&&kinds.runner>350&&kinds.spitter>300&&kinds.brute>300&&kinds.wolf>150&&kinds.wolf<400,`the mix: ${JSON.stringify(kinds)}`);
  assert.equal(pick(1,none,false,0.1,0.99),'walker','no wolf before the second wave'); assert.equal(pick(2,none,false,0.1,0.99),'wolf');
  // a headstone belongs to the grave it stands at: the nearest within reach, and nothing further off
  const graves=[{x:0,z:1.2,hx:0,hz:0},{x:5,z:1.2,hx:5,hz:0},{x:5.9,z:1.2,hx:5.9,hz:0}];
  assert.equal(V.graveOf(graves,0.3,0.2),graves[0]); assert.equal(V.graveOf(graves,5.6,0.1),graves[2]); assert.equal(V.graveOf(graves,2.5,0),null); assert.equal(V.graveOf([],0,0),null);
  // a totem: nothing, then three stages as the work on it adds up
  same([0,W.totemWork[0]-0.1,W.totemWork[0],W.totemWork[1],W.totemWork[2]-0.1,W.totemWork[2],1e6].map(V.totemStage),[0,0,1,2,2,3,3]);
  assert.ok(W.totemWork[0]<W.totemWork[1]&&W.totemWork[1]<W.totemWork[2]&&W.graveChance>0&&W.graveChance<=1);
  // the real churchyard's graves each have a plot a step in front of the stone, for something to come up through
  const T=V.THREE, kit=V.kit, g=navGame(T), mat=new T.MeshStandardMaterial(), mats={get:()=>mat,cache:new Map()};
  const B=new kit.Builder(g,mats), yard=V.yard.build(B,{g,mats,root:new T.Group(),dyn:new T.Group()});
  assert.ok(yard.graves.length>=60,`${yard.graves.length} graves`);
  for (const gr of yard.graves) { const d=Math.hypot(gr.x-gr.hx,gr.z-gr.hz); assert.ok(d>0.6&&d<1.6,`a plot ${d.toFixed(2)} m from its stone`); assert.equal(V.graveOf(yard.graves,gr.hx,gr.hz).hx,gr.hx); }
});

test('the churchyard\'s heavier rain rewrites the engine\'s streak shader where it expects to, and says so when it cannot',()=>{
  const {V}=load();
  const bundle=fs.readFileSync('vendor/gunslinger-engine.js','utf8'), a=bundle.indexOf('uniform float uTime, uRain, uPix, uDrip;'), b=bundle.indexOf('`',a);
  assert.ok(a>0&&b>a,'the engine\'s rain vertex shader is where it was');
  const src=bundle.slice(a,b), o={len:0.066,w0:0.0065,w1:0.0055,px:1.05,near0:0.9,near1:2.8};
  const out=V.heavyRain(src,o);
  for (const need of ['uniform float uGain, uFlash, uTorchCos;','vec3 rainLamps(vec3 p)','len = 0.066 * length(vel);','float w0 = 0.0065 + 0.0055','dist * uPix * 1.05','smoothstep(0.9, 2.8, dist)','* uGain + uFlash *','+ rainLamps(p);']) assert.ok(out.includes(need),need);
  assert.equal(out.split('void main(){').length,2,'one main');
  // whole numbers are written as floats, or the shader would not compile
  assert.ok(V.heavyRain(src,{...o,near0:7,near1:15}).includes('smoothstep(7.0, 15.0, dist)'));
  assert.throws(()=>V.heavyRain(src.replace('len = 0.03 * length(vel);','len = 0.031 * length(vel);'),o),/rain shader anchor/,'a renamed line is an error, not a silent no-op');
  assert.throws(()=>V.heavyRain(out,o),/rain shader anchor/,'and it is not applied twice');
});

test('a sidearm never runs dry and nothing is ever reloaded: the engine refuses a reload with nothing behind the magazine',()=>{
  // The engine's reload refuses when reserve <= 0. Every weapon here has a reserve of nothing: a rifle's magazine is all
  // that is carried of its kind, a pistol's is without end.
  const src=fs.readFileSync('src/vigil/director.js','utf8'), at=src.indexOf('function sidearmStats('), body=src.slice(at,src.indexOf('return true;',at));
  assert.ok(at>0); assert.ok(/rig\.slot\.reserve = 0; rig\.slot\.ammo = Infinity;/.test(body)); assert.ok(!/reserve = null/.test(body));
  const kb=src.slice(src.indexOf('function kitStats('),src.indexOf('function sidearmStats('));
  assert.ok(/d\.magSize = cap; d\.reserve = 0;/.test(kb)&&/rig\.slot\.reserve = 0;/.test(kb),'a rifle holds all that is carried of its kind and has nothing behind it');
  const bundle=fs.readFileSync('vendor/gunslinger-engine.js','utf8');
  assert.ok(bundle.includes('B.ammo>=B.magSize||B.reserve<=0?!1:'),'the engine\'s reload rule is the one this guards against');
  assert.equal(0<=0,true); assert.equal(Infinity-1,Infinity,'a shot from what is without end leaves it without end');
});

test('the ammunition pile sells what is short, for what it costs, and shares out what money there is',()=>{
  const {V}=load(), rate=V.ECON.cost;
  same(V.ammoBill({},500),{cost:0,spent:0,buy:{}},'nothing short, nothing to pay');
  const need={rifle:100,shell:10}, full=Math.ceil((100*V.AMMO.rifle.unit+10*V.AMMO.shell.unit)*rate);
  same(V.ammoBill(need,1e6),{cost:full,spent:full,buy:{rifle:100,shell:10}},'everything short, at the price of each round');
  // half as much needed costs half as much
  assert.ok(Math.abs(V.ammoBill({rifle:50,shell:5},1e6).cost-full/2)<=1,'the price follows what is needed');
  // short of money: the same share of each kind, and never more spent than there is
  const half=V.ammoBill(need,Math.floor(full/2));
  assert.equal(half.cost,full); assert.ok(half.spent<=Math.floor(full/2)&&half.spent>full/2-6); assert.ok(half.buy.rifle>=48&&half.buy.rifle<=50&&half.buy.shell>=4&&half.buy.shell<=5,JSON.stringify(half.buy));
  same(V.ammoBill(need,0).buy,{}); assert.equal(V.ammoBill(need,0).spent,0);
  // the dear kinds are dear
  assert.ok(V.AMMO.rocket.unit>V.AMMO.flak.unit&&V.AMMO.flak.unit>V.AMMO.shell.unit&&V.AMMO.shell.unit>V.AMMO.rifle.unit&&V.AMMO.rifle.unit>V.AMMO.pistol.unit);
  // where it stands: built with the yard, not among the things that break
  const y=fs.readFileSync('src/vigil/yard.js','utf8'), at=y.indexOf('The ammunition pile'), blk=y.slice(at,y.indexOf('info.pile =',at)+60);
  assert.ok(at>0&&/info\.pile = \{ x: px - 0\.2, y: fl, z: pz \};/.test(blk)&&!/B\.begin\(/.test(blk),'the pile is always there');
  assert.ok(/, true, true\);/.test(blk)&&/BUY AMMO HERE!/.test(blk),'its crates are fixed ones, and it has its board');
  assert.ok(!/ammoBox\(hx, fl \+ 0\.62/.test(y),'no ammunition box stands on a crate that can be blown up');
});

test('lifeforce in the world: a wisp hovers over the body, comes to a player who is near, is gathered at arm\'s length, and gutters out',()=>{
  const {V}=load(); const T=V.THREE, L=V.LIFE, got=[];
  V.glowTexture=new T.Texture();
  const scene=new T.Group(), g={THREE:T,scene};
  V.wisps.install(g,{gather:(n)=>got.push(n)});
  assert.equal(scene.children.length,1); assert.equal(scene.children[0].children.length,L.pool*2,'two sprites a wisp, made once');
  assert.equal(V.wisps.count(),0);
  const w=V.wisps.spawn({x:10,y:0.2,z:-4},'brute',1.3); assert.equal(V.wisps.count(),1); assert.equal(w.worth,6);
  // nobody near: it rises to about a metre over where the body fell and stays
  for (let i=0;i<120;i++) V.wisps.update(1/30,{x:40,y:0,z:40});
  assert.ok(Math.abs(w.x-10)<1e-6&&Math.abs(w.z+4)<1e-6,'it does not wander'); assert.ok(w.y>0.2+0.85&&w.y<0.2+1.25,`hovering (${w.y})`); assert.equal(got.length,0);
  assert.ok(w.glow.visible&&w.glow.scale.x>w.core.scale.x&&w.core.scale.x>0.1);
  // someone who cannot gather (down, in a menu) leaves it where it is
  for (let i=0;i<30;i++) V.wisps.update(1/30,null); assert.equal(V.wisps.count(),1);
  // a player four metres off: it comes, and is taken
  const p={x:14,y:0.2,z:-4}; let d0=Math.hypot(p.x-w.x,p.z-w.z), n=0;
  while (V.wisps.count()&&n<300) { V.wisps.update(1/30,p); n++; }
  assert.equal(V.wisps.count(),0); same(got,[6]); assert.ok(n<90,`within three seconds (${n} frames from ${d0} m)`); assert.equal(w.glow.visible,false);
  // left alone it lasts its time and no longer, and takes nothing with it
  V.wisps.spawn({x:0,y:0,z:0},'walker',1);
  for (let t=0;t<L.lasts-1;t+=0.5) V.wisps.update(0.5,null); assert.equal(V.wisps.count(),1);
  for (let t=0;t<3;t+=0.5) V.wisps.update(0.5,null); assert.equal(V.wisps.count(),0); same(got,[6]);
  // more deaths than lights: the oldest goes into the newest, and nothing is lost
  for (let i=0;i<L.pool+3;i++) { V.wisps.spawn({x:i,y:0,z:0},'walker',1); V.wisps.update(0.01,null); }
  assert.equal(V.wisps.count(),L.pool); assert.equal(V.wisps.list().reduce((a,q)=>a+q.worth,0),L.pool+3);
  V.wisps.reset(); assert.equal(V.wisps.count(),0);
});

// what share of wave n each type is, over `times` waves
function share(V,n,times) { const c={}; let total=0; for (let i=0;i<times;i++) for (const t of V.composeWave(n).list) { c[t]=(c[t]||0)+1; total++; } for (const t of Object.keys(V.ZOMBIES)) c[t]=(c[t]||0)/total; return c; }

test('the newer dead: a wolf, a burster and a pyre borrow bodies, come in on schedule, and the abomination has its fire',()=>{
  const {V}=load(); const Z=V.ZOMBIES, F=V.figure;
  // each borrows a body that exists and is not a kind of its own
  for (const t of ['wolf','burster','pyre']) { assert.ok(Z[t]&&F.LOOKS[Z[t].body],`${t} has a body to borrow`); assert.ok(!F.KINDS[t]); assert.equal(Z[t].glow.length,3); }
  assert.ok(Z.wolf.fours&&Z.wolf.leap.from<Z.wolf.leap.to&&Z.wolf.leap.speed>Z.wolf.speed[1]&&Z.wolf.speed[0]>Z.runner.speed[1],'a wolf outruns a runner and springs faster than it runs');
  assert.ok(Z.burster.burst.radius>Z.burster.reach&&Z.burster.burst.onDeath<1&&Z.burster.burst.fuse>0.5,'a burster gives warning, and going off in its own time is worse than being shot down');
  assert.ok(Z.pyre.spit.splash>0&&Z.pyre.spit.range>Z.spitter.spit.range&&Z.pyre.burning);
  const fire=Z.boss.fire; assert.ok(fire.nova.radius>Z.boss.reach*2&&fire.nova.wind>=1&&fire.bolts.n>=2&&fire.aura.dur>0&&fire.aura.cd[0]>fire.aura.dur,'the abomination gathers itself for a second before the ring, and is not wreathed all the time');
  // the wire carries what each is: no more types than four bits hold
  assert.ok(Object.keys(Z).length<=16);
  // the first two waves have none of them; wolves from the third, bursters from the fourth, pyres from the sixth; a late wave has all three
  const seen=(n,t)=>{ let c=0; for (let i=0;i<40;i++) c+=V.composeWave(n).list.filter(x=>x===t).length; return c; };
  for (const t of ['wolf','burster','pyre']) { assert.equal(seen(1,t),0); assert.equal(seen(2,t),0); assert.ok(seen(14,t)>20,`${t} in wave 14`); }
  assert.ok(seen(3,'wolf')>0); assert.equal(seen(3,'burster'),0); assert.ok(seen(4,'burster')>0); assert.equal(seen(5,'pyre'),0); assert.ok(seen(6,'pyre')>0);
  // together the three are never more than a fifth of a wave, and walkers never fewer than a fifth
  // (a wave is drawn at random, so shares are taken over a few hundred of them)
  for (const n of [6,12,30]) { const w=share(V,n,300); assert.ok(w.wolf+w.burster+w.pyre<0.24,`the three in wave ${n}: ${(w.wolf+w.burster+w.pyre).toFixed(3)}`); assert.ok(w.walker>0.17,`walkers in wave ${n}: ${w.walker.toFixed(3)}`); }
  // what they are worth
  assert.equal(V.lifeWorth('wolf'),2); assert.equal(V.lifeWorth('pyre'),3);
});

test('what is not a person: a demon, a flying skull, a bat and two spiders are configured to fly, charge, swoop, climb and spring, and come in on schedule',()=>{
  const {V}=load(); const Z=V.ZOMBIES, F=V.figure;
  // the demon is a painted body with wings; the rest have bodies of their own
  assert.ok(Z.demon.body&&F.LOOKS[Z.demon.body]&&Z.demon.winged&&Z.demon.fly&&Z.demon.noCrawl&&Z.demon.spit.splash>0&&Z.demon.spit.range>Z.demon.fly.keep[1],'a demon flies, keeps its distance inside its own range, and cannot be brought down to a crawl');
  for (const t of ['skull','bat','spider','greatspider']) { assert.ok(Z[t].beast&&V.BEAST_HIT[Z[t].beast],t); assert.equal(Z[t].centre,V.BEAST_HIT[Z[t].beast].centre,`${t}: the middle the manager aims at is the body's`); }
  for (const t of ['demon','skull','bat']) { const f=Z[t].fly; assert.ok(f.alt[0]<=f.alt[1]&&f.alt[1]<=V.FLY.top+Z[t].centre,`${t} keeps under the airspace's ceiling`); assert.ok(Z[t].cry&&Z[t].half>0.3&&Z[t].half<Z[t].centre,t); }
  assert.ok(V.FLY.top+Z.demon.centre+Z.demon.half<7.6,'the tallest flyer at the top of the airspace is still under the church eaves');
  const ch=Z.skull.charge; assert.ok(ch.speed>Z.skull.speed[1]*1.8&&ch.wind>=0.4&&ch.from>ch.radius*2&&ch.dead===0,'a skull gives warning, charges much faster than it flies, and its blast is for the living');
  assert.ok(Z.bat.pack>=2&&Z.bat.swoop.speed>Z.bat.speed[1]&&Z.bat.swoop.cd[0]>1&&Z.bat.hp<Z.walker.hp,'bats come several at once, dive faster than they fly, and are frail');
  // spiders: the small one still big enough to shoot, the great one a brute's size on a brute's grid; both spring and climb
  const hit=V.BEAST_HIT.spider.hit, body=Math.max(...hit.map(h=>h[3]))*2;
  assert.ok(body*Z.spider.scale[0]>=0.5,`the small spider's body is ${(body*Z.spider.scale[0]).toFixed(2)} m across`);
  assert.ok(Z.greatspider.scale[0]>=1.9&&Z.greatspider.hp>Z.spider.hp*5&&V.zombieSize('greatspider')===1&&V.zombieSize('spider')===0);
  for (const t of ['spider','greatspider']) { const c=Z[t].climb, l=Z[t].leap; assert.ok(l.from<l.to&&l.speed>Z[t].speed[1]&&c.from<c.to&&c.rise[0]>=c.least&&c.cd[0]>3&&c.to>l.to,t); }
  assert.ok(hit.some(h=>h[4]==='weak')&&V.BEAST_HIT.bat.hit.some(h=>h[4]==='weak'),'spiders and bats have a head to hit');
  // the schedule: none of them in the first three waves; spiders from the fourth, bats the fifth, skulls the sixth, demons the seventh, great spiders the ninth
  const seen=(n,t)=>{ let c=0; for (let i=0;i<60;i++) c+=V.composeWave(n).list.filter(x=>x===t).length; return c; };
  const first={spider:4,bat:5,skull:6,demon:7,greatspider:9};
  for (const t of Object.keys(first)) { for (let n=1;n<first[t];n++) assert.equal(seen(n,t),0,`no ${t} in wave ${n}`); for (let i=0;i<30;i++) assert.ok(V.composeWave(first[t]).list.includes(t),`${t} for certain in wave ${first[t]}`); assert.ok(seen(16,t)>20,`${t} in wave 16`); }
  assert.equal(V.composeWave(9).list.filter(x=>x==='greatspider').length,1); assert.equal(V.composeWave(40).list.filter(x=>x==='greatspider').length,3,'never more than three great spiders');
  // together (a bat's place in the list is a pack) they are a small share that grows to a cap, and the dead they join keep their own mix
  for (const n of [4,8,12,30]) { const w=share(V,n,300), mine=w.spider+w.bat+w.skull+w.demon+w.greatspider; assert.ok(mine>0.03&&mine<0.24,`their share of wave ${n}: ${mine.toFixed(3)}`); assert.ok(w.walker>mine*0.9,`walkers in wave ${n}`); }
  { const a=share(V,4,300), b=share(V,5,300); assert.ok(a.walker>0.52,'walkers are still most of the wave the first of them comes in: '+a.walker.toFixed(3)); assert.ok(b.walker>0.42,'and the largest part of the next: '+b.walker.toFixed(3)); }
  // every one of them is worth something, named for the kill feed, and scored
  for (const t of ['demon','skull','bat','spider','greatspider']) { assert.ok(V.lifeWorth(t)>=1&&V.LIFE.worth[t],t); assert.ok(Z[t].reward>0); }
});

test('flying and climbing, as numbers: a charge turns only so fast, a climb stops under the top of the wall, a spring from a height lands where it was aimed',()=>{
  const {V}=load(); const close=(a,b,e,what)=>assert.ok(Math.abs(a-b)<e,`${what||''} ${a} is not ${b}`);
  // a velocity is turned toward where it is wanted at most so many radians a second, and brought to the speed asked for
  const v={x:10,y:0,z:0}; V.flyHome(v,0,0,1,10,2,0.1);
  close(Math.atan2(v.z,v.x),0.2,1e-6,'turned by turn x dt:'); close(Math.hypot(v.x,v.y,v.z),10,1e-6);
  for (let i=0;i<40;i++) V.flyHome(v,0,0,1,10,2,0.1); close(v.z,10,1e-6,'and arrives at the direction:'); close(v.x,0,1e-6);
  const w={x:0,y:0,z:0}; V.flyHome(w,0,1,0,7,2,0.1); close(w.y,7,1e-9,'from rest it sets straight off:');
  const s={x:2,y:0,z:0}; for (let i=0;i<60;i++) V.flyHome(s,1,0,0,13,2.6,1/60); close(s.x,13,0.05,'it gathers speed:');
  const back={x:5,y:0,z:0}; V.flyHome(back,-1,0,0,5,2,0.1); assert.ok(Number.isFinite(back.x+back.y+back.z)&&Math.hypot(back.x,back.y,back.z)>4.9,'asked to turn straight back, it still knows where it is going');
  // how high up a wall: the rise it wants, or just under the top; not at all when there is too little to gain
  assert.equal(V.climbTop(0,11,3,1.1),3); close(V.climbTop(0,1.6,3,1.1),1.3,1e-9); assert.equal(V.climbTop(0,1.2,3,1.1),0); assert.equal(V.climbTop(0.24,7.6,4.6,1.4,0.6),4.84);
  // a spring: from the ground it is the wolf's arc; from a height it comes down where it was aimed, at the moment it was meant to
  const flat=V.leapArc(6,0,12); close(flat.dur,0.5,1e-9); close(flat.vy,5,1e-9); close(flat.vy*flat.dur-10*flat.dur*flat.dur,0,1e-9,'back on the ground at the end:');
  assert.equal(V.leapArc(1,0,12).dur,0.36); assert.equal(V.leapArc(40,0,12).dur,0.85);
  for (const [dist,drop] of [[8,3],[12,4.5],[5,1.2],[14,3]]) { const a=V.leapArc(dist,drop,12); close(a.vy*a.dur-10*a.dur*a.dur,-drop,1e-9,`from ${drop} m up, ${dist} m off:`); assert.ok(a.dur<=1.16&&a.sp>0&&a.sp<=dist/a.dur); }
  // a swoop is flown through whoever it is at, and on past them
  const p=V.swoopThrough(0,0,6,1.2,8,5); close(Math.hypot(p.x-6,p.z-8),5,1e-9); close(p.x/p.z,6/8,1e-9); assert.equal(p.y,1.2);
});

test('the bodies that are not people build without a GPU: a few rigid parts each, hit where they are drawn, posed with finite numbers alive and dead',()=>{
  const {V}=load(); const T=V.THREE, K=V.beasts.create(T,V.kit);
  const finite=(root)=>{ let n=0; root.traverse((m)=>{ if (!m.isMesh) return; n++; const p=m.geometry.attributes.position, q=m.geometry.attributes.normal; assert.equal(q.count,p.count); for (let i=0;i<p.count*3;i++) assert.ok(Number.isFinite(p.array[i])&&Number.isFinite(q.array[i])); assert.ok(p.count%3===0&&p.count>0); }); return n; };
  const mk=(make,type)=>{ const b=make(type); return {body:b,cfg:V.ZOMBIES[type],mesh:b.root,scale:1,seed:1,phase:0,walkBlend:0,swing:0,swingDur:0.5,vel:new T.Vector3(1,0.5,2),fs:'orbit',leapWind:0}; };
  const parts={skull:[K.skull,'skull',4],bat:[K.bat,'bat',4],spider:[K.spider,'spider',10],greatspider:[K.spider,'greatspider',10]};
  for (const name of Object.keys(parts)) {
    const [make,type,meshes]=parts[name], z=mk(make,type), b=z.body;
    assert.equal(finite(b.root),meshes,`${name}: ${meshes} rigid parts`);
    assert.ok(b.glow&&b.glow.isMesh&&b.glow.material.isMeshBasicMaterial,'something on it glows, unlit');
    b.root.traverse((m)=>{ if (m.isMesh&&m!==b.glow&&!m.material.isMeshBasicMaterial) assert.ok(m.material.isMeshStandardMaterial&&!m.material.map&&m.material.side===T.FrontSide,`${name}: plain one-sided standard material, the wolf's program`); });
    // every sphere a bullet is tested against lies inside the reach the manager culls with, and near the drawn body
    const box=new T.Box3().setFromObject(b.root);
    for (const h of b.hit) { assert.ok(Math.hypot(h[0],h[1]-b.centre,h[2])+h[3]<=b.reach+1e-9,`${name}: a hit sphere inside its reach`); assert.ok(box.containsPoint(new T.Vector3(h[0],h[1],h[2])),`${name}: a hit sphere inside the body`); assert.ok(h[4]==='body'||h[4]==='weak'); }
    assert.ok(Math.abs((box.min.y+box.max.y)/2-b.centre)<0.5,`${name}: its middle is where the manager aims (${((box.min.y+box.max.y)/2).toFixed(2)} vs ${b.centre})`);
    // posed over a second of movement, in each of its states, then dead: nothing goes to infinity
    const ok=()=>b.root.traverse((m)=>{ for (const v of [m.rotation.x,m.rotation.y,m.rotation.z,m.position.x,m.position.y,m.position.z]) assert.ok(Number.isFinite(v),`${name}: finite pose`); });
    for (const st of [{},{fs:'wind'},{fs:'charge'},{fs:'dive'},{leap:{}},{climb:{phase:'up'}},{leapWind:0.2},{swing:0.3},{dead:{t:0.2,spin:2,down:false}},{dead:{t:3,spin:2,down:true}}]) { Object.assign(z,{fs:'orbit',leap:null,climb:null,leapWind:0,swing:0,dead:null},st); for (let i=0;i<30;i++) { b.root.position.set(1,2,3); K.pose(z,1/60,3,i/60); } ok(); }
  }
  // a spider's legs step in two sets of four, and it turns belly to the wall when it climbs
  const sp=mk(K.spider,'spider'); assert.equal(sp.body.legs.length,8); assert.equal(sp.body.legs.filter(l=>l.group===0).length,4);
  for (let i=0;i<40;i++) K.pose(sp,1/60,3,i/60);
  const lifted=sp.body.legs.filter(l=>Math.abs(l.m.rotation.z)>0.1).length; assert.ok(lifted>=2&&lifted<=6,`some feet are off the ground at once, not all (${lifted})`);
  sp.climb={phase:'up'}; for (let i=0;i<120;i++) K.pose(sp,1/60,2,i/60); assert.ok(Math.abs(sp.body.root.rotation.x+Math.PI/2)<0.02,'head up the wall');
  // a bat's wings beat; the demon's bolt on to a painted body's bones
  const bt=mk(K.bat,'bat'); const a=[]; for (let i=0;i<30;i++) { K.pose(bt,1/60,6,i/60); a.push(bt.body.wingR.rotation.z); assert.equal(bt.body.wingL.rotation.z,-bt.body.wingR.rotation.z); }
  assert.ok(Math.max(...a)-Math.min(...a)>0.8,'the wings beat');
  const B={chest:new T.Group(),head:new T.Group(),hips:new T.Group()}, wings=K.demonParts(B);
  assert.equal(B.chest.children.length,2); assert.equal(B.head.children.length,1); assert.equal(B.hips.children.length,1);
  K.flap(wings,1.2,0.5); assert.ok(wings.wingR.rotation.y>0&&wings.wingL.rotation.y===-wings.wingR.rotation.y);
  // a flyer pitches and banks about its middle, not about the point under it that the manager places it by
  for (const [make,type,st] of [[K.bat,'bat',{fs:'dive'}],[K.skull,'skull',{fs:'charge'}]]) {
    const z=mk(make,type); Object.assign(z,st,{bank:0.6,scale:1.1}); z.vel.set(4,-6,3); z.mesh.scale.setScalar(1.1);
    z.mesh.position.set(5,2,-3); z.mesh.rotation.y=0.8; K.pose(z,1/60,5,1); z.mesh.updateMatrixWorld(true);
    const mid=new T.Vector3(0,z.body.centre,0).applyMatrix4(z.mesh.matrixWorld), bob=type==='skull'?0.07:0;
    assert.ok(Math.abs(z.mesh.rotation.x)>0.3,`${type} is pitched`); assert.ok(Math.hypot(mid.x-5,mid.z+3)<1e-6&&Math.abs(mid.y-(2+z.body.centre*1.1))<=bob+1e-6,`${type}: its middle stays over where it is (${mid.x.toFixed(3)}, ${mid.y.toFixed(3)}, ${mid.z.toFixed(3)})`);
  }
});

test('fire: a flame goes from near white to dull red, fades at both ends, rises and is spent',()=>{
  const {V}=load();
  const a=V.fireRamp(0), b=V.fireRamp(0.15), c=V.fireRamp(0.6), d=V.fireRamp(1);
  assert.equal(a[3],0,'not there at the moment it is lit'); assert.equal(d[3],0,'nor at the end'); assert.ok(b[3]>0.6&&c[3]>0.15&&c[3]<b[3]);
  for (let u=0;u<=1;u+=0.05){ const r=V.fireRamp(u); assert.ok(r[0]>=r[1]&&r[1]>=r[2]&&r[2]>=0,`red over green over blue at ${u.toFixed(2)}`); assert.ok(r[3]>=0&&r[3]<=1); }
  assert.ok(a[0]>c[0]&&a[1]>c[1]*2,'hotter and yellower young'); same(V.fireRamp(-3),V.fireRamp(0)); same(V.fireRamp(9),V.fireRamp(1));
  const p={x:0,y:0,z:0,vx:2,vy:0,vz:0,t:0,life:0.5,size:0.3,rise:2,drag:1.5,grow:0.7}; let n=0;
  while (V.fireStep(p,1/60)) n++;
  assert.ok(n>=28&&n<=30,`half a second of frames (${n})`); assert.ok(p.y>0.15,'it rose'); assert.ok(p.x>0.4&&p.x<1,'and was slowed');
  // with no renderer the calls are there and do nothing
  V.fire.puff(0,0,0); V.fire.burst(0,0,0); V.fire.update(0.1); assert.equal(V.fire.count(),0);
});

test('blood in a made-up yard: a wound throws drops and leaves marks, a mark goes with the wall it was on, no more than a few begin in one place, and off means nothing', () => {
  const { V, engine } = load(), T = engine.THREE, g = fakeGame(T);
  const list = [];
  g.scene = { add(o) { list.push(o); }, traverse() {}, fog: null };
  g.camera = { position: new T.Vector3(0, 1.7, 6) };
  g.render = { renderer: { capabilities: { getMaxAnisotropy: () => 4 } } };
  g.events = { on() {}, emit() {} };
  // a floor at y = 0 and one wall across z = -3
  const wall = g.physics.addBox([-4, 0, -3.5], [4, 3, -3], { surface: 'stone' });
  g.physics.groundHeight = () => 0;
  g.physics.raycast = (o, d, max) => {
    let best = null;
    if (d.y < -1e-6) { const t = -o.y / d.y; if (t > 0 && t < max) best = { dist: t, point: new T.Vector3(o.x + d.x * t, 0, o.z + d.z * t), normal: new T.Vector3(0, 1, 0), surface: 'stone', box: null }; }
    if (d.z < -1e-6 && g.physics.boxes.includes(wall)) { const t = (-3 - o.z) / d.z, y = o.y + d.y * t; if (t > 0 && t < max && y > 0 && y < 3 && (!best || t < best.dist)) best = { dist: t, point: new T.Vector3(o.x + d.x * t, y, -3), normal: new T.Vector3(0, 0, 1), surface: 'stone', box: wall }; }
    return best;
  };
  const B = V.blood; B.install(g);
  assert.ok(B.marks && B.drops && list.includes(B.marks) && list.includes(B.drops), 'two meshes, and no more');
  assert.equal(list.length, 2); assert.equal(B.marks.material.transparent, true); assert.equal(B.marks.material.depthWrite, false);
  const walker = { scale: 1, mass: 1, pos: new T.Vector3(0, 0, -1.6), id: 7, active: true, alive: true };
  const run = (s) => { for (let t = 0; t < s; t += 1 / 60) B.update(1 / 60); };
  // a round going north through a body a little over a metre from the wall
  for (let i = 0; i < 6; i++) B.hit(walker, new T.Vector3(0, 1.2, -1.5), new T.Vector3(0, 0, -1), false);
  assert.ok(B.count() > 100, B.count() + ' drops in the air'); assert.ok(B.waiting() > 10, 'and marks on their way');
  assert.equal(B.stains(), 0, 'nothing is marked before the blood gets there');
  run(0.6);
  const a = B.marks.instanceMatrix.array; let onWall = 0, onFloor = 0;
  for (let i = 0; i < B.marks.count; i++) { if (a[i * 16 + 15] !== 1) continue; if (Math.abs(a[i * 16 + 10]) > 0.9) { onWall++; assert.ok(a[i * 16 + 14] > -3 && a[i * 16 + 14] < -2.97, 'just off the face of the wall'); } else { onFloor++; assert.ok(a[i * 16 + 13] > 0 && a[i * 16 + 13] < 0.03, 'just off the floor'); } }
  assert.ok(onWall >= 1 && onFloor >= 6 && onWall + onFloor === B.stains(), onWall + ' on the wall, ' + onFloor + ' on the floor');
  run(3); assert.equal(B.count(), 0, 'every drop has landed'); const kept = B.stains(); assert.ok(kept >= onWall + onFloor);
  // the wall comes down: what was on it goes, what is on the floor stays
  g.physics.removeBox(wall); run(2.2);
  assert.equal(B.stains(), kept - onWall, 'the marks on the wall went with it');
  // a floor fought over: the marks there grow, they do not pile up
  const before = B.stains(); B.fill(400, 20, 20, 0.45);
  assert.ok(B.stains() - before <= 4 * V.BLOOD.perCell, (B.stains() - before) + ' marks begun in under a square metre');
  // a body put down leaves a pool once it lies still
  const n0 = B.stains(); B.death(Object.assign({}, walker, { alive: false, pos: new T.Vector3(-3, 0, 2), id: 8 }), { dir: new T.Vector3(1, 0, 0) }); run(2);
  assert.ok(B.stains() > n0);
  // off: nothing new, nothing shown, and the dead are told there is no colour; on again, what was there is still there
  B.set({ on: false }); const off = B.stains();
  B.hit(walker, new T.Vector3(0, 1.2, -1.5), new T.Vector3(0, 0, -1), true); B.burst(new T.Vector3(0, 1, 0), 2); run(1);
  assert.equal(B.count(), 0); assert.equal(B.stains(), off); assert.equal(B.marks.visible, false); assert.equal(B.tint(), null);
  B.set({ on: true, colour: 'rainbow' }); assert.equal(B.marks.visible, true); assert.equal(B.stains(), off);
  B.reset(); assert.equal(B.stains(), 0); assert.equal(B.count(), 0); assert.equal(B.marks.count, 0);
});

test('each visit to the ammunition pile is dearer than the last, and a repair costs a share of what the thing is worth', () => {
  const { V } = load(), rate = V.ECON.cost || 1, need = { rifle: 100 }, rounds = Math.ceil(100 * V.AMMO.rifle.unit * rate);
  assert.equal(V.AMMO_RISE, 20);
  same(V.ammoBill(need, 1e6, 0), V.ammoBill(need, 1e6), 'the first visit costs the rounds alone');
  same(V.ammoBill(need, 1e6, 40), { cost: rounds + 40, spent: rounds + 40, buy: { rifle: 100 } }, 'the third costs forty more');
  same(V.ammoBill({}, 500, 60), { cost: 0, spent: 0, buy: {} }, 'nothing short: nothing to pay, whatever the visit would cost');
  // short of money: the visit is paid for first, then the same share of every kind for what is left
  const part = V.ammoBill(need, 20 + Math.floor(rounds / 2), 20);
  assert.ok(part.buy.rifle >= 48 && part.buy.rifle <= 50 && part.spent <= 20 + Math.floor(rounds / 2) && part.spent > 20, JSON.stringify(part));
  same(V.ammoBill(need, 20, 20), { cost: rounds + 20, spent: 0, buy: {} }, 'money for the visit and nothing for rounds buys nothing, and costs nothing');
  const d = fs.readFileSync('src/vigil/director.js', 'utf8');
  assert.ok(d.includes('const ammoFee = () => V.AMMO_RISE * (S.ammoBuys | 0);') && d.includes('S.ammoBuys = (S.ammoBuys | 0) + 1;'), 'a visit that buys anything is counted');
  assert.ok(d.includes('tokens: 1 + FX.tokens, tokensBought: 0, ammoBuys: 0,') && d.includes('ammoBuys: S.ammoBuys | 0,') && d.includes('S.ammoBuys = num(d.ammoBuys, 0, 999);'), 'a new night starts the count again; a night taken up keeps it');
  // mending
  assert.equal(V.repairCost([]), 0); assert.equal(V.repairCost([{ worth: 1000, gone: 0 }]), 0); assert.equal(V.repairCost([{ worth: 1000, gone: 0.5 }]), 500);
  assert.equal(V.repairCost([{ worth: 1000, gone: 2 }, { worth: 400, gone: 0.25 }, { worth: 50, gone: -1 }]), 1100, 'never more than all of a thing, never less than nothing');
  const D = V.DEF, R = V.REPAIR;
  assert.ok(D.guard.price === 900 && D.turret.price === 1200 && D.floodlight.price === 300, 'what each defense costs new');
  assert.ok(R.defense >= 0.5 && R.defense < 1 && R.crystal >= 2500, 'mending is dear, and cheaper than buying again');
  const wrecked = (k) => V.repairCost([{ worth: D[k].price * R.defense, gone: 0.9 }]);
  assert.ok(wrecked('turret') > wrecked('guard') && wrecked('turret') < D.turret.price && wrecked('guard') > 400, 'a turret all but gone: ' + wrecked('turret') + ', a guard: ' + wrecked('guard'));
  assert.equal(V.repairCost([{ worth: R.crystal, gone: 0.25 }]), R.crystal / 4, 'a quarter of the crystal is a quarter of its price');
  const u = fs.readFileSync('src/vigil/ui.js', 'utf8'), f = fs.readFileSync('src/vigil/defenses.js', 'utf8');
  assert.ok(/id: 'repair'[^\n]*partial: true/.test(u) && /id: 'fix'[^\n]*partial: true/.test(u) && u.includes('const pay = item.partial ? Math.min(price, Math.floor(S.money)) : price;'), 'with less than the price, what there is buys its share');
  assert.ok(f.includes('repairAll(share = 1)') && f.includes("NET().request('dfix', share)") && d.includes("op === 'dfix'"), 'and a guest asks the host for the same share');
});
