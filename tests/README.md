# Tests de Sinema

Les tests n'utilisent ni le vrai Supabase ni le vrai TMDB : un faux Supabase (`e2e/fake_supabase.js`) et un faux TMDB (`e2e/fake_tmdb.py`) répondent à leur place. Rien n'est écrit dans la vraie base.

| Dossier | Ce qui est testé | Outil |
|---|---|---|
| `check-modules.mjs` | chaque nom utilisé est déclaré ou importé, les imports existent, un seul numéro de version | Node |
| `e2e/` | le vrai site dans Chromium : compte, salons, swipe, matchs, watchlist, filtres, profil, relais TMDB, « trop de requêtes », hors connexion | Python, pytest, Playwright |
| `function/` | le relais TMDB (`supabase/functions/tmdb`) : chemins autorisés, connexion exigée, limite de débit | Deno |
| `sql/` | `supabase/schema.sql` : fonctions, limites, règles d'accès entre personnes | PostgreSQL |

## Lancer

```bash
./tests/run.sh          # tout ce qui est installé sur la machine
```

Installation (une fois) :

```bash
pip install pytest playwright && python3 -m playwright install chromium   # parcours dans le navigateur
cd tests && npm install                                                   # vérification des modules
curl -fsSL https://deno.land/install.sh | sh                              # relais TMDB (facultatif)
```

Pour les tests SQL, il faut un PostgreSQL local, par exemple avec Docker :

```bash
docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=pg --name pg postgres:16
PGHOST=localhost PGUSER=postgres PGPASSWORD=pg ./tests/sql/run.sh
```

Un seul test : `python3 -m pytest -q tests/e2e/test_filtres.py -k anime`.

Les tests tournent aussi automatiquement sur GitHub à chaque envoi (onglet *Actions* du dépôt).
