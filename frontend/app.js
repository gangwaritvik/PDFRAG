// ══════════════════════════════════════  
//  STATE  
// ══════════════════════════════════════  
const state = {  
  files:       [],  
  queryCount:  0,  
  totalChunks: 0,  
};

// ══════════════════════════════════════  
//  SAFE SETTER  
// ══════════════════════════════════════  
function setText(id, val) {  
  const el = document.getElementById(id);  
  if (el) el.textContent = val;  
}

// ══════════════════════════════════════  
//  CHUNKING MODE DROPDOWN  
// ══════════════════════════════════════  
const CHUNK_DESCRIPTIONS = {  
  recursive: 'Splits by character count with smart separator fallback — fast &amp; reliable.',  
  semantic:  'Splits by meaning using embeddings — preserves topic context. Slower, uses embedding API.',  
  sliding:   'Overlapping windows of fixed size — ensures no context is lost at chunk boundaries.',  
  fixed:     'Hard splits at exact character count — simple, predictable, no overlap.',  
};  


function updateChunkMode() {  
  const select = document.getElementById('chunkModeSelect');  
  const desc   = document.getElementById('chunkModeDesc');  
  const mode   = select.value;  
  if (desc) desc.innerHTML = CHUNK_DESCRIPTIONS[mode] || '';  
  select.classList.toggle('semantic-active', mode === 'semantic');  
  toast(mode === 'semantic' ? '🧠 Semantic chunking selected' : '⚡ Recursive chunking selected', 'info');  
}

function getChunkMode() {  
  const select = document.getElementById('chunkModeSelect');  
  return select ? select.value : 'recursive';  
}

// ══════════════════════════════════════  
//  UPLOAD ZONE  
// ══════════════════════════════════════  
const zone  = document.getElementById('uploadZone');  
const input = document.getElementById('fileInput');

zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });  
zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));  
zone.addEventListener('drop', e => {  
  e.preventDefault();  
  zone.classList.remove('drag-over');  
  addFiles([...e.dataTransfer.files]);  
});  
input.addEventListener('change', () => { addFiles([...input.files]); input.value = ''; });

function addFiles(files) {  
  const pdfs = files.filter(f => f.type === 'application/pdf');  
  if (!pdfs.length) { toast('Only PDF files accepted.', 'error'); return; }  
  pdfs.forEach(f => {  
    if (state.files.find(x => x.name === f.name)) return;  
    state.files.push({ id: Date.now() + Math.random(), file: f, name: f.name, size: fmtSize(f.size), status: 'pending', chunks: [] });  
  });  
  renderFiles();  
  const btn = document.getElementById('processBtn');  
  if (btn) btn.disabled = !state.files.some(f => f.status === 'pending');  
  toast(`${pdfs.length} PDF(s) added`, 'success');  
}

// ══════════════════════════════════════  
//  RENDER FILES  
// ══════════════════════════════════════  
function renderFiles() {  
  const list  = document.getElementById('fileList');  
  const noMsg = document.getElementById('noFiles');  
  if (!list) return;  
  if (noMsg) noMsg.style.display = state.files.length ? 'none' : 'block';  
  list.querySelectorAll('.file-item').forEach(el => el.remove());

  state.files.forEach(f => {  
    const div = document.createElement('div');  
    div.className = 'file-item';  
    div.id = `fi-${f.id}`;

    const chunksHTML = f.chunks.length  
      ? f.chunks.map((c, i) => `  
          <div class="chunk-card">  
            <div class="chunk-label">Chunk ${i + 1} · Page ${c.page || '?'}</div>  
            <div class="chunk-text">${esc(c.text)}</div>  
          </div>`).join('')  
      : `<div class="chunk-card" style="color:var(--t3);font-size:11px;">No chunks yet.</div>`;

    div.innerHTML = `  
  <div class="file-head">  
    <span class="file-icon">📄</span>  
    <div class="file-info">  
      <div class="file-name" title="${esc(f.name)}">${esc(f.name)}</div>  
      <div class="file-meta">${f.size} · ${f.chunks.length} chunks</div>  
    </div>  
    <span class="file-badge badge-${f.status}">${f.status.toUpperCase()}</span>  
    <button  
      class="file-delete-btn"  
      title="Delete from vector store"  
      onclick="deleteFile('${f.id}', '${esc(f.name)}', event)"  
    >🗑️</button>  
  </div>  
  ${f.status === 'processing'  
    ? `<div class="progress-wrap"><div class="progress-fill" id="pb-${f.id}" style="width:0%"></div></div>`  
    : ''}  
  <div class="chunk-toggle" onclick="toggleChunks('${f.id}')">  
    <span id="arr-${f.id}">▶</span> Chunks (${f.chunks.length})  
  </div>  
  <div class="chunk-list" id="cl-${f.id}">${chunksHTML}</div>`;  


    list.appendChild(div);  
  });

  setText('fileCount', state.files.length);  
  setText('sFiles',    state.files.length);  
  setText('sChunks',   state.totalChunks);  
  setText('sQueries',  state.queryCount);  
}

function toggleChunks(id) {  
  const cl  = document.getElementById(`cl-${id}`);  
  const arr = document.getElementById(`arr-${id}`);  
  const open = cl.classList.toggle('open');  
  if (arr) arr.textContent = open ? '▼' : '▶';  
}

// ══════════════════════════════════════  
//  INGEST  
// ══════════════════════════════════════  
async function ingestFiles() {  
  const pending   = state.files.filter(f => f.status === 'pending');  
  if (!pending.length) return;

  const btn       = document.getElementById('processBtn');  
  const chunkMode = getChunkMode();  
  if (btn) btn.disabled = true;

  for (const f of pending) {  
    f.status = 'processing';  
    renderFiles();  
    animateProgress(f.id);

    const form = new FormData();  
    form.append('files',      f.file, f.name);  
    form.append('chunk_mode', chunkMode);

    try {  
      const res  = await fetch('/ingest', { method: 'POST', body: form });  
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      const doc = data.documents?.[0];  
      if (doc) {  
        f.chunks = doc.chunks || [];  
        f.status = 'done';  
        state.totalChunks += f.chunks.length;  
        toast(`✅ ${f.name} — ${f.chunks.length} chunks (${chunkMode})`, 'success');  
      } else {  
        f.status = 'error';  
        toast(`No chunks returned for ${f.name}`, 'error');  
      }  
    } catch (e) {  
      console.error('[INGEST ERROR]', e);  
      f.status = 'error';  
      toast(`Error: ${e.message}`, 'error');  
    }

    renderFiles();  
  }

  if (btn) btn.disabled = !state.files.some(f => f.status === 'pending');  
}

function animateProgress(id) {  
  let p = 0;  
  const iv = setInterval(() => {  
    p += 12 + Math.random() * 15;  
    const bar = document.getElementById(`pb-${id}`);  
    if (bar) bar.style.width = Math.min(p, 90) + '%';  
    if (p >= 100) clearInterval(iv);  
  }, 250);  
  setTimeout(() => clearInterval(iv), 2500);  
}

// ══════════════════════════════════════  
//  QUERY  
// ══════════════════════════════════════  
function handleKey(e) {  
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitQuery(); }  
}

function resize(el) {  
  el.style.height = 'auto';  
  el.style.height = Math.min(el.scrollHeight, 150) + 'px';  
}

async function submitQuery() {  
  const queryEl = document.getElementById('queryInput');  
  const query   = queryEl ? queryEl.value.trim() : '';  
  if (!query) { toast('Enter a question first.', 'error'); return; }

  const ready = state.files.filter(f => f.status === 'done');  
  if (!ready.length) { toast('Process at least one PDF first.', 'error'); return; }

  setLoading(true);  
  const t0 = Date.now();

  try {  
    const res  = await fetch('/query', {  
      method:  'POST',  
      headers: { 'Content-Type': 'application/json' },  
      body: JSON.stringify({  
        query:       query,  
        top_k:       parseInt(document.getElementById('topK')?.value) || 5,  
        temperature: parseFloat(document.getElementById('temp')?.value) || 0.2,  
      }),  
    });

    const data = await res.json();  
    if (data.error) throw new Error(data.error);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(2) + 's';  
    state.queryCount++;  
    setText('sQueries', state.queryCount);

    renderAnswer(query, data.answer, data.sources, elapsed);  
    queryEl.value = '';  
    resize(queryEl);

  } catch (e) {  
    toast(`Error: ${e.message}`, 'error');  
  }

  setLoading(false);  
}

// ══════════════════════════════════════  
//  RENDER ANSWER — with expand/collapse  
// ══════════════════════════════════════  
function renderAnswer(query, answer, sources, elapsed) {  
  const area = document.getElementById('results');  
  document.getElementById('emptyState')?.remove();

  const cardId = `card-${Date.now()}`;  
  const card   = document.createElement('div');  
  card.className = 'answer-card expanded';  
  card.id = cardId;

  card.innerHTML = `  
    <div class="card-head" onclick="toggleCard('${cardId}')">  
      <div class="card-head-left">  
        <div class="q-tag">Question · GPT-4.1 · ${elapsed}</div>  
        <div class="q-text">${esc(query)}</div>  
      </div>  
      <div class="card-expand-btn" title="Expand / Collapse">▲</div>  
    </div>

    <div class="card-body-wrap">  
      <div class="card-body">  
        <div class="a-tag">GPT-4.1 Answer</div>  
        <div class="a-text">${fmtAnswer(answer)}</div>  
      </div>

      <div class="sources-wrap">  
        <div class="sources-label">📌 Retrieved Sources (${sources.length})</div>  
        <div class="sources-grid">  
          ${sources.map((s, i) => {  
            const ctype = s.chunk_type || 'recursive';  
            return `  
            <div class="source-card" onclick="this.classList.toggle('open')">  
              <div class="src-top">  
                <span class="src-file">📄 ${esc(s.filename)}</span>  
                <span class="src-tag">Chunk #${(s.chunk_index ?? i) + 1}</span>  
                <span class="chunk-type-tag ${ctype}">${ctype}</span>  
              </div>  
              <div class="src-meta">Page ${s.page} · Similarity: <span class="sim">${s.score?.toFixed(3)}</span></div>  
              <div class="src-preview">${esc(s.text)}</div>  
              <div class="src-full">${esc(s.text)}</div>  
            </div>`;  
          }).join('')}  
        </div>  
      </div>  
    </div>`;

   area.insertBefore(card, area.firstChild);

  // ── Re-render MathJax after DOM update ──  
  if (window.MathJax) {  
    MathJax.typesetPromise([card]).catch(err => console.error('MathJax error:', err));  
  }

  card.scrollIntoView({ behavior: 'smooth', block: 'start' });  
} 


// ══════════════════════════════════════  
//  TOGGLE CARD EXPAND / COLLAPSE  
// ══════════════════════════════════════  
function toggleCard(cardId) {  
  const card = document.getElementById(cardId);  
  if (!card) return;  
  card.classList.toggle('expanded');  
}

function setLoading(on) {  
  const btn   = document.getElementById('askBtn');  
  const label = document.getElementById('askLabel');  
  if (btn)   btn.disabled    = on;  
  if (label) label.innerHTML = on ? '<span class="spin"></span> Thinking…' : '➤ Ask';  
}

// ══════════════════════════════════════  
//  UTILITIES  
// ══════════════════════════════════════  
function esc(str) {  
  return String(str)  
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')  
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');  
}

// ══════════════════════════════════════  
//  FORMAT ANSWER — Markdown + LaTeX  
// ══════════════════════════════════════  
function fmtAnswer(text) {  
  let out = text;

  // Headers  
  out = out.replace(/^### (.+)$/gm, '<h4 class="ans-h4">$1</h4>');  
  out = out.replace(/^## (.+)$/gm,  '<h3 class="ans-h3">$1</h3>');  
  out = out.replace(/^# (.+)$/gm,   '<h2 class="ans-h2">$1</h2>');

  // Bold and italic  
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');  
  out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Horizontal rule  
  out = out.replace(/^---+$/gm, '<hr class="ans-hr"/>');

  // Bullet lists  
  out = out.replace(/^[\-\*] (.+)$/gm, '<li class="ans-li">$1</li>');  
  out = out.replace(/(<li class="ans-li">[\s\S]*?<\/li>)/g, '<ul class="ans-ul">$1</ul>');  
  out = out.replace(/<\/ul>\s*<ul class="ans-ul">/g, '');

  // Numbered lists  
  out = out.replace(/^\d+\. (.+)$/gm, '<li class="ans-li">$1</li>');

  // Inline code  
  out = out.replace(/`([^`]+)`/g, '<code class="ans-code">$1</code>');

  // Line breaks (skip block elements)  
  out = out.replace(/\n(?!<(h[2-4]|ul|li|hr))/g, '<br/>');

  return out;  
}  



function fmtSize(b) {  
  if (b < 1024)    return `${b} B`;  
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;  
  return `${(b / 1048576).toFixed(1)} MB`;  
}

function toast(msg, type = 'info') {  
  const wrap = document.getElementById('toasts');  
  if (!wrap) return;  
  const el = document.createElement('div');  
  el.className = `toast ${type}`;  
  el.innerHTML = `<span class="tdot"></span>${msg}`;  
  wrap.appendChild(el);  
  setTimeout(() => el.remove(), 3800);  
}  

// ══════════════════════════════════════  
//  DELETE FILE  
// ══════════════════════════════════════  
async function deleteFile(id, filename, event) {  
  event.stopPropagation();

  const confirmed = confirm(`Delete "${filename}" from the vector store?`);  
  if (!confirmed) return;

  try {  
    const res  = await fetch('/delete', {  
      method:  'POST',  
      headers: { 'Content-Type': 'application/json' },  
      body:    JSON.stringify({ filename }),  
    });

    const data = await res.json();

    if (data.error) throw new Error(data.error);

    // Remove from state  
    const file = state.files.find(f => String(f.id) === String(id));  
    if (file) {  
      state.totalChunks = Math.max(0, state.totalChunks - file.chunks.length);  
    }  
    state.files = state.files.filter(f => String(f.id) !== String(id));

    renderFiles();

    const btn = document.getElementById('processBtn');  
    if (btn) btn.disabled = !state.files.some(f => f.status === 'pending');

    toast(`🗑️ "${filename}" deleted — ${data.deleted_vectors} vectors removed`, 'success');

  } catch (e) {  
    console.error('[DELETE ERROR]', e);  
    toast(`Delete failed: ${e.message}`, 'error');  
  }  
}  
