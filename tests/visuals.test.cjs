const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('./weapon-harness.cjs');
test('visual settings target renderer tuning and ground extension preserves the wet shader',async()=>{
 const {g,visuals,groundFactory}=await harness();
 // Regression: these fields on render.post silently did nothing.
 g.render.tune={};visuals.install(g);
 assert.equal(g.render.tune.lookSat,.94);assert.equal(g.render.tune.volSigma,.0018);
 assert.equal(g.render.post.lookSat,undefined);
 const T=g.THREE;
 const map={image:{width:128}};
 const apron=groundFactory(g,{marks:map,mask:map});
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
