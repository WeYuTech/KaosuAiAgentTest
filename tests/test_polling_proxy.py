"""驗證隔離代理真的先緩衝完整回應，並保留同源 Host。"""
import importlib.util
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread, Event
from concurrent.futures import ThreadPoolExecutor
import httpx


def test_完整緩衝代理延後標頭但保留同源資訊():
    spec=importlib.util.spec_from_file_location('buffer_proxy',Path(__file__).parent/'manual/issue47_buffer_proxy.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    entered,release=Event(),Event()
    seen=[]
    class Upstream(BaseHTTPRequestHandler):
        def log_message(self,*_):pass
        def do_GET(self):
            seen.append((self.headers['Host'],self.headers['Origin']))
            self.send_response(200);self.send_header('Content-Length','6');self.end_headers()
            self.wfile.write(b'first');self.wfile.flush();entered.set();release.wait(5)
            self.wfile.write(b'!')
    upstream=ThreadingHTTPServer(('127.0.0.1',0),Upstream)
    proxy=ThreadingHTTPServer(('127.0.0.1',0),module.BufferProxy)
    proxy.upstream=f'http://127.0.0.1:{upstream.server_port}'
    threads=[Thread(target=s.serve_forever,daemon=True) for s in (upstream,proxy)]
    for t in threads:t.start()
    try:
        with ThreadPoolExecutor() as pool:
            job=pool.submit(httpx.get,f'http://127.0.0.1:{proxy.server_port}/',headers={'Host':'mes.test','Origin':'http://mes.test'})
            assert entered.wait(2)
            assert not job.done()
            release.set();response=job.result(timeout=3)
        assert response.content==b'first!' and seen==[('mes.test','http://mes.test')]
    finally:
        release.set()
        for s in (proxy,upstream):s.shutdown();s.server_close()
        for t in threads:t.join(2)
