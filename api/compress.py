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


def build_huffman_codes(text):
    freq_dict = {}
    for ch in text:
        freq_dict[ch] = freq_dict.get(ch, 0) + 1

    heap = [BinaryTree(ch, f) for ch, f in freq_dict.items()]
    heapq.heapify(heap)

    # Handle single unique character edge case
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
    codes = {}

    def walk(node, bits):
        if node is None:
            return
        if node.value is not None:
            codes[node.value] = bits if bits else '0'
            return
        walk(node.left, bits + '0')
        walk(node.right, bits + '1')

    walk(root, '')
    return freq_dict, codes


def compress_text(text):
    freq_dict, codes = build_huffman_codes(text)

    encoded = ''.join(codes[ch] for ch in text)
    padding = (8 - len(encoded) % 8) % 8
    encoded += '0' * padding

    byte_array = bytearray()
    for i in range(0, len(encoded), 8):
        byte_array.append(int(encoded[i:i + 8], 2))

    # File format:
    # [8 bytes magic: HUFFMAN\x01]
    # [4 bytes: freq_json length]
    # [freq_json bytes]
    # [1 byte: padding bits count]
    # [4 bytes: original character count]
    # [compressed bytes]
    freq_json = json.dumps(freq_dict, ensure_ascii=False).encode('utf-8')
    output = bytearray()
    output += b'HUFFMAN\x01'
    output += struct.pack('>I', len(freq_json))
    output += freq_json
    output += struct.pack('>B', padding)
    output += struct.pack('>I', len(text))
    output += byte_array

    return freq_dict, codes, padding, bytes(output), len(text)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            data = json.loads(body)

            filename = data.get('filename', 'file.txt')
            content_bytes = base64.b64decode(data['content'])

            try:
                text = content_bytes.decode('utf-8')
            except UnicodeDecodeError:
                self._json(400, {'success': False, 'error': 'File must be a plain text file (UTF-8).'})
                return

            if not text.strip():
                self._json(400, {'success': False, 'error': 'File is empty or contains only whitespace.'})
                return

            if len(text) > 500_000:
                self._json(400, {'success': False, 'error': 'File too large. Max 500 KB text.'})
                return

            freq_dict, codes, padding, output_bytes, orig_len = compress_text(text)

            orig_bits = orig_len * 8
            comp_bits = (len(output_bytes) - 8 - 4 - len(json.dumps(freq_dict).encode()) - 1 - 4) * 8
            ratio = round((1 - comp_bits / orig_bits) * 100, 1) if orig_bits > 0 else 0

            stem = filename.rsplit('.', 1)[0]
            out_name = stem + '.huff.bin'

            self._json(200, {
                'success': True,
                'compressed': base64.b64encode(output_bytes).decode('ascii'),
                'filename': out_name,
                'stats': {
                    'original_bytes': len(content_bytes),
                    'compressed_bytes': len(output_bytes),
                    'original_bits': orig_bits,
                    'compressed_bits': comp_bits,
                    'ratio': ratio,
                    'unique_chars': len(freq_dict),
                    'total_chars': orig_len,
                }
            })

        except Exception as e:
            self._json(500, {'success': False, 'error': str(e)})

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
