# huffman.zip

> Lossless text file compression using Huffman coding — drag-drop a file, compress it to a self-contained binary, decompress it back bit-perfect.

Built with vanilla HTML/CSS/JS on the frontend and Python serverless functions on the backend (Vercel). **Zero external dependencies** — the entire algorithm runs on Python's standard library.

---

## Features

| Feature | Detail |
|---|---|
| **Compress** | Upload any UTF-8 text file → download a `.huff.bin` archive |
| **Decompress** | Upload a `.huff.bin` → restore the original text, verified character-for-character |
| **Honest stats** | Reports full-file compression ratio (original vs total output bytes, including header overhead) — not just the bit-stream ratio |
| **Expanded-file notice** | When a file grows after compression (small/low-repetition inputs), the UI explains exactly why with a size breakdown |
| **Client-side validation** | File type, empty file, and 500 KB size limit checked before any network request |
| **Responsive** | Works on desktop, tablet, and mobile (breakpoints at 600 px / 420 px / 340 px) |

---

## Project structure

```
huffman-app/
├── api/
│   ├── compress.py       ← Vercel Python serverless function
│   └── decompress.py     ← Vercel Python serverless function
├── index.html            ← Markup (semantic HTML5 + ARIA)
├── style.css             ← Styles (vanilla CSS, responsive)
├── app.js                ← All client-side logic
├── vercel.json           ← Routing config for Vercel
└── requirements.txt      ← Empty — stdlib only
```

---

## How Huffman coding works

```
Input text
    │
    ▼
1.  Count character frequencies        → { 'a': 45, 'b': 13, 'c': 12, … }
    │
    ▼
2.  Build a min-heap (priority queue)  → ordered by frequency, lowest first
    │
    ▼
3.  Merge two lowest nodes repeatedly  → binary tree where rare chars are deeper
    │
    ▼
4.  Walk the tree to assign codes      → frequent chars get short codes (e.g. 'a' → 0)
                                         rare chars get long codes  (e.g. 'z' → 10110)
    │
    ▼
5.  Encode the text as a bit-stream    → variable-length codes concatenated
    │
    ▼
6.  Pack bits → bytes, prepend header  → self-contained .huff.bin output
```

**Why files can expand on small inputs:** The frequency table (JSON header) embedded in the output adds a fixed overhead of ~20–500 bytes. For files smaller than ~5 KB with many unique characters, this overhead can exceed the bit savings, resulting in a larger output file. The UI detects this and shows an exact size breakdown.

---

## Binary file format (`.huff.bin`)

```
Offset    Size        Field
──────    ──────      ───────────────────────────────────────────────
0         8 bytes     Magic: HUFFMAN\x01  (identifies valid files)
8         4 bytes     Frequency table length  (big-endian uint32)
12        variable    Frequency table  (UTF-8 JSON: {"a":45,"b":13,…})
+0        1 byte      Padding bit count  (0–7, for byte-alignment)
+1        4 bytes     Original character count  (big-endian uint32)
+5        variable    Compressed payload  (bit-packed bytes)
```

Every `.huff.bin` is **self-contained** — it carries its own frequency table so it can be decompressed independently without the original file.

---

## API reference

### `POST /api/compress`

**Request body (JSON)**
```json
{
  "filename": "notes.txt",
  "content": "<base64-encoded file bytes>"
}
```

**Success response**
```json
{
  "success": true,
  "compressed": "<base64-encoded .huff.bin bytes>",
  "filename": "notes.huff.bin",
  "stats": {
    "original_bytes": 1024,
    "compressed_bytes": 680,
    "payload_bytes": 512,
    "header_bytes": 168,
    "original_bits": 8192,
    "payload_bits": 4096,
    "ratio": 33.6,
    "bit_ratio": 50.0,
    "expanded": false,
    "unique_chars": 42,
    "total_chars": 1024
  }
}
```

> `ratio` is the **full-file** ratio: `(1 − compressed_bytes / original_bytes) × 100`.  
> Positive = file shrank. Negative = file grew (small/high-entropy input).  
> `bit_ratio` is the **payload-only** ratio (educational — ignores header overhead).

**Error responses**

| HTTP | Condition |
|---|---|
| 400 | Empty body / missing `content` field / invalid base64 |
| 400 | File is empty or whitespace-only |
| 400 | Not a valid UTF-8 text file |
| 413 | File exceeds 500 KB |
| 500 | Unexpected server error |

---

### `POST /api/decompress`

**Request body (JSON)**
```json
{
  "filename": "notes.huff.bin",
  "content": "<base64-encoded .huff.bin bytes>"
}
```

**Success response**
```json
{
  "success": true,
  "decompressed": "<base64-encoded UTF-8 text bytes>",
  "filename": "notes_decompressed.txt",
  "stats": {
    "compressed_bytes": 680,
    "decompressed_bytes": 1024,
    "chars": 1024
  }
}
```

**Error responses**

| HTTP | Condition |
|---|---|
| 400 | Empty body / missing `content` field / invalid base64 |
| 400 | File is empty |
| 400 | Invalid magic bytes (not a `.huff.bin` file) |
| 400 | Corrupted header (truncated freq table, bad JSON, invalid padding) |
| 400 | Decoded character count doesn't match the stored original count |
| 500 | Unexpected server error |

---

## Algorithm complexity

| Step | Time | Space |
|---|---|---|
| Frequency count | O(n) | O(k) |
| Heap build | O(k log k) | O(k) |
| Encoding | O(n) | O(n) |
| Decoding | O(n) | O(n) |

`n` = total characters, `k` = unique characters (max 1,114,112 for Unicode but typically < 200 for prose).

---

## Supported file types

**Compress:** `.txt` `.csv` `.md` `.log` `.json` `.xml` `.py` `.js` `.ts` `.html` `.css` `.java` `.c` `.cpp` `.rs`

**Decompress:** `.huff.bin` (files created by this tool)

**Not supported:** Binary files (images, PDFs, executables, etc.) — Huffman coding on high-entropy binary data rarely compresses and the tool has no way to restore non-text content faithfully.

---

## Limits

| Limit | Value |
|---|---|
| Max input size | 500 KB |
| Encoding | UTF-8 only |
| File types | Text-based only (see above) |
| Platform | Vercel serverless (Python 3.x, stdlib only) |

---

## Deploy to Vercel

### Option A — Vercel CLI

```bash
npm i -g vercel
cd huffman-app
vercel
```

Follow the prompts. Your app will be live at `https://your-project.vercel.app`.

### Option B — GitHub + Vercel Dashboard

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import your repo
3. Leave all settings as default → **Deploy**

The `vercel.json` already configures routing:
- `/api/compress` → `api/compress.py`
- `/api/decompress` → `api/decompress.py`
- Everything else → `index.html`

---

## Local development

There is no build step. Open `index.html` directly — but since the UI calls `/api/compress` and `/api/decompress`, you need the Vercel dev server to run the Python functions locally:

```bash
npm i -g vercel
vercel dev
```

Then open `http://localhost:3000`.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend markup | Semantic HTML5 |
| Frontend styles | Vanilla CSS (no framework) |
| Frontend logic | Vanilla JS (`'use strict'`, no bundler) |
| Backend | Python 3 — `heapq`, `json`, `struct`, `base64` (stdlib only) |
| Hosting | Vercel (static + serverless) |
| Fonts | IBM Plex Sans + IBM Plex Mono (Google Fonts) |