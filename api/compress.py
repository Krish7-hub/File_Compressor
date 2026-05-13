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
    encoded_padded = encoded + '0' * padding

    byte_array = bytearray()
    for i in range(0, len(encoded_padded), 8):
        byte_array.append(int(encoded_padded[i:i + 8], 2))

    # File format:
    # [8 bytes magic: HUFFMAN\x01]
    # [4 bytes: freq_json length]
    # [freq_json bytes]
    # [1 byte: padding bits count]
    # [4 bytes: original character count]
    # [compressed payload bytes]
    freq_json = json.dumps(freq_dict, ensure_ascii=False).encode('utf-8')
    output = bytearray()
    output += b'HUFFMAN\x01'
    output += struct.pack('>I', len(freq_json))
    output += freq_json
    output += struct.pack('>B', padding)
    output += struct.pack('>I', len(text))
    output += byte_array

    payload_bytes = len(byte_array)
    header_bytes = 8 + 4 + len(freq_json) + 1 + 4
    payload_bits = len(encoded)          # actual meaningful bits (no padding)
    original_bits = len(text) * 8        # original raw bits (1 byte per char)

    return freq_dict, codes, padding, bytes(output), len(text), payload_bytes, header_bytes, payload_bits, original_bits


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

            filename = data.get('filename', 'file.txt')

            try:
                content_bytes = base64.b64decode(data['content'])
            except Exception:
                self._json(400, {'success': False, 'error': 'Invalid base64 content.'})
                return

            # Validate file size (raw bytes before decode)
            if len(content_bytes) == 0:
                self._json(400, {'success': False, 'error': 'File is empty.'})
                return

            if len(content_bytes) > 500_000:
                self._json(413, {'success': False, 'error': 'File too large. Maximum size is 500 KB.'})
                return

            try:
                text = content_bytes.decode('utf-8')
            except UnicodeDecodeError:
                self._json(400, {'success': False, 'error': 'File must be a UTF-8 plain-text file.'})
                return

            if not text.strip():
                self._json(400, {'success': False, 'error': 'File is empty or contains only whitespace.'})
                return

            (freq_dict, codes, padding, output_bytes,
             orig_len, payload_bytes, header_bytes,
             payload_bits, original_bits) = compress_text(text)

            original_file_bytes = len(content_bytes)
            compressed_file_bytes = len(output_bytes)

            # True file-level ratio: positive = file shrank, negative = file grew
            file_ratio = round((1 - compressed_file_bytes / original_file_bytes) * 100, 1) if original_file_bytes > 0 else 0

            # Bit-level ratio (payload only, educational)
            bit_ratio = round((1 - payload_bits / original_bits) * 100, 1) if original_bits > 0 else 0

            # File expanded if compressed output is larger than original
            expanded = compressed_file_bytes >= original_file_bytes

            stem = filename.rsplit('.', 1)[0] if '.' in filename else filename
            out_name = stem + '.huff.bin'

            self._json(200, {
                'success': True,
                'compressed': base64.b64encode(output_bytes).decode('ascii'),
                'filename': out_name,
                'stats': {
                    'original_bytes': original_file_bytes,
                    'compressed_bytes': compressed_file_bytes,
                    'payload_bytes': payload_bytes,
                    'header_bytes': header_bytes,
                    'original_bits': original_bits,
                    'payload_bits': payload_bits,
                    'ratio': file_ratio,        # full-file ratio (what matters)
                    'bit_ratio': bit_ratio,      # payload-only ratio (educational)
                    'expanded': expanded,
                    'unique_chars': len(freq_dict),
                    'total_chars': orig_len,
                }
            })

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
