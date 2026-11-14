/* Renderer-facing changes belong here, separate from combat rules. */
window.GunslingerVisuals = {
  install(g) {
    const T=g.THREE;
    // A map that brings its own level also brings its own look; the values below are the harbor's daylight.
    const map=window.GunslingerMap;
    if(map) { map.look?.(g); }
    else {
      // render.post is transient gameplay state; render.tune drives the optical passes.
      Object.assign(g.render.tune || {}, {
        grain:.008,ca:.00015,vignette:.14,lookSat:.94,lookPower:1.02,
        bloom:.025,bloomMix:.3,dirt:.012,streak:.006,flare:.035,
        sharpen:.18,volSigma:.0018,volFarHaze:.2,volInteriorDust:2.5,
        aoIntensity:1.15,aoStrength:.8,key:.15,minExposure:.7,maxExposure:1.7
      });
      if(g.mats?.uniforms?.wet) g.mats.uniforms.wet.value=.6;
      if(g.ground?.setRain) g.ground.setRain(.25);
    }
    if(!g.scene || !T?.TextureLoader) return;
    g.visuals={materialReady:false,impacts:0};
    if(!map) this.installGround(g);
    this.installImpacts(g);
  },
  installGround(g) {
    const T=g.THREE,material=g.ground?.apron?.material;
    if(!material) return;
    // Blend photographic-scale grain into the existing wetness, markings and puddle shader.
    new T.TextureLoader().load('assets/materials/dock-concrete-albedo.png', texture=>{
      texture.colorSpace=T.SRGBColorSpace;
      texture.wrapS=texture.wrapT=T.RepeatWrapping;
      texture.anisotropy=Math.min(8,g.renderer.capabilities.getMaxAnisotropy());
      const original=material.onBeforeCompile;
      const cacheKey=material.customProgramCacheKey();
      material.onBeforeCompile=shader=>{
        original.call(material,shader);
        shader.uniforms.uGsConcrete={value:texture};
        shader.fragmentShader='uniform sampler2D uGsConcrete;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('diffuseColor.rgb *= alb;',`
          vec2 gsUv = gxz / 3.0;
          vec3 gsA = texture2D(uGsConcrete, gsUv).rgb;
          vec3 gsB = texture2D(uGsConcrete, mat2(0.8,-0.6,0.6,0.8)*gsUv*0.73+vec2(0.37,0.63)).rgb;
          vec3 gsDetail = mix(gsA,gsB,0.35);
          // Preserve paint and standing water, which have their own surface response.
          alb *= mix(vec3(1.0),clamp(gsDetail / vec3(0.25,0.23,0.20),vec3(0.35),vec3(1.6)),0.75*(1.0-paint)*(1.0-puddle));
          diffuseColor.rgb *= alb;`);
      };
      material.customProgramCacheKey=()=>cacheKey+'-gunslinger-photo-1';
      material.needsUpdate=true;g.visuals.materialReady=true;
    },undefined,error=>{console.error('[visuals] Concrete texture failed to load',error);});
  },
  installImpacts(g) {
    const T=g.THREE;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const c=canvas.getContext('2d');
    const glow=c.createRadialGradient(64,64,6,64,64,58);
    glow.addColorStop(0,'rgba(12,11,10,.95)');glow.addColorStop(.22,'rgba(25,23,20,.9)');
    glow.addColorStop(.42,'rgba(90,85,73,.55)');glow.addColorStop(1,'rgba(80,75,64,0)');
    c.fillStyle=glow;c.fillRect(0,0,128,128);
    const texture=new T.CanvasTexture(canvas);
    const material=new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,toneMapped:false});
    const geo=new T.PlaneGeometry(1,1),marks=[],up=new T.Vector3(0,0,1);
    let index=0;
    g.events.on('impact',hit=>{
      if(hit.enemy || hit.surface==='water' || !hit.point || !hit.normal) return;
      if(!['metal','concrete','wood','stone','brick','dirt','paint'].includes(hit.surface)) return;
      let mark=marks[index];
      if(!mark){mark=new T.Mesh(geo,material);marks[index]=mark;g.scene.add(mark);}
      mark.position.copy(hit.point).addScaledVector(hit.normal,.008);
      mark.quaternion.setFromUnitVectors(up,hit.normal);
      const size=hit.surface==='metal'?.065:.13;
      mark.scale.setScalar(size*(.85+Math.random()*.3));mark.visible=true;
      index=(index+1)%96;g.visuals.impacts++;
    });
    g.events.on('game:state',({state})=>{if(state==='intro')for(const mark of marks)mark.visible=false;});
  }
};
