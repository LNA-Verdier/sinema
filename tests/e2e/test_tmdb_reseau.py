"""Relais TMDB, limite de débit et mode hors connexion."""


def test_passe_par_le_relais_avec_la_session(app):
    app.start()
    assert app.tmdb.calls, "les appels TMDB passent par la fonction Supabase « tmdb »"


def test_trop_de_requetes_on_reessaie(app):
    app.tmdb.fail_next = [429, 429]
    app.start()
    assert app.top(), "les cartes arrivent après les nouvelles tentatives"
    assert app.notice() == ""


def test_hors_connexion_les_choix_partent_au_retour(app):
    app.start()
    p = app.page
    p.wait_for_timeout(600)  # fiches détaillées chargées
    p.evaluate("window.__netDown = true")
    app.ctx.set_offline(True)
    p.wait_for_timeout(100)
    assert "Hors connexion" in app.notice()
    first = int(app.top().split()[-1])
    p.click("#like"); p.wait_for_timeout(450)
    assert first not in app.my_verdicts()
    assert str(first) in p.evaluate("localStorage.getItem('sinema-outbox')")
    assert "Hors connexion" in app.notice(), "pas d'erreur rouge, juste le bandeau"
    p.evaluate("window.__netDown = false")
    app.ctx.set_offline(False)
    p.wait_for_timeout(600)
    assert app.my_verdicts().get(first) == "like", "le choix est envoyé au retour du réseau"
    assert not p.evaluate("localStorage.getItem('sinema-outbox')")
    assert app.notice() == ""
