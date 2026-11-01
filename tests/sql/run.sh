#!/usr/bin/env bash
# Teste supabase/schema.sql sur un Postgres local (base jetable « sinema_test »).
#   ./tests/sql/run.sh            (utilise psql avec les réglages par défaut : PGHOST, PGUSER…)
# Avec Docker :  docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=pg --name pg postgres:16
#                PGHOST=localhost PGUSER=postgres PGPASSWORD=pg ./tests/sql/run.sh
set -euo pipefail
cd "$(dirname "$0")"
psql -q -d postgres -c "drop database if exists sinema_test" -c "create database sinema_test"
psql -q -v ON_ERROR_STOP=1 -d sinema_test -f stubs.sql 2>&1 | grep -v NOTICE || true
# deux fois : le script doit pouvoir être relancé sans erreur
PGOPTIONS="-c client_min_messages=warning" psql -q -v ON_ERROR_STOP=1 -d sinema_test -f ../../supabase/schema.sql
PGOPTIONS="-c client_min_messages=warning" psql -q -v ON_ERROR_STOP=1 -d sinema_test -f ../../supabase/schema.sql
psql -q -v ON_ERROR_STOP=1 -d sinema_test -f test_schema.sql 2>&1 | sed 's/^psql:[^:]*:[0-9]*: NOTICE:  /  /'
psql -q -d postgres -c "drop database sinema_test"
