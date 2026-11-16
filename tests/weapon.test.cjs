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
test('arsenal: six weapons swap stats, keep separate ammunition, and restore defaults on reset',async()=>{
 const {g,key,tick}=await harness();let shots=0,projectiles=0;g.events.on('weapon:fire',()=>shots++);
 const fire=g.ballistics.fire.bind(g.ballistics);g.ballistics.fire=(...a)=>{projectiles++;return fire(...a);};
 assert.equal(g.arsenal.held().id,'carbine');
 g.input.fire=true;tick(.5);g.input.fire=false;tick(.2);assert.equal(g.weapon.ammo,24);
 key('Digit3');assert.equal(g.arsenal.held().id,'marksman');assert.equal(g.weapon.magSize,15);assert.equal(g.weapon.ammo,15);
 tick(.5);const before=shots;g.input.fire=true;tick(1);assert.equal(shots-before,1,'marksman rifle is semi-automatic');
 g.input.fire=false;tick(.2);key('KeyV');assert.equal(g.realism.semi,false,'selector only applies to the carbine');
 key('Digit5');tick(.5);projectiles=0;g.input.fire=true;tick(.1);g.input.fire=false;tick(.2);
 assert.equal(projectiles,9,'breacher fires nine pellets per shell');assert.equal(g.weapon.ammo,7);
 key('Digit1');assert.equal(g.weapon.ammo,24,'carbine keeps its own magazine');
 key('Digit3');assert.equal(g.weapon.ammo,14);
 key('Digit6');tick(1.5);assert.equal(g.weapon.current,'pistol');assert.equal(g.arsenal.held().id,'heavy');assert.equal(g.weapon.magSize,8);
 g.weapon.swap();tick(1.5);assert.equal(g.arsenal.held().id,'marksman','Q returns to the previously held weapon');
 g.arsenal.cycle(1);tick(1.5);assert.equal(g.arsenal.held().id,'pdw','wheel steps to the next slot');
 g.arsenal.cycle(-1);g.arsenal.cycle(-1);tick(1.5);assert.equal(g.arsenal.held().id,'sidearm','wheel steps back across platforms');
 g.player.reset();g.weapon.reset();
 assert.equal(g.arsenal.held().id,'carbine');assert.equal(g.weapon.ammo,30);assert.equal(g.weapon.rpm,720);
 assert.equal(g.weapon.rigs.pistol.slot.magSize,15);
});
test('modular gunsmith: live optics, muzzles, barrels, ammo loads, reciprocating parts, armory lock and quick melee',async()=>{
 const {g,key,tick}=await harness();
 let firedHearRadius=0,projectiles=0,meleeCount=0;
 g.events.on('weapon:fire',ev=>{firedHearRadius=ev?.hearRadius||0;});
 g.events.on('weapon:melee',()=>meleeCount++);
 const fire=g.ballistics.fire.bind(g.ballistics);
 g.ballistics.fire=(...a)=>{projectiles++;return fire(...a);};

 // Customize Carbine: TA-31 ACOG + QDC Suppressor + Fluted Match Barrel + PEQ-15 + Extended Mag + Burnt Bronze
 const cfg=g.arsenal.configure('carbine',{optic:'acog',muzzle:'suppressor',barrel:'marksman',underbarrel:'laser',ammoType:'ext',finish:'bronze'});
 assert.equal(cfg.def.magSize,40,'extended magazine raises carbine capacity to 40');
 assert.equal(g.weapon.ammo,40,'full magazine scales to new capacity');
 assert.ok(cfg.speed>820,'fluted marksman barrel increases muzzle velocity');
 assert.ok(cfg.def.hearRadius<20,'suppressor reduces acoustic alert radius');
 assert.equal(cfg.hasLaser,true);
 assert.equal(g.arsenal.parts('carbine').magGroup.parent,g.weapon.rigs.rifle.partsRef.mag,'extended basepad attaches to animated magazine node');
 // a prism sight is looked through: its dark ocular gives way to a depth-only pane once the weapon is more than half aimed
 {const parts=g.arsenal.parts('carbine');assert.equal(parts.aimOpen,false);parts.setAim(.4);assert.equal(parts.aimOpen,false);parts.setAim(.9);assert.equal(parts.aimOpen,true);
  const panes=[];parts.group.traverse(n=>{if(n.isMesh&&n.material&&n.material.colorWrite===false)panes.push(n);});assert.equal(panes.length,1,'one pane');assert.ok(panes[0].visible&&panes[0].renderOrder<0,'drawn before the rest of the weapon');
  parts.setAim(0);assert.equal(parts.aimOpen,false);assert.equal(panes[0].visible,false);}
 // a suppressed muzzle keeps the engine's small flash light; an open one throws the bigger, longer one
 assert.equal(cfg.def.flashReach,9);assert.equal(g.arsenal.configure('carbine',{muzzle:'std'}).def.flashReach,15);
 {const open=g.arsenal.configure('carbine',{muzzle:'std'});assert.equal(open.def.flashScale,1.5,'the flame is half as big again');assert.equal(open.def.flashLight,72);assert.equal(open.def.flashHold,.07);}
 g.arsenal.configure('carbine',{muzzle:'suppressor'});

 g.input.fire=true;tick(.1);g.input.fire=false;tick(.2);
 assert.equal(firedHearRadius,cfg.def.hearRadius,'weapon:fire carries modular acoustic alert radius');

 // Breacher 12G modular shell loads: 14-dart flechette vs 1-projectile rifled slug
 key('Digit5');tick(.5);
 g.arsenal.configure('breacher',{ammoType:'flechette'});
 projectiles=0;g.input.fire=true;tick(.1);g.input.fire=false;tick(.45);
 assert.equal(projectiles,14,'flechette shell fires 14 darts');

 g.arsenal.configure('breacher',{ammoType:'slug'});
 projectiles=0;g.input.fire=true;tick(.1);g.input.fire=false;tick(.45);
 assert.equal(projectiles,1,'rifled slug fires a single heavy projectile');
 assert.ok(g.arsenal.held().speed>450,'rifled slug increases muzzle velocity over buckshot');

 // Sidearm slide-reciprocating RMR-HD & suppressor attachment parenting
 key('Digit2');tick(1.2);
 g.arsenal.configure('sidearm',{optic:'rmr',muzzle:'suppressor',ammoType:'ext',finish:'fde'});
 assert.equal(g.weapon.magSize,20);
 assert.equal(g.arsenal.parts('sidearm').slideGroup.parent,g.weapon.rigs.pistol.partsRef.slide,'pistol optic and suppressor mount to reciprocating slide');

 // Tactical 3-position emitter rotary (T: LASER -> DUAL -> OFF), Armory UI fire gate (Tab), and Quick Melee (F)
 assert.equal(g.realism.laserOn,true);assert.equal(g.realism.lightOn,false);
 key('KeyT');assert.equal(g.realism.laserOn,true);assert.equal(g.realism.lightOn,true);
 key('KeyT');assert.equal(g.realism.laserOn,false);assert.equal(g.realism.lightOn,false);
 key('Tab');assert.equal(g.realism.armoryOpen,true);
 projectiles=0;g.input.fire=true;tick(.3);
 assert.equal(projectiles,0,'open armory workbench prevents accidental weapon discharge');
 key('Tab');assert.equal(g.realism.armoryOpen,false);g.input.fire=false;

 let enemyDmg=0;
 g.enemies={raycast:()=>({enemy:{damage:(d)=>{enemyDmg+=d;return false;}},part:'head',dist:1.4,point:new g.THREE.Vector3(0,0,-1.4),normal:new g.THREE.Vector3(0,0,1)})};
 key('KeyF');
 assert.equal(meleeCount,1,'KeyF triggers quick melee');
 assert.ok(enemyDmg>=55,'quick melee applies close-quarters strike damage');

 // Full reset restores factory builds and closes armory
 g.arsenal.toggleArmory(true);
 g.player.reset();g.weapon.reset();
 assert.equal(g.realism.armoryOpen,false);
 assert.equal(g.arsenal.held().id,'carbine');
 assert.equal(g.arsenal.held().mods.optic,'holo');
 assert.equal(g.weapon.magSize,30);
});

test('arsenal audio: PDW and suppressed weapons synthesize heavy low-mid baffle punch without high-frequency tinkle',async()=>{
 const {g,arsenal,key,tick}=await harness();
 const sr=48000,registered={},played=[];
 g.audio={
  interior:0,
  ctx:{
   sampleRate:sr,
   createBuffer(ch,len,rate){
    const data=Array.from({length:ch},()=>new Float32Array(len));
    return {sampleRate:rate,length:len,duration:len/rate,getChannelData:i=>data[i]};
   }
  },
  register(name,bufs,bus,opts){registered[name]={bufs,bus,opts:opts||{}};},
  play(name,opts){played.push({name,opts});return true;},
  duck(){}
 };
 arsenal.installAudio(g);

 for(const name of ['gs_subsonic','gs_suppressed','gs_pdw','gs_marksman','gs_shotgun','gs_heavy','gs_flak','gs_rocket','gs_flak_burst','gs_rocket_blast','shell_bounce','gs_pump','gs_selector','gs_attach','gs_melee']){
  assert.ok(registered[name]?.bufs?.length>0,`${name} registered`);
  for(const buf of registered[name].bufs){
   const L=buf.getChannelData(0);
   let peak=0;
   for(let i=0;i<L.length;i++){
    assert.ok(Number.isFinite(L[i]),`${name} sample finite`);
    peak=Math.max(peak,Math.abs(L[i]));
   }
   assert.ok(peak>0.05 && peak<=1,`${name} peak in valid range (${peak})`);
  }
 }
 assert.ok(registered.gs_subsonic.opts.max>=12,'950 RPM subsonic PDW allocates >=12 gun voices to avoid voice-steal chop');
 assert.equal(registered.gs_subsonic.bufs.length,6,'6 variants prevent rapid-fire comb repetition');

 // Measure 4-pole band RMS (dB) to guard against high-frequency sine chimes on suppressed PDW
 const bq=(sig,type,fc)=>{
  const y=new Float32Array(sig.length),w0=2*Math.PI*fc/sr,cos=Math.cos(w0),alpha=Math.sin(w0)/1.414;
  const b0=type==='lp'?(1-cos)/2:(1+cos)/2,b1=type==='lp'?1-cos:-(1+cos),b2=b0,a0=1+alpha,a1=-2*cos,a2=1-alpha;
  let z1=0,z2=0;
  for(let i=0;i<sig.length;i++){const x=sig[i],d=(b0*x+z1)/a0;z1=b1*x-a1*d+z2;z2=b2*x-a2*d;y[i]=d;}
  return y;
 };
 const bandDb=(sig,lo,hi)=>{
  let y=bq(bq(sig,'hp',lo),'hp',lo);
  y=bq(bq(y,'lp',hi),'lp',hi);
  let s=0;for(let i=0;i<y.length;i++)s+=y[i]*y[i];
  return 10*Math.log10(s/y.length+1e-12);
 };
 for(const name of ['gs_subsonic','gs_suppressed']){
  const sig=registered[name].bufs[0].getChannelData(0);
  const bodyDb=bandDb(sig,55,750);
  const hiMidDb=bandDb(sig,2200,6000);
  assert.ok(bodyDb-hiMidDb>14,`${name} low-mid baffle/bolt body (${bodyDb.toFixed(1)} dB) dominates 2.2-6 kHz band (${hiMidDb.toFixed(1)} dB)`);
 }

 // Verify PDW firing routes cleanly across subsonic suppressed, supersonic suppressed, and unsuppressed modes
 key('Digit4');tick(1.2);
 assert.equal(g.arsenal.held().id,'pdw');
 assert.ok(g.arsenal.held().shellPitch<1,'PDW uses lower-pitched .300 BLK casing bounce');
 played.length=0;
 assert.equal(g.audio.customFire(),true);
 assert.equal(played[0].name,'gs_subsonic');

 g.arsenal.configure('pdw',{ammoType:'fmj'});
 played.length=0;
 assert.equal(g.audio.customFire(),true);
 assert.equal(played[0].name,'gs_suppressed');

 g.arsenal.configure('pdw',{muzzle:'std'});
 played.length=0;
 assert.equal(g.audio.customFire(),true);
 assert.equal(played[0].name,'gs_pdw','unsuppressed PDW uses dedicated short-barrel SMG report');
});

test('scoped weapons: marksman rifle and LPVO builds fire, reload, and hide viewmodel only during renderFrame while zoomed in',async()=>{
 const {g,key}=await harness();
 let fired=0,recoilCalls=0;
 g.events.on('weapon:fire',()=>fired++);
 const origAddRecoil=g.player.addRecoil;
 g.player.addRecoil=(...a)=>{recoilCalls++;return origAddRecoil?.(...a);};

 let renderSawHiddenRoot=false,renderSawHiddenArms=false;
 g.render.onFrame=()=>{
  if(g.realism.scoped){
   renderSawHiddenRoot=g.weapon.root.visible===false;
   renderSawHiddenArms=g.weapon.arms.right.group.visible===false && g.weapon.arms.left.group.visible===false;
  }
 };

 const step=(seconds,fps=60)=>{
  const dt=1/fps;
  for(let i=0;i<Math.round(seconds*fps);i++){
   g.time.t+=dt;
   g.player.ads=Math.max(0,Math.min(1,g.weapon.ads||0));
   g.player.update(dt);
   g.weapon.update(dt);
   g.render.frame(dt);
  }
 };

 // Equip SR-25 Marksman (slot 3, RAZOR HD 4.5X scope) and zoom all the way in
 key('Digit3');
 step(.45);
 assert.equal(g.arsenal.held().id,'marksman');
 assert.equal(g.weapon.ammo,15);

 g.input.ads=true;
 step(.45);
 assert.ok(g.player.ads>.98,'marksman reaches full ADS');
 assert.equal(g.realism.scoped,true,'full-screen magnified scope activates above 0.86 ADS');
 assert.equal(renderSawHiddenRoot,true,'1P rifle rig is hidden during renderFrame so it does not block the scope reticle');
 assert.equal(renderSawHiddenArms,true,'1P arm groups are hidden during renderFrame while scoped');
 assert.equal(g.weapon.root.visible,true,'1P rifle rig visibility is restored immediately after renderFrame so weapon controller stays active');

 // Fire consecutive semi-auto shots while zoomed in
 g.input.fire=true;
 step(.1);
 assert.equal(fired,1,'marksman fires while zoomed in');
 assert.equal(g.weapon.ammo,14);
 assert.equal(g.ballistics.projectiles.length,1,'zoomed marksman spawns 7.62mm projectile');
 assert.ok(recoilCalls>=1,'zoomed marksman applies recoil kick');

 g.input.fire=false;
 step(.3);
 g.input.fire=true;
 step(.1);
 g.input.fire=false;
 assert.equal(fired,2,'second semi-auto trigger pull while zoomed in fires cleanly');
 assert.equal(g.weapon.ammo,13);

 // Reloading while holding ADS smoothly exits scope, refills magazine, and re-enters scope cleanly
 assert.equal(g.weapon.reloadNow(),true);
 step(.35);
 assert.equal(g.realism.scoped,false,'reload lowers ADS and exits full-screen scope');
 step(3.2);
 assert.equal(g.weapon.ammo,15,'reload completes');
 assert.equal(g.realism.scoped,true,'holding ADS re-enters scope after reload completes');

 g.input.fire=true;
 step(.1);
 g.input.fire=false;
 assert.equal(fired,3,'marksman fires again immediately after scoped reload');
 assert.equal(g.weapon.ammo,14);

 // Full-auto rifle equipped with RAZOR HD 4.5X (lpvo) also fires continuously while zoomed in
 g.input.ads=false;
 key('Digit1');
 step(.45);
 g.arsenal.configure('carbine',{optic:'lpvo'});
 g.input.ads=true;
 step(.45);
 assert.equal(g.realism.scoped,true,'carbine with LPVO activates full-screen scope');
 const beforeAuto=fired;
 g.input.fire=true;
 step(.5);
 g.input.fire=false;
 assert.equal(fired-beforeAuto,6,'carbine with LPVO fires 6 automatic rounds in 0.5s while zoomed in');
});
test('a map can run the arsenal under its own rules: roster, ownership, its own ammunition, keys and reset',async()=>{
 const plan={roster:['carbine','pdw','support','sidearm','heavy'],numberKeys:false,gunsmithKeys:['Tab'],laserKey:'KeyL',weaponLight:false,slots:['optic','muzzle','barrel','underbarrel','finish'],keepOnReset:true,swapRigs:true};
 const {g,key,tick}=await harness({map:{arsenal:plan}});
 // what a map's director does (src/vigil/director.js): own some weapons, keep their magazines, put its numbers on the rig
 const owned=new Set(['carbine','support','sidearm']),bank={};
 g.arsenalOwns=id=>owned.has(id);
 g.arsenalLeave=(cfg,rig)=>{bank[cfg.id]=rig.slot.ammo;};
 g.arsenalEnter=(cfg,rig)=>{if(cfg.id==='support'){rig.def.magSize=rig.slot.magSize=100;rig.slot.ammo=bank.support??100;}};
 const held=()=>g.arsenal.held().id;
 assert.ok(g.arsenal.parts('support'),'a roster extra is built');
 assert.equal(g.arsenal.parts('marksman'),null,'a weapon off the roster is not');
 key('Digit4');assert.equal(held(),'carbine','the digit keys belong to the map');
 assert.equal(g.arsenal.select('pdw'),false,'a weapon the player does not own cannot be drawn');
 g.arsenal.cycle(1);tick(1.5);assert.equal(held(),'support','the wheel skips what is not owned');
 assert.equal(g.weapon.magSize,100,'the map writes its own magazine onto the rig');
 const tan=g.weapon.rigs.rifle.partsRef.mag.children.find(n=>n.isMesh&&n.material.name==='pac9_polymer_tan');
 assert.equal(tan.visible,false,'the twin drum replaces the stick magazine');
 g.input.fire=true;tick(.5);g.input.fire=false;tick(.2);const left=g.weapon.ammo;assert.ok(left<100);
 g.arsenal.select('carbine');tick(1.5);assert.equal(bank.support,left,'leaving a weapon hands its magazine to the map');
 assert.equal(tan.visible,true);
 g.arsenal.select('support');tick(1.5);assert.equal(g.weapon.ammo,left,'and drawing it again takes the map\'s count');
 g.arsenal.configure('support',{optic:'holo'});assert.equal(g.weapon.ammo,left,'changing an attachment keeps the magazine');
 g.weapon.swap();tick(1.5);assert.equal(g.weapon.current,'pistol');
 g.weapon.swap();tick(1.5);assert.equal(held(),'support','Q crosses between rifle and sidearm');
 key('KeyH');assert.equal(g.realism.armoryOpen,false,'H is the map\'s');key('Tab');assert.equal(g.realism.armoryOpen,true);key('Tab');
 let spots=0;g.scene.traverse(n=>{if(n.isSpotLight)spots++;});assert.equal(spots,0,'no weapon SpotLight where the map has its own flashlight');
 const laser=g.realism.laserOn;key('KeyT');assert.equal(g.realism.laserOn,laser);key('KeyL');assert.equal(g.realism.laserOn,!laser);
 g.player.reset();g.weapon.reset();assert.equal(held(),'support','the map restores its own loadout');
 assert.equal(g.arsenal.mods('support').optic,'holo');
});

test('the flak cannon and the rocket launcher: bodies of their own over the rig, what they may wear, one rocket at a time and loaded again by itself',async()=>{
 const plan={roster:['carbine','flak','rocket','sidearm'],numberKeys:false,gunsmithKeys:['Tab'],laserKey:'KeyL',weaponLight:false,slots:['optic','muzzle','barrel','underbarrel','finish'],keepOnReset:true,swapRigs:true};
 const {g,arsenal,tick}=await harness({map:{arsenal:plan}});
 const held=()=>g.arsenal.held(),rig=g.weapon.rigs.rifle,platform=g.arsenal.armory.base.rifle;
 const same=(a,b,msg)=>assert.equal(JSON.stringify(a),JSON.stringify(b),msg);   // arrays made inside the vm belong to another realm
 // off the harbor's keys and out of its six
 for(const id of ['flak','rocket']){const w=arsenal.byId(id);assert.ok(w&&w.rig==='rifle'&&w.key===null&&w.launcher===id,id);assert.ok(!arsenal.weapons.includes(w),id);}
 assert.equal(arsenal.byKey('Digit8'),undefined);assert.equal(arsenal.byKey('Digit9'),undefined);
 // what they may wear: a red dot or the prism sight, nothing on the muzzle, no other barrel; a laser on the cannon only
 const ids=(w,slot)=>arsenal.optionsFor(arsenal.byId(w),slot).map(o=>o.id);
 same(ids('flak','optic'),['rds','acog']);same(ids('rocket','optic'),['rds','acog']);
 same(ids('flak','muzzle'),['bore']);same(ids('rocket','muzzle'),['bore']);same(ids('flak','barrel'),['standard']);
 same(ids('flak','underbarrel'),['none','laser']);same(ids('rocket','underbarrel'),['none']);same(ids('rocket','ammoType'),['he']);
 assert.ok(!ids('carbine','muzzle').includes('bore')&&!ids('carbine','ammoType').includes('he')&&!ids('breacher','muzzle').includes('bore'),'and nothing of theirs goes on a rifle');
 for(const id of ['flak','rocket'])for(const [slot,val] of Object.entries(arsenal.byId(id).defaults))if(slot!=='finish')assert.ok(ids(id,slot).includes(val),`${id}'s own ${slot} is one it may wear`);
 // composed: a launcher may hold a single round; a cannon kicks harder than a rocket leaving its tube
 const rocket=arsenal.compose(arsenal.byId('rocket'),null,platform.def),flak=arsenal.compose(arsenal.byId('flak'),null,platform.def);
 assert.equal(rocket.def.magSize,1);assert.equal(flak.def.magSize,5);assert.equal(rocket.launcher,'rocket');assert.equal(flak.launcher,'flak');
 assert.ok(flak.recoil>rocket.recoil&&rocket.recoil>1&&flak.speed>60&&rocket.speed>60&&!flak.def.auto&&!rocket.def.auto);
 assert.equal(arsenal.compose(arsenal.byId('carbine'),null,platform.def).launcher,null);
 assert.equal(arsenal.compose(arsenal.byId('carbine'),null,platform.def).def.magSize,30,'a rifle is as it was');
 // in hand: the rifle beneath is on no layer and the launcher's own parts are drawn; put away, the rifle is back
 const beneath=[];rig.root.traverse(n=>{if(!n.isMesh||n===rig.flash)return;for(let up=n.parent;up&&up!==rig.root;up=up.parent)if(up.userData.gsPart)return;beneath.push(n);});
 const masks=beneath.map(n=>n.layers.mask);assert.ok(beneath.length>4&&masks.every(m=>m!==0));
 assert.ok(g.arsenal.select('rocket'));tick(1.5);assert.equal(held().id,'rocket');
 assert.ok(beneath.every(n=>n.layers.mask===0),'the rifle is not drawn under a launcher');
 const parts=g.arsenal.parts('rocket');let drawn=0;parts.group.traverse(n=>{if(n.isMesh&&n.layers.mask!==0)drawn++;});
 assert.ok(parts.group.visible&&drawn>14,'the launcher is built of its own parts');
 assert.ok(parts.group.userData.gsLauncher&&!g.arsenal.parts('carbine').group.userData.gsLauncher,'and marked, so a soldier\'s copy of the rifle leaves it out');
 assert.ok(parts.muzzleAt[0]>0&&Math.abs(rig.muzzle[0]-platform.muzzle[0]-parts.muzzleAt[0])<1e-9&&Math.abs(rig.muzzle[1]-platform.muzzle[1]-parts.muzzleAt[1])<1e-9,'its tube sits beside the sight, and the muzzle is where the tube is');
 // one rocket: fired, its nose is gone from the muzzle; it is loaded again without a second pull of the trigger
 const nose=()=>g.arsenal.parts('rocket').group.children.find(c=>c.isGroup);
 assert.equal(g.weapon.magSize,1);assert.equal(g.weapon.ammo,1);g.render.frame(1/60);assert.equal(nose().visible,true);
 let shots=0;g.combat.playerShot=()=>{shots++;return null;};
 const reserve=g.weapon.reserve;
 g.input.fire=true;tick(.1);g.input.fire=false;tick(.05);assert.equal(shots,1);assert.equal(g.weapon.ammo,0);
 g.render.frame(1/60);assert.equal(nose().visible,false,'the tube is empty');
 tick(5);assert.equal(g.weapon.ammo,1,'loaded again by itself');assert.equal(g.weapon.reserve,reserve-1);
 g.render.frame(1/60);assert.equal(nose().visible,true);
 // another sight is fitted with the launcher in hand: still the launcher, the rifle still out of sight
 assert.equal(g.arsenal.configure('rocket',{optic:'acog'}).mods.optic,'acog');assert.ok(beneath.every(n=>n.layers.mask===0));
 assert.equal(g.arsenal.configure('rocket',{muzzle:'suppressor'}).mods.muzzle,'bore','what it may not wear is refused');
 // put away, the rifle is drawn again and its muzzle is its own; the cannon hides it again, on the rifle's bore
 g.arsenal.select('carbine');tick(1.5);assert.equal(held().id,'carbine');same(beneath.map(n=>n.layers.mask),masks);assert.equal(rig.muzzle[0],platform.muzzle[0]);
 g.arsenal.select('flak');tick(1.5);assert.equal(held().id,'flak');assert.ok(beneath.every(n=>n.layers.mask===0));assert.equal(g.weapon.magSize,5);assert.equal(rig.muzzle[0],platform.muzzle[0]);
 assert.ok(rig.muzzle[2]<platform.muzzle[2],'the cannon\'s muzzle is further out than the rifle\'s');
 g.arsenal.cycle(1);tick(1.5);assert.equal(held().id,'rocket','the wheel reaches a launcher that is owned');
});

test('the pump shotgun: a body of its own, what it may wear, worked after every shot with the hand that holds it, and no shell of its own',async()=>{
 const plan={roster:['carbine','breacher','pump','sidearm'],numberKeys:false,gunsmithKeys:['Tab'],laserKey:'KeyL',weaponLight:false,slots:['optic','muzzle','barrel','underbarrel','finish'],keepOnReset:true,swapRigs:true};
 const {g,arsenal,tick}=await harness({map:{arsenal:plan}});
 const held=()=>g.arsenal.held(),rig=g.weapon.rigs.rifle,platform=g.arsenal.armory.base.rifle;
 const same=(a,b,msg)=>assert.equal(JSON.stringify(a),JSON.stringify(b),msg);
 const w=arsenal.byId('pump');
 assert.ok(w&&w.rig==='rifle'&&w.key===null&&w.body==='pump'&&!w.launcher&&!arsenal.weapons.includes(w),'an extra, off the harbor\'s keys, and not a launcher');
 // what it may wear: irons or a dot, its choke, its own barrel, a light but no grip (the fore-end is the grip), shot and slugs
 const ids=(slot)=>arsenal.optionsFor(w,slot).map(o=>o.id);
 same(ids('muzzle'),['choke']);same(ids('barrel'),['standard']);same(ids('underbarrel'),['none','laser']);same(ids('ammoType'),['buckshot','flechette','slug']);
 assert.ok(ids('optic').includes('irons')&&ids('optic').includes('rds')&&!ids('optic').includes('lpvo'));
 for(const [slot,val] of Object.entries(w.defaults))if(slot!=='finish')assert.ok(ids(slot).includes(val),`its own ${slot} is one it may wear`);
 const cfg=arsenal.compose(w,null,platform.def),breacher=arsenal.compose(arsenal.byId('breacher'),null,platform.def);
 assert.equal(cfg.body,'pump');assert.equal(cfg.launcher,null);assert.equal(cfg.def.auto,false);assert.equal(cfg.def.magSize,7);
 assert.ok(cfg.def.rpm<breacher.def.rpm&&cfg.recoil>breacher.recoil,'slower and harder on the shoulder than the semi-automatic');
 // in hand: the rifle beneath is not drawn, the gun is built of its own parts, and a soldier's copy of the rifle leaves it out
 const beneath=[];rig.root.traverse(n=>{if(!n.isMesh||n===rig.flash)return;for(let up=n.parent;up&&up!==rig.root;up=up.parent)if(up.userData.gsPart)return;beneath.push(n);});
 const masks=beneath.map(n=>n.layers.mask);
 assert.ok(g.arsenal.select('pump'));tick(1.5);assert.equal(held().id,'pump');
 assert.ok(beneath.every(n=>n.layers.mask===0));
 const parts=g.arsenal.parts('pump');let drawn=0;parts.group.traverse(n=>{if(n.isMesh&&n.layers.mask!==0)drawn++;});
 assert.ok(parts.group.visible&&drawn>20&&parts.pumps&&parts.group.userData.gsLauncher);
 assert.ok(!g.arsenal.parts('carbine').pumps,'a rifle has no fore-end to work');
 assert.ok(rig.muzzle[2]<platform.muzzle[2],'its muzzle is further out than the rifle\'s');
 // the fore-end: forward at rest; after a shot it comes back with the left hand's hold and goes forward again
 const fore=()=>parts.group.children.find(c=>c.isGroup),hold=rig.holds.fore.p,rest=hold.z;
 g.render.frame(1/60);assert.equal(fore().position.z,0);
 let shots=0;g.combat.playerShot=()=>{shots++;return null;};
 g.input.fire=true;tick(.05);g.input.fire=false;assert.equal(shots,1);assert.equal(g.weapon.ammo,6);
 let back=0;for(let i=0;i<40;i++){g.render.frame(1/60);back=Math.max(back,fore().position.z);if(i===17)assert.ok(Math.abs((hold.z-rest)-fore().position.z)<1e-9,'the hand goes where the fore-end goes');}
 assert.ok(back>.06&&back<.08,`it comes right back (${back.toFixed(3)} m)`);
 assert.equal(fore().position.z,0,'and is forward again within two thirds of a second');assert.ok(Math.abs(hold.z-rest)<1e-9);
 // it cannot be fired faster than it can be worked
 tick(1);g.input.fire=true;tick(.05);g.input.fire=false;assert.equal(shots,2);tick(.2);g.input.fire=true;tick(.05);g.input.fire=false;assert.equal(shots,2,'a second pull straight after the first does nothing');
 tick(1);g.input.fire=true;tick(.05);g.input.fire=false;assert.equal(shots,3);
 // put away in the middle of a stroke, the hold is the rifle's again
 for(let i=0;i<14;i++)g.render.frame(1/60);
 g.arsenal.select('carbine');tick(1.5);assert.equal(held().id,'carbine');same(beneath.map(n=>n.layers.mask),masks);assert.ok(Math.abs(hold.z-rest)<1e-9,'the left hand is back on the rifle');
});
