// What each body is painted as. `node prompts.cjs <mannequin dir> <art dir> <stage> [kind ...]` prints the jobs for
// one stage as JSON: stage 1 paints the body from the front, stage 2 the back and the face (shown the front),
// stage 3 the back of the head.
const path = require('node:path');

const WHO = {
  walkerA: 'a gaunt rotting corpse risen from an old grave: desiccated grey-green skin tight over the skull, sunken dark eye sockets, lipless exposed teeth, a few thin strands of hair; a rotted black early-1900s funeral suit: jacket with lapels over a buttoned waistcoat and a stained shirt with a loose black tie, matching trousers, cracked leather shoes, everything frayed and caked with wet grave mud; where one sleeve ends in a step at the elbow the forearm below it is bare withered skin with bone showing',
  walkerB: 'a rotting villager risen from an old grave: desiccated grey-green skin, sunken dark eye sockets, lipless exposed teeth, patchy hair; a stained collarless linen shirt with torn rolled sleeves under a dark buttoned waistcoat and braces, coarse brown wool trousers caked with wet mud; the arm with almost no sleeve is bare withered skin; the leg whose trouser ends below the knee is a bare bony shin and bare foot, the other foot wears an old boot',
  runner: 'a lean wiry feral corpse: bare desiccated grey skin stretched over ribs and sinew on the chest, arms and legs, a snarling skull-like face with exposed teeth; wrapped in a torn dirty-white burial shroud: a ragged hood over the head and shoulders, stained strips bound round the chest, a ragged loincloth at the hips; bare clawed feet; streaks of wet grave mud',
  spitter: 'a bloated swamp zombie creature for a fantasy horror game: swollen pale blue-grey skin with dark veins, a huge round belly and a swollen throat covered in glowing yellow-green boils under translucent skin, long wet stringy dark hair, hollow dark eyes, an open mouth with green slime on the chin; a dirty torn linen nightgown hanging to below the knees in tatters, stained green down the front; bare swollen feet',
  brute: 'a huge heavy gravedigger corpse: grey-brown rotting skin, thick neck, heavy brow, underbite with broken teeth, bald scarred scalp; a filthy linen shirt with rolled sleeves, a heavy stained leather apron hanging from the chest to the knees on leather straps, baggy mud-caked trousers, heavy hobnailed boots; a rusted chain wound round one forearm; massive rotting hands',
  boss: 'a towering dead bishop, an abomination: a skull face with empty sockets under a tall rotted ivory-and-gold mitre; tattered crimson and gold vestments: a long robe to the feet, a chasuble panel down the chest embroidered with gold crosses, wide ragged sleeves, skeletal clawed hands; an exposed ribcage showing through the torn chest; the round lumps on the torso are the faces of other corpses fused under the skin; the thin limbs on the back are withered grey spare arms; the beams behind the shoulder are a broken mossy stone cross embedded in the body',
};
WHO.guard = 'a living human night watchman of the 1910s guarding a churchyard, alert and grim, not a monster: a weathered face with a moustache, a dark wool scarf at the throat, a steel brodie helmet; a long dark oilskin greatcoat buttoned to the neck with brass buttons, a leather belt with ammunition pouches and a cross strap, leather gloves, wool trousers, tall muddy leather boots; everything wet from rain';
const RULES = 'Keep the exact pose, proportions, scale, framing and silhouette of the grey figure: every part stays exactly where it is in the image; do not move, crop, resize, re-pose or add anything outside its outline. Orthographic straight-on view. Flat, even, shadowless diffuse lighting like an albedo texture reference: no cast shadows, no rim light, no glossy highlights, no ground, no fog, no rain. Grounded, realistic, grim; muted bone grey, moss green, black cloth and mud brown. The background stays a flat solid pure magenta (#FF00FF) everywhere outside the figure. No text.';
const SAME = 'The other attached image shows the same character from the front: match its skin, clothing, colours and state of decay exactly.';

function jobs(man, art, stage, kinds) {
  const out = [];
  for (const k of kinds) {
    const m = (v) => path.join(man, `${k}-${v}.png`), a = (v) => path.join(art, `${k}-${v}.png`);
    const base = (what, view) => `The attached image is a grey untextured 3D base mesh of ${what} of a humanoid video game character, seen exactly from ${view} on a flat magenta background. Paint the finished character directly over it as a realistic texture reference: ${WHO[k]}.`;
    if (stage === 1) out.push({ out: a('bodyFront'), size: '1024x1536', inputs: [m('bodyFront')], prompt: `${base('the whole body', 'the front in a neutral A-pose')} ${RULES}` });
    if (stage === 2) {
      out.push({ out: a('bodyBack'), size: '1024x1536', inputs: [m('bodyBack'), a('bodyFront')], prompt: `${base('the whole body', 'behind in a neutral A-pose (we see its back, the back of the head and the heels)')} ${SAME} ${RULES}` });
      out.push({ out: a('headFront'), size: '1024x1024', inputs: [m('headFront'), a('bodyFront')], prompt: `${base('the head and neck', 'the front in close-up, mouth slightly open')} Paint the face in fine detail: rotted skin, eye sockets, nose, teeth. The other attached image shows the whole character: this is its head, match it exactly. ${RULES}` });
    }
    if (stage === 3) out.push({ out: a('headBack'), size: '1024x1024', inputs: [m('headBack'), a('headFront'), a('bodyBack')], prompt: `${base('the head and neck', 'behind in close-up (we see the back of the skull and the nape)')} The other attached images show the face of the same character and its whole back: match them exactly. ${RULES}` });
  }
  return out;
}

if (require.main === module) {
  const [man, art, stage, ...kinds] = process.argv.slice(2);
  process.stdout.write(JSON.stringify(jobs(path.resolve(man), path.resolve(art), +stage, kinds.length ? kinds : Object.keys(WHO)), null, 1));
}
module.exports = { WHO, jobs };
