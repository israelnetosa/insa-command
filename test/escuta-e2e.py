# Teste de ponta a ponta da escuta "Hey Manuel": microfone falso do Chrome tocando falas geradas por TTS.
import asyncio, http.server, threading, functools, json, os, sys, glob
from playwright.async_api import async_playwright
RAIZ = os.path.abspath('.')
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=RAIZ, **k)
    def log_message(s, *a): pass
    def do_GET(s):
        if s.path.startswith('/vosk/pt.tar.gz'):
            m = json.load(open('public/vosk/pt/manifesto.json'))
            s.send_response(200); s.send_header('Content-Type', 'application/gzip'); s.send_header('Content-Length', str(m['tamanho'])); s.end_headers()
            for p in m['partes']: s.wfile.write(open('public/vosk/pt/' + p, 'rb').read())
            return
        return super().do_GET()
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8799), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
CASOS = json.load(open(sys.argv[1]))
async def um(p, wav, espera):
    b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-audio-capture={wav}', '--autoplay-policy=no-user-gesture-required'])
    pg = await b.new_page(); erros = []
    pg.on('pageerror', lambda e: erros.append(str(e))); pg.on('console', lambda m: erros.append(m.text) if m.type == 'error' else None)
    await pg.goto('http://127.0.0.1:8799/test/escuta.html')
    await pg.wait_for_function("window.LOG && (window.LOG.includes('ouvindo') || window.LOG.some(x => x.startsWith('erro')))", timeout=180000)
    await pg.wait_for_timeout(espera)
    r = await pg.evaluate('({log: window.LOG, chamadas: window.CHAMADAS})')
    await b.close(); return r, erros
async def main():
    falhas = 0
    async with async_playwright() as p:
        for c in CASOS:
            r, erros = await um(p, c['wav'], 9000)
            ok = (len(r['chamadas']) > 0) == c['chama']
            falhas += 0 if ok else 1
            print(('OK   ' if ok else 'FALHA'), c['frase'], '→', r['chamadas'], r['log'][-2:], erros[:2])
    srv.shutdown(); sys.exit(1 if falhas else 0)
asyncio.run(main())
