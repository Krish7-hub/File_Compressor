/* ─────────────────────────────────────────────────────────────────────────
   huffman.zip — app.js
   Handles: mode switching, drag-drop, file selection, API calls,
            result rendering, download, XSS escaping.
───────────────────────────────────────────────────────────────────────── */

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
  // Only remove if leaving the drop-zone entirely (not a child)
  if (!dz.contains(e.relatedTarget)) {
    dz.classList.remove('drag-over');
  }
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

// ── File validation ────────────────────────────────────────────────────────
const COMPRESS_EXTS   = ['.txt','.csv','.md','.log','.json','.xml','.py','.js','.ts','.html','.css','.java','.c','.cpp','.rs'];
const DECOMPRESS_EXTS = ['.bin'];
const MAX_BYTES       = 500 * 1024; // 500 KB

function getExt(name) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

function validateAndHandle(file) {
  const ext = getExt(file.name);

  if (mode === 'compress') {
    if (!COMPRESS_EXTS.includes(ext)) {
      showError(`Unsupported file type "${ext}". Please upload a text-based file (${COMPRESS_EXTS.join(', ')}).`);
      return;
    }
  } else {
    // For decompress, accept .bin but also .huff.bin (which ends in .bin)
    if (!file.name.endsWith('.bin')) {
      showError('Please upload a .huff.bin file created by this tool.');
      return;
    }
  }

  if (file.size === 0) {
    showError('The selected file is empty. Please choose a non-empty file.');
    return;
  }

  if (mode === 'compress' && file.size > MAX_BYTES) {
    showError(`File is too large (${formatBytes(file.size)}). Maximum allowed size is 500 KB.`);
    return;
  }

  handleFile(file);
}

function handleFile(file) {
  selectedFile = file;
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

// ── Utilities ──────────────────────────────────────────────────────────────
function formatBytes(n) {
  if (n === 0)          return '0 B';
  if (n < 1024)         return n + ' B';
  if (n < 1024 * 1024)  return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function escAttr(s) {
  return String(s).replace(/'/g, "\\'");
}

// ── Read file as base64 ────────────────────────────────────────────────────
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

// ── Button state helpers ───────────────────────────────────────────────────
function setBtnLoading() {
  const btn   = document.getElementById('action-btn');
  const label = document.getElementById('action-label');
  btn.disabled = true;
  label.textContent = mode === 'compress' ? 'Compressing…' : 'Decompressing…';
  const svgEl = btn.querySelector('svg');
  if (svgEl) svgEl.outerHTML = '<div class="spinner"></div>';
}

function resetBtn() {
  const btn = document.getElementById('action-btn');
  btn.disabled = false;
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
    </svg>
    <span id="action-label">${mode === 'compress' ? 'Compress file' : 'Decompress file'}</span>`;
}

// ── Main action ────────────────────────────────────────────────────────────
async function run() {
  if (!selectedFile) return;

  setBtnLoading();

  let b64;
  try {
    b64 = await readFileAsBase64(selectedFile);
  } catch (err) {
    showError('Could not read file: ' + err.message);
    resetBtn();
    return;
  }

  const endpoint = mode === 'compress' ? '/api/compress' : '/api/decompress';

  let resp, data;
  try {
    resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: selectedFile.name, content: b64 })
    });
  } catch (err) {
    showError('Network error — could not reach the server. Please check your connection.');
    resetBtn();
    return;
  }

  try {
    data = await resp.json();
  } catch {
    showError('Server returned an invalid response (not JSON). Status: ' + resp.status);
    resetBtn();
    return;
  }

  resetBtn();

  if (!data.success) {
    showError(data.error || 'An unknown error occurred on the server.');
    return;
  }

  if (mode === 'compress') {
    showCompressResult(data);
  } else {
    showDecompressResult(data);
  }
}

// ── Error display ──────────────────────────────────────────────────────────
function showError(msg) {
  document.getElementById('result-area').innerHTML = `
    <div class="result-card error">
      <div class="result-header">
        <div class="result-status status-err"></div>
        <div class="result-title">Error</div>
      </div>
      <p class="err-msg">${escHtml(msg)}</p>
    </div>`;
}

// ── Compress result renderer ───────────────────────────────────────────────
// Ratio convention (from server):
//   positive  →  file got SMALLER  → good (green)
//   negative  →  file got LARGER   → bad  (red)
//   near-zero →  almost no change  → warn (amber)
function showCompressResult(data) {
  const { stats, compressed, filename } = data;

  const ratio    = stats.ratio;        // full-file ratio
  const bitRatio = stats.bit_ratio;    // payload-only ratio (educational)
  const expanded = stats.expanded;     // boolean: compressed > original

  // ── Ratio display ────────────────────────────────────────────────────────
  const ratioAbs  = Math.abs(ratio).toFixed(1);
  const ratioSign = ratio >= 0 ? '−' : '+';        // − = shrank, + = grew
  const ratioText = ratioSign + ratioAbs + '%';
  const ratioClass = ratio > 5  ? 'good'
                   : ratio < 0  ? 'bad'
                   : 'warn';

  const labelSaved = ratio >= 0 ? 'SPACE SAVED' : 'SIZE INCREASE';

  // ── Bar widths ───────────────────────────────────────────────────────────
  const maxBytes  = Math.max(stats.original_bytes, stats.compressed_bytes);
  const origPct   = maxBytes > 0 ? (stats.original_bytes   / maxBytes * 100).toFixed(1) : 100;
  const compPct   = maxBytes > 0 ? (stats.compressed_bytes / maxBytes * 100).toFixed(1) : 100;
  const compBarCls = expanded ? 'bar-fill fill-comp fill-bad' : 'bar-fill fill-comp';

  // ── Expanded notice ──────────────────────────────────────────────────────
  const bitSavedText = bitRatio >= 0
    ? `saved <span style="color:var(--text)">${bitRatio}%</span> on the raw content bits`
    : `used <span style="color:var(--text)">${Math.abs(bitRatio)}% more</span> bits on the raw content`;

  const expandedHtml = expanded ? `
    <div class="expanded-notice">
      <strong>⚠ Compressed file is larger than the original.</strong><br>
      Huffman coding ${bitSavedText},
      but the self-contained header (frequency table + metadata) adds
      <span style="color:var(--text)">${formatBytes(stats.header_bytes)}</span> of overhead —
      more than any bit savings for this small or low-repetition file.<br>
      The file is still perfectly decompressible. For best results, compress files ≥ 5 KB with repetitive content.
    </div>` : '';

  // ── Size breakdown (only when expanded) ─────────────────────────────────
  const overheadHtml = expanded ? `
    <div class="overhead-block">
      <div class="overhead-title">Size breakdown</div>
      <div class="overhead-row">
        <span class="oh-label">Original input</span>
        <span class="oh-val">${formatBytes(stats.original_bytes)}</span>
      </div>
      <div class="overhead-row">
        <span class="oh-label">Compressed payload</span>
        <span class="oh-val">${formatBytes(stats.payload_bytes)}</span>
      </div>
      <div class="overhead-row">
        <span class="oh-label">Header overhead (freq table + magic)</span>
        <span class="oh-val">${formatBytes(stats.header_bytes)}</span>
      </div>
      <div class="overhead-row" style="border-top:1px solid var(--border2);margin-top:4px;padding-top:6px;">
        <span class="oh-label" style="color:var(--text)">Total output</span>
        <span class="oh-val"   style="color:var(--red)">${formatBytes(stats.compressed_bytes)}</span>
      </div>
    </div>` : '';

  // ── Bit-level note ───────────────────────────────────────────────────────
  const bitDirText = bitRatio >= 0
    ? `<span class="hl">${bitRatio}% fewer bits</span> in payload`
    : `${Math.abs(bitRatio)}% more bits in payload`;

  const bitNoteHtml = `
    <div class="meta-line">
      <span>${stats.unique_chars} unique chars</span>
      <span class="sep">·</span>
      <span>${stats.total_chars.toLocaleString()} total chars</span>
      <span class="sep">·</span>
      <span>${stats.original_bits.toLocaleString()} → ${stats.payload_bits.toLocaleString()} bits (${bitDirText})</span>
    </div>`;

  // ── Render ───────────────────────────────────────────────────────────────
  document.getElementById('result-area').innerHTML = `
    <div class="result-card${expanded ? ' warning' : ''}">
      <div class="result-header">
        <div class="result-status ${expanded ? 'status-warn' : 'status-ok'}"></div>
        <div class="result-title">${expanded ? 'Compressed (file grew — overhead note below)' : 'Compression complete'}</div>
      </div>

      ${expandedHtml}

      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-lbl">Original</div>
          <div class="stat-val">${formatBytes(stats.original_bytes)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-lbl">Compressed</div>
          <div class="stat-val ${expanded ? 'bad' : ''}">${formatBytes(stats.compressed_bytes)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-lbl">${escHtml(labelSaved)}</div>
          <div class="stat-val ${ratioClass}">${escHtml(ratioText)}</div>
        </div>
      </div>

      <div class="compare-bar">
        <div class="bar-row">
          <div class="bar-lbl">original</div>
          <div class="bar-track"><div class="bar-fill fill-orig" style="width:${origPct}%"></div></div>
          <div class="bar-num">${formatBytes(stats.original_bytes)}</div>
        </div>
        <div class="bar-row">
          <div class="bar-lbl">compressed</div>
          <div class="bar-track"><div class="${compBarCls}" style="width:${compPct}%"></div></div>
          <div class="bar-num">${formatBytes(stats.compressed_bytes)}</div>
        </div>
      </div>

      ${overheadHtml}
      ${bitNoteHtml}

      <a class="dl-btn" href="#"
         id="dl-compressed"
         onclick="downloadResult(event,'${escAttr(filename)}','${escAttr(compressed)}','application/octet-stream')">
        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        Download ${escHtml(filename)}
      </a>
    </div>`;
}

// ── Decompress result renderer ─────────────────────────────────────────────
function showDecompressResult(data) {
  const { stats, decompressed, filename } = data;

  document.getElementById('result-area').innerHTML = `
    <div class="result-card">
      <div class="result-header">
        <div class="result-status status-ok"></div>
        <div class="result-title">Decompression complete — lossless ✓</div>
      </div>

      <div class="stats-grid" style="grid-template-columns:1fr 1fr;">
        <div class="stat-box">
          <div class="stat-lbl">Compressed</div>
          <div class="stat-val">${formatBytes(stats.compressed_bytes)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-lbl">Restored</div>
          <div class="stat-val good">${formatBytes(stats.decompressed_bytes)}</div>
        </div>
      </div>

      <div class="meta-line">
        <span>${stats.chars.toLocaleString()} characters restored</span>
      </div>

      <a class="dl-btn" href="#"
         id="dl-decompressed"
         onclick="downloadResult(event,'${escAttr(filename)}','${escAttr(decompressed)}','text/plain')">
        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        Download ${escHtml(filename)}
      </a>
    </div>`;
}

// ── Download helper ────────────────────────────────────────────────────────
function downloadResult(e, filename, b64, mime) {
  e.preventDefault();
  try {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const blob  = new Blob([bytes], { type: mime });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    showError('Download failed: ' + err.message);
  }
}
