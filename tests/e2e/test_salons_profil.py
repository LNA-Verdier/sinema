"""Menu des salons et profil."""


def test_code_masque_puis_affiche(app):
    app.start()
    p = app.page
    p.click("#menuBtn")
    assert "ABCD2345" not in p.inner_text("#menuSheet"), "le code reste caché par défaut"
    p.click("#revealCode")
    assert p.inner_text("#shareCode") == "ABCD2345"


def test_creer_et_renommer_un_salon(app):
    app.start()
    p = app.page
    p.click("#menuBtn")
    p.click("#newRoomBtn")
    p.fill("#menuRoomName", "Potes")
    p.click("#menuCreateBtn")
    p.wait_for_timeout(600)
    assert p.inner_text("#roomName") == "Potes"
    if not p.is_visible("#menuSheet"):
        p.click("#menuBtn")
    p.fill("#renameInput", "Les potes")
    p.click("#renameBtn")
    p.wait_for_timeout(300)
    assert any(r["name"] == "Les potes" for r in app.db("rooms"))


def test_profil_pseudo_et_avatar(app):
    app.start()
    p = app.page
    p.click("#menuBtn")
    p.click("#profileBtn")
    p.fill("#pseudoInput", "Loïc")
    p.click("#avBases button >> nth=2")
    p.click("#saveProfile")
    p.wait_for_timeout(400)
    calls = [a for f, a in p.evaluate("window.__rpc") if f == "set_profile"]
    assert calls and calls[-1]["p_name"] == "Loïc" and calls[-1]["p_avatar"]
