"""隔離代理：上游回應全部 read() 完成後才送出標頭與本文，模擬 ARR 緩衝。"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import os

HOP = {'connection','transfer-encoding','content-length','content-encoding','keep-alive'}
class BufferProxy(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def forward(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0))) or None
        headers = {k:v for k,v in self.headers.items() if k.lower() not in HOP}
        # 與正式 ARR preserveHostHeader 一致，保留 Host 供產品同源檢核。
        headers['Accept-Encoding']='identity'
        req=Request(self.server.upstream+self.path, data=body, headers=headers, method=self.command)
        try: response=urlopen(req, timeout=30)
        except HTTPError as exc: response=exc
        with response:
            # 必須先收齊；不可用迭代器提前轉送任何位元組。
            content=response.read()
            self.send_response(response.status)
            for key,value in response.headers.items():
                if key.lower() not in HOP:self.send_header(key,value)
            self.send_header('Content-Length',str(len(content)))
            self.end_headers()
            self.wfile.write(content)
    do_GET=forward
    do_POST=forward

if __name__=='__main__':
    server=ThreadingHTTPServer(('127.0.0.1',8071),BufferProxy)
    server.upstream='http://127.0.0.1:8070'
    server.serve_forever()
