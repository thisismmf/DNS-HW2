#!/usr/bin/env python3
"""Local TCP server wrapping node index.js for testing."""
import socket, subprocess, threading, os

NODE_SCRIPT = os.path.join(os.path.dirname(__file__), 'encsrv/app/index.js')
HOST, PORT = '127.0.0.1', 1204

def handle(conn):
    proc = subprocess.Popen(
        ['node', NODE_SCRIPT],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        cwd=os.path.dirname(NODE_SCRIPT)
    )
    def fwd(src, dst):
        try:
            while True:
                data = src.read(4096)
                if not data: break
                dst.write(data)
                dst.flush()
        except: pass
        try: src.close()
        except: pass
        try: dst.close()
        except: pass

    t1 = threading.Thread(target=fwd, args=(conn.makefile('rb'), proc.stdin))
    t2 = threading.Thread(target=fwd, args=(proc.stdout, conn.makefile('wb')))
    t1.start(); t2.start()
    proc.wait()
    conn.close()

srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind((HOST, PORT))
srv.listen(5)
print(f"[*] Local server on {HOST}:{PORT}")
while True:
    conn, _ = srv.accept()
    threading.Thread(target=handle, args=(conn,), daemon=True).start()
