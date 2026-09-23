export const SPEC_VERSION = 1;

/** Age ratings — 'all' (All Ages) | '12' (12+) | '18' (18+) */
export const RATINGS = ['all', '12', '18'];
export const RATING_LABELS = { all: 'All Ages', '12': '12+', '18': '18+' };

const OUTFIT_ID_RE = /^[a-z0-9_-]{2,32}$/;
const TAG_RE = /^[a-z0-9-]{2,24}$/;

export function validateManifest(m) {
  const errs = [];
  if (!m || typeof m !== 'object') return ['manifest must be object'];
  if (m.spec !== 1) errs.push('spec must be 1');
  if (!m.id || !/^[a-z0-9_-]{2,32}$/.test(m.id)) errs.push('id 2-32 [a-z0-9_-]');
  if (!m.name || typeof m.name !== 'string' || m.name.length < 2) errs.push('name required');
  if (!m.version || !/^\d+\.\d+\.\d+$/.test(m.version)) errs.push('version semver x.y.z');
  if (!m.model || !m.model.entry) errs.push('model.entry required (e.g. model/model.pmx)');
  if (m.model.entry.includes('..')) errs.push('model.entry traversal');
  if (m.voice && typeof m.voice !== 'object') errs.push('voice must be object');
  if (m.motions && typeof m.motions !== 'object') errs.push('motions must be object');
  if (m.affinity !== undefined && (typeof m.affinity !== 'number' || m.affinity < 0 || m.affinity > 1)) errs.push('affinity 0-1');
  // outfits — optional, backwards-compatible
  if (m.outfits !== undefined) {
    if (!Array.isArray(m.outfits)) errs.push('outfits must be array');
    else {
      if (m.outfits.length > 16) errs.push('outfits max 16');
      const seen = new Set();
      for (let i = 0; i < m.outfits.length; i++) {
        const o = m.outfits[i];
        if (!o || typeof o !== 'object') { errs.push(`outfits[${i}] must be object`); continue; }
        if (!o.id || !OUTFIT_ID_RE.test(o.id)) errs.push(`outfits[${i}].id 2-32 [a-z0-9_-]`);
        else if (seen.has(o.id)) errs.push(`outfits[${i}].id duplicate: ${o.id}`);
        else seen.add(o.id);
        if (!o.name || typeof o.name !== 'string' || o.name.length < 1 || o.name.length > 64) errs.push(`outfits[${i}].name 1-64 chars`);
        if (!o.entry || typeof o.entry !== 'string') errs.push(`outfits[${i}].entry required`);
        else if (o.entry.includes('..') || o.entry.startsWith('/')) errs.push(`outfits[${i}].entry traversal`);
        if (o.preview && typeof o.preview !== 'string') errs.push(`outfits[${i}].preview must be string`);
        if (o.preview && o.preview.includes('..')) errs.push(`outfits[${i}].preview traversal`);
      }
      // every outfits entry should have an entry; model.entry should match one of them if outfits non-empty
      if (m.outfits.length && !m.outfits.some(o => o.entry === m.model.entry)) {
        // not an error — just warn via lenient check (old readers use model.entry directly)
        // keep valid: multiple filesets can still be present even if default not listed explicitly
      }
    }
  }
  if (m.outfit_default !== undefined && typeof m.outfit_default !== 'string') errs.push('outfit_default must be string');
  if (m.outfit_default && m.outfits && !m.outfits.some(o => o.id === m.outfit_default)) errs.push('outfit_default must match an outfit id');
  // content metadata — optional, backwards-compatible (defaults to All Ages)
  if (m.rating !== undefined && !RATINGS.includes(m.rating)) errs.push('rating must be one of: all, 12, 18');
  if (m.description !== undefined && (typeof m.description !== 'string' || m.description.length > 2000)) errs.push('description max 2000 chars');
  if (m.tags !== undefined) {
    if (!Array.isArray(m.tags)) errs.push('tags must be array');
    else {
      if (m.tags.length > 24) errs.push('tags max 24');
      const seenTags = new Set();
      for (let i = 0; i < m.tags.length; i++) {
        const t = m.tags[i];
        if (typeof t !== 'string' || !TAG_RE.test(t)) errs.push(`tags[${i}] 2-24 [a-z0-9-]`);
        else if (seenTags.has(t)) errs.push(`tags[${i}] duplicate: ${t}`);
        else seenTags.add(t);
      }
    }
  }
  if (m.content_flags !== undefined) {
    if (!Array.isArray(m.content_flags)) errs.push('content_flags must be array');
    else if (m.content_flags.length > 12) errs.push('content_flags max 12');
    else for (let i = 0; i < m.content_flags.length; i++) {
      const f = m.content_flags[i];
      if (typeof f !== 'string' || !TAG_RE.test(f)) errs.push(`content_flags[${i}] 2-24 [a-z0-9-]`);
    }
  }
  return errs;
}

/** Normalize optional metadata with safe defaults (call after validate). */
export function normalizeMeta(m) {
  const out = { ...m };
  if (!RATINGS.includes(out.rating)) out.rating = 'all';
  if (!Array.isArray(out.tags)) out.tags = [];
  if (!Array.isArray(out.content_flags)) out.content_flags = [];
  if (typeof out.description !== 'string') out.description = '';
  return out;
}

export function getOutfits(manifest) {
  if (Array.isArray(manifest.outfits) && manifest.outfits.length) return manifest.outfits;
  // compat: single outfit derived from model.entry
  return [{ id: 'default', name: 'Default', entry: manifest.model.entry }];
}

export function resolveOutfitEntry(manifest, outfitId) {
  const list = getOutfits(manifest);
  const hit = list.find(o => o.id === outfitId);
  return (hit || list[0]).entry;
}

export function defaultManifest(id) {
  return {
    spec: 1,
    id,
    name: id,
    version: '1.0.0',
    author: 'you',
    model: { entry: 'model/model.pmx', textures: ['model/tex/*'] },
    outfits: [{ id: 'default', name: 'Default', entry: 'model/model.pmx' }],
    outfit_default: 'default',
    voice: { provider: 'kokoro', en: 'af_sky', ja: 'jf_alpha', prosody: { pitch: 0, rate: 1, energy: 1 } },
    prompts: { system_file: 'prompts/system.md' },
    motions: { idle: 'motions/idle.vmd', gestures: {} },
    affinity: 0.5,
    rating: 'all',
    tags: [],
    content_flags: [],
    description: '',
    created_at: new Date().toISOString().slice(0, 10)
  };
}
