'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let mode = 'compress';
let selectedFile = null;

// ── Mode switching ─────────────────────────────────────────────────────────
function setMode(m) {
  mode = m;
  document.getElementById('btn-compress').classList.toggle('active', m === 'compress');
  document.getElementById('btn-decompress').classList.toggle('active', m === 'decompress');
  document.getElementById('action-label').textContent =
    m === 'compress' ? 'Compress file' : 'Decompress file';

  const input = document.getElementById('file-input');
  const hint  = document.getElementById('accepted-hint');

  if (m === 'compress') {
    input.accept = '.txt,.csv,.md,.log,.json,.xml,.py,.js,.ts,.html,.css,.java,.c,.cpp,.rs';
    hint.textContent = '.txt .csv .md .log .json .xml .py .js .ts .html .css .java .c .cpp .rs';
  } else {
    input.accept = '.bin';
    hint.textContent = '.huff.bin  (files compressed with this tool)';
  }

  clearFile();
  document.getElementById('result-area').innerHTML = '';
}

// ── Drag & Drop ────────────────────────────────────────────────────────────
const dz = document.getElementById('drop-zone');

dz.addEventListener('dragover', e => {
  e.preventDefault();
  dz.classList.add('drag-over');
});

dz.addEventListener('dragleave', e => {
  if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag-over');
});

dz.addEventListener('drop', e => {
  e.preventDefault();
  dz.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) validateAndHandle(file);
});

document.getElementById('file-input').addEventListener('change', e => {
  if (e.target.files.length) validateAndHandle(e.target.files[0]);
});

// ── Keyboard accessibility for drop zone ───────────────────────────────────
dz.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    document.getElementById('file-input').click();
  }
});

// ── File validation ────────────────────────────────────────────────────────
const COMPRESS_EXTS   = ['.txt','.csv','.md','.log','.json','.xml','.py','.js','.ts','.html','.css','.java','.c','.cpp','.rs'];
const MAX_BYTES       = 500 * 1024;

function getExt(name) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

function validateAndHandle(file) {
  const ext = getExt(file.name);

  if (mode === 'compress') {
    if (!COMPRESS_EXTS.includes(ext)) {
      showError(`Unsupported file type "${ext}". Accepted: ${COMPRESS_EXTS.join(', ')}`);
      return;
    }
    if (file.size > MAX_BYTES) {
      showError(`File too large (${formatBytes(file.size)}). Max allowed: 500 KB.`);
      return;
    }
  } else {
    if (!file.name.endsWith('.bin')) {
      showError('Please upload a .huff.bin file created by this tool.');
      return;
    }
  }

  if (file.size === 0) {
    showError('The selected file is empty.');
    return;
  }

  handleFile(file);
}

function handleFile(file) {
  selectedFile = file;

  // Derive extension badge (up to 4 chars, uppercase)
  const ext = getExt(file.name).replace('.', '').toUpperCase().slice(0, 4) || 'BIN';
  document.getElementById('file-ext-badge').textContent = ext;

  document.getElementById('drop-zone').classList.add('hidden');
  document.getElementById('file-selected').classList.remove('hidden');
  document.getElementById('file-name-display').textContent = file.name;
  document.getElementById('file-size-display').textContent = formatBytes(file.size);
  document.getElementById('action-btn').disabled = false;
  document.getElementById('result-area').innerHTML = '';
}

function clearFile() {
  selectedFile = null;
  document.getElementById('drop-zone').classList.remove('hidden');
  document.getElementById('file-selected').classList.add('hidden');
  document.getElementById('action-btn').disabled = true;
  document.getElementById('file-input').value = '';
  document.getElementById('result-area').innerHTML = '';
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatBytes(n) {
  if (n === 0)         return '0 B';
  if (n < 1024)        return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function escAttr(s) {
  return String(s).replace(/'/g, "\\'");
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result.split(',')[1]);
    r.onerror = () => reject(new Error('Could not read file.'));
    r.readAsDataURL(file);
  });
}

// ── Button helpers ─────────────────────────────────────────────────────────
function setBtnLoading() {
  const btn = document.getElementById('action-btn');
  btn.disabled = true;
  btn.innerHTML = `<div class="spinner"></div><span>${mode === 'compress' ? 'Compressing…' : 'Decompressing…'}</span>`;
}

function resetBtn() {
  const btn = document.getElementById('action-btn');
  btn.disabled = false;
  btn.innerHTML = `<span id="action-label">${mode === 'compress' ? 'Compress file' : 'Decompress file'}</span>`;
}

// ── Run ────────────────────────────────────────────────────────────────────
async function run() {
  if (!selectedFile) return;

  setBtnLoading();

  let b64;
  try {
    b64 = await readFileAsBase64(selectedFile);
  } catch (err) {
    showError('Could not read file: ' + err.message);
    resetBtn(); return;
  }

  const endpoint = mode === 'compress' ? '/api/compress' : '/api/decompress';

  let resp;
  try {
    resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: selectedFile.name, content: b64 })
    });
  } catch (err) {
    showError('Network error — could not reach the server. Check your connection.');
    resetBtn(); return;
  }

  let data;
  try {
    data = await resp.json();
  } catch {
    showError(`Server returned an invalid response (not JSON). Status: ${resp.status}`);
    resetBtn(); return;
  }

  resetBtn();

  if (!data.success) {
    showError(data.error || 'An unknown error occurred.');
    return;
  }

  mode === 'compress' ? showCompressResult(data) : showDecompressResult(data);
}

// ── Error ──────────────────────────────────────────────────────────────────
function showError(msg) {
  document.getElementById('result-area').innerHTML = `
    <div class="result-card is-error">
      <div class="result-header">
        <div class="result-dot dot-err"></div>
        <div class="result-label">Error</div>
      </div>
      <div class="err-body">
        <p class="err-text">${escHtml(msg)}</p>
      </div>
    </div>`;
}

// ── Compress result ────────────────────────────────────────────────────────
function showCompressResult(data) {
  const { stats, compressed, filename } = data;
  const { ratio, bit_ratio, expanded } = stats;

  // Ratio display: positive = shrank (−X%), negative = grew (+X%)
  const ratioAbs   = Math.abs(ratio).toFixed(1);
  const ratioSign  = ratio >= 0 ? '−' : '+';
  const ratioText  = ratioSign + ratioAbs + '%';
  const ratioClass = ratio > 5 ? 'v-good' : ratio < 0 ? 'v-bad' : 'v-warn';
  const labelSaved = ratio >= 0 ? 'SPACE SAVED' : 'SIZE INCREASE';

  // Bar widths
  const maxB    = Math.max(stats.original_bytes, stats.compressed_bytes);
  const origPct = maxB > 0 ? (stats.original_bytes   / maxB * 100).toFixed(1) : 100;
  const compPct = maxB > 0 ? (stats.compressed_bytes / maxB * 100).toFixed(1) : 100;
  const compFillCls = expanded ? 'bar-fill fill-comp fill-neg' : 'bar-fill fill-comp';

  // Expanded warning
  const warnHtml = expanded ? `
    <div class="warn-notice">
      <strong>File grew after compression.</strong><br>
      Huffman saved ${bit_ratio >= 0 ? bit_ratio + '%' : '0%'} on the raw bits, but the embedded
      frequency table adds <strong>${formatBytes(stats.header_bytes)}</strong> of fixed overhead —
      larger than the bit savings for this small or high-entropy file.<br>
      For real savings, try files ≥ 5 KB with repetitive content.
    </div>` : '';

  // Size breakdown (only when expanded)
  const breakdownHtml = expanded ? `
    <div class="breakdown">
      <div class="breakdown-title">Size breakdown</div>
      <div class="breakdown-row">
        <span class="bd-key">Original input</span>
        <span class="bd-val">${formatBytes(stats.original_bytes)}</span>
      </div>
      <div class="breakdown-row">
        <span class="bd-key">Compressed payload</span>
        <span class="bd-val">${formatBytes(stats.payload_bytes)}</span>
      </div>
      <div class="breakdown-row">
        <span class="bd-key">Header overhead</span>
        <span class="bd-val">${formatBytes(stats.header_bytes)}</span>
      </div>
      <div class="breakdown-row bd-total">
        <span class="bd-key">Total output</span>
        <span class="bd-val">${formatBytes(stats.compressed_bytes)}</span>
      </div>
    </div>` : '';

  // Meta
  const bitDir = bit_ratio >= 0 ? `${bit_ratio}% fewer bits in payload` : `${Math.abs(bit_ratio)}% more bits in payload`;
  const metaHtml = `
    <div class="meta-row">
      ${stats.unique_chars} unique chars &nbsp;·&nbsp;
      ${stats.total_chars.toLocaleString()} total chars &nbsp;·&nbsp;
      ${stats.original_bits.toLocaleString()} → ${stats.payload_bits.toLocaleString()} bits (${bitDir})
    </div>`;

  document.getElementById('result-area').innerHTML = `
    <div class="result-card${expanded ? ' is-warn' : ''}">
      <div class="result-header">
        <div class="result-dot ${expanded ? 'dot-warn' : 'dot-ok'}"></div>
        <div class="result-label">${expanded ? 'Compressed — file grew (see note)' : 'Compression complete'}</div>
      </div>

      ${warnHtml}

      <div class="stats-row">
        <div class="stat-cell">
          <div class="stat-label">Original</div>
          <div class="stat-value">${formatBytes(stats.original_bytes)}</div>
        </div>
        <div class="stat-cell">
          <div class="stat-label">Compressed</div>
          <div class="stat-value ${expanded ? 'v-bad' : ''}">${formatBytes(stats.compressed_bytes)}</div>
        </div>
        <div class="stat-cell">
          <div class="stat-label">${escHtml(labelSaved)}</div>
          <div class="stat-value ${ratioClass}">${escHtml(ratioText)}</div>
        </div>
      </div>

      <div class="bars">
        <div class="bar-row">
          <span class="bar-label">original</span>
          <div class="bar-track"><div class="bar-fill fill-orig" style="width:${origPct}%"></div></div>
          <span class="bar-bytes">${formatBytes(stats.original_bytes)}</span>
        </div>
        <div class="bar-row">
          <span class="bar-label">compressed</span>
          <div class="bar-track"><div class="${compFillCls}" style="width:${compPct}%"></div></div>
          <span class="bar-bytes">${formatBytes(stats.compressed_bytes)}</span>
        </div>
      </div>

      ${breakdownHtml}
      ${metaHtml}

      <a class="dl-btn" href="#"
         onclick="downloadResult(event,'${escAttr(filename)}','${escAttr(compressed)}','application/octet-stream')">
        <svg width="14" height="14" viewBox="0 0 24 24">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
        Download ${escHtml(filename)}
      </a>
    </div>`;
}

// ── Decompress result ──────────────────────────────────────────────────────
function showDecompressResult(data) {
  const { stats, decompressed, filename } = data;

  document.getElementById('result-area').innerHTML = `
    <div class="result-card">
      <div class="result-header">
        <div class="result-dot dot-ok"></div>
        <div class="result-label">Decompression complete — lossless ✓</div>
      </div>

      <div class="stats-row stats-2col">
        <div class="stat-cell">
          <div class="stat-label">Compressed</div>
          <div class="stat-value">${formatBytes(stats.compressed_bytes)}</div>
        </div>
        <div class="stat-cell">
          <div class="stat-label">Restored</div>
          <div class="stat-value v-good">${formatBytes(stats.decompressed_bytes)}</div>
        </div>
      </div>

      <div class="meta-row">
        ${stats.chars.toLocaleString()} characters restored
      </div>

      <a class="dl-btn" href="#"
         onclick="downloadResult(event,'${escAttr(filename)}','${escAttr(decompressed)}','text/plain')">
        <svg width="14" height="14" viewBox="0 0 24 24">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
        Download ${escHtml(filename)}
      </a>
    </div>`;
}

// ── Download ───────────────────────────────────────────────────────────────
function downloadResult(e, filename, b64, mime) {
  e.preventDefault();
  try {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const blob  = new Blob([bytes], { type: mime });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    showError('Download failed: ' + err.message);
  }
}
