const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {create}=require('../src/achievements.js');
const challenges=require('../src/challenges.js');

// ---------------------------------------------------------------------------------------------------- counting
test('a challenge counts its fact as a total, a best or a set of different things',()=>{
  const A=create({now:()=>1000});
  A.define('x',{group:'G'},[
    {id:'x.sum',label:'ten kills',goal:10,fact:'kill',test:(c)=>c.type==='gull'},
    {id:'x.best',label:'wave 5 in one run',goal:5,fact:'wave',best:true,add:(c)=>c.wave},
    {id:'x.set',label:'three difficulties',goal:3,fact:'mission',distinct:(c)=>c.diff}]);
  for (let i=0;i<4;i++) A.report('kill',{type:'gull'});
  A.report('kill',{type:'hound'});
  assert.equal(A.value('x.sum'),4,'only the kills the test accepts');
  A.report('wave',{wave:3}); A.report('wave',{wave:2});
  assert.equal(A.value('x.best'),3,'a best keeps the highest, it does not add up');
  A.report('mission',{diff:'hard'}); A.report('mission',{diff:'hard'}); A.report('mission',{diff:'brutal'});
  assert.equal(A.value('x.set'),2,'the same difficulty twice counts once');
  assert.equal(A.unlocked('x'),false);
  for (let i=0;i<20;i++) A.report('kill',{type:'gull'});
  assert.equal(A.value('x.sum'),10,'a counter stops at its goal');
  assert.equal(A.report('kill',{type:'gull'}),0,'and a finished challenge no longer changes');
});

test('an outfit unlocks when all of its challenges are done, once, and says so',()=>{
  const A=create({now:()=>42}), seen=[];
  A.define('base',{group:'Standard issue'},[]);
  A.define('y',{group:'G'},[{id:'y.1',label:'a',goal:2,fact:'f'},{id:'y.2',label:'b',goal:1,fact:'g'}]);
  A.define('meta',{group:'G'},[{id:'meta.1',label:'unlock one',goal:1,fact:'unlock',best:true,add:(c)=>c.count}]);
  A.on((e)=>seen.push(e.type+':'+(e.id||e.outfit)));
  assert.equal(A.unlocked('base'),true,'an outfit without challenges is worn from the start');
  assert.equal(A.unlocked('never-defined'),true,'an unknown outfit is not locked: the caller falls back by itself');
  assert.equal(A.unlockedCount(),0,'standard issue is not counted as earned');
  A.beginRun();
  A.report('f'); A.report('g');
  assert.equal(A.unlocked('y'),false);
  A.report('f');
  assert.equal(A.unlocked('y'),true); assert.equal(A.outfit('y').at,42);
  assert.deepEqual(seen.filter((s)=>/^unlock/.test(s)),['unlock:y','unlock:meta'],'unlocking an outfit is itself a fact other challenges count');
  assert.equal(A.unlockedCount(),2);
  const sum=A.runSummary();
  assert.deepEqual(sum.unlocked,['y','meta']); assert.equal(sum.rows.length,3);
  assert.ok(sum.rows.every((r)=>r.done&&r.from<r.value));
  A.beginRun(); assert.equal(A.runSummary().rows.length,0,'a new run starts with nothing moved');
});

test('two saves join: the higher count wins, sets are united, and an outfit completed across devices unlocks',()=>{
  const defs=[{id:'z.1',label:'a',goal:5,fact:'f'},{id:'z.2',label:'b',goal:2,fact:'g',distinct:(c)=>c.k}];
  const one=create(), two=create();
  for (const A of [one,two]) A.define('z',{group:'G'},defs);
  for (let i=0;i<5;i++) one.report('f'); one.report('g',{k:'a'});
  two.report('f'); two.report('g',{k:'b'});
  assert.equal(one.unlocked('z'),false); assert.equal(two.unlocked('z'),false);
  assert.equal(two.merge(JSON.parse(JSON.stringify(one.doc()))),true);
  assert.equal(two.value('z.1'),5); assert.equal(two.value('z.2'),2,'a from one device, b from the other');
  assert.equal(two.unlocked('z'),true); assert.ok(two.outfit('z').at>0);
  assert.equal(two.merge(one.doc()),false,'nothing new the second time');
  assert.equal(two.merge(null),false); assert.equal(two.merge({c:{'z.1':'x','nope':9}}),true,'a strange document does no harm');
  assert.equal(two.value('z.1'),5);
});

// ---------------------------------------------------------------------------------------------------- this game's challenges
function game(ctx) { const A=challenges.install(create()); let c=ctx; A.setContext(()=>c); A.ctx=(n)=>{c=n;}; return A; }
const HARBOR={map:'harbor',mode:'mission',diff:'hard',coop:false,players:1}, VIGIL={map:'vigil',mode:'vigil',diff:'hard',coop:false,players:1};

test('twenty-six outfits are earned by three challenges each; four are standard issue',()=>{
  const A=game(HARBOR), ids=new Set(), labels=new Set();
  assert.equal(challenges.LIST.length,26); assert.equal(A.outfits().length,30);
  for (const id of challenges.BASE) { assert.equal(A.outfit(id).total,0); assert.equal(A.unlocked(id),true); }
  for (const [outfit,group,rows] of challenges.LIST) {
    assert.ok(challenges.GROUPS.includes(group),group); assert.equal(rows.length,3,outfit);
    const o=A.outfit(outfit); assert.equal(o.unlocked,false);
    for (const c of o.challenges) {
      assert.ok(!ids.has(c.id)&&!labels.has(c.label),'no challenge twice: '+c.label); ids.add(c.id); labels.add(c.label);
      assert.ok(c.goal>=1&&Number.isInteger(c.goal)&&c.value===0);
      const n=c.label.match(/\b(\d[\d,]*)\b/g)||[];           // the number a player reads is the number counted (when the label has one)
      if (c.goal>1) assert.ok(n.map((s)=>+s.replace(/,/g,'')).includes(c.goal)||/Standard, Hard and Brutal/.test(c.label),`${c.id}: goal ${c.goal} is in "${c.label}"`);
    }
  }
  assert.equal(ids.size,78);
});

test('every fact a challenge waits for is one the game reports',()=>{
  const src=fs.readFileSync('src/progress.js','utf8')+fs.readFileSync('src/achievements.js','utf8'), reported=new Set();
  for (const m of src.matchAll(/report\('([a-z]+)'/g)) reported.add(m[1]);
  for (const [outfit,,rows] of challenges.LIST) for (const [label,,fact] of rows) assert.ok(reported.has(fact),`${outfit}: nothing reports "${fact}" (${label})`);
});

test('a kill counts where it belongs: by map, weapon, range, who made it',()=>{
  const A=game(HARBOR);
  A.report('kill',{type:'gull',by:'player',weapon:'marksman',dist:62,weak:true,multi:1,multiSame:1,burst:1});
  assert.equal(A.value('skyhook.1'),1); assert.equal(A.value('skyhook.2'),1,'a gull from 40 m or more');
  assert.equal(A.value('stratos.1'),1); assert.equal(A.value('stratos.2'),1); assert.equal(A.value('circuit.2'),1);
  assert.equal(A.value('argonaut.3'),1,'in Terminal Breach'); assert.equal(A.value('aurum.2'),1);
  assert.equal(A.value('marshal.1'),0,'a machine is not a zombie'); assert.equal(A.value('briar.1'),0);
  A.ctx({...HARBOR,mode:'holdout'}); A.report('kill',{type:'hound',by:'player',weapon:'breacher',dist:5,multi:3,multiSame:1,burst:1});
  assert.equal(A.value('argonaut.3'),1,'not in Holdout'); assert.equal(A.value('duneRider.2'),1); assert.equal(A.value('duneRider.3'),1); assert.equal(A.value('circuit.3'),1); assert.equal(A.value('tempest.2'),1);
  A.ctx(VIGIL);
  A.report('kill',{type:'walker',by:'player',weapon:'pistol',dist:27,head:true,torch:false,multi:1,multiSame:1,burst:1});
  assert.equal(A.value('marshal.1'),1); assert.equal(A.value('marshal.2'),1); assert.equal(A.value('marshal.3'),1); assert.equal(A.value('shade.1'),1); assert.equal(A.value('briar.1'),1);
  assert.equal(A.value('circuit.1'),2,'a zombie is not a machine');
  A.report('kill',{type:'runner',by:'defense',weapon:'defense',dist:3,multi:1,multiSame:1,burst:1});
  assert.equal(A.value('oldGuard.2'),1); assert.equal(A.value('shade.2'),0,'a turret\'s kill is not yours'); assert.equal(A.value('aurum.2'),3,'three by hand so far');
  A.report('kill',{type:'brute',by:'player',weapon:'buck',dist:3,blast:true,multi:1,multiSame:1,burst:1,torch:true});
  assert.equal(A.value('sapper.2'),1); assert.equal(A.value('trapper.1'),0,'a grenade is not the shotgun'); assert.equal(A.value('bulwark.3'),1);
  A.ctx({...VIGIL,coop:true,players:2}); A.report('kill',{type:'walker',by:'player',weapon:'carbine',dist:9,multi:1,multiSame:1,burst:1,torch:true});
  assert.equal(A.value('standard.3'),1);
});

test('runs, waves and the rest reach their outfits, and an outfit can really be earned',()=>{
  const A=game(HARBOR);
  A.report('mission',{time:290,acc:0.7,retries:0,hits:3,dressings:0,health:90});
  assert.equal(A.value('corsair.1'),1); assert.equal(A.value('corsair.2'),1); assert.equal(A.done('corsair.3'),true); assert.equal(A.done('raptor.1'),true);
  assert.equal(A.value('stratos.3'),1); assert.equal(A.done('void.2'),true); assert.equal(A.value('duneRider.1'),1); assert.equal(A.value('sapper.3'),1); assert.equal(A.value('argonaut.2'),1); assert.equal(A.value('argonaut.1'),0);
  A.report('mission',{time:500,acc:null,retries:2,hits:30,dressings:2,health:20});
  assert.equal(A.value('corsair.1'),2); assert.equal(A.value('corsair.2'),1,'hard again'); assert.equal(A.value('stratos.3'),1,'no shots fired is not 60%');
  A.ctx({...HARBOR,diff:'brutal'}); A.report('mission',{time:400,acc:0.2,retries:1,hits:9,dressings:1,health:50});
  A.ctx({...HARBOR,diff:'standard'}); for (let i=0;i<2;i++) A.report('mission',{time:400,acc:0.2,retries:1,hits:9,dressings:1,health:50});
  assert.equal(A.unlocked('corsair'),true,'five runs, three difficulties, one under six minutes');
  A.ctx({...HARBOR,mode:'holdout',diff:'brutal'});
  A.report('hwave',{wave:1}); A.report('hwave',{wave:2}); A.report('hend',{score:21000,waves:4,kills:61});
  assert.equal(A.value('duskPatrol.1'),2); assert.equal(A.value('duskPatrol.2'),2); assert.equal(A.done('duskPatrol.3'),true); assert.equal(A.value('tempest.1'),2); assert.equal(A.value('tempest.3'),2);
  assert.equal(A.done('sandveil.2'),true); assert.equal(A.value('sandveil.3'),1);
  A.ctx(VIGIL);
  A.report('wave',{wave:11,crystal:0.95,crystalMin:0.6,noDown:true,cls:'scout'});
  assert.equal(A.value('briar.3'),1); assert.equal(A.value('whiteout.1'),1); assert.equal(A.done('whiteout.2'),true); assert.equal(A.value('verdant.3'),1); assert.equal(A.value('bulwark.1'),1);
  assert.equal(A.value('nomad.1'),11); assert.equal(A.value('aurum.3'),11); assert.equal(A.value('standard.1'),0,'alone');
  A.report('earn',{n:1234}); A.report('stack',{}); A.report('place',{kind:'guard'}); A.report('place',{kind:'turret'}); A.report('sever',{}); A.report('dress',{}); A.report('relay',{});
  assert.equal(A.value('nomad.2'),1234); assert.equal(A.value('nomad.3'),1); assert.equal(A.value('oldGuard.1'),1); assert.equal(A.value('yellowVest.3'),2); assert.equal(A.value('briar.2'),1); assert.equal(A.value('yellowVest.2'),1); assert.equal(A.value('yellowVest.1'),1);
  assert.equal(A.value('aurum.1'),1,'Corsair was the first outfit earned');
});

// ---------------------------------------------------------------------------------------------------- boards
test('every map and mode has a board, and a time survives the trip through a whole number',()=>{
  const window={}; vm.runInNewContext(fs.readFileSync('src/leaderboards.js','utf8'),{window,location:{search:''},URLSearchParams,console,Date,Math,Promise});
  const B=window.GunslingerBoards, names=new Set();
  for (const b of B.list()) { assert.ok(!names.has(b.name)&&b.name.length<=64,b.name); names.add(b.name); assert.ok(b.title&&b.what&&typeof b.text==='function'); }
  assert.deepEqual([...new Set(B.list().map((b)=>b.map+'/'+b.mode))].sort(),['career/career','harbor/holdout','harbor/mission','vigil/squad','vigil/vigil']);
  const t=B.get('breach-time'), fast=t.encode({time:271.26,diff:'brutal'}), slow=t.encode({time:271.9,diff:'standard'});
  assert.ok(fast>slow,'a faster run ranks higher');
  assert.equal(t.text(fast),'4:31.3 · brutal'); assert.equal(t.text(slow),'4:31.9 · standard');
  assert.ok(t.encode({time:99999,diff:'hard'})>0&&t.encode({time:0,diff:'x'})<=3600000*4);
  assert.equal(B.get('holdout-score').text(B.get('holdout-score').encode(12345.4)),'12,345');
  assert.equal(B.available(),false,'no key, no service: nothing is submitted');
});

// A night that is never lost still ranks: the real src/progress.js against a made-up game, boards and page.
test('a run reaches its boards while it is played: on a wave, on a pause, and only once it has grown', async()=>{
  const noop=()=>{}, sent=[], timers=[], ev={}, doc={};
  const el=()=>({style:{},dataset:{},className:'',hidden:false,classList:{add:noop,remove:noop,toggle:noop},setAttribute:noop,appendChild:noop,remove:noop,children:[],querySelector:()=>null,insertBefore:noop,firstChild:null});
  const document={getElementById:el,createElement:el,querySelector:()=>null,querySelectorAll:()=>[],body:el(),visibilityState:'visible',addEventListener:(n,f)=>{doc[n]=f;}};
  const A=new Proxy({load:()=>Promise.resolve(),runSummary:()=>({rows:[],unlocked:[]}),unlockedCount:()=>0,extra:null},{get:(o,k)=>(k in o?o[k]:noop)});
  let fail=false;
  const B={get:(id)=>({what:id}),num:String,submit:(id,v)=>{sent.push(id+'='+v);return Promise.resolve(fail?null:{score:v,rank:2,total:5,text:'x',best:true});}};
  const S={kills:0,earned:0,crystal:{hp:1,max:1},cls:{id:'soldier'},kit:'carbine'};
  const window={GunslingerAchievements:A,GunslingerBoards:B,GunslingerMapSelect:{id:'vigil'},Vigil:{director:{S},net:null},addEventListener:noop};
  const g={player:{pos:{x:0,y:0,z:0},health:100,maxHealth:100},events:{on:(n,f)=>{(ev[n]=ev[n]||[]).push(f);}},game:{state:'title',run:{wavesCleared:0}},combat:{},weapon:{current:'rifle'}};
  const emit=(n,d)=>(ev[n]||[]).forEach((f)=>f(d)), settle=()=>new Promise((r)=>setImmediate(r));
  vm.runInNewContext(fs.readFileSync('src/progress.js','utf8'),{window,document,performance,setInterval:(f)=>{timers.push(f);},setTimeout:noop,Promise,Math,console});
  window.GunslingerProgress.install(g);
  const tick=()=>timers.forEach((f)=>f()), take=()=>sent.splice(0).sort();
  g.game.state='playing'; emit('game:state',{state:'playing',prev:'title'});
  tick(); assert.deepEqual(take(),[],'nothing reached yet, nothing sent');
  // a zombie of this player's, then the wave it belonged to
  emit('enemy:killed',{enemy:{flesh:true,pos:{x:3,y:0,z:4}},type:'walker',by:'player',head:true});
  S.kills=7; g.game.run.wavesCleared=1; emit('objective:done',{id:'wave',index:1});
  assert.deepEqual(take(),['career-kills=1','vigil-kills=7','vigil-waves=1'],'a wave cleared goes to the boards at once, without the run ending');
  await settle(); tick(); assert.deepEqual(take(),[],'nothing has grown: nothing is sent again');
  S.kills=9; tick(); assert.deepEqual(take(),['vigil-kills=9'],'kills between waves go with the next pass');
  // a pass that does not arrive is tried again, and kills counted for the career are not lost
  await settle(); fail=true; S.kills=12; emit('enemy:killed',{enemy:{flesh:true,pos:{x:1,y:0,z:1}},type:'runner',by:'player'}); tick();
  assert.deepEqual(take(),['career-kills=1','vigil-kills=12']); await settle();
  fail=false; tick(); assert.deepEqual(take(),['career-kills=1','vigil-kills=12'],'sent again once the boards answer');
  await settle();
  // pausing sends what stands; the tab being hidden does too
  S.kills=13; g.game.state='paused'; emit('game:state',{state:'paused',prev:'playing'}); assert.deepEqual(take(),['vigil-kills=13']);
  tick(); assert.deepEqual(take(),[],'the timer only runs while playing');
  await settle(); S.kills=14; document.visibilityState='hidden'; doc.visibilitychange(); assert.deepEqual(take(),['vigil-kills=14']);
  // the end of the run still ranks it for the card, and after it nothing more is sent
  await settle(); g.game.state='title'; emit('game:state',{state:'title',prev:'paused'});
  assert.deepEqual(take(),['vigil-kills=14','vigil-waves=1']);
  S.kills=99; tick(); doc.visibilitychange(); assert.deepEqual(take(),[]);
});

// ---------------------------------------------------------------------------------------------------- the soldiers
// The War Bash soldier code against the engine's own three.js, without a GPU: every outfit's geometry builds, and a
// soldier can be made and posed.
function soldiers() {
  const noop=()=>{};
  const ctx2d=new Proxy({measureText:s=>({width:s.length*12}),createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop}),getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray((w||1)*(h||1)*4)}),createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),canvas:{}},{get:(o,k)=>o[k]??noop});
  const el=()=>({style:{},dataset:{},classList:{add:noop,remove:noop,toggle:noop},getContext:()=>ctx2d,addEventListener:noop,setAttribute:noop,appendChild:noop,append:noop,prepend:noop,querySelector:()=>null,querySelectorAll:()=>[],getBoundingClientRect:()=>({left:0,top:0,width:1,height:1}),width:0,height:0});
  const store=new Map(), window={addEventListener:noop};
  const context=vm.createContext({window,document:{querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>el(),createElement:el,createElementNS:el,addEventListener:noop,documentElement:el(),body:el()},
    console:{log:noop,warn:noop,error:console.error},AbortController,performance,URLSearchParams,URL,location:{search:'',hash:'',href:'http://localhost/'},navigator:{userAgent:'test'},
    localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))},addEventListener:noop,setTimeout:noop,requestAnimationFrame:noop,Image:class{},Math,Float32Array,Uint8Array,Uint16Array,Int32Array});
  vm.runInContext(fs.readFileSync('src/maps.js','utf8'),context);
  vm.runInContext(fs.readFileSync('vendor/gunslinger-engine.js','utf8').replace('cL().catch(n=>yT(n&&n.stack||n));','window.testEngine={THREE:ut};'),context);
  vm.runInContext(fs.readFileSync('vendor/warbash-soldier.js','utf8'),context);
  const T=window.testEngine.THREE, root=new T.Group(), camera=new T.PerspectiveCamera();
  const HOST={root,camera,gun:()=>({group:new T.Group(),muzzle:new T.Vector3(0,0,-0.5),kind:'rifle'}),grips:()=>({R:new T.Vector3(0,-0.06,0.062),L:new T.Vector3(0,-0.02,-0.25),butt:[0,0.02,0.33],magP:[0,-0.12,-0.035],slide:0,lift:0.048})};
  return {T,W:window.WarBashSoldier(T,HOST),root};
}

test('the thirty War Bash outfits build under the engine\'s three.js',()=>{
  const {W}=soldiers(), ids=Object.keys(W.SKINS);
  assert.equal(ids.length,30);
  for (const [outfit] of challenges.LIST) assert.ok(W.SKINS[outfit],`challenge outfit ${outfit} is a soldier outfit`);
  for (const id of challenges.BASE) assert.ok(W.SKINS[id]);
  assert.equal(W.skinId('no-such-outfit'),'assault','an unknown id from the network falls back');
  for (const id of ids) {
    const s=W.SKINS[id]; assert.ok(typeof s.name==='string'&&s.name.length>2,id);
    const geo=W.soldierGeometry(id,'hi'), P=geo.attributes.position, tris=geo.index.count/3;
    assert.ok(tris>9000&&tris<60000,`${id}: ${tris} triangles`);
    for (const a of ['normal','uv','color','skinIndex','skinWeight','aoc']) assert.ok(geo.attributes[a]&&geo.attributes[a].count===P.count,`${id} has ${a}`);
    let lo=Infinity, hi=-Infinity, bad=0; for (let i=0;i<P.count;i++){ const y=P.getY(i); if(!Number.isFinite(y+P.getX(i)+P.getZ(i))) bad++; lo=Math.min(lo,y); hi=Math.max(hi,y); }
    assert.equal(bad,0,`${id}: finite vertices`);
    assert.ok(lo>-0.25&&lo<0.06&&hi>1.7&&hi<2.45,`${id}: stands between the ground and ${hi.toFixed(2)} m`);       // a long coat or a ghillie may trail a little below the soles
    const SI=geo.attributes.skinIndex; let worst=0; for (let i=0;i<SI.count;i+=17) worst=Math.max(worst,SI.getX(i),SI.getY(i),SI.getZ(i),SI.getW(i));
    assert.ok(worst<W.SOLDIER_NB,`${id}: bones within the skeleton`);
  }
});

test('a soldier stands, aims, walks and crouches with finite joints, and its coat stays cloth',()=>{
  const {T,W,root}=soldiers();
  const model=W.makeSoldier('assault',0,'rifle');
  assert.equal(model.root.parent,root,'made where the host says'); assert.equal(model.bones.length,W.SOLDIER_NB); assert.equal(model.J.length,15);
  const e={model,skin:'assault',pos:new T.Vector3(3,0,-2),vel:new T.Vector3(),yaw:0.7,pitch:0.2,crouchAmt:0,sprinting:false,onGround:true,vy:0,alive:true,isPlayer:false,isRemote:true,visible:false,target:null,lastShotT:-99,lastSeenT:-99,arms:{adsW:1,reload:null},recoil:0,throwT:0,slide:false,slideT:0,slideAmt:0};
  const finite=()=>model.J.every((v)=>Number.isFinite(v.x+v.y+v.z))&&model.bones.every((b)=>Number.isFinite(b.position.x+b.position.y+b.position.z+b.quaternion.x+b.quaternion.w));
  for (let i=0;i<30;i++) W.animSoldier(e,1/60);
  assert.ok(finite(),'standing and aiming');
  const head=model.bones[W.SB.HEA].position, feet=Math.min(model.J[W.J.FTL].y,model.J[W.J.FTR].y);
  assert.ok(Math.hypot(head.x-3,head.z+2)<0.5&&head.y>1.45&&head.y<1.9,`the head is over where the soldier was placed (${head.x.toFixed(2)}, ${head.y.toFixed(2)}, ${head.z.toFixed(2)})`);
  assert.ok(feet>-0.05&&feet<0.25,'feet near the ground');
  const fwd=new T.Vector3(0,0,-1).applyQuaternion(model.gun.quaternion);
  assert.ok(fwd.x<-0.3&&fwd.z<-0.3&&fwd.y>0.05,'the rifle points where the soldier looks: yaw and pitch as the engine means them');
  e.vel.set(-Math.sin(0.7)*3.2,0,-Math.cos(0.7)*3.2); e.arms.adsW=0;
  for (let i=0;i<90;i++) { e.pos.addScaledVector(e.vel,1/60); W.animSoldier(e,1/60); }
  assert.ok(finite(),'walking');
  e.crouchAmt=1; e.vel.set(0,0,0); for (let i=0;i<40;i++) W.animSoldier(e,1/60);
  assert.ok(finite()&&model.bones[W.SB.HEA].position.y<1.5,'crouched');
  W.soldierLook(model,'marshal',0); assert.equal(model.lod.skin,'marshal'); assert.ok(model.cloth,'the duster is simulated cloth');
  for (let i=0;i<10;i++) { W.animSoldier(e,1/60); W.entities.length=0; W.entities.push(e); W.clothUpdate(1/60); }
  const cp=model.cloth.mesh.geometry.attributes.position; let bad=0; for (let i=0;i<cp.count;i++) if(!Number.isFinite(cp.getX(i)+cp.getY(i)+cp.getZ(i))) bad++;
  assert.equal(bad,0,'the cloth stays finite');
});
