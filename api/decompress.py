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
    if len(data) < 8 or data[:7] != b'HUFFMAN':
        raise ValueError('Invalid file — not a Huffman compressed file. Upload a .huff.bin file.')

    offset = 8
    if offset + 4 > len(data):
        raise ValueError('Corrupted file: header truncated.')

    freq_json_len = struct.unpack('>I', data[offset:offset + 4])[0]
    offset += 4

    if offset + freq_json_len > len(data):
        raise ValueError('Corrupted file: frequency table truncated.')

    freq_dict = json.loads(data[offset:offset + freq_json_len].decode('utf-8'))
    offset += freq_json_len

    padding = data[offset]
    offset += 1

    orig_count = struct.unpack('>I', data[offset:offset + 4])[0]
    offset += 4

    compressed = data[offset:]

    # Rebuild Huffman tree from frequency table
    heap = [BinaryTree(ch, f) for ch, f in freq_dict.items()]
    heapq.heapify(heap)

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
    reversecodes = {}

    def walk(node, bits):
        if node is None:
            return
        if node.value is not None:
            reversecodes[bits if bits else '0'] = node.value
            return
        walk(node.left, bits + '0')
        walk(node.right, bits + '1')

    walk(root, '')

    bit_string = ''.join(bin(b)[2:].zfill(8) for b in compressed)
    if padding > 0:
        bit_string = bit_string[:-padding]

    current = ''
    result = []
    for bit in bit_string:
        current += bit
        if current in reversecodes:
            result.append(reversecodes[current])
            current = ''
        if len(result) >= orig_count:
            break

    return ''.join(result)


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

            filename = data.get('filename', 'file.bin')
            content_bytes = base64.b64decode(data['content'])

            decoded_text = decompress_data(content_bytes)

            stem = filename.replace('.huff.bin', '').replace('.bin', '')
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
