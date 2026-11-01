"""Fixtures des tests de bout en bout : le vrai site, servi depuis le dépôt,
avec un faux Supabase (fake_supabase.js) et un faux TMDB (fake_tmdb.py) à la place des services réels."""
import json, os, pathlib, urllib.parse
import pytest
from playwright.sync_api import sync_playwright
from fake_tmdb import FakeTmdb

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent
SITE = "http://localhost"
SUPA = "https://test.supabase.co"
CONFIG = f'export const SUPABASE_URL = "{SUPA}", SUPABASE_ANON_KEY = "anon-test", TMDB_TOKEN = "";'
TYPES = {"js": "application/javascript", "css": "text/css", "html": "text/html", "svg": "image/svg+xml",
         "png": "image/png", "webmanifest": "application/manifest+json"}
CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey", "Access-Control-Allow-Methods": "GET, OPTIONS"}


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        exe = os.environ.get("SINEMA_CHROME")
        b = p.chromium.launch(**({"executable_path": exe} if exe else {}))
        yield b
        b.close()


class App:
    """Le site ouvert dans un onglet, avec accès aux faux services."""

    def __init__(self, browser, width=400, height=820):
        self.tmdb = FakeTmdb()
        self.errors = []
        # le service worker est testé à part (test_offline.py) : ici il gênerait l'interception des requêtes
        self.ctx = browser.new_context(viewport={"width": width, "height": height}, service_workers="block", locale="fr-FR")
        self.ctx.route("**/*", self._route)
        self.page = self.ctx.new_page()
        self.page.on("pageerror", lambda e: self.errors.append(str(e)))
        self.page.on("console", lambda m: self.errors.append(m.text) if m.type == "error" else None)

    def _route(self, route):
        req = route.request
        u = urllib.parse.urlparse(req.url)
        if "supabase-js" in req.url:
            return route.fulfill(body=(HERE / "fake_supabase.js").read_text(), content_type="application/javascript")
        if req.url.startswith(SUPA + "/functions/v1/tmdb"):
            if req.method == "OPTIONS":
                return route.fulfill(status=204, headers=CORS)
            if req.headers.get("authorization") != "Bearer test-access-token":
                return route.fulfill(status=401, headers=CORS, body='{"error":"not_signed_in"}')
            qs = dict(urllib.parse.parse_qsl(u.query))
            status, headers, body = self.tmdb.respond(qs.pop("p"), qs)
            return route.fulfill(status=status, headers={**CORS, **headers}, body=json.dumps(body), content_type="application/json")
        if u.hostname == "image.tmdb.org":
            return route.fulfill(body=(ROOT / "icon-180.png").read_bytes(), content_type="image/png")
        if req.url.startswith(SITE + "/"):
            if u.path == "/config.js":
                return route.fulfill(body=CONFIG, content_type="application/javascript")
            f = ROOT / (u.path.lstrip("/") or "index.html")
            if f.is_file():
                return route.fulfill(body=f.read_bytes(), content_type=TYPES.get(f.suffix.lstrip("."), "application/octet-stream"))
            return route.fulfill(status=404, body="")
        return route.abort()

    # ---------- démarrage ----------
    def open(self, seed=None, path="/"):
        self.page.add_init_script(f"window.__SEED = {json.dumps(seed or {})};")
        self.page.goto(SITE + path)
        return self

    def login(self, password="bonmotdepasse1"):
        p = self.page
        p.click("#modeLogin")
        p.fill("#authEmail", "lolo@test.fr")
        p.fill("#authPass", password)
        p.click("#authSubmit")
        return self

    def start(self, seed=None):
        """Connecté, dans le salon « Canapé », pile de cartes chargée."""
        self.open({"logged": True, **(seed or {})}, "/?salon=ABCD2345")
        self.page.click("#joinInviteBtn")
        self.wait_cards()
        return self

    # ---------- raccourcis ----------
    def wait_cards(self):
        self.page.wait_for_selector(".card:not(.back):not(.back2) h2")

    def top(self):
        return self.page.text_content(".card:not(.back):not(.back2) h2")

    def db(self, table):
        return self.page.evaluate(f"window.__db.{table}")

    def my_verdicts(self):
        return {r["movie_id"]: r["verdict"] for r in self.db("user_swipes") if r["user_id"] == "u_me"}

    def notice(self):
        n = self.page.locator("#notice")
        return n.inner_text() if n.is_visible() else ""

    def close(self):
        self.ctx.close()


@pytest.fixture
def app(browser):
    a = App(browser)
    yield a
    a.close()
    real = [e for e in a.errors if "net::ERR_FAILED" not in e and "Failed to load resource" not in e]
    assert not real, "erreurs dans la page : " + " | ".join(real)
