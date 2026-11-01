#!/usr/bin/env bash
# Lance tous les tests disponibles sur cette machine (ceux dont l'outil manque sont sautés).
set -uo pipefail
cd "$(dirname "$0")"
fail=0
step(){ echo; echo "── $1"; }

step "Modules du site (Node)"
if command -v node >/dev/null; then
  [ -d node_modules ] || npm install --silent
  node check-modules.mjs || fail=1
else echo "Node absent : sauté"; fi

step "Parcours dans le navigateur (Python + Playwright)"
if python3 -c "import playwright, pytest" 2>/dev/null; then
  python3 -m pytest -q e2e || fail=1
else echo "pytest ou playwright absent : sauté (pip install pytest playwright && python3 -m playwright install chromium)"; fi

step "Relais TMDB (Deno)"
if command -v deno >/dev/null; then
  SINEMA_NO_SERVE=1 TMDB_TOKEN=test SUPABASE_URL=https://x.supabase.co deno test --allow-env function/ || fail=1
else echo "Deno absent : sauté"; fi

step "Schéma Supabase (PostgreSQL)"
if command -v psql >/dev/null && psql -d postgres -c "select 1" >/dev/null 2>&1; then
  ./sql/run.sh || fail=1
else echo "PostgreSQL injoignable : sauté"; fi

echo
[ $fail = 0 ] && echo "✔ Tout est vert" || echo "✘ Des tests ont échoué"
exit $fail
