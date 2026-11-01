-- Tests du schéma : fonctions, limites et règles d'accès (RLS).
-- Chaque vérification lève une erreur si elle échoue (psql s'arrête avec ON_ERROR_STOP).
\set ON_ERROR_STOP on
\o /dev/null
grant select, insert, update, delete on all tables in schema public to authenticated;

create or replace function pg_temp.ok(cond boolean, what text) returns void language plpgsql as
$$ begin if cond is not true then raise exception 'ÉCHEC : %', what; end if; raise notice 'ok : %', what; end $$;
create or replace function pg_temp.fails(stmt text, expected text, what text) returns void language plpgsql as
$$ begin execute stmt; raise exception 'ÉCHEC (aucune erreur) : %', what;
   exception when others then
     if sqlerrm like 'ÉCHEC%' then raise; end if;
     if sqlerrm not like '%' || expected || '%' then raise exception 'ÉCHEC : % (erreur « % »)', what, sqlerrm; end if;
     raise notice 'ok : %', what; end $$;
create or replace function pg_temp.as_user(u text) returns void language sql as
$$ select set_config('request.uid', u, false) $$;

-- Lolo crée un salon
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
set role authenticated;
select public.create_room('Lolo', 'Canapé') as code \gset
select pg_temp.ok(:'code' ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$', 'code de 8 caractères sans ambiguïté');
select pg_temp.ok((select name from rooms where code = :'code') = 'Canapé', 'nom du salon enregistré');
insert into user_swipes(user_id, movie_id, verdict, movie) values (auth.uid(), 550, 'like', '{"title":"Fight Club"}');

-- Camille rejoint avec le code, une inconnue ne voit rien
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.ok((select count(*) from rooms) = 0, 'avant de rejoindre, aucun salon visible');
select pg_temp.ok((select count(*) from user_swipes) = 0, 'avant de rejoindre, aucun choix des autres visible');
select pg_temp.ok(public.join_room(lower(:'code'), 'Camille') is not null, 'rejoindre avec le code (minuscules acceptées)');
select pg_temp.ok((select count(*) from members) = 2, 'les deux membres sont visibles');
select pg_temp.ok((select verdict from user_swipes where movie_id = 550) = 'like', 'les choix des membres du salon sont lisibles');
select pg_temp.ok(public.join_room('ZZZZZZZZ', 'Camille') is null, 'code inconnu : null, sans erreur');

-- Camille ne peut ni écrire à la place de Lolo, ni modifier ses choix
select pg_temp.fails($$insert into user_swipes(user_id, movie_id, verdict) values ('11111111-1111-1111-1111-111111111111', 1, 'like')$$,
  'row-level security', 'impossible d''ajouter un choix au nom de quelqu''un d''autre');
update user_swipes set verdict = 'nope' where movie_id = 550;
delete from user_swipes where movie_id = 550;
select pg_temp.ok((select verdict from user_swipes where movie_id = 550) = 'like', 'impossible de modifier ou supprimer le choix d''un autre');
select pg_temp.fails($$insert into user_swipes(movie_id, verdict) values (2, 'super')$$, 'check', 'verdict inconnu refusé');
select pg_temp.fails($$insert into user_swipes(movie_id, verdict, movie) values (3, 'like', jsonb_build_object('x', repeat('a', 5000)))$$, 'check', 'fiche de film trop lourde refusée');

-- profil et salon
select public.set_profile('Cam', '{"b":"alien","c":3}');
select pg_temp.ok((select name from members where user_id = auth.uid() limit 1) = 'Cam', 'pseudo mis à jour');
select public.rename_room((select id from rooms limit 1), 'Salon de Cam');
select pg_temp.ok((select name from rooms limit 1) = 'Salon de Cam', 'renommer le salon');

-- limite de codes erronés
select pg_temp.fails($$select public.join_room('ZZZZZZZZ', 'C') from generate_series(1, 9)$$, 'too_many_attempts', '8 codes erronés par quart d''heure au plus');

-- limite de membres
select set_config('request.uid', gen_random_uuid()::text, false), public.join_room(:'code', 'M' || g) from generate_series(3, 12) g;
select pg_temp.as_user('99999999-9999-9999-9999-999999999999');
select pg_temp.fails(format('select public.join_room(%L, %L)', :'code', 'Treize'), 'room_full', '12 membres par salon au plus');

-- limite de salons créés
select pg_temp.fails($$select public.create_room('X') from generate_series(1, 11)$$, 'too_many_rooms', '10 salons créés par personne au plus');

-- quitter : le salon disparaît avec son dernier membre
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select public.create_room('Solo', 'Seul') as solo \gset
select public.leave_room((select id from rooms where code = :'solo'));
reset role;
select pg_temp.ok(not exists (select 1 from rooms where code = :'solo'), 'salon supprimé quand le dernier membre part');
\echo '✔ schéma : tous les tests passent'
