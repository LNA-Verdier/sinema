# Sinema

Choisir un film à deux sans débat : chacun swipe de son côté, et quand vous avez tous les deux envie du même film, il rejoint votre liste commune.

- **Envie** (→), **Bof** (←), **Déjà vu** (↑), **Plus tard** (↓), annuler (retour arrière)
- **Match** : envie des deux côtés. **Match à revoir** : l'un a envie, l'autre l'a déjà vu.
- Affiches, résumés et plateformes de streaming en France via TMDB
- Comptes e-mail + mot de passe avec confirmation d'e-mail, profil retrouvé sur tous les appareils
- Synchronisation en temps réel via Supabase
- Un salon par couple, rejoint avec un lien ou un code à 8 caractères

## Stack

Site statique (HTML/CSS/JS, sans build) hébergé sur GitHub Pages, base Supabase (Postgres + temps réel), données TMDB.

## Installation

1. **Supabase** : créer un projet (région Europe), puis exécuter `supabase/schema.sql` dans *SQL Editor*.
   - *Authentication → Sign In / Providers → Email* : activé, *Confirm email* coché, mot de passe de 10 caractères minimum avec lettres et chiffres.
   - *Authentication → URL Configuration* : *Site URL* et *Redirect URLs* = `https://lna-verdier.github.io/sinema/`.
   - *Authentication → Emails → SMTP Settings* : un service d'envoi (Brevo, Resend…) est nécessaire pour envoyer les e-mails à d'autres adresses que celles de l'équipe Supabase.
2. **TMDB** : créer une clé API et récupérer le *API Read Access Token*.
3. Renseigner `config.js` (URL Supabase, clé `anon`, jeton TMDB).
4. **GitHub Pages** : *Settings → Pages → Deploy from a branch → main / (root)*.

Pour tester en local : `python3 -m http.server 8000` puis ouvrir http://localhost:8000.

## Sécurité

- La clé Supabase `anon` est publique par conception. Les règles RLS de `schema.sql` limitent chaque personne aux salons dont elle est membre, et chacun ne peut modifier que ses propres swipes.
- Le jeton TMDB est visible dans le code du site. Acceptable pour un usage personnel non commercial. Pour une ouverture au public, le faire passer par une fonction serveur (Supabase Edge Function).
- Limites anti-abus (modifiables dans `sinema_limits()`) : 3 salons créés par personne, 4 membres par salon, 8 codes erronés par quart d'heure.
- Les mots de passe sont gérés et chiffrés par Supabase (bcrypt), jamais par le code du site.

Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB.
