"""Filtres : ce que Sinema demande à TMDB."""


def last_discover(app):
    return app.tmdb.discover("movie")[-1]


def apply(app):
    app.page.click("#applyFilters")
    app.page.wait_for_timeout(500)


def pick(app, button, labels):
    p = app.page
    p.click(button)
    for l in labels:
        p.click(f"#pickerList button:has-text('{l}')")
    p.click("#pickerDone")


def test_par_defaut_chez_moi_sans_films_a_l_affiche(app):
    app.start()
    q = last_discover(app)
    assert q.get("sort_by", "").startswith("popularity"), q
    assert "release_date.lte" in q or "primary_release_date.lte" in q, "seulement des films déjà sortis"


def test_genres_cumulatifs_note_pays(app):
    app.start()
    p = app.page
    p.click("#filtersBtn")
    pick(app, "#genreBtn", ["Drame", "Comédie"])
    p.click("#rateSeg button[data-v='7']")
    pick(app, "#countryBtn", ["France", "Japon"])
    apply(app)
    q = last_discover(app)
    assert set(q["with_genres"].split("|")) == {"18", "35"}, "plusieurs genres = l'un OU l'autre"
    assert q["vote_average.gte"] == "7"
    assert set(q["with_origin_country"].split("|")) == {"FR", "JP"}
    assert p.inner_text("#fcount") == "3"


def test_anime(app):
    app.start()
    p = app.page
    p.click("#filtersBtn")
    pick(app, "#genreBtn", ["Anime"])
    apply(app)
    q = last_discover(app)
    assert q["with_genres"] == "16" and q["with_original_language"] == "ja"


def test_au_cinema(app):
    app.start()
    p = app.page
    p.click("#filtersBtn")
    p.click("#availSeg button[data-v=cinema]")
    apply(app)
    q = last_discover(app)
    assert q.get("with_release_type") == "3|2" and q.get("region") == "FR"


def test_realisatrice_avec_suggestions(app):
    app.start()
    p = app.page
    p.click("#filtersBtn")
    p.fill("#fPerson", "Agn")
    p.wait_for_selector("#personList button")
    assert "Agnès Varda" in p.inner_text("#personList")
    p.click("#personList button >> nth=0")
    assert "Varda" in p.inner_text("#personLabel")
    apply(app)
    p.wait_for_timeout(500)
    # seuls les films réalisés par elle (4 et 8), pas celui qu'elle a seulement produit (12)
    seen = set()
    for _ in range(4):
        t = app.top()
        if not t:
            break
        seen.add(t)
        p.click("#nope"); p.wait_for_timeout(420)
        if p.locator(".card:not(.back):not(.back2) h2").count() == 0:
            break
    assert seen <= {"Film 4", "Film 8"} and seen, seen
