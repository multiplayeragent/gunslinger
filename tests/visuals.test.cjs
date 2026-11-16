const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('./weapon-harness.cjs');
test('visual settings target renderer tuning and ground extension preserves the wet shader',async()=>{
 const {g,visuals,groundFactory}=await harness();
 // Regression: these fields on render.post silently did nothing.
 g.render.tune={};visuals.install(g);
 assert.equal(g.render.tune.lookSat,.98);assert.equal(g.render.tune.volSigma,.0015);
 assert.equal(g.render.tune.blackLift,0);assert.equal(g.render.tune.split,0);
 assert.equal(g.render.post.lookSat,undefined);
 const T=g.THREE;
 const map={image:{width:128}};
 const apron=groundFactory(g,{marks:map,mask:map});
 assert.equal(apron.uniforms.uMaskRect.value.x,-54,'wetness mask covers expanded west perimeter');
 assert.equal(apron.uniforms.uMaskRect.value.y,-46,'wetness mask covers expanded north perimeter');
 assert.equal(apron.uniforms.uMarkRect.value.x,-50,'painted terminal markings cover expanded west gate');
 assert.equal(apron.uniforms.uMarkRect.value.y,-40,'painted terminal markings cover expanded north service road');
 g.ground={apron:apron.mesh};
 let loaded;
 g.THREE={...T,TextureLoader:class{load(url,success){loaded=url;success(new T.Texture());}}};
 g.renderer={capabilities:{getMaxAnisotropy:()=>8}};
 visuals.installGround(g);
 const shader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};
 apron.material.onBeforeCompile(shader);
 assert.equal(loaded,'assets/materials/dock-concrete-albedo.png');
 assert.ok(shader.uniforms.uGsConcrete);assert.ok(shader.uniforms.uRefl);
 assert.match(shader.fragmentShader,/uniform sampler2D uGsConcrete;/);
 assert.match(shader.fragmentShader,/texture2D\(uGsConcrete/);
 assert.match(shader.fragmentShader,/float puddle =/);
 assert.match(shader.fragmentShader,/float paint =/);
 assert.match(shader.fragmentShader,/radiance = mix\(radiance, pr, pw\)/);
 assert.equal(g.visuals.materialReady,true);
});
test('sea planar reflection shader hoists foam mask cleanly and PBR impact decals respect pool bounds',async()=>{
 const {g,visuals,groundFactory,seaFactory}=await harness();
 const T=g.THREE;
 const map={image:{width:128}};
 const apron=groundFactory(g,{marks:map,mask:map,detail:map,detailN:map,black:map});
 const sea=seaFactory(g,{detail:map,detailN:map});
 g.ground={apron:apron.mesh,sea:sea.mesh,uniforms:apron.uniforms};
 g.visuals={materialReady:false,seaReady:false,envReady:false,impacts:0,activeLights:0};

 visuals.installSea(g);
 assert.equal(g.visuals.seaReady,true);
 const seaShader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};
 sea.material.onBeforeCompile(seaShader);
 assert.equal(seaShader.uniforms.uRefl,apron.uniforms.uRefl);
 assert.equal(seaShader.uniforms.uReflMatrix,apron.uniforms.uReflMatrix);
 assert.match(seaShader.fragmentShader,/float gsSeaFoam = 0\.0;/,'foam mask must be hoisted outside zP block scope');
 assert.match(seaShader.fragmentShader,/gsSeaFoam = foam;/);
 assert.match(seaShader.fragmentShader,/gsWaveFade = 1\.0 - smoothstep/);
 assert.match(seaShader.fragmentShader,/radiance = mix\(radiance, gsRefl/);
 assert.doesNotMatch(seaShader.fragmentShader,/1\.0 - foam \* 0\.85/,'lights_fragment_maps must not reference block-local foam');

 // Lit PBR impact decal pool (already installed by harness; bounded to 96 meshes, ignores water/enemy hits)
 const beforeChildren=g.scene.children.length;
 g.events.emit('impact',{surface:'water',point:new T.Vector3(),normal:new T.Vector3(0,1,0)});
 assert.equal(g.visuals.impacts,0);
 for(let i=0;i<110;i++){
  g.events.emit('impact',{surface:i%2?'metal':'concrete',point:new T.Vector3(i*.1,0,0),normal:new T.Vector3(0,1,0)});
 }
 assert.equal(g.visuals.impacts,110);
 assert.equal(g.scene.children.length-beforeChildren,96,'impact mark pool is bounded at 96 meshes');
 const sampleMark=g.scene.children[g.scene.children.length-1];
 assert.ok(sampleMark.material.isMeshStandardMaterial,'impact decals use lit PBR MeshStandardMaterial');
 assert.ok(sampleMark.material.normalMap,'impact decals carry normal relief map');
 g.events.emit('game:state',{state:'intro',prev:'playing'});
 assert.equal(sampleMark.visible,false,'transition to intro hides pooled decals');

 // Showcase mode safety: missing player.tuning does not throw
 g.player.tuning=undefined;
 assert.doesNotThrow(()=>g.render.frame(.016));
});
test('a map can take the focused shadow fit and its own weapon fill; the harbor keeps its numbers',async()=>{
 const {g,visuals}=await harness();
 const T=g.THREE,passes=[];
 const sun=new T.DirectionalLight();sun.shadow.camera=new T.OrthographicCamera(-97,97,71,-71,104,287);
 g.render={...g.render,sun,sunDir:new T.Vector3(-.6,.62,.5).normalize(),addPrePass:f=>passes.push(f)};
 g.visuals={};
 // the churchyard's fit (src/vigil/map.js): a 64 m box ahead of a camera in the yard, the whole yard from above
 visuals.installHighResShadows(g,{wide:p=>p.y>12,half:32,wideHalf:70,ahead:15,wideAhead:0,dist:80,near:4,far:175,maxY:8});
 const cam=new T.PerspectiveCamera();cam.position.set(0,1.7,20);cam.lookAt(0,1.7,0);cam.updateMatrixWorld();
 passes[0](null,null,cam);
 assert.equal(sun.shadow.camera.right,32);assert.equal(sun.shadow.camera.far,175);
 const texel=64/4096,s=sun.target.position,d=g.render.sunDir;
 const right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),d).normalize();
 const lx=s.dot(right)/texel;assert.ok(Math.abs(lx-Math.round(lx))<1e-6,'the focus is snapped to whole shadow texels');
 cam.position.set(0,30,0);cam.updateMatrixWorld();passes[0](null,null,cam);assert.equal(sun.shadow.camera.right,70,'a view from above keeps the whole yard');
 g.visuals.shadowFit=false;passes[0](null,null,cam);assert.equal(sun.shadow.camera.right,97,'the diagnostic switch restores the engine fit');
 // weapon fill: the harbor's daylight defaults unless a map brings its own
 g.camera=new T.PerspectiveCamera();visuals.installViewmodelRealism(g);assert.equal(g.render.viewKey,.78);
 assert.equal(g.visuals.viewLights.rim.intensity,.52);
 g.camera=new T.PerspectiveCamera();visuals.installViewmodelRealism(g,{key:.3,bounce:[0x39404a,.1],rim:[0xb4c6ff,.18]});
 assert.equal(g.render.viewKey,.3);assert.equal(g.visuals.viewLights.rim.intensity,.18);assert.equal(g.visuals.viewLights.rim.color.getHex(),0xb4c6ff);
});
