"""Service worker : le site s'ouvre sans réseau une fois visité.
Ce test sert le dépôt par un vrai petit serveur web (un service worker exige une vraie origine)."""
import functools, http.server, json, threading, urllib.parse
import pytest
from conftest import CONFIG, CORS, HERE, ROOT, SUPA, FakeTmdb


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if urllib.parse.urlparse(self.path).path == "/config.js":
            body = CONFIG.encode()
            self.send_response(200); self.send_header("Content-Type", "application/javascript")
            self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, *a):
        pass


@pytest.fixture
def server():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    # « localhost » : origine sûre exigée par les service workers
    yield f"http://localhost:{srv.server_address[1]}"
    srv.shutdown()


def test_le_site_s_ouvre_hors_connexion(browser, server):
    tmdb = FakeTmdb()
    ctx = browser.new_context(service_workers="allow")

    def route(r):
        u = r.request.url
        if "supabase-js" in u:
            return r.fulfill(body=(HERE / "fake_supabase.js").read_text(), content_type="application/javascript", headers={"Access-Control-Allow-Origin": "*"})
        if u.startswith(SUPA + "/functions/v1/tmdb"):
            if r.request.method == "OPTIONS":
                return r.fulfill(status=204, headers=CORS)
            qs = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(u).query))
            status, headers, body = tmdb.respond(qs.pop("p"), qs)
            return r.fulfill(status=status, headers={**CORS, **headers}, body=json.dumps(body), content_type="application/json")
        if "image.tmdb.org" in u:
            return r.fulfill(body=(ROOT / "icon-180.png").read_bytes(), content_type="image/png", headers={"Access-Control-Allow-Origin": "*"})
        if u.startswith(server):
            return r.continue_()
        return r.abort()

    ctx.route("**/*", route)
    page = ctx.new_page()
    page.add_init_script('window.__SEED = {"logged": true};')
    page.goto(server + "/")
    page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller", timeout=10000)
    page.wait_for_timeout(500)
    ctx.set_offline(True)
    page.reload()
    # le site démarre : fichiers, bibliothèque Supabase et genres TMDB viennent du cache
    page.wait_for_selector("#view-onboard:visible", timeout=10000)
    assert "Hors connexion" in page.inner_text("#notice")
    assert page.evaluate("caches.has('sinema-data')"), "réponses TMDB gardées pour le mode hors connexion"
    ctx.close()
