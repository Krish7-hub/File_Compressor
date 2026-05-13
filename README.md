# huffman.zip — Huffman File Compressor

A lossless text file compressor built with Huffman coding, deployable to Vercel in under 2 minutes.

## What it does

- **Compress** any plain-text file (.txt, .csv, .md, .json, .py, .js, etc.) into a compact binary
- **Decompress** it back — bit-perfect, 100% lossless
- Shows compression ratio, bit savings, and character frequency table

## Project structure

```
huffman-app/
├── api/
│   ├── compress.py      ← Vercel Python serverless function
│   └── decompress.py    ← Vercel Python serverless function
├── index.html           ← Frontend (drag & drop UI)
├── vercel.json          ← Vercel routing config
└── requirements.txt     ← No external deps (stdlib only)
```

## Deploy to Vercel (2 minutes)

### Option A — Vercel CLI

```bash
npm i -g vercel
cd huffman-app
vercel
```

Follow the prompts. Your app will be live at `https://your-project.vercel.app`.

### Option B — GitHub + Vercel dashboard

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. Leave all settings as default → **Deploy**

## How Huffman coding works

1. Count frequency of every character in the file
2. Build a min-heap (priority queue) of nodes ordered by frequency
3. Merge the two lowest-frequency nodes repeatedly → binary tree
4. Assign short bit codes to frequent chars, long codes to rare chars
5. Encode the entire text as a stream of variable-length bits
6. Pack into bytes and store alongside the frequency table for later decompression

## Algorithm complexity

| Step | Time |
|---|---|
| Frequency count | O(n) |
| Heap build | O(k log k) — k = unique chars |
| Encoding | O(n) |
| Decoding | O(n) |

Space: O(k) for the Huffman tree.

## File format (.huff.bin)

```
[8 bytes]  Magic: HUFFMAN\x01
[4 bytes]  Length of frequency table JSON
[variable] Frequency table (JSON)
[1 byte]   Padding bit count (0–7)
[4 bytes]  Original character count
[variable] Compressed bytes
```

The frequency table is embedded so any .huff.bin file is self-contained and can be decompressed independently.

## Limits

- Max file size: ~500 KB text (Vercel serverless payload limit)
- Text files only (UTF-8)
- Binary files (images, executables) are not supported
