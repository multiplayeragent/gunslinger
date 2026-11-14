/* Assembles the churchyard and hands the engine its level contract. */
(function () {
  'use strict';
  const V = (window.Vigil = window.Vigil || {});

  V.level = {
    async create(g) {
      const T = g.THREE, kit = V.kit;
      const root = new T.Group(); root.name = 'level'; g.scene.add(root);
      const mats = (V.materials = await V.mats.create(g));
      V.loose = V.phys.create(g);                  // before anything is built, so it sees every collider
      const B = new kit.Builder(g, mats);
      const ctx = { g, mats, root, dyn: new T.Group() };
      ctx.dyn.name = 'vigil-dynamic'; root.add(ctx.dyn);

      const church = V.church.build(B, ctx);
      const yard = V.yard.build(B, ctx, church);
      const woods = V.forest.build(B, ctx, yard);
      const tris = B.count();
      const merged = B.build('vigil-static');
      root.add(merged);
      const breakable = (V.destruct = V.destructs.create(g, mats, B.objects || [], root));

      const lights = V.lighting.create(g, ctx, church, yard);
      const crystal = V.crystal.create(g, ctx, lights, church);
      V.world = { church, yard, woods, lights, crystal, ctx };
      console.log(`[vigil] churchyard: ${tris} triangles in ${merged.children.length} merged meshes, ${woods.count} pines, ${yard.graves.length} graves, ${breakable.objects.length} things that break`);

      const W = V.WORLD;
      // keep the player inside the map
      g.physics.addBox([-W - 2, 0, -W - 2], [-W + 0.6, 30, W + 2], { playerOnly: true, noNav: true });
      g.physics.addBox([W - 0.6, 0, -W - 2], [W + 2, 30, W + 2], { playerOnly: true, noNav: true });
      g.physics.addBox([-W - 2, 0, -W - 2], [W + 2, 30, -W + 0.6], { playerOnly: true, noNav: true });
      g.physics.addBox([-W - 2, 0, W - 0.6], [W + 2, 30, W + 2], { playerOnly: true, noNav: true });

      return {
        root,
        playerStart: { pos: new T.Vector3(0.6, 0, 24.5), yaw: 0 },
        objectives: [], enemySpawns: [], zones: [], coverPoints: [], explosives: [],
        interiorBoxes: [church.interior],
        skylights: church.skylights,
        cinematicPath: [
          { pos: [3, 1.6, 44], look: [0, 6, 12] },
          { pos: [1.5, 1.5, 33], look: [-2, 7, 12] },
          { pos: [-9, 1.8, 24], look: [-7, 9, 10] },
          { pos: [-17, 2.2, 14], look: [-4, 6, 4] },
          { pos: [-16, 1.7, -2], look: [-4, 3.5, -5] },
          { pos: [-9.5, 1.6, -4.5], look: [0, 2.2, -2] },
          { pos: [-3.2, 1.7, -3.8], look: [0.2, 2.0, 0] },
          { pos: [1.8, 1.9, 4.5], look: [0, 2.3, -3] },
          { pos: [0.6, 1.6, 10.5], look: [0, 3.2, -6] },
          { pos: [0.3, 1.7, 17], look: [0, 6.5, 10] },
          { pos: [10, 2.2, 23], look: [2, 6, 10] },
          { pos: [20, 2.4, 12], look: [6, 5, 0] },
        ],
        extraction: { pos: new T.Vector3(0, -200, 0), radius: 0.1 },
        groundSurfaceAt(x, z) { return Math.abs(x) < V.CH.hw && Math.abs(z) < V.CH.hd ? 'concrete' : 'dirt'; },
        update(dt) { lights.update(dt); crystal.update(dt); V.loose.updateBodies(dt); breakable.update(dt); },
      };
    },
  };
  // The forest and its hills are part of the level, so there is no separate backdrop to build.
  V.backdrop = { async create() { return { stub: true, update() {} }; } };
})();
