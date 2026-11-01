# Sinema

Choisir un film sans débat : chacun swipe de son côté, et quand tout le salon a envie du même film, il rejoint votre liste commune.

- **Envie** (→), **Bof** (←), **Déjà vu** (↑), **Plus tard** (↓), annuler (retour arrière)
- **Match** : envie des deux côtés. **Match à revoir** : l'un a envie, l'autre l'a déjà vu.
- Affiches, résumés et plateformes de streaming en France via TMDB
- Comptes e-mail + mot de passe avec confirmation d'e-mail, profil retrouvé sur tous les appareils
- Synchronisation en temps réel via Supabase
- Plusieurs salons par personne (couple, amis, coloc…), nommés, jusqu'à 12 membres, rejoints avec un lien ou un code à 8 caractères
- Les choix sont liés à la personne et valent dans tous ses salons : en rejoignant un salon, les films en commun apparaissent immédiatement
- Salons de 3 personnes ou plus : « match » quand tout le monde a envie, et « x/n envies » dès que 2 personnes ont envie
- Onglet « Ma watchlist » pour revoir et modifier ses envies, bofs et déjà vus
- Filtres : mode Populaires / Mélange / Pépites, genre, période, note minimale, pays de production, réalisateur ou acteur (avec suggestions)
- Films et séries (bascule en haut de l'écran de swipe, filtres mémorisés séparément)
- Où regarder : « Chez moi » (tout ce qui est sorti, sauf les films encore à l'affiche en France) ou « Au cinéma », avec une option stricte « disponible tout de suite » et le choix de ses plateformes
- Réalisation et casting affichés sur chaque carte, avec un lien « Où le voir » et un lien vers la fiche TMDB
- Recherche et filtre Films / Séries dans « Ma watchlist »
- Hors connexion : le site s'ouvre sans réseau, les listes restent consultables, les choix faits hors ligne partent au retour du réseau
- Profil : pseudo, avatar personnalisable (10 personnages, 10 couleurs, accessoires), changement d'e-mail (lien de confirmation) et de mot de passe (code envoyé par e-mail)

## Stack

Site statique (HTML/CSS/JS, sans build) hébergé sur GitHub Pages, base Supabase (Postgres + temps réel), données TMDB via un relais Supabase (Edge Function).

```
index.html, style.css     la page et son style
config.js                 adresse et clé publique Supabase
js/main.js                point d'entrée : démarrage, onglets, rendu global, hors connexion
js/core.js                utilitaires, accès TMDB (relais, nouvelles tentatives), état partagé
js/auth.js                compte : inscription, connexion, mot de passe
js/rooms.js               salons, temps réel, calcul des matchs, pastilles
js/deck.js                pile de cartes : filtres TMDB, remplissage, swipe, boîte d'envoi hors ligne
js/lists.js               « Nos matchs » et « Ma watchlist »
js/sheets.js              menu, filtres, profil
js/avatars.js             avatars personnalisables
sw.js                     service worker (mode hors connexion, cache des affiches)
supabase/schema.sql       tables, fonctions et règles d'accès
supabase/functions/tmdb   relais TMDB (garde le jeton secret)
tests/                    tests automatiques (voir tests/README.md)
scripts/version.sh        numéro de version anti-cache, à lancer avant chaque commit
```

## Installation

1. **Supabase** : créer un projet (région Europe), puis exécuter `supabase/schema.sql` dans *SQL Editor*.
   - *Authentication → Sign In / Providers → Email* : activé, *Confirm email* coché, mot de passe de 10 caractères minimum avec lettres et chiffres.
   - *Authentication → URL Configuration* : *Site URL* et *Redirect URLs* = `https://lna-verdier.github.io/sinema/`.
   - *Authentication → Emails → SMTP Settings* : un service d'envoi (Brevo, Resend…) est nécessaire pour envoyer les e-mails à d'autres adresses que celles de l'équipe Supabase.
2. **TMDB** : créer une clé API et récupérer le *API Read Access Token*.
3. **Relais TMDB** : *Edge Functions → Deploy a new function → Via Editor*, nommer la fonction `tmdb`, coller `supabase/functions/tmdb/index.ts`, garder *Verify JWT* activé et déployer. Puis *Edge Functions → Secrets* : ajouter `TMDB_TOKEN` (le jeton TMDB). Avec la CLI : `supabase functions deploy tmdb` et `supabase secrets set TMDB_TOKEN=…`.
4. Renseigner `config.js` (URL Supabase, clé `anon`, `TMDB_TOKEN` vide).
5. **GitHub Pages** : *Settings → Pages → Deploy from a branch → main / (root)*.

Pour tester en local : `python3 -m http.server 8000` puis ouvrir http://localhost:8000.

## Sécurité

- La clé Supabase `anon` est publique par conception. Les règles RLS de `schema.sql` limitent chaque personne aux salons dont elle est membre, et chacun ne peut modifier que ses propres swipes.
- Le jeton TMDB reste côté serveur : le site passe par le relais `tmdb`, qui n'accepte que les personnes connectées, uniquement les lectures utiles à Sinema, avec une limite de débit par personne.
- En cas de « trop de requêtes » de TMDB, le site patiente et réessaie (au plus 6 appels en parallèle).
- À la déconnexion, les données gardées pour le mode hors connexion sont effacées de l'appareil.
- Limites anti-abus (modifiables dans `sinema_limits()`) : 10 salons créés par personne, 12 membres par salon, 8 codes erronés par quart d'heure.
- Les mots de passe sont gérés et chiffrés par Supabase (bcrypt), jamais par le code du site.

Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB.

## Licence

© 2026 Loïc Verdier, tous droits réservés. Voir [LICENSE](LICENSE).
