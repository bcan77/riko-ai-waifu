/**
 * WpkgEditor — in-app .wpkg editor (built-in, no website).
 * Mounts as overlay inside waifu-viewer. Uses backend /api/wpkg endpoints.
 */
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
          <h3>Packages</h3>
          <div id="wpkgList" class="wpkg-list">Loading…</div>
          <div class="row" style="margin-top:8px">
            <button id="wpkgImport" class="btn">Import .wpkg</button>
            <button id="wpkgCreate" class="btn primary">+ New</button>
          </div>
          <input id="wpkgFileInput" type="file" accept=".wpkg" style="display:none" />
          <p class="hint">.wpkg is a renamed folder/zip (like Wallpaper Engine .pkg). Drag .pmx/.vmd/.wav onto form.</p>
        </div>
        <div class="wpkg-col">
          <h3>Preview</h3>
          <div id="wpkgPreview" class="wpkg-preview">No package loaded.<br/>Select one on left.</div>
          <div id="wpkgMorphSliders" class="wpkg-sliders"></div>
        </div>
        <div class="wpkg-col">
          <h3>Manifest</h3>
          <label>Id <input id="wpkgId" placeholder="ellen_joe" /></label>
          <label>Name <input id="wpkgName" placeholder="Ellen Joe" /></label>
          <label>Version <input id="wpkgVer" value="1.0.0" /></label>
          <label>Author <input id="wpkgAuthor" value="you" /></label>
          <label>Voice EN <select id="wpkgEn"><option>af_sky</option><option>af_bella</option><option>af_nicole</option><option>af_sarah</option></select></label>
          <label>Voice JA <select id="wpkgJa"><option>jf_alpha</option><option>jf_gongitsune</option><option>jf_sakura</option><option>jf_nezumi</option></select></label>
          <label>System Prompt <textarea id="wpkgPrompt" rows="6" placeholder="You are..."></textarea></label>
          <label>Idle VMD <input id="wpkgIdle" placeholder="motions/idle.vmd" /><button id="wpkgPickIdle" class="btn small">Pick .vmd</button></label>
          <label>Outfits (JSON) <textarea id="wpkgOutfits" rows="3" placeholder='[{"id":"default","name":"Maid","entry":"model/model.pmx"}]'></textarea></label>
          <div class="row">
            <button id="wpkgValidate" class="btn">Validate</button>
            <button id="wpkgSave" class="btn primary">Save .wpkg</button>
            <button id="wpkgInstall" class="btn">Install</button>
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
    try {
      const r = await fetch('/api/wpkg/list');
      const data = await r.json();
      if (!data.length) el.innerHTML = '<div class="hint">No .wpkg yet — click + New or Import.</div>';
      else el.innerHTML = data.map(x => `<button class="wpkg-item" data-file="${x.file}"><b>${x.file}</b><small>${(x.size/1024/1024).toFixed(1)} MB</small></button>`).join('');
      el.querySelectorAll('.wpkg-item').forEach(b => b.addEventListener('click', () => loadPkg(b.dataset.file)));
    } catch (e) { el.textContent = 'list failed: ' + e.message; }
  }
  async function loadPkg(file) {
    const r = await fetch('/api/wpkg/info?file=' + encodeURIComponent(file));
    const j = await r.json().catch(() => ({}));
    if (j.error) { $('#wpkgStatus').textContent = j.error; return; }
    $('#wpkgId').value = j.id || '';
    $('#wpkgName').value = j.name || '';
    $('#wpkgVer').value = j.version || '1.0.0';
    $('#wpkgAuthor').value = j.author || 'you';
    if (j.voice) { $('#wpkgEn').value = j.voice.en || 'af_sky'; $('#wpkgJa').value = j.voice.ja || 'jf_alpha'; }
    if (j.prompts) $('#wpkgPrompt').value = j.prompts.system || '';
    $('#wpkgIdle').value = j.motions?.idle || '';
    if (j.outfits) $('#wpkgOutfits').value = JSON.stringify(j.outfits, null, 2);
    const outfitsLine = j.outfits?.length ? `<br/>outfits: ${j.outfits.map(o=>o.id+':'+o.entry).join(', ')}` : '';
    $('#wpkgPreview').innerHTML = `<b>${j.name}</b> v${j.version}<br/>model: ${j.model?.entry}${outfitsLine}<br/>voice: ${j.voice?.en}/${j.voice?.ja}`;
  }

  $('#wpkgImport')?.addEventListener('click', () => $('#wpkgFileInput').click());
  $('#wpkgFileInput')?.addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('file', f);
    const r = await fetch('/api/wpkg/upload', { method: 'POST', body: fd });
    const j = await r.json();
    $('#wpkgStatus').textContent = j.ok ? 'Imported ' + j.file : 'Import failed: ' + j.error;
    refreshList();
  });
  $('#wpkgValidate')?.addEventListener('click', async () => {
    const man = collectManifest();
    const r = await fetch('/api/wpkg/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(man) });
    const j = await r.json();
    $('#wpkgStatus').textContent = j.ok ? 'Valid ✓' : 'Invalid: ' + (j.errors||[]).join(', ');
  });
  $('#wpkgSave')?.addEventListener('click', async () => {
    const man = collectManifest();
    const r = await fetch('/api/wpkg/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(man) });
    const j = await r.json();
    $('#wpkgStatus').textContent = j.ok ? 'Created ' + j.file : 'Save failed: ' + j.error;
    refreshList();
  });
  $('#wpkgCreate')?.addEventListener('click', () => {
    $('#wpkgId').value = 'my_waifu';
    $('#wpkgName').value = 'My Waifu';
    $('#wpkgPrompt').value = 'You are a helpful waifu.';
    $('#wpkgStatus').textContent = 'Editing new package — fill and Save.';
  });

  function collectManifest() {
    let outfits = undefined
    try {
      const raw = $('#wpkgOutfits').value.trim()
      if (raw) outfits = JSON.parse(raw)
    } catch {}
    return {
      spec: 1,
      id: $('#wpkgId').value.trim() || 'my_waifu',
      name: $('#wpkgName').value.trim() || 'My Waifu',
      version: $('#wpkgVer').value.trim() || '1.0.0',
      author: $('#wpkgAuthor').value.trim() || 'you',
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
