import heapq
import json
import struct
import base64
from http.server import BaseHTTPRequestHandler


class BinaryTree:
    def __init__(self, char, freq):
        self.value = char
        self.freq = freq
        self.left = None
        self.right = None

    def __lt__(self, other):
        return self.freq < other.freq

    def __eq__(self, other):
        return self.freq == other.freq


def decompress_data(data: bytes) -> str:
    # ── Magic check: must be exactly b'HUFFMAN\x01' (8 bytes) ─────────────
    if len(data) < 17 or data[:8] != b'HUFFMAN\x01':
        raise ValueError(
            'Invalid file — not a valid Huffman compressed file. '
            'Please upload a .huff.bin file created by this tool.'
        )

    offset = 8

    # ── Frequency table length ─────────────────────────────────────────────
    if offset + 4 > len(data):
        raise ValueError('Corrupted file: header truncated (freq-table length missing).')
    freq_json_len = struct.unpack('>I', data[offset:offset + 4])[0]
    offset += 4

    if freq_json_len == 0:
        raise ValueError('Corrupted file: frequency table length is zero.')

    # ── Frequency table ────────────────────────────────────────────────────
    if offset + freq_json_len > len(data):
        raise ValueError('Corrupted file: frequency table data truncated.')
    try:
        freq_dict = json.loads(data[offset:offset + freq_json_len].decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError(f'Corrupted file: frequency table is not valid JSON ({exc}).') from exc
    offset += freq_json_len

    if not isinstance(freq_dict, dict) or len(freq_dict) == 0:
        raise ValueError('Corrupted file: frequency table is empty or malformed.')

    # ── Padding byte ───────────────────────────────────────────────────────
    if offset >= len(data):
        raise ValueError('Corrupted file: padding byte missing.')
    padding = data[offset]
    if padding > 7:
        raise ValueError(f'Corrupted file: invalid padding value {padding} (must be 0-7).')
    offset += 1

    # ── Original character count ───────────────────────────────────────────
    if offset + 4 > len(data):
        raise ValueError('Corrupted file: original character count missing.')
    orig_count = struct.unpack('>I', data[offset:offset + 4])[0]
    offset += 4

    if orig_count == 0:
        raise ValueError('Corrupted file: original character count is zero.')

    # ── Compressed payload ─────────────────────────────────────────────────
    compressed = data[offset:]
    if len(compressed) == 0:
        raise ValueError('Corrupted file: compressed payload is empty.')

    # ── Rebuild Huffman tree ───────────────────────────────────────────────
    heap = [BinaryTree(ch, f) for ch, f in freq_dict.items()]
    heapq.heapify(heap)

    # Single-character edge case (same as compress side)
    if len(heap) == 1:
        node = heapq.heappop(heap)
        root = BinaryTree(None, node.freq)
        root.left = node
        heapq.heappush(heap, root)

    while len(heap) > 1:
        n1 = heapq.heappop(heap)
        n2 = heapq.heappop(heap)
        merged = BinaryTree(None, n1.freq + n2.freq)
        merged.left = n1
        merged.right = n2
        heapq.heappush(heap, merged)

    root = heapq.heappop(heap)
    reverse_codes = {}

    def walk(node, bits):
        if node is None:
            return
        if node.value is not None:
            reverse_codes[bits if bits else '0'] = node.value
            return
        walk(node.left,  bits + '0')
        walk(node.right, bits + '1')

    walk(root, '')

    # ── Bit-string decode ──────────────────────────────────────────────────
    bit_string = ''.join(bin(b)[2:].zfill(8) for b in compressed)
    if padding > 0:
        bit_string = bit_string[:-padding]

    current = ''
    result  = []
    for bit in bit_string:
        current += bit
        if current in reverse_codes:
            result.append(reverse_codes[current])
            current = ''
        if len(result) >= orig_count:
            break

    # Sanity check: leftover bits mean the file is corrupted or mismatched
    if len(result) != orig_count:
        raise ValueError(
            f'Decompression mismatch: expected {orig_count} characters '
            f'but decoded {len(result)}. The file may be corrupted.'
        )

    return ''.join(result)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length == 0:
                self._json(400, {'success': False, 'error': 'Empty request body.'})
                return

            body = self.rfile.read(length)

            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                self._json(400, {'success': False, 'error': 'Invalid JSON in request body.'})
                return

            if 'content' not in data:
                self._json(400, {'success': False, 'error': 'Missing "content" field.'})
                return

            filename = data.get('filename', 'file.bin')

            try:
                content_bytes = base64.b64decode(data['content'])
            except Exception:
                self._json(400, {'success': False, 'error': 'Invalid base64 content.'})
                return

            if len(content_bytes) == 0:
                self._json(400, {'success': False, 'error': 'File is empty.'})
                return

            decoded_text = decompress_data(content_bytes)

            # Build clean output filename
            stem = filename
            for suffix in ('.huff.bin', '.bin'):
                if stem.endswith(suffix):
                    stem = stem[:-len(suffix)]
                    break
            out_name = stem + '_decompressed.txt'

            self._json(200, {
                'success': True,
                'decompressed': base64.b64encode(decoded_text.encode('utf-8')).decode('ascii'),
                'filename': out_name,
                'stats': {
                    'compressed_bytes': len(content_bytes),
                    'decompressed_bytes': len(decoded_text.encode('utf-8')),
                    'chars': len(decoded_text),
                }
            })

        except ValueError as e:
            # User-facing errors (bad file, corrupted, etc.)
            self._json(400, {'success': False, 'error': str(e)})

        except Exception as e:
            self._json(500, {'success': False, 'error': f'Internal server error: {str(e)}'})

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass
