// Sinema · relais TMDB (Supabase Edge Function « tmdb »)
//
// Le site appelle  GET /functions/v1/tmdb?p=/discover/movie&page=2&…
// La fonction ajoute le jeton TMDB (secret TMDB_TOKEN, jamais envoyé au navigateur)
// et relaie la réponse. Seules les lectures utilisées par Sinema sont autorisées,
// et seulement pour une personne connectée.
//
// Secrets à définir (Edge Functions → Secrets) :
//   TMDB_TOKEN       jeton « API Read Access Token » de TMDB (obligatoire)
//   ALLOWED_ORIGINS  adresses du site séparées par des virgules (facultatif)
// SUPABASE_URL est fourni automatiquement par Supabase.

const TMDB = "https://api.themoviedb.org/3";
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ||
  "https://lna-verdier.github.io,http://localhost:8000,http://127.0.0.1:8000").split(",").map((s) => s.trim());

// chemins TMDB autorisés, et durée de cache conseillée au navigateur (secondes)
const ROUTES: [RegExp, number][] = [
  [/^\/discover\/(movie|tv)$/, 600],
  [/^\/genre\/(movie|tv)\/list$/, 86400],
  [/^\/watch\/providers\/(movie|tv)$/, 86400],
  [/^\/(movie|tv)\/\d{1,9}$/, 3600],
  [/^\/search\/person$/, 600],
  [/^\/person\/\d{1,9}\/movie_credits$/, 3600],
];
const PARAM = /^[a-z_.]{1,40}$/;

// limite par personne, au mieux (chaque instance de la fonction a son propre compteur)
const PER_MINUTE = 240;
const hits = new Map<string, { n: number; t: number }>();
function tooMany(user: string): boolean {
  const now = Date.now(), h = hits.get(user);
  if (!h || now - h.t > 60_000) { hits.set(user, { n: 1, t: now }); if (hits.size > 5000) hits.clear(); return false; }
  return ++h.n > PER_MINUTE;
}

function cors(origin: string | null): Record<string, string> {
  const ok = origin && ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin! : ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// La personne doit être connectée : son jeton de session est vérifié auprès de Supabase Auth
// (fonctionne quel que soit le type de clés de signature du projet), puis gardé en mémoire 10 minutes.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const verified = new Map<string, number>(); // jeton -> valable jusqu'à (ms)
async function userOf(req: Request, fetcher: typeof fetch): Promise<string | null> {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+([\w-]+\.([\w-]+)\.[\w-]+)$/);
  if (!m) return null;
  let claims;
  try {
    const b64 = m[2].replace(/-/g, "+").replace(/_/g, "/");
    claims = JSON.parse(atob(b64 + "=".repeat((4 - b64.length % 4) % 4)));
  } catch { return null; }
  // la clé publique seule (rôle « anon ») ne suffit pas
  if (claims.role !== "authenticated" || !claims.sub) return null;
  if (!claims.exp || claims.exp * 1000 < Date.now()) return null;
  const token = m[1], sub = String(claims.sub);
  if ((verified.get(token) || 0) > Date.now()) return sub;
  try {
    const apikey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
    const r = await fetcher(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey } });
    if (!r.ok) return null;
    const u = await r.json();
    if (u?.id !== sub) return null;
  } catch { return null; }
  if (verified.size > 5000) verified.clear();
  verified.set(token, Math.min(claims.exp * 1000, Date.now() + 10 * 60_000));
  return sub;
}

export async function handle(req: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  const headers = cors(req.headers.get("origin"));
  const reply = (status: number, body: unknown, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json", ...extra } });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "GET") return reply(405, { error: "method_not_allowed" });

  const user = await userOf(req, fetcher);
  if (!user) return reply(401, { error: "not_signed_in" });
  if (tooMany(user)) return reply(429, { error: "too_many_requests" }, { "Retry-After": "20" });

  const url = new URL(req.url);
  const path = url.searchParams.get("p") || "";
  const route = ROUTES.find(([re]) => re.test(path));
  if (!route) return reply(400, { error: "path_not_allowed" });

  const qs = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    if (k === "p") continue;
    if (!PARAM.test(k) || k === "api_key" || v.length > 300) return reply(400, { error: "param_not_allowed", param: k });
    qs.append(k, v);
  }

  const token = Deno.env.get("TMDB_TOKEN");
  if (!token) return reply(500, { error: "missing_tmdb_token" });

  let r: Response;
  try {
    r = await fetcher(`${TMDB}${path}?${qs}`, { headers: { Authorization: `Bearer ${token}`, accept: "application/json" } });
  } catch {
    return reply(502, { error: "tmdb_unreachable" });
  }
  const extra: Record<string, string> = { "Content-Type": "application/json" };
  if (r.status === 429) extra["Retry-After"] = r.headers.get("retry-after") || "2";
  else if (r.ok) extra["Cache-Control"] = `private, max-age=${route[1]}`;
  // un refus de TMDB dû au jeton est un problème de configuration du relais, pas de la personne
  const status = r.status === 401 ? 502 : r.status;
  return new Response(r.body, { status, headers: { ...headers, ...extra } });
}

// (les tests importent handle() sans démarrer de serveur)
if (!Deno.env.get("SINEMA_NO_SERVE")) Deno.serve((req) => handle(req));
