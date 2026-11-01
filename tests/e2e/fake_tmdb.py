"""Faux TMDB pour les tests : réponses fixes et journal des appels."""
import re

GENRES_MOVIE = [{"id": 18, "name": "Drame"}, {"id": 35, "name": "Comédie"}, {"id": 878, "name": "Science-Fiction"}, {"id": 16, "name": "Animation"}]
GENRES_TV = [{"id": 18, "name": "Drame"}, {"id": 10765, "name": "Science-Fiction & Fantastique"}]


class FakeTmdb:
    def __init__(self):
        self.calls = []          # (chemin, paramètres)
        self.fail_next = []      # statuts à renvoyer avant les vraies réponses, ex. [429]

    def discover(self, kind):
        return [dict(q) for p, q in self.calls if p == f"/discover/{kind}"]

    def respond(self, path, qs):
        """Renvoie (statut, en-têtes, corps JSON)."""
        self.calls.append((path, qs))
        if self.fail_next:
            status = self.fail_next.pop(0)
            return status, {"Retry-After": "1"}, {"status_message": "trop de requêtes"}
        page = int(qs.get("page", 1))
        if path == "/genre/movie/list":
            return 200, {}, {"genres": GENRES_MOVIE}
        if path == "/genre/tv/list":
            return 200, {}, {"genres": GENRES_TV}
        if path == "/discover/movie":
            base = (page - 1) * 20
            return 200, {}, {"page": page, "total_pages": 40, "results": [
                {"id": base + i, "title": f"Film {base + i}", "release_date": "2015-01-01", "poster_path": f"/p{base + i}.jpg",
                 "overview": "Court.", "genre_ids": [18 if i % 2 else 35], "vote_average": 7.3, "original_language": "fr"}
                for i in range(1, 21)]}
        if path == "/discover/tv":
            return 200, {}, {"page": page, "total_pages": 5, "results": [
                {"id": 500 + i, "name": f"Série {500 + i}", "first_air_date": "2019-03-01", "poster_path": "/s.jpg",
                 "overview": "Une série.", "genre_ids": [18], "vote_average": 8.1} for i in range(1, 21)]}
        if re.fullmatch(r"/tv/\d+", path):
            return 200, {}, {"name": "Série", "episode_run_time": [52], "number_of_seasons": 3, "created_by": [{"name": "Créatrice Une"}],
                             "credits": {"cast": [{"name": "Acteur A"}]},
                             "watch/providers": {"results": {"FR": {"link": "https://x", "flatrate": [{"provider_id": 337, "provider_name": "Arte", "logo_path": "/a.jpg"}]}}}}
        if re.fullmatch(r"/movie/\d+", path):
            return 200, {}, {"title": "Film", "runtime": 127, "release_date": "2015-01-01",
                             "credits": {"crew": [{"job": "Director", "name": "Jean Réalisateur"}],
                                         "cast": [{"name": "Acteur Un"}, {"name": "Actrice Deux"}, {"name": "Acteur Trois"}]},
                             "release_dates": {"results": [{"iso_3166_1": "FR", "release_dates": [{"type": 3, "release_date": "2015-01-01T00:00:00Z"}]}]},
                             "watch/providers": {"results": {"FR": {"link": "https://x", "flatrate": [{"provider_id": 8, "provider_name": "Netflix", "logo_path": "/n.jpg"}]}}}}
        if path == "/search/person":
            return 200, {}, {"results": [
                {"id": 1, "name": "Agnès Varda", "known_for_department": "Directing", "profile_path": "/av.jpg", "known_for": [{"title": "Cléo de 5 à 7"}]},
                {"id": 2, "name": "Agnès Jaoui", "known_for_department": "Acting", "profile_path": None, "known_for": [{"title": "Le Goût des autres"}]}]}
        if re.fullmatch(r"/person/\d+/movie_credits", path):
            mk = lambda i: {"id": i, "title": f"Film {i}", "release_date": "2001-01-01", "poster_path": f"/p{i}.jpg", "genre_ids": [18], "vote_average": 7}
            return 200, {}, {"crew": [{**mk(4), "job": "Director"}, {**mk(8), "job": "Director"}, {**mk(12), "job": "Producer"}], "cast": []}
        if re.fullmatch(r"/watch/providers/(movie|tv)", path):
            return 200, {}, {"results": [{"provider_id": 8, "provider_name": "Netflix", "logo_path": "/n.jpg", "display_priorities": {"FR": 1}},
                                         {"provider_id": 337, "provider_name": "Disney Plus", "logo_path": "/d.jpg", "display_priorities": {"FR": 2}}]}
        return 404, {}, {"status_message": "inconnu"}
