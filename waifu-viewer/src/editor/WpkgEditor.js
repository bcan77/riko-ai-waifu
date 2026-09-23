/**
 * WpkgEditor — in-app .wpkg editor (optional add-on, NOT preinstalled).
 * Loaded via dynamic import only after the user installs it from Extensions.
 * Uses backend /api/wpkg endpoints. Supports age ratings + tags.
 */
import { getRaw as getSettingsRaw } from '../settings/store.js';
import { t } from '../services/i18n.js';

const ratingLabel = (r) => t('rating.' + (r || 'all'));
export function mountWpkgEditor(containerId = 'wpkgEditorRoot') {
  let root = document.getElementById(containerId);
  if (!root) {
    root = document.createElement('div');
    root.id = containerId;
    root.className = 'wpkg-editor hidden';
    document.body.appendChild(root);
  }
  root.innerHTML = `
    <div class="wpkg-backdrop"></div>
    <div class="wpkg-modal">
      <header class="wpkg-head">
        <h2>.wpkg Editor — Character Package</h2>
        <button id="wpkgClose" class="btn ghost">✕</button>
      </header>
      <div class="wpkg-body">
        <div class="wpkg-col">
          <h3>${t('ed.packages')}</h3>
          <div id="wpkgList" class="wpkg-list">Loading…</div>
          <div class="row" style="margin-top:8px">
            <button id="wpkgImport" class="btn">${t('ed.import')}</button>
            <button id="wpkgCreate" class="btn primary">${t('ed.new')}</button>
          </div>
          <input id="wpkgFileInput" type="file" accept=".wpkg" style="display:none" />
          <p class="hint">${t('ed.hint')}</p>
        </div>
        <div class="wpkg-col">
          <h3>${t('ed.preview')}</h3>
          <div id="wpkgPreview" class="wpkg-preview">${t('ed.noPreview')}</div>
          <div id="wpkgMorphSliders" class="wpkg-sliders"></div>
        </div>
        <div class="wpkg-col">
          <h3>${t('ed.manifest')}</h3>
          <label>Id <input id="wpkgId" placeholder="ellen_joe" /></label>
          <label>Name <input id="wpkgName" placeholder="Ellen Joe" /></label>
          <label>Version <input id="wpkgVer" value="1.0.0" /></label>
          <label>Author <input id="wpkgAuthor" value="you" /></label>
          <label>${t('ed.rating')} <select id="wpkgRating"><option value="all">${t('rating.all')}</option><option value="12">${t('rating.12')}</option><option value="18">${t('rating.18')}</option></select></label>
          <label>${t('ed.tags')} <input id="wpkgTags" placeholder="maid, shark, zzz" /></label>
          <label>${t('ed.desc')} <textarea id="wpkgDesc" rows="3" placeholder="Short bio…"></textarea></label>
          <label>${t('ed.voiceEn')} <select id="wpkgEn"><option>af_sky</option><option>af_bella</option><option>af_nicole</option><option>af_sarah</option></select></label>
          <label>${t('ed.voiceJa')} <select id="wpkgJa"><option>jf_alpha</option><option>jf_gongitsune</option><option>jf_sakura</option><option>jf_nezumi</option></select></label>
          <label>${t('ed.prompt')} <textarea id="wpkgPrompt" rows="6" placeholder="You are..."></textarea></label>
          <label>${t('ed.idle')} <input id="wpkgIdle" placeholder="motions/idle.vmd" /><button id="wpkgPickIdle" class="btn small">Pick .vmd</button></label>
          <label>${t('ed.outfits')} <textarea id="wpkgOutfits" rows="3" placeholder='[{"id":"default","name":"Maid","entry":"model/model.pmx"}]'></textarea></label>
          <div class="row">
            <button id="wpkgValidate" class="btn">${t('ed.validate')}</button>
            <button id="wpkgSave" class="btn primary">${t('ed.save')}</button>
            <button id="wpkgInstall" class="btn">${t('ed.install')}</button>
          </div>
          <div id="wpkgStatus" class="hint"></div>
        </div>
      </div>
    </div>
  `;
  const $ = s => root.querySelector(s);
  const backdrop = $('.wpkg-backdrop');
  const closeBtn = $('#wpkgClose');
  function close() { root.classList.add('hidden'); }
  backdrop?.addEventListener('click', close);
  closeBtn?.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  // fetch list
  async function refreshList() {
    const el = $('#wpkgList');
    let showMature = false;
    try{ showMature = !!getSettingsRaw().showMature; }catch{}
    try {
      const r = await fetch('/api/wpkg/list');
      const data = await r.json();
      if (!data.length) el.innerHTML = `<div class="hint">${t('ed.empty')}</div>`;
      else el.innerHTML = data.map(x => {
        const rating = x.rating || 'all';
        const locked = rating === '18' && !showMature;
        return `<button class="wpkg-item${locked ? ' locked' : ''}" data-file="${x.file}">
          <b>${locked ? t('ed.locked') : (x.name || x.file)}</b>
          <small>${(x.size/1024/1024).toFixed(1)} MB <span class="rating-badge r-${rating}">${ratingLabel(rating)}</span></small>
          ${locked ? `<small class="lock-note">${t('ed.lockNote')}</small>` : `<small class="file-note">${x.file}</small>`}
        </button>`;
      }).join('');
      el.querySelectorAll('.wpkg-item').forEach(b => b.addEventListener('click', () => {
        let showM = false;
        try{ showM = !!getSettingsRaw().showMature; }catch{}
        // locked cards still selectable to show metadata, but flagged
        loadPkg(b.dataset.file);
      }));
    } catch (e) { el.textContent = t('ed.listFail', { e: e.message }); }
  }
  async function loadPkg(file) {
    const r = await fetch('/api/wpkg/info?file=' + encodeURIComponent(file));
    const j = await r.json().catch(() => ({}));
    if (j.error) { $('#wpkgStatus').textContent = j.error; return; }
    $('#wpkgId').value = j.id || '';
    $('#wpkgName').value = j.name || '';
    $('#wpkgVer').value = j.version || '1.0.0';
    $('#wpkgAuthor').value = j.author || 'you';
    $('#wpkgRating').value = j.rating || 'all';
    $('#wpkgTags').value = (j.tags || []).join(', ');
    $('#wpkgDesc').value = j.description || '';
    if (j.voice) { $('#wpkgEn').value = j.voice.en || 'af_sky'; $('#wpkgJa').value = j.voice.ja || 'jf_alpha'; }
    if (j.prompts) $('#wpkgPrompt').value = j.prompts.system || '';
    $('#wpkgIdle').value = j.motions?.idle || '';
    if (j.outfits) $('#wpkgOutfits').value = JSON.stringify(j.outfits, null, 2);
    const outfitsLine = j.outfits?.length ? `<br/>outfits: ${j.outfits.map(o=>o.id+':'+o.entry).join(', ')}` : '';
    const rating = j.rating || 'all';
    const tagsLine = j.tags?.length ? `<br/>tags: ${j.tags.join(', ')}` : '';
    const flagsLine = j.content_flags?.length ? ` • ⚑ ${j.content_flags.join(', ')}` : '';
    $('#wpkgPreview').innerHTML = `<b>${j.name}</b> v${j.version} <span class="rating-badge r-${rating}">${ratingLabel(rating)}</span><br/>model: ${j.model?.entry}${outfitsLine}${tagsLine}${flagsLine}<br/>voice: ${j.voice?.en}/${j.voice?.ja}`;
  }

  $('#wpkgImport')?.addEventListener('click', () => $('#wpkgFileInput').click());
  $('#wpkgFileInput')?.addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('file', f);
    const r = await fetch('/api/wpkg/upload', { method: 'POST', body: fd });
    const j = await r.json();
    $('#wpkgStatus').textContent = j.ok ? t('ed.imported', { f: j.file }) : t('ed.importFail', { e: j.error });
    refreshList();
  });
  $('#wpkgValidate')?.addEventListener('click', async () => {
    const man = collectManifest();
    const r = await fetch('/api/wpkg/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(man) });
    const j = await r.json();
    $('#wpkgStatus').textContent = j.ok ? t('ed.valid') : t('ed.invalid', { e: (j.errors||[]).join(', ') });
  });
  $('#wpkgSave')?.addEventListener('click', async () => {
    const man = collectManifest();
    const r = await fetch('/api/wpkg/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(man) });
    const j = await r.json();
    $('#wpkgStatus').textContent = j.ok ? t('ed.created', { f: j.file }) : t('ed.saveFail', { e: j.error });
    refreshList();
  });
  $('#wpkgCreate')?.addEventListener('click', () => {
    $('#wpkgId').value = 'my_waifu';
    $('#wpkgName').value = 'My Waifu';
    $('#wpkgPrompt').value = 'You are a helpful waifu.';
    $('#wpkgRating').value = 'all';
    $('#wpkgTags').value = '';
    $('#wpkgDesc').value = '';
    $('#wpkgStatus').textContent = t('ed.newEditing');
  });

  function collectManifest() {
    let outfits = undefined
    try {
      const raw = $('#wpkgOutfits').value.trim()
      if (raw) outfits = JSON.parse(raw)
    } catch {}
    const tags = $('#wpkgTags').value.split(',').map(t => t.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')).filter(t => t.length >= 2).slice(0, 24);
    return {
      spec: 1,
      id: $('#wpkgId').value.trim() || 'my_waifu',
      name: $('#wpkgName').value.trim() || 'My Waifu',
      version: $('#wpkgVer').value.trim() || '1.0.0',
      author: $('#wpkgAuthor').value.trim() || 'you',
      rating: $('#wpkgRating').value || 'all',
      tags,
      content_flags: [],
      description: $('#wpkgDesc').value.trim().slice(0, 2000),
      model: { entry: 'model/model.pmx' },
      outfits,
      voice: { provider: 'kokoro', en: $('#wpkgEn').value, ja: $('#wpkgJa').value, prosody: { pitch: 0, rate: 1 } },
      prompts: { system: $('#wpkgPrompt').value },
      motions: { idle: $('#wpkgIdle').value || null, gestures: {} },
      affinity: 0.5,
      created_at: new Date().toISOString().slice(0, 10),
    };
  }

  refreshList();
  return { open: () => root.classList.remove('hidden'), close, refreshList };
}
