/* Gunslinger gameplay layer. The bundled engine owns rendering and mission flow. */
window.Gunslinger = {
  install(g) {
    'use strict';
    const T = g.THREE, p = g.player, w = g.weapon;
    if (!p || !w || !g.combat) return;
    const clamp = (v,a=0,b=1) => Math.max(a,Math.min(b,v));
    const state = {stamina:1,suppression:0,breath:1,bandages:2,bandaging:0,held:false,semi:false,elapsed:0,projectiles:0,exhausted:false,breathSpent:false};
    g.realism = state;
    const keys = new Set();
    window.addEventListener('keydown', e => {
      if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
      keys.add(e.code);
      if (e.code === 'KeyV' && !e.repeat && g.game.state === 'playing' && p.enabled && p.alive && w.current === 'rifle') state.semi = !state.semi;
    });
    window.addEventListener('keyup', e => keys.delete(e.code));
    window.addEventListener('blur', () => keys.clear());
    const vec = v => new T.Vector3(v.x,v.y,v.z);
    const hud = document.createElement('div'); hud.id = 'realism-hud'; hud.hidden = true;
    hud.innerHTML = `<div class="gs-identity"><span class="gs-dot"></span>GUNSLINGER <small>TERMINAL BREACH / 01</small></div>
      <div class="gs-status"><div><label>ENDURANCE</label><meter id="gs-stamina" min="0" max="1" value="1"></meter></div><div><label>BREATH</label><meter id="gs-breath" min="0" max="1" value="1"></meter></div><span id="gs-condition">STABLE</span></div>
      <div class="gs-readiness"><span id="gs-mode">AUTO</span><span id="gs-ammo">30 / 150</span><span id="gs-stance">STANDING</span><span id="gs-dressings">2 DRESSINGS</span></div>
      <div id="gs-action" role="status"></div><div class="gs-hint">V · FIRE SELECT &nbsp; ALT · STEADY AIM &nbsp; HOLD B · FIELD DRESSING</div>`;
    document.getElementById('ui').append(hud);
    const $ = id => document.getElementById(id);
    const suppression = document.createElement('div'); suppression.id = 'gs-suppression'; document.getElementById('ui').append(suppression);
    const stats = g.combat.stats;
    const trace = (origin, direction, range, owner) => {
      const o = vec(origin), d = vec(direction);
      const wall = g.physics.raycast(o,d,range); const limit = wall ? wall.dist : range;
      if (owner === 'player') {
        const target = g.enemies.raycast(o,d,limit);
        if (target) return {...target, surface:'enemy',normal:target.normal || d.clone().negate()};
      } else if (p.alive) {
        // A swept ray/capsule approximation with distinct standing/crouched bounds.
        const height = p.crouching ? 1.12 : 1.78;
        const center = p.pos.clone().add(new T.Vector3(0,height*.5,0));
        const along = clamp(center.clone().sub(o).dot(d),0,limit);
        const nearest = o.clone().addScaledVector(d,along);
        if (Math.hypot(nearest.x-center.x,nearest.z-center.z)<.3 && nearest.y>p.pos.y && nearest.y<p.pos.y+height) {
          return {dist:along,point:nearest,normal:d.clone().negate(),surface:'player'};
        }
      }
      return wall;
    };
    const bullets = new window.GunslingerBallistics({trace,
      impact(hit,b,damage) {
        const dir = vec(b.velocity).normalize();
        if (hit.surface === 'player') { p.damage(damage,vec(b.position)); return; }
        let killed = false;
        if (hit.enemy) {
          stats.hits++;
          killed = hit.enemy.damage(damage*(hit.part === 'weak'?2.2:1),hit.point,dir,hit.part) === true;
          g.events.emit('player:hitEnemy',{enemy:hit.enemy,part:hit.part,killed,weak:hit.part==='weak'});
        }
        g.events.emit('impact',{...hit,dir,from:b.owner,killed});
        if (g.fx.tracer && b.owner==='player') g.fx.tracer(vec(b.previous),hit.point);
      },
      nearMiss(start,end,b) {
        if (b.owner !== 'enemy' || !p.alive) return;
        const a=vec(start), ab=vec(end).sub(a), eye=p.eye;
        const t=clamp(eye.clone().sub(a).dot(ab)/Math.max(ab.lengthSq(),1e-8));
        const distance=eye.distanceTo(a.addScaledVector(ab,t));
        if(distance<1.8) state.suppression=Math.max(state.suppression,(1-distance/1.8)*.85);
      }
    });
    g.ballistics = bullets;
    g.combat.playerShot = (origin,dir,options={}) => {
      stats.shots++;
      const shot = vec(dir);
      const unstable = (1-state.stamina)*.0018 + state.suppression*.002;
      shot.x+=(Math.random()-.5)*unstable; shot.y+=(Math.random()-.5)*unstable;
      bullets.fire(origin,shot.normalize(),{speed:w.current==='pistol'?360:820,damage:options.damage?options.damage*1.4:42,range:options.range||350});
      return null;
    };
    g.combat.enemyShot = (origin,dir,options={}) => {
      bullets.fire(origin,dir,{speed:620,damage:Math.max(16,(options.damage||6)*2),range:options.range||200,owner:'enemy'});
      return false;
    };
    const applyTuning = () => Object.assign(p.tuning,{walk:3.15,sprint:5.5,crouch:1.45,ads:1.55,accelGround:15,decelGround:20,accelAir:2,regenDelay:1e9,regenRate:0,bobY:.017,bobX:.009,fovSprint:2,recoilKeep:.65});
    applyTuning();
    g.events.on('game:state', ({state:next,prev}) => {
      keys.clear();
      if (next==='intro' || (prev==='dead' && next!=='dead') || (prev==='complete' && next!=='complete')) reset();
      applyTuning();
    });
    const reset = () => {
      Object.assign(state,{stamina:1,suppression:0,breath:1,bandages:2,bandaging:0,held:false,semi:false,exhausted:false,breathSpent:false}); bullets.reset();
    };
    const playerReset = p.reset.bind(p);
    p.reset = (...args) => { playerReset(...args); reset(); applyTuning(); };
    const playerUpdate = p.update.bind(p);
    p.update = dt => {
      applyTuning();
      if(state.stamina<.06) state.exhausted=true;
      if(state.stamina>.3) state.exhausted=false;
      if(state.exhausted) g.input.sprint=false;
      if(state.breath<.05) state.breathSpent=true;
      if(state.breath>.3) state.breathSpent=false;
      if(state.bandaging>0) {g.input.fire=false;g.input.sprint=false;g.input.ads=false;}
      p.tuning.walk=3.15*(p.health<30?.72:1);
      playerUpdate(dt);
      const steady = (keys.has('AltLeft')||keys.has('AltRight')) && p.ads>.8 && !state.breathSpent && !p.sprinting;
      state.breath=clamp(state.breath+dt*(steady?-.3:.18));
      const amplitude=(steady?.00012:.0007)*(1+(1-state.stamina)*3+state.suppression*2);
      if (p.alive && p.enabled) {
        g.camera.rotation.x+=Math.sin(g.time.t*1.7)*amplitude;
        g.camera.rotation.y+=Math.sin(g.time.t*1.1)*amplitude*.55;
      }
    };
    const weaponUpdate = w.update.bind(w);
    w.update = dt => {
      if (w.rigs?.rifle?.def) w.rigs.rifle.def.auto = !state.semi;
      weaponUpdate(dt);
    };
    let hitTime=-10;
    g.events.on('player:hit',()=>{hitTime=g.time.t;state.bandaging=0;state.suppression=1;});
    const renderFrame = g.render.frame.bind(g.render);
    g.render.frame = dt => {
      const active=p.enabled && p.alive && !['title','paused','dead','complete'].includes(g.game.state);
      hud.hidden=!active;
      if (active) {
        state.elapsed+=dt;
        state.stamina=clamp(state.stamina+dt*(p.sprinting?-.19:p.crouching?.16:.115));
        state.suppression=Math.max(0,state.suppression-dt*.45);
        const dressing=keys.has('KeyB') && p.speed<.4 && state.bandages>0 && p.health<100 && g.time.t-hitTime>1;
        state.bandaging=dressing?state.bandaging+dt:0;
        if(state.bandaging>=3) {p.heal(35);state.bandages--;state.bandaging=0;keys.delete('KeyB');}
        bullets.update(dt);
        state.projectiles=bullets.projectiles.length;
        $('gs-stamina').value=state.stamina; $('gs-breath').value=state.breath;
        $('gs-condition').textContent=p.health<30?'CRITICAL':p.health<65?'WOUNDED':'STABLE';
        $('gs-condition').classList.toggle('injured',p.health<65);
        $('gs-ammo').textContent=`${w.ammo} / ${Number.isFinite(w.reserve)?w.reserve:'∞'}`;
        $('gs-mode').textContent=w.current==='pistol'?'SEMI':state.semi?'SEMI':'AUTO';
        $('gs-stance').textContent=p.crouching?'CROUCHED':p.sprinting?'SPRINTING':'STANDING';
        $('gs-dressings').textContent=`${state.bandages} DRESSINGS`;
        $('gs-action').textContent=state.bandaging>0?`APPLYING DRESSING  ${Math.min(100,state.bandaging/3*100).toFixed(0)}%`:state.suppression>.5?'UNDER FIRE — FIND COVER':state.stamina<.15?'EXHAUSTED — RECOVER':'';
      }
      suppression.style.opacity=active?state.suppression*.65:0;
      renderFrame(dt);
    };
    window.GunslingerVisuals?.install(g);
    this.brand();
  },
  brand() {
    const set = (selector,text) => {const e=document.querySelector(selector);if(e)e.textContent=text;};
    set('.m-word','GUNSLINGER'); set('.m-premise','A hostile terminal. Three uplinks. One way out. Every round has a flight path. Every wound stays with you.');
    set('.m-eyebrow .m-tag','GS / 01'); set('.m-eyebrow > span:nth-child(2)','TERMINAL BREACH');
    set('.m-eyebrow .m-dim','COMBAT STUDY / FIRST LIGHT');
    set('.m-note','Projectile flight · persistent injuries · endurance · suppression');
    set('[data-act="deploy"]','Enter operation');
    set('.m-debrief .m-h','Terminal secured');
    const callout=document.querySelector('.m-callout');if(callout)callout.remove();
    const controls=document.querySelector('[data-pane="controls"]');
    if(controls){const note=document.createElement('p');note.className='panel-note';note.textContent='Rifle starts in automatic. V: semi / auto rifle fire. Hold Alt while aiming: steady breath (limited). Hold B while stationary for 3 seconds: apply one of two dressings, restoring 35 health. Damage interrupts treatment. No automatic health regeneration.';controls.prepend(note);}
    const legend=document.querySelector('.m-legend');
    if(legend){const row=document.createElement('div');row.innerHTML='<span><kbd>V</kbd> Fire select</span><span><kbd>Alt</kbd> Steady aim</span><span><kbd>Hold B</kbd> Dress wound</span>';legend.prepend(row);}
  }
};
