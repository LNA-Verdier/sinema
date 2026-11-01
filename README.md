# Ciné à deux

Choisir un film à deux sans débat : chacun swipe de son côté, et quand vous avez tous les deux envie du même film, il rejoint votre liste commune.

- **Envie** (→), **Bof** (←), **Déjà vu** (↑), **Plus tard** (↓), annuler (retour arrière)
- **Match** : envie des deux côtés. **Match à revoir** : l'un a envie, l'autre l'a déjà vu.
- Affiches, résumés et plateformes de streaming en France via TMDB
- Synchronisation en temps réel via Supabase, sans création de compte (connexion anonyme)
- Un salon par couple, rejoint avec un lien ou un code à 6 caractères

## Stack

Site statique (HTML/CSS/JS, sans build) hébergé sur GitHub Pages, base Supabase (Postgres + temps réel), données TMDB.

## Installation

1. **Supabase** : créer un projet, activer *Authentication → Sign In / Providers → Allow anonymous sign-ins*, puis exécuter `supabase/schema.sql` dans *SQL Editor*.
2. **TMDB** : créer une clé API et récupérer le *API Read Access Token*.
3. Renseigner `config.js` (URL Supabase, clé `anon`, jeton TMDB).
4. **GitHub Pages** : *Settings → Pages → Deploy from a branch → main / (root)*.

Pour tester en local : `python3 -m http.server 8000` puis ouvrir http://localhost:8000.

## Sécurité

- La clé Supabase `anon` est publique par conception. Les règles RLS de `schema.sql` limitent chaque personne aux salons dont elle est membre, et chacun ne peut modifier que ses propres swipes.
- Le jeton TMDB est visible dans le code du site. Acceptable pour un usage personnel non commercial. Pour une ouverture au public, le faire passer par une fonction serveur (Supabase Edge Function).
- La connexion anonyme est liée au navigateur : vider les données du site fait perdre son identité dans le salon.

Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB.
