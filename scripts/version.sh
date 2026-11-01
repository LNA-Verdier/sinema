#!/usr/bin/env bash
# Met le même numéro de version (?v=AAAAMMJJHHMM) sur tous les fichiers du site,
# pour que les navigateurs rechargent les nouvelles versions au lieu de garder l'ancienne en cache.
# À lancer avant chaque commit qui modifie le site :  ./scripts/version.sh
set -euo pipefail
cd "$(dirname "$0")/.."
v=$(date -u +%Y%m%d%H%M)
files=(index.html manifest.webmanifest js/*.js)
[ -f sw.js ] && files+=(sw.js)
sed -i -E "s/\?v=[0-9]{12}/?v=$v/g" "${files[@]}"
echo "Version $v"
