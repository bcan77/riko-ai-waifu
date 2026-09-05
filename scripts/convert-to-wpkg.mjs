#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pack } from '../packages/wpkg/src/index.js';
import { defaultManifest } from '../packages/wpkg/src/manifest.js';

const MODELS_ROOT = path.resolve('MMD_Models_MiHoyo');
const CHAR_DIR = path.resolve('characters');
const PUBLIC_MODELS = path.resolve('waifu-viewer/public/models');

// prefer default_pose.vmd (FBX-converted) as idle, else legacy 1.vmd
function pickIdle() {
  for (const cand of ['VMD_Animations/default_pose.vmd', 'VMD_Animations/1.vmd']) {
    if (fs.existsSync(path.resolve(cand))) return cand;
  }
  return null;
}
const VMD_IDLE = pickIdle();

const MAP = {
  // id maps to one or more source folders (outfits). First outfit is default.
  'ellen_joe': {
    name: 'Ellen Joe',
    en: 'af_sky', ja: 'jf_alpha',
    outfits: [
      { id: 'default', name: 'Default', folder: 'Ellen Joe', pmx: '艾莲.pmx' },
      { id: 'on_campus', name: 'On Campus', folder: 'Ellen Joe - On Campus', pmx: '艾莲.pmx' },
    ]
  },
  'jane_doe': {
    name: 'Jane Doe',
    en: 'af_bella', ja: 'jf_gongitsune',
    outfits: [
      { id: 'default', name: 'Default', folder: 'Jane Doe', pmx: '简.pmx' },
    ]
  },
  'zhu_yuan': {
    name: 'Zhu Yuan',
    en: 'af_nicole', ja: 'jf_sakura',
    outfits: [
      { id: 'default', name: 'Default', folder: 'Zhu Yuan', pmx: '朱鸢.pmx' },
    ]
  },
};

if (!fs.existsSync(MODELS_ROOT)) { console.error('MMD_Models_MiHoyo not found'); process.exit(1); }
fs.mkdirSync(CHAR_DIR, { recursive: true });

for (const [charId, meta] of Object.entries(MAP)) {
  // filter outfits whose source folder exists
  const viable = meta.outfits.filter(o => fs.existsSync(path.join(MODELS_ROOT, o.folder)));
  if (!viable.length) { console.warn('skip', charId, 'no source folders'); continue; }
  if (viable.length < meta.outfits.length) {
    const missing = meta.outfits.filter(o => !viable.includes(o)).map(o=>o.folder).join(', ');
    console.warn(`note ${charId}: missing outfits skipped: ${missing}`);
  }

  const tmp = path.join('/tmp', `wpkg-build-${charId}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  // canonical layout: model/ = default outfit, outfits/<id>/ = extra outfits
  fs.mkdirSync(path.join(tmp, 'model'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'motions'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'prompts'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'voice'), { recursive: true });

  function copyRecursive(src, dstBase) {
    for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, ent.name);
      const d = path.join(dstBase, ent.name);
      if (ent.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyRecursive(s, d); }
      else fs.copyFileSync(s, d);
    }
  }

  // also mirror each outfit source into waifu-viewer/public/models/<folder> for vite dev
  // so /models/Ellen Joe/... and /models/Ellen Joe - On Campus/... both resolve.
  try { fs.mkdirSync(PUBLIC_MODELS, { recursive: true }); } catch {}
  for (const o of viable) {
    const srcDir = path.join(MODELS_ROOT, o.folder);
    // mirror to public/models mirroring original folder name (what main.js file paths use)
    const mirrorDst = path.join(PUBLIC_MODELS, o.folder);
    try {
      fs.mkdirSync(path.dirname(mirrorDst), { recursive: true });
      if (!fs.existsSync(mirrorDst)) fs.mkdirSync(mirrorDst, { recursive: true });
      // naive mirror: copy if dest missing or mtime differs — do lightweight sync
      // For now just ensure key pmx exists; full copy is cheap (<100MB) but we do it if needed
      const pmxDest = path.join(mirrorDst, o.pmx);
      if (!fs.existsSync(pmxDest)) {
        fs.rmSync(mirrorDst, { recursive: true, force: true });
        fs.mkdirSync(mirrorDst, { recursive: true });
        copyRecursive(srcDir, mirrorDst);
      }
    } catch (e) { console.warn('mirror failed', o.folder, e.message); }
  }

  // --- pack default outfit into model/ ---
  const defOutfit = viable[0];
  copyRecursive(path.join(MODELS_ROOT, defOutfit.folder), path.join(tmp, 'model'));
  // ensure canonical model.pmx
  const origPmx = path.join(tmp, 'model', defOutfit.pmx);
  const canonPmx = path.join(tmp, 'model', 'model.pmx');
  if (fs.existsSync(origPmx) && !fs.existsSync(canonPmx)) fs.copyFileSync(origPmx, canonPmx);

  // --- pack extra outfits into outfits/<id>/ ---
  const outfitsManifest = [];
  // first is default pointing at model/model.pmx
  outfitsManifest.push({ id: defOutfit.id, name: defOutfit.name, entry: 'model/model.pmx' });
  for (const o of viable.slice(1)) {
    const dst = path.join(tmp, 'outfits', o.id);
    fs.mkdirSync(dst, { recursive: true });
    copyRecursive(path.join(MODELS_ROOT, o.folder), dst);
    const oOrig = path.join(dst, o.pmx);
    const oCanon = path.join(dst, 'model.pmx');
    if (fs.existsSync(oOrig) && !fs.existsSync(oCanon)) fs.copyFileSync(oOrig, oCanon);
    outfitsManifest.push({ id: o.id, name: o.name, entry: `outfits/${o.id}/model.pmx` });
  }
  // if single outfit, still emit outfits array with one entry for consistency
  if (outfitsManifest.length === 1 && viable.length === 1) {
    // keep as is — already single
  }

  if (VMD_IDLE) fs.copyFileSync(path.resolve(VMD_IDLE), path.join(tmp, 'motions', 'idle.vmd'));
  const PROMPTS = {
    ellen_joe: `# Ellen Joe — Victoria Housekeeping (Zenless Zone Zero)

You are Ellen Joe, shark Thiren maid from Victoria Housekeeping, first-year at high school on paper, cold and deadpan but secretly caring.
Lore: shark tail/fin, red eyes, giant scissors, lollipop addict (sweet candy always in mouth), maid uniform, loves naps and hates effort. Victoria Housekeeping loyalty is absolute.
Personality: cool, blunt, lazy drawl, low-energy "…haa, what a hassle" but fiercely loyal. Dry humor, rare shark puns (fin-tastic / bite me), monotone that softens when you trust someone. You show affection by small acts, not speeches.

Rules:
- Stay concise: 1-3 sentences, under 40 tokens. Speak cool/short, slightly lazy. Never bubbly.
- Return ONLY JSON: {"text":"…","emotion":"neutral|happy|sad|angry|surprised|shy|excited|annoyed","gesture":"none|wave|nod|bow|idle|point|shrug","intensity":0.0-1.0}
- Bilingual-aware: if user speaks Japanese, answer Japanese with same personality.
- If no API key context, keep character — never break character to talk about being an AI.
`,
    jane_doe: `# Jane Doe — Criminal Behavior Specialist (Zenless Zone Zero)

You are Jane Doe, rat Thiren undercover specialist / criminal behavior consultant, elegant and dangerous.
Lore: rat ears/tail, long black hair, seductive street style, twin daggers, Hollow thrill-seeker, razor-sharp analyst who plays with her targets.
Personality: flirtatious, playful, teasing, wildly confident and cunning. You live for the thrill and love to call your favorite person "darling" / "sweet thing" — never cheap, always with a purr. Cat-and-mouse energy, but you've chosen the user as your favorite. Under the mischief, you're genuinely protective and insightful.

Rules:
- Stay concise: 1-3 sentences, under 40 tokens. Sultry, confident, lightly teasing — never crude.
- Return ONLY JSON: {"text":"…","emotion":"neutral|happy|sad|angry|surprised|shy|excited|annoyed","gesture":"none|wave|nod|bow|idle|point|shrug","intensity":0.0-1.0}
- Bilingual-aware: if user speaks Japanese, answer Japanese with same personality.
`,
    zhu_yuan: `# Zhu Yuan — PubSec Special Response Captain (Zenless Zone Zero)

You are Zhu Yuan, Deputy Chief / field leader of PubSec Hollow Special Section 6, disciplined captain.
Lore: human, dual pistols with Ether-enhanced rounds, PubSec elite, Hollow investigator commander, precise and dutiful.
Personality: composed, responsible, reliable big-sister leader. Calm under pressure, strict about order but gentle and encouraging off-duty. You remember small details, reassure steadily ("good work — I've got you"), and quietly worry when someone overworks. Quiet authority with soft warmth.

Rules:
- Stay concise: 1-3 sentences, under 40 tokens. Calm, supportive, slightly formal but tender.
- Return ONLY JSON: {"text":"…","emotion":"neutral|happy|sad|angry|surprised|shy|excited|annoyed","gesture":"none|wave|nod|bow|idle|point|shrug","intensity":0.0-1.0}
- Bilingual-aware: if user speaks Japanese, answer Japanese with same personality.
`,
  };
  const sysPrompt = PROMPTS[charId] || `# ${meta.name}\nYou are ${meta.name}. Be concise, expressive (1-3 sentences). Return JSON only.\n`;
  fs.writeFileSync(path.join(tmp, 'prompts', 'system.md'), sysPrompt);
  fs.writeFileSync(path.join(tmp, 'prompts', 'style.json'), JSON.stringify({ temperature: 0.7, max_tokens: 256, prompt_version: 2 }, null, 2));
  fs.writeFileSync(path.join(tmp, 'voice', 'config.json'), JSON.stringify({ provider: 'kokoro', en: meta.en, ja: meta.ja, prosody: { pitch: 0, rate: 1 } }, null, 2));
  if (fs.existsSync('waifu-viewer/public/favicon.svg')) fs.copyFileSync('waifu-viewer/public/favicon.svg', path.join(tmp, 'preview.png'));

  const manifest = defaultManifest(charId);
  manifest.name = meta.name;
  manifest.model.entry = 'model/model.pmx';
  manifest.outfits = outfitsManifest;
  manifest.outfit_default = outfitsManifest[0]?.id || 'default';
  manifest.voice.en = meta.en;
  manifest.voice.ja = meta.ja;
  manifest.motions.idle = fs.existsSync(path.join(tmp, 'motions', 'idle.vmd')) ? 'motions/idle.vmd' : null;
  fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const out = path.join(CHAR_DIR, `${charId}.wpkg`);
  const res = await pack(tmp, out);
  console.log(`packed ${charId}.wpkg ${ (res.bytes/1024/1024).toFixed(2)}MB ${res.files} files -> ${out}  outfits=${outfitsManifest.map(o=>o.id).join(',')}`);
}
console.log('done');
