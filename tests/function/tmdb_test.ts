// Tests du relais TMDB :  SINEMA_NO_SERVE=1 TMDB_TOKEN=test SUPABASE_URL=https://x.supabase.co deno test --allow-env tests/function/
import { handle } from "../../supabase/functions/tmdb/index.ts";

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (claims: Record<string, unknown>) => `x.${b64(claims)}.sig`;
const USER = jwt({ role: "authenticated", sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600 });
const ORIGIN = "https://lna-verdier.github.io";
const req = (q: string, token = USER, method = "GET") =>
  new Request(`https://x.supabase.co/functions/v1/tmdb?${q}`, { method, headers: { authorization: `Bearer ${token}`, origin: ORIGIN } });

let seen: string[] = [];
// faux Supabase Auth : seul le jeton USER correspond à une vraie session
const fake = (status = 200, headers: Record<string, string> = {}) => ((url: string, init: RequestInit) => {
  const auth = (init.headers as Record<string, string>).Authorization;
  if (url.endsWith("/auth/v1/user"))
    return Promise.resolve(auth === `Bearer ${USER}` ? Response.json({ id: "u1" }) : new Response("{}", { status: 401 }));
  seen.push(url + " | " + auth);
  return Promise.resolve(new Response('{"ok":true}', { status, headers }));
}) as unknown as typeof fetch;
const eq = (a: unknown, b: unknown, msg: string) => { if (a !== b) throw new Error(`${msg} : ${a} au lieu de ${b}`); };

Deno.test("relaie une recherche autorisée avec le jeton secret", async () => {
  seen = [];
  const r = await handle(req("p=/discover/movie&page=2&with_genres=18|35"), fake());
  eq(r.status, 200, "statut");
  eq(seen[0], "https://api.themoviedb.org/3/discover/movie?page=2&with_genres=18%7C35 | Bearer test", "appel TMDB");
  eq(r.headers.get("access-control-allow-origin"), ORIGIN, "CORS");
  eq(r.headers.get("cache-control"), "private, max-age=600", "cache");
});
Deno.test("préflight CORS", async () => {
  const r = await handle(req("", USER, "OPTIONS"), fake());
  eq(r.status, 204, "statut");
});
Deno.test("refuse une personne non connectée (clé publique seule)", async () => {
  const r = await handle(req("p=/discover/movie", jwt({ role: "anon" })), fake());
  eq(r.status, 401, "statut");
});
Deno.test("refuse un jeton expiré", async () => {
  const r = await handle(req("p=/discover/movie", jwt({ role: "authenticated", sub: "u1", exp: 1 })), fake());
  eq(r.status, 401, "statut");
});
Deno.test("refuse un jeton falsifié (inconnu de Supabase Auth)", async () => {
  const forged = jwt({ role: "authenticated", sub: "u1", exp: Math.floor(Date.now() / 1000) + 600 });
  const r = await handle(req("p=/discover/movie", forged), fake());
  eq(r.status, 401, "statut");
});
Deno.test("refuse les chemins non prévus", async () => {
  for (const p of ["/account", "/movie/12/../../account", "/authentication/token/new", "/movie/12/rating"]) {
    const r = await handle(req("p=" + encodeURIComponent(p)), fake());
    eq(r.status, 400, p);
  }
});
Deno.test("refuse un paramètre api_key", async () => {
  const r = await handle(req("p=/discover/movie&api_key=abc"), fake());
  eq(r.status, 400, "statut");
});
Deno.test("refuse les écritures", async () => {
  const r = await handle(req("p=/discover/movie", USER, "POST"), fake());
  eq(r.status, 405, "statut");
});
Deno.test("transmet le « trop de requêtes » de TMDB avec son délai", async () => {
  const r = await handle(req("p=/movie/550"), fake(429, { "retry-after": "3" }));
  eq(r.status, 429, "statut");
  eq(r.headers.get("retry-after"), "3", "délai");
});
Deno.test("un jeton TMDB refusé devient une erreur du relais", async () => {
  const r = await handle(req("p=/movie/550"), fake(401));
  eq(r.status, 502, "statut");
});
