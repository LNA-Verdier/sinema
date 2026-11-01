"""Parcours principaux : compte, salon, swipe, matchs, watchlist."""


def test_connexion_mauvais_mot_de_passe(app):
    app.open(path="/")
    app.login(password="faux")
    app.page.wait_for_timeout(300)
    assert "incorrect" in app.notice().lower()


def test_rejoindre_par_lien_puis_swiper(app):
    app.open(path="/?salon=ABCD2345").login()
    p = app.page
    p.wait_for_selector("#joinInvite:visible")
    p.click("#joinInviteBtn")
    app.wait_cards()
    assert p.inner_text("#roomName") == "Canapé"
    assert "ABCD2345" not in p.inner_text("header"), "le code d'invitation ne doit pas apparaître"
    first = app.top()
    p.click("#nope")
    p.wait_for_timeout(450)
    assert app.top() != first
    assert app.my_verdicts()[int(first.split()[-1])] == "nope"


def test_match_et_liste_commune(app):
    # Camille a envie de « Film Trois » : il doit finir par arriver dans la pile
    app.start()
    p = app.page
    for _ in range(25):
        if app.top() == "Film Trois":
            break
        p.click("#nope"); p.wait_for_timeout(380)
    assert app.top() == "Film Trois", "un film aimé par l'autre doit être proposé rapidement"
    p.click("#like")
    p.wait_for_selector("#match:visible")
    assert "Film Trois" in p.inner_text("#matchTitle")
    p.click("#tab-matches"); p.wait_for_timeout(400)
    assert "Film Trois" in p.inner_text("#mlist")
    # « Marquer vu » : mon choix devient « déjà vu »
    p.click("#mlist button:has-text('Marquer vu')"); p.wait_for_timeout(300)
    assert app.my_verdicts()[3] == "seen"


def test_pas_d_indice_sur_les_cartes(app):
    app.start()
    assert "Camille" not in app.page.inner_text("#stage"), "swipe à l'aveugle : aucune mention des envies des autres"


def test_annuler(app):
    app.start()
    p = app.page
    first = app.top()
    p.click("#like"); p.wait_for_timeout(450)
    p.click("#undo"); p.wait_for_timeout(450)
    assert app.top() == first
    assert int(first.split()[-1]) not in app.my_verdicts()


def test_watchlist_compteurs_et_recherche(app):
    app.start()
    p = app.page
    for a in ["like", "like", "nope"]:
        p.click("#" + a); p.wait_for_timeout(450)
    p.click("#tab-mine"); p.wait_for_timeout(400)
    assert p.inner_text("#n-like") == "2" and p.inner_text("#n-nope") == "1"
    title = p.inner_text("#minelist .row >> nth=0 >> .t")
    p.fill("#mineSearch", title); p.wait_for_timeout(200)
    assert p.locator("#minelist .row").count() == 1
    assert p.inner_text("#n-like") == "2", "la recherche ne change pas les compteurs"
    # en revenant au swipe, la recherche est effacée
    p.click("#tab-swipe"); p.click("#tab-mine"); p.wait_for_timeout(300)
    assert p.input_value("#mineSearch") == ""


def test_series(app):
    app.start()
    p = app.page
    p.click("#typeSeg button[data-v=tv]")
    p.wait_for_function("document.querySelector('.card:not(.back):not(.back2) h2')?.textContent.startsWith('Série')")
    assert app.tmdb.discover("tv"), "la pile des séries interroge /discover/tv"
