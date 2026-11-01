import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, TMDB_TOKEN } from "./config.js";

// ================== Utilitaires ==================
const $ = id => document.getElementById(id);
const LS = { get(k){ try{ return localStorage.getItem(k); }catch{ return null; } }, set(k,v){ try{ localStorage.setItem(k,v); }catch{} } };
const IMG = (path, size="w500") => path ? `https://image.tmdb.org/t/p/${size}${path}` : "";
const fmtMins = m => m ? `${Math.floor(m/60)} h ${String(m%60).padStart(2,"0")}` : "";
const COLORS = ["#D9361E","#2A6FDB","#1E8F5A","#A33DB8","#C98B1E","#0E8C9B","#B8476B"];
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const HOME = location.origin + location.pathname;
const ICON = {
  like:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>`,
  nope:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  seen:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
  trash:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>`,
};

function showNotice(t){ const n=$("notice"); n.textContent=t||""; n.hidden=!t; }
function reportError(err){
  console.error(err);
  showNotice("Oups, une erreur est survenue : « "+((err && err.message) || err)+" ». Recharge la page, et si ça persiste envoie ce message à Claude.");
}
window.addEventListener("error", e => reportError(e.error || e.message));
window.addEventListener("unhandledrejection", e => reportError(e.reason));

// ---------- Barres de choix avec curseur animé ----------
function segInit(seg, onChange){
  if (!seg.querySelector(".ind")){ const i=document.createElement("span"); i.className="ind"; seg.prepend(i); }
  seg.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { segSelect(seg, b); onChange && onChange(b); }));
  segMove(seg, false);
}
function segSelect(seg, btn){
  seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-selected", b === btn));
  segMove(seg, true);
}
function segSelectBy(seg, pred){ const b=[...seg.querySelectorAll("button")].find(pred); if (b) segSelect(seg, b); }
function segMove(seg, animate){
  const ind = seg.querySelector(".ind"), btn = seg.querySelector('button[aria-selected="true"]');
  if (!ind || !btn || !btn.offsetWidth) return;
  if (!animate) ind.style.transition = "none";
  ind.style.width = btn.offsetWidth + "px";
  ind.style.transform = `translateX(${btn.offsetLeft}px)`;
  if (!animate){ ind.offsetWidth; ind.style.transition = ""; }
}
const segValue = seg => seg.querySelector('button[aria-selected="true"]')?.dataset.v ?? "";
const allSegs = () => document.querySelectorAll(".seg");
window.addEventListener("resize", () => allSegs().forEach(s => segMove(s, false)));
// une barre devenue visible (onglet, feuille ouverte) doit recalculer son curseur
const refreshSegs = () => requestAnimationFrame(() => allSegs().forEach(s => segMove(s, false)));

// ================== TMDB ==================
async function tmdb(path, params = {}){
  const qs = new URLSearchParams({ language: "fr-FR", ...params });
  const r = await fetch(`https://api.themoviedb.org/3${path}?${qs}`, { headers: { Authorization: `Bearer ${TMDB_TOKEN}`, accept: "application/json" } });
  if (r.status === 401) throw new Error("Jeton TMDB refusé : vérifie TMDB_TOKEN dans config.js");
  if (!r.ok) throw new Error(`TMDB a répondu ${r.status}`);
  return r.json();
}
let GENRE_NAMES = {};
const details = new Map();
function getDetails(id){
  if (!details.has(id)) details.set(id, tmdb(`/movie/${id}`, { append_to_response: "watch/providers" }).then(d => ({
    runtime: d.runtime,
    providers: ((d["watch/providers"]?.results?.FR?.flatrate) || []).slice(0,5).map(p=>({ name:p.provider_name, logo:p.logo_path })),
    link: d["watch/providers"]?.results?.FR?.link || `https://www.themoviedb.org/movie/${id}`,
  })).catch(() => null));
  return details.get(id);
}
const snapshot = m => ({ id:m.id, title:m.title, year:m.year, poster:m.poster, overview:(m.overview||"").slice(0,600), genres:m.genres, vote:m.vote });
function normalize(m){
  return { id:m.id, title:m.title, year:(m.release_date||"").slice(0,4), poster:m.poster_path, overview:m.overview,
    genres:(m.genre_ids||[]).map(g=>GENRE_NAMES[g]).filter(Boolean).slice(0,3), vote:m.vote_average };
}

// ================== État ==================
const DEFAULT_FILTERS = { mode:"top", genre:"", period:"", rating:"", country:"" };
const S = {
  me:null, email:"", name:"",
  rooms:[],               // [{ id, code, name }]
  room:null,              // salon courant
  members:{},             // user_id -> pseudo (salon courant)
  mine:new Map(),         // movie_id -> { verdict, movie }  (mes choix, tous salons)
  theirs:new Map(),       // user_id -> Map(movie_id -> { verdict, movie })  (autres membres du salon)
  watched:new Set(),
  filters:{ ...DEFAULT_FILTERS, ...JSON.parse(LS.get("sinema-filters") || "{}") },
  queue:[], pageOrder:null, pageIdx:0, totalPages:1, loading:false,
  history:[], busy:false, channel:null, view:"swipe", mineTab:"like",
};
let sb;

// ================== Démarrage ==================
async function boot(){
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TMDB_TOKEN){
    showNotice("Configuration incomplète : renseigne SUPABASE_URL, SUPABASE_ANON_KEY et TMDB_TOKEN dans config.js.");
    return;
  }
  ["tabs","authSeg","mineSeg","modeSeg","rateSeg"].forEach(id => segInit($(id), b => onSeg(id, b)));
  const url = new URL(location.href);
  const h = location.hash.slice(1);
  const invite = (url.searchParams.get("salon") || (/^[A-Za-z0-9]{6,8}$/.test(h) ? h : "")).toUpperCase();
  if (invite) LS.set("cad-invite", invite);
  const isRecovery = /type=recovery/.test(location.hash);

  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:"implicit" } });
  const { data:{ session } } = await sb.auth.getSession();
  if (location.search || location.hash) history.replaceState(null, "", location.pathname);
  if (isRecovery && session) return showReset();
  if (!session) return showAuth("signup");
  await afterLogin(session);
}

function onSeg(id, btn){
  if (id === "tabs") setView(btn.dataset.view);
  else if (id === "authSeg") setAuthMode(btn.id === "modeLogin" ? "login" : "signup");
  else if (id === "mineSeg"){ S.mineTab = btn.dataset.v; renderMine(); }
  else if (id === "modeSeg") modeHelp();
}

async function afterLogin(session){
  ["view-auth","view-reset"].forEach(v => $(v).hidden = true);
  S.me = session.user.id;
  S.email = session.user.email || "";
  S.name = session.user.user_metadata?.name || LS.get("cad-name") || (S.email.split("@")[0]);
  const [g] = await Promise.all([ tmdb("/genre/movie/list"), loadMine(), loadRooms() ]);
  GENRE_NAMES = Object.fromEntries(g.genres.map(x=>[x.id,x.name]));
  const sel = $("fGenre"); sel.length = 1;
  g.genres.forEach(x => { const o=document.createElement("option"); o.value=x.id; o.textContent=x.name; sel.appendChild(o); });
  subscribeMine();

  const invite = LS.get("cad-invite");
  if (invite){
    LS.set("cad-invite","");
    const known = S.rooms.find(r => r.code === invite);
    if (known) return openRoom(known);
    return onboard(invite);
  }
  const saved = S.rooms.find(r => r.code === LS.get("cad-room")) || S.rooms[0];
  if (saved) return openRoom(saved);
  onboard(null);
}

async function loadMine(){
  const { data, error } = await sb.from("user_swipes").select("movie_id,verdict,movie,updated_at").eq("user_id", S.me);
  if (error) throw error;
  S.mine = new Map(data.map(r => [r.movie_id, { verdict:r.verdict, movie:r.movie, at:r.updated_at }]));
}
async function loadRooms(){
  const { data, error } = await sb.from("members").select("joined_at, rooms(id,code,name)").eq("user_id", S.me).order("joined_at", { ascending:true });
  if (error) throw error;
  S.rooms = data.map(r => r.rooms).filter(Boolean);
}
const roomLabel = r => r?.name || `Salon ${r?.code || ""}`;

// ================== Compte ==================
const redirectHome = () => { const c = LS.get("cad-invite"); return c ? `${HOME}?salon=${c}` : HOME; };
const PASS_OK = p => p.length >= 10 && /[A-Za-z]/.test(p) && /\d/.test(p);
function authMessage(err){
  const m = (err && err.message) || String(err);
  if (/Invalid login credentials/i.test(m)) return "E-mail ou mot de passe incorrect.";
  if (/Email not confirmed/i.test(m)) return "Ton e-mail n'est pas encore confirmé. Clique sur le lien reçu, ou renvoie-le.";
  if (/already registered|already been registered/i.test(m)) return "Un compte existe déjà avec cet e-mail. Connecte-toi.";
  if (/rate limit|too many/i.test(m)) return "Trop de tentatives ou d'e-mails envoyés. Réessaie dans un moment.";
  if (/Password should|weak password/i.test(m)) return "Mot de passe trop faible : 10 caractères minimum, avec des lettres et des chiffres.";
  if (/valid email|invalid format/i.test(m)) return "Cette adresse e-mail n'est pas valide.";
  if (/not authorized/i.test(m)) return "L'envoi d'e-mails n'est pas encore configuré pour cette adresse (voir les réglages SMTP de Supabase).";
  return m;
}
let authMode = "signup";
function setAuthMode(mode){
  authMode = mode;
  segSelectBy($("authSeg"), b => b.id === (mode === "login" ? "modeLogin" : "modeSignup"));
  $("signupOnly").hidden = mode !== "signup"; $("forgotBtn").hidden = mode !== "login";
  $("authSubmit").textContent = mode === "signup" ? "Créer mon compte" : "Se connecter";
  $("authPass").autocomplete = mode === "signup" ? "new-password" : "current-password";
}
function showAuth(mode){
  $("view-auth").hidden = false; $("authForm").hidden = false; $("checkMail").hidden = true;
  $("authName").value = LS.get("cad-name") || ""; setAuthMode(mode); refreshSegs();
}
function showCheckMail(email){ $("authForm").hidden = true; $("checkMail").hidden = false; $("checkMailTo").textContent = email; }
$("authForm").onsubmit = async e => {
  e.preventDefault(); showNotice("");
  const email = $("authEmail").value.trim(), password = $("authPass").value, name = $("authName").value.trim();
  if (!email){ showNotice("Indique ton e-mail."); return; }
  const btn = $("authSubmit"); btn.disabled = true;
  try{
    if (authMode === "signup"){
      if (!name){ showNotice("Indique ton pseudo."); return; }
      if (!PASS_OK(password)){ showNotice("Mot de passe trop faible : 10 caractères minimum, avec des lettres et des chiffres."); return; }
      const { data, error } = await sb.auth.signUp({ email, password, options:{ data:{ name }, emailRedirectTo: redirectHome() } });
      if (error) throw error;
      LS.set("cad-name", name);
      if (data.session) return afterLogin(data.session);
      if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length){ setAuthMode("login"); showNotice("Un compte existe déjà avec cet e-mail. Connecte-toi."); return; }
      showCheckMail(email);
    } else {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error){ if (/Email not confirmed/i.test(error.message)) showCheckMail(email); throw error; }
      await afterLogin(data.session);
    }
  } catch(err){ showNotice(authMessage(err)); }
  finally { btn.disabled = false; }
};
$("resendBtn").onclick = async () => {
  const { error } = await sb.auth.resend({ type:"signup", email:$("checkMailTo").textContent, options:{ emailRedirectTo: redirectHome() } });
  showNotice(error ? authMessage(error) : "E-mail renvoyé.");
};
$("backToLogin").onclick = () => showAuth("login");
$("forgotBtn").onclick = async () => {
  const email = $("authEmail").value.trim();
  if (!email){ showNotice("Indique d'abord ton e-mail, puis clique sur « Mot de passe oublié ? »."); $("authEmail").focus(); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: HOME });
  showNotice(error ? authMessage(error) : "Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé.");
};
function showReset(){ $("view-reset").hidden = false; $("view-auth").hidden = true; }
$("resetForm").onsubmit = async e => {
  e.preventDefault();
  const password = $("resetPass").value;
  if (!PASS_OK(password)){ showNotice("Mot de passe trop faible : 10 caractères minimum, avec des lettres et des chiffres."); return; }
  const { error } = await sb.auth.updateUser({ password });
  if (error){ showNotice(authMessage(error)); return; }
  showNotice("Mot de passe modifié.");
  const { data:{ session } } = await sb.auth.getSession();
  await afterLogin(session);
};
async function logout(){
  await sb.auth.signOut();
  LS.set("cad-room",""); location.href = HOME;
}

// ================== Salons ==================
function onboard(code){
  ["view-swipe","view-matches","view-mine"].forEach(v => $(v).hidden = true);
  $("tabs").hidden = true; $("menuBtn").hidden = !S.rooms.length;
  $("view-onboard").hidden = false;
  $("joinInvite").hidden = !code; $("firstRoom").hidden = !!code;
  $("onboardTitle").textContent = code ? "On t'attend !" : "Crée ton premier salon";
  $("onboardLead").hidden = !!code;
  if (code) $("joinCodeLabel").textContent = code;
  $("joinInviteBtn").onclick = () => joinRoom(code);
}
$("firstCreateBtn").onclick = () => createRoom($("newRoomName").value);
$("joinCodeBtn").onclick = () => joinRoom($("codeInput").value);
$("menuCreateBtn").onclick = () => createRoom($("menuRoomName").value);
$("menuJoinBtn").onclick = () => joinRoom($("menuCode").value);

async function createRoom(roomName){
  showNotice("");
  const { data:code, error } = await sb.rpc("create_room", { p_name: S.name, p_room_name: (roomName||"").trim() || null });
  if (error){
    if (/too_many_rooms/.test(error.message)) return showNotice("Tu as atteint la limite de 10 salons créés. Rejoins plutôt un salon existant avec son code.");
    return reportError(error);
  }
  await loadRooms();
  closeSheets();
  await openRoom(S.rooms.find(r => r.code === code), { justCreated:true });
}

async function joinRoom(raw){
  showNotice("");
  const code = (raw||"").trim().toUpperCase();
  if (code.length !== 6 && code.length !== 8) return showNotice("Le code d'invitation fait 8 caractères.");
  const { data:roomId, error } = await sb.rpc("join_room", { p_code: code, p_name: S.name });
  if (error){
    if (/too_many_attempts/.test(error.message)) return showNotice("Trop de codes erronés. Réessaie dans un quart d'heure.");
    if (/room_full/.test(error.message)) return showNotice("Ce salon est complet (12 personnes maximum).");
    return reportError(error);
  }
  if (!roomId) return showNotice("Ce salon n'existe pas. Vérifie le code.");
  await loadRooms();
  closeSheets();
  await openRoom(S.rooms.find(r => r.id === roomId), { justJoined:true });
}

async function openRoom(room, { justCreated=false, justJoined=false } = {}){
  if (!room) return onboard(null);
  S.room = room; LS.set("cad-room", room.code);
  $("roomName").textContent = roomLabel(room);
  $("view-onboard").hidden = true; $("menuBtn").hidden = false; $("tabs").hidden = false;
  showNotice("");
  await loadRoom();
  subscribeRoom();
  S.history = [];
  await refill(true);
  setView(justCreated ? "swipe" : S.view);
  renderAll();
  if (justCreated) openMenu();
  if (justJoined){
    const n = matchList().filter(x => x.kind !== "partial").length;
    if (n) showNotice(`Bienvenue ! Grâce à vos choix passés, vous avez déjà ${n} film${n>1?"s":""} en commun dans ce salon.`);
  }
}

async function loadRoom(){
  const [m, w] = await Promise.all([
    sb.from("members").select("user_id,name").eq("room_id", S.room.id),
    sb.from("watched").select("movie_id").eq("room_id", S.room.id),
  ]);
  for (const r of [m,w]) if (r.error) throw r.error;
  S.members = Object.fromEntries(m.data.map(x=>[x.user_id, x.name]));
  S.watched = new Set(w.data.map(x=>x.movie_id));
  const others = Object.keys(S.members).filter(u => u !== S.me);
  S.theirs = new Map(others.map(u => [u, new Map()]));
  if (others.length){
    const { data, error } = await sb.from("user_swipes").select("user_id,movie_id,verdict,movie").in("user_id", others);
    if (error) throw error;
    data.forEach(r => S.theirs.get(r.user_id)?.set(r.movie_id, { verdict:r.verdict, movie:r.movie }));
  }
}

// Mes choix faits sur un autre appareil arrivent en direct
function subscribeMine(){
  sb.channel("mine-"+S.me)
    .on("postgres_changes", { event:"*", schema:"public", table:"user_swipes", filter:`user_id=eq.${S.me}` }, ({ eventType, new:n, old:o }) => {
      if (eventType === "DELETE") S.mine.delete(o.movie_id);
      else S.mine.set(n.movie_id, { verdict:n.verdict, movie:n.movie, at:n.updated_at });
      renderMatches(); renderMine();
    }).subscribe();
}

function subscribeRoom(){
  if (S.channel) sb.removeChannel(S.channel);
  const roomId = S.room.id, f = `room_id=eq.${roomId}`;
  S.channel = sb.channel("room-"+roomId)
    .on("postgres_changes", { event:"*", schema:"public", table:"user_swipes" }, ({ eventType, new:n, old:o }) => {
      const row = eventType === "DELETE" ? o : n;
      if (!row || row.user_id === S.me || !S.theirs.has(row.user_id)) return;
      const before = matchKind(row.movie_id);
      if (eventType === "DELETE") S.theirs.get(row.user_id).delete(row.movie_id);
      else S.theirs.get(row.user_id).set(row.movie_id, { verdict:n.verdict, movie:n.movie });
      const after = matchKind(row.movie_id);
      if (after && after !== "partial" && after !== before) celebrate(row.movie_id, after);
      if (n?.verdict === "like" && !S.mine.has(n.movie_id) && !S.queue.some(q=>q.id===n.movie_id) && n.movie?.title && filterOk(n.movie)){
        S.queue.splice(Math.min(2, S.queue.length), 0, n.movie);
      }
      renderAll();
    })
    .on("postgres_changes", { event:"*", schema:"public", table:"watched", filter:f }, ({ eventType, new:n, old:o }) => {
      if (eventType === "DELETE"){ if (o.room_id !== roomId) return; S.watched.delete(o.movie_id); } else S.watched.add(n.movie_id);
      renderMatches();
    })
    .on("postgres_changes", { event:"*", schema:"public", table:"members", filter:f }, async () => {
      try{ await loadRoom(); renderAll(); }catch(err){ reportError(err); }
    })
    .on("postgres_changes", { event:"UPDATE", schema:"public", table:"rooms", filter:`id=eq.${roomId}` }, ({ new:n }) => {
      S.room.name = n.name; const r = S.rooms.find(x => x.id === roomId); if (r) r.name = n.name;
      $("roomName").textContent = roomLabel(S.room); renderMenu();
    })
    .subscribe();
}
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && S.room){ try{ await Promise.all([loadMine(), loadRoom()]); renderAll(); }catch(err){ reportError(err); } }
});

// ================== Calcul des films en commun ==================
const others = () => Object.keys(S.members).filter(u => u !== S.me);
const nameOf = u => S.members[u] || "quelqu'un";
const namesOf = us => { const n = us.map(nameOf); return n.length <= 1 ? (n[0]||"") : n.slice(0,-1).join(", ") + " et " + n.at(-1); };
const verdictOf = (u, id) => u === S.me ? S.mine.get(id)?.verdict : S.theirs.get(u)?.get(id)?.verdict;
const othersWith = (id, v) => others().filter(u => verdictOf(u, id) === v);
const movieOf = id => S.mine.get(id)?.movie || [...S.theirs.values()].map(m => m.get(id)?.movie).find(m => m?.title) || {};

// match : tout le monde a envie. revoir : tout le monde a envie ou l'a déjà vu (au moins une envie, au moins un déjà vu).
// partial (salons de 3+) : au moins 2 envies sans unanimité.
function matchKind(id){
  const ids = [S.me, ...others()];
  if (ids.length < 2) return null;
  const v = ids.map(u => verdictOf(u, id));
  const likes = v.filter(x => x === "like").length, seens = v.filter(x => x === "seen").length;
  if (likes === ids.length) return "match";
  if (likes >= 1 && seens >= 1 && likes + seens === ids.length) return "revoir";
  if (ids.length >= 3 && likes >= 2) return "partial";
  return null;
}
function matchList(){
  const seen = new Set([...S.mine.keys(), ...[...S.theirs.values()].flatMap(m => [...m.keys()])]);
  const out = [];
  for (const id of seen){ const k = matchKind(id); if (k) out.push({ id, kind:k, movie:movieOf(id), likes:[S.me,...others()].filter(u => verdictOf(u,id)==="like").length }); }
  return out;
}

// ================== Filtres et pile de films ==================
function filterOk(m){
  const f = S.filters;
  if (f.genre && !(m.genres||[]).includes(GENRE_NAMES[f.genre])) return false;
  if (f.period){ const [a,b] = f.period.split("-"); const y = +m.year; if (!y || (a && y < +a) || (b && y > +b)) return false; }
  if (f.rating && (m.vote||0) < +f.rating) return false;
  return true; // le pays n'est pas connu dans l'instantané : on n'exclut pas
}
function discoverParams(page){
  const f = S.filters;
  const p = { include_adult:"false", page:String(page) };
  if (f.mode === "gems"){ p.sort_by = "vote_average.desc"; p["vote_count.gte"] = "60"; p["vote_count.lte"] = "1500"; p["vote_average.gte"] = f.rating || "6.8"; }
  else if (f.mode === "mix"){ p.sort_by = "popularity.desc"; p["vote_count.gte"] = "80"; }
  else { p.sort_by = "popularity.desc"; p["vote_count.gte"] = "300"; }
  if (f.rating && f.mode !== "gems") p["vote_average.gte"] = f.rating;
  if (f.genre) p.with_genres = f.genre;
  if (f.country) p.with_origin_country = f.country;
  if (f.period){
    const [a,b] = f.period.split("-");
    if (a) p["primary_release_date.gte"] = `${a}-01-01`;
    if (b) p["primary_release_date.lte"] = `${b}-12-31`;
  }
  return p;
}
const shuffle = a => { for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };

async function refill(reset = false){
  if (reset){
    S.queue = []; S.pageOrder = null; S.pageIdx = 0; S.totalPages = 1;
    // d'abord les films que les autres membres ont aimés et que je n'ai pas encore swipés
    const pending = new Map();
    for (const m of S.theirs.values()) for (const [id, e] of m){
      if (e.verdict === "like" && !S.mine.has(id) && e.movie?.title && filterOk(e.movie)) pending.set(id, e.movie);
    }
    S.queue.push(...shuffle([...pending.values()]));
  }
  if (S.loading) return;
  S.loading = true;
  try{
    let guard = 0;
    while (S.queue.length < 8 && guard++ < 6){
      let page;
      if (S.filters.mode === "mix" && S.pageOrder){ if (S.pageIdx >= S.pageOrder.length) break; page = S.pageOrder[S.pageIdx++]; }
      else { if (S.pageIdx >= Math.min(S.totalPages, 500)) break; page = ++S.pageIdx; }
      const d = await tmdb("/discover/movie", discoverParams(page));
      S.totalPages = d.total_pages || 1;
      if (S.filters.mode === "mix" && !S.pageOrder){
        S.pageOrder = shuffle(Array.from({ length: Math.min(S.totalPages, 300) - 1 }, (_, i) => i + 2)); S.pageIdx = 0;
      }
      const inQueue = new Set(S.queue.map(q=>q.id));
      let batch = d.results.map(normalize).filter(m => !S.mine.has(m.id) && !inQueue.has(m.id));
      if (S.filters.mode === "mix") batch = shuffle(batch);
      S.queue.push(...batch);
    }
  } finally { S.loading = false; }
}

// ================== Rendu ==================
function cardEl(m, cls){
  const el = document.createElement("article");
  el.className = "card " + (cls||"");
  el.innerHTML = `
    ${m.poster ? `<img class="poster" alt="" draggable="false">` : `<div class="noposter"></div>`}
    <div class="shade"></div>
    <div class="hint yes">Envie</div><div class="hint no">Bof</div><div class="hint vu">Déjà vu</div>
    <div class="info">
      <div class="genres"></div>
      <h2></h2>
      <div class="meta"><span class="year"></span><span class="rating"></span><span class="dur"></span></div>
      <p class="overview"></p>
      <button class="more" type="button" hidden>Voir plus</button>
      <div class="providers"></div>
    </div>`;
  if (m.poster){ const img = el.querySelector("img.poster"); img.src = IMG(m.poster, "w780"); img.alt = "Affiche : " + m.title; }
  else el.querySelector(".noposter").textContent = m.title;
  (m.genres||[]).forEach(g => { const s=document.createElement("span"); s.textContent=g; el.querySelector(".genres").appendChild(s); });
  el.querySelector("h2").textContent = m.title;
  el.querySelector(".year").textContent = m.year || "";
  el.querySelector(".rating").textContent = m.vote ? `★ ${m.vote.toFixed(1)}` : "";
  el.querySelector(".overview").textContent = m.overview || "Pas de résumé en français.";
  const fans = othersWith(m.id, "like");
  if (fans.length){ const p=document.createElement("div"); p.className="partner"; p.textContent=`${namesOf(fans)} ${fans.length>1?"ont":"a"} envie de le voir`; el.appendChild(p); }
  return el;
}
function setupMore(el){
  const ov = el.querySelector(".overview"), more = el.querySelector(".more");
  requestAnimationFrame(() => { more.hidden = ov.scrollHeight <= ov.clientHeight + 2; });
  more.addEventListener("pointerdown", e => e.stopPropagation());
  more.addEventListener("click", e => { e.stopPropagation(); const open = el.classList.toggle("open"); more.textContent = open ? "Voir moins" : "Voir plus"; });
  ov.addEventListener("pointerdown", e => { if (el.classList.contains("open")) e.stopPropagation(); });
}

async function fillDetails(el, m){
  const d = await getDetails(m.id);
  if (!d || !el.isConnected) return;
  el.querySelector(".dur").textContent = fmtMins(d.runtime);
  const pv = el.querySelector(".providers"); pv.innerHTML = "";
  if (d.providers.length) d.providers.forEach(p => { const i=document.createElement("img"); i.src=IMG(p.logo,"w92"); i.alt=p.name; i.title=p.name; pv.appendChild(i); });
  else { const s=document.createElement("span"); s.className="none"; s.textContent="Pas en streaming par abonnement en France"; pv.appendChild(s); }
  const a = document.createElement("a"); a.className="tmdblink"; a.href=d.link; a.target="_blank"; a.rel="noopener"; a.textContent="Où le voir ↗";
  a.addEventListener("pointerdown", e => e.stopPropagation());
  pv.appendChild(a);
}

function renderStage(){
  const st = $("stage"); st.innerHTML = "";
  const top3 = S.queue.slice(0,3);
  if (!top3.length){
    const e=document.createElement("div"); e.className="empty";
    e.innerHTML = `<strong></strong><span></span>`;
    e.querySelector("strong").textContent = S.loading ? "Chargement…" : "Pile terminée";
    e.querySelector("span").textContent = S.loading ? "On cherche des films pour vous." : "Plus de films pour ces filtres. Élargis-les ou passe en mode Mélange.";
    st.appendChild(e);
  }
  top3.slice().reverse().forEach((m, ri) => {
    const idx = top3.length-1-ri;
    const el = cardEl(m, idx===0 ? "" : idx===1 ? "back" : "back2");
    st.appendChild(el);
    if (idx === 0){ attachDrag(el); setupMore(el); fillDetails(el, m); }
  });
  S.queue.slice(3,6).forEach(m => { if (m.poster){ const i=new Image(); i.src=IMG(m.poster,"w780"); } });
  ["like","nope","vu","skip"].forEach(b => $(b).disabled = !top3.length);
  $("undo").disabled = !S.history.length;
}

function renderPeople(){
  const p = $("people"); p.innerHTML = "";
  const ids = [S.me, ...others()];
  ids.slice(0,5).forEach((u, i) => {
    const c = document.createElement("span"); c.className = "chip";
    const n = (u === S.me ? S.name : nameOf(u)) || "?";
    c.innerHTML = `<i></i><b></b>`;
    c.querySelector("i").textContent = n.slice(0,1).toUpperCase(); c.querySelector("i").style.background = COLORS[i % COLORS.length];
    c.querySelector("b").textContent = u === S.me ? `${n} (toi)` : n;
    p.appendChild(c);
  });
  if (ids.length > 5){ const s=document.createElement("span"); s.textContent=`+${ids.length-5}`; p.appendChild(s); }
  if (!others().length){ const s=document.createElement("button"); s.className="linkbtn"; s.type="button"; s.textContent="Invite quelqu'un"; s.onclick=openMenu; p.appendChild(s); }
}

function rowEl(m, id){
  const row = document.createElement("div"); row.className = "row";
  row.innerHTML = `${m.poster ? `<img alt="">` : `<div class="mini"></div>`}<div class="info"><div class="t"></div><div class="m"></div><div class="pv"></div></div><div class="side"></div>`;
  if (m.poster){ const i=row.querySelector("img"); i.src=IMG(m.poster,"w185"); i.alt="Affiche : "+(m.title||""); i.loading="lazy"; }
  row.querySelector(".t").appendChild(document.createTextNode(m.title || `Film ${id}`));
  row.querySelector(".m").textContent = [m.year, (m.genres||[]).join(", ")].filter(Boolean).join(" · ");
  return row;
}

function renderMatches(){
  const all = matchList();
  const order = { match:0, revoir:1, partial:2 };
  $("mcount").textContent = all.filter(x => x.kind !== "partial" && !S.watched.has(x.id)).length;
  const list = $("mlist"); list.innerHTML = "";
  const hide = $("hideSeen").checked;
  const shown = all.filter(x => !(hide && S.watched.has(x.id)))
    .sort((a,b) => (S.watched.has(a.id) - S.watched.has(b.id)) || order[a.kind]-order[b.kind] || b.likes-a.likes);
  if (!shown.length){
    const e=document.createElement("div"); e.className="lempty";
    e.textContent = all.length ? "Tous vos films en commun sont marqués comme vus."
      : others().length ? "Pas encore de film en commun. Continuez à swiper : les films que les autres aiment remontent dans ta pile."
      : "Invite quelqu'un dans ce salon depuis le menu en haut à droite.";
    list.appendChild(e); return;
  }
  const n = others().length + 1;
  shown.forEach(({ id, kind, movie:m, likes }) => {
    const done = S.watched.has(id);
    const row = rowEl(m, id); if (done) row.classList.add("done");
    const t = row.querySelector(".t");
    if (kind !== "match"){ const k=document.createElement("span"); k.className="kind"+(kind==="partial"?" part":""); k.textContent = kind==="revoir" ? "À revoir" : `${likes}/${n} envies`; t.prepend(k); }
    if (kind === "revoir"){ const who = [S.me,...others()].filter(u => verdictOf(u,id)==="seen").map(u => u===S.me?"toi":nameOf(u)); row.querySelector(".m").textContent += ` · déjà vu par ${who.join(", ")}`; }
    getDetails(id).then(d => { if (!d) return; const pv=row.querySelector(".pv"); d.providers.forEach(p => { const i=document.createElement("img"); i.src=IMG(p.logo,"w92"); i.alt=p.name; i.title=p.name; pv.appendChild(i); }); });
    const b = document.createElement("button"); b.className="seen"; b.type="button"; b.textContent = done ? "Vu ✓" : "Marquer vu";
    b.onclick = () => toggleWatched(id);
    row.querySelector(".side").appendChild(b);
    list.appendChild(row);
  });
}

function renderMine(){
  const counts = { like:0, nope:0, seen:0 };
  for (const e of S.mine.values()) counts[e.verdict]++;
  Object.entries(counts).forEach(([k,v]) => $("n-"+k).textContent = v);
  const list = $("minelist"); list.innerHTML = "";
  const items = [...S.mine.entries()].filter(([,e]) => e.verdict === S.mineTab).sort((a,b) => (b[1].at||"").localeCompare(a[1].at||""));
  if (!items.length){
    const e=document.createElement("div"); e.className="lempty";
    e.textContent = { like:"Aucune envie pour l'instant.", nope:"Aucun film écarté.", seen:"Aucun film marqué déjà vu." }[S.mineTab];
    list.appendChild(e); return;
  }
  items.forEach(([id, e]) => {
    const row = rowEl(e.movie || {}, id);
    const v = document.createElement("div"); v.className = "verdicts";
    [["like","Envie"],["seen","Déjà vu"],["nope","Bof"]].forEach(([k,label]) => {
      const b=document.createElement("button"); b.type="button"; b.dataset.v=k; b.title=label; b.setAttribute("aria-label",label);
      b.setAttribute("aria-pressed", e.verdict===k); b.innerHTML = ICON[k];
      b.onclick = () => setVerdict(id, k, e.movie);
      v.appendChild(b);
    });
    const del=document.createElement("button"); del.type="button"; del.title="Retirer (le film reviendra dans ta pile)"; del.setAttribute("aria-label","Retirer"); del.innerHTML=ICON.trash;
    del.onclick = () => removeVerdict(id);
    v.appendChild(del);
    row.querySelector(".side").appendChild(v);
    list.appendChild(row);
  });
}

function renderMenu(){
  const list = $("roomList"); list.innerHTML = "";
  S.rooms.forEach(r => {
    const b = document.createElement("button"); b.type="button"; b.className="roomitem";
    b.setAttribute("aria-current", S.room && r.id === S.room.id);
    b.innerHTML = `<b></b><span></span>`;
    b.querySelector("b").textContent = roomLabel(r);
    b.querySelector("span").textContent = S.room && r.id === S.room.id ? "actuel" : r.code;
    b.onclick = async () => { if (S.room?.id === r.id) return closeSheets(); closeSheets(); try{ await openRoom(r); }catch(err){ reportError(err); } };
    list.appendChild(b);
  });
  $("currentRoom").hidden = !S.room;
  if (S.room){
    $("renameInput").value = S.room.name || "";
    $("shareCode").textContent = S.room.code;
    $("shareLink").value = `${HOME}?salon=${S.room.code}`;
  }
  $("pseudoInput").value = S.name; $("accountEmail").textContent = S.email;
  $("leaveConfirm").hidden = true;
}

function renderFilters(){
  const f = S.filters;
  segSelectBy($("modeSeg"), b => b.dataset.v === f.mode);
  segSelectBy($("rateSeg"), b => b.dataset.v === f.rating);
  $("fGenre").value = f.genre; $("fPeriod").value = f.period; $("fCountry").value = f.country;
  modeHelp();
}
function modeHelp(){
  $("modeHelp").textContent = { top:"Les films les plus populaires du moment, puis de moins en moins connus.",
    mix:"Un tirage au hasard parmi des milliers de films, connus ou non.",
    gems:"Des films très bien notés mais peu vus : de quoi faire des découvertes." }[segValue($("modeSeg"))];
}
function activeFilterCount(){ const f=S.filters; return ["genre","period","rating","country"].filter(k => f[k]).length + (f.mode !== "top" ? 1 : 0); }

function renderAll(){
  renderPeople(); renderStage(); renderMatches(); renderMine();
  const n = activeFilterCount(); $("fcount").hidden = !n; $("fcount").textContent = n;
}

function setView(v){
  S.view = v;
  segSelectBy($("tabs"), b => b.dataset.view === v);
  $("view-swipe").hidden = v !== "swipe"; $("view-matches").hidden = v !== "matches"; $("view-mine").hidden = v !== "mine";
  if (v === "mine") refreshSegs();
}

// ================== Actions ==================
function attachDrag(el){
  let x0=0, y0=0, dx=0, dy=0, active=false;
  const yes=el.querySelector(".hint.yes"), no=el.querySelector(".hint.no"), vu=el.querySelector(".hint.vu");
  el.addEventListener("pointerdown", e => { active=true; x0=e.clientX; y0=e.clientY; dx=dy=0; el.setPointerCapture(e.pointerId); el.classList.add("dragging"); });
  el.addEventListener("pointermove", e => {
    if (!active) return; dx=e.clientX-x0; dy=e.clientY-y0;
    const up = dy < -30 && Math.abs(dy) > Math.abs(dx);
    el.style.transform = up ? `translate(${dx*.3}px,${dy}px)` : `translate(${dx}px,${dy*.3}px) rotate(${dx/18}deg)`;
    yes.style.opacity = up ? 0 : Math.max(0, Math.min(1, dx/90));
    no.style.opacity  = up ? 0 : Math.max(0, Math.min(1, -dx/90));
    vu.style.opacity  = up ? Math.max(0, Math.min(1, -dy/110)) : 0;
  });
  const end = () => {
    if (!active) return; active=false; el.classList.remove("dragging");
    if (dy < -110 && Math.abs(dy) > Math.abs(dx)) act("vu");
    else if (dx > 100) act("like");
    else if (dx < -100) act("nope");
    else { el.style.transform=""; yes.style.opacity=no.style.opacity=vu.style.opacity=0; }
  };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
}

function flyOut(kind){
  const el = $("stage").querySelector(".card:not(.back):not(.back2)"); if (!el) return Promise.resolve();
  const dx = kind==="like" ? 1 : kind==="nope" ? -1 : 0;
  el.style.transform = dx ? `translate(${dx*140}%,20px) rotate(${dx*22}deg)` : kind==="vu" ? "translateY(-120%)" : "translateY(120%)";
  el.style.opacity = "0";
  const h = el.querySelector(kind==="like" ? ".hint.yes" : kind==="nope" ? ".hint.no" : kind==="vu" ? ".hint.vu" : null); if (h) h.style.opacity = 1;
  return new Promise(r => setTimeout(r, reduceMotion() ? 0 : 260));
}

async function saveVerdict(id, verdict, movie){
  const { error } = await sb.from("user_swipes").upsert({ user_id:S.me, movie_id:id, verdict, movie, updated_at:new Date().toISOString() });
  if (error) throw error;
}

const VERDICT = { like:"like", nope:"nope", vu:"seen" };
async function act(kind){
  if (S.busy || !S.queue.length) return;
  S.busy = true;
  try{
    const m = S.queue[0];
    await flyOut(kind);
    S.queue.shift();
    if (kind === "skip") S.queue.push(m);
    else {
      const verdict = VERDICT[kind], movie = snapshot(m);
      const before = matchKind(m.id);
      S.mine.set(m.id, { verdict, movie, at:new Date().toISOString() });
      S.history.push(m);
      const after = matchKind(m.id);
      if (after && after !== "partial" && after !== before) celebrate(m.id, after);
      await saveVerdict(m.id, verdict, movie);
    }
  } catch(err){ reportError(err); }
  finally { S.busy = false; }
  renderStage(); renderMatches(); renderMine();
  if (S.queue.length < 5) refill().then(renderStage).catch(reportError);
}

async function undo(){
  const m = S.history.pop(); if (!m || S.busy) return;
  S.mine.delete(m.id);
  S.queue.unshift(m);
  renderStage(); renderMatches(); renderMine();
  const { error } = await sb.from("user_swipes").delete().match({ user_id:S.me, movie_id:m.id });
  if (error) reportError(error);
}

async function setVerdict(id, verdict, movie){
  const before = matchKind(id);
  S.mine.set(id, { verdict, movie, at:new Date().toISOString() });
  const after = matchKind(id);
  if (after && after !== "partial" && after !== before) celebrate(id, after);
  renderMine(); renderMatches();
  try{ await saveVerdict(id, verdict, movie); }catch(err){ reportError(err); }
}
async function removeVerdict(id){
  const e = S.mine.get(id); S.mine.delete(id);
  if (e?.movie?.title && filterOk(e.movie)) S.queue.splice(Math.min(1, S.queue.length), 0, e.movie);
  renderAll();
  const { error } = await sb.from("user_swipes").delete().match({ user_id:S.me, movie_id:id });
  if (error) reportError(error);
}

async function toggleWatched(id){
  const had = S.watched.has(id);
  if (had) S.watched.delete(id); else S.watched.add(id);
  renderMatches();
  const q = had ? sb.from("watched").delete().match({ room_id:S.room.id, movie_id:id })
                : sb.from("watched").upsert({ room_id:S.room.id, movie_id:id }, { ignoreDuplicates:true });
  const { error } = await q; if (error) reportError(error);
}

let matchTimer;
function celebrate(id, kind){
  const m = movieOf(id);
  $("matchTitle").textContent = m.title || "";
  const img = $("matchPoster"); img.hidden = !m.poster; if (m.poster) img.src = IMG(m.poster, "w342");
  $("matchBox").classList.toggle("revoir", kind === "revoir");
  $("matchKind").textContent = kind === "revoir" ? "Match à revoir" : "C'est un match";
  const all = [S.me, ...others()];
  const likers = all.filter(u => verdictOf(u,id) === "like").map(u => u===S.me ? "toi" : nameOf(u));
  const seers  = all.filter(u => verdictOf(u,id) === "seen").map(u => u===S.me ? "toi" : nameOf(u));
  const list = a => a.length <= 1 ? (a[0]||"") : a.slice(0,-1).join(", ") + " et " + a.at(-1);
  $("matchWho").textContent = kind === "match"
    ? (all.length === 2 ? `Toi et ${nameOf(others()[0])} voulez le voir. Ajouté à vos films.` : `Tout le salon veut le voir ! Ajouté à vos films.`)
    : `Envie : ${list(likers)}. Déjà vu : ${list(seers)}. À regarder ensemble ?`;
  $("match").hidden = false; clearTimeout(matchTimer); matchTimer = setTimeout(() => $("match").hidden = true, 2800);
}

// ================== Feuilles : menu et filtres ==================
function openMenu(){ renderMenu(); $("newRoomForm").hidden = true; $("joinRoomForm").hidden = true; $("menuSheet").hidden = false; }
function openFilters(){ renderFilters(); $("filtersSheet").hidden = false; refreshSegs(); }
function closeSheets(){ $("menuSheet").hidden = true; $("filtersSheet").hidden = true; }
document.querySelectorAll(".overlay").forEach(o => {
  o.addEventListener("click", e => { if (e.target === o || e.target.closest("[data-close]")) closeSheets(); });
});
$("menuBtn").onclick = openMenu;
$("filtersBtn").onclick = openFilters;
$("newRoomBtn").onclick = () => { $("newRoomForm").hidden = !$("newRoomForm").hidden; $("joinRoomForm").hidden = true; if (!$("newRoomForm").hidden) $("menuRoomName").focus(); };
$("joinRoomBtn").onclick = () => { $("joinRoomForm").hidden = !$("joinRoomForm").hidden; $("newRoomForm").hidden = true; if (!$("joinRoomForm").hidden) $("menuCode").focus(); };
$("renameBtn").onclick = async () => {
  const name = $("renameInput").value.trim();
  const { error } = await sb.rpc("rename_room", { p_room: S.room.id, p_room_name: name });
  if (error) return reportError(error);
  S.room.name = name || null; $("roomName").textContent = roomLabel(S.room); renderMenu();
};
$("pseudoBtn").onclick = async () => {
  const name = $("pseudoInput").value.trim(); if (!name) return;
  const [{ error }] = await Promise.all([ sb.rpc("set_pseudo", { p_name:name }), sb.auth.updateUser({ data:{ name } }) ]);
  if (error) return reportError(error);
  S.name = name; LS.set("cad-name", name); S.members[S.me] = name; renderPeople(); $("pseudoBtn").textContent = "Changé ✓";
  setTimeout(() => $("pseudoBtn").textContent = "Changer", 1500);
};
$("copyLink").onclick = async () => {
  const link = $("shareLink").value;
  if (navigator.share){ try{ await navigator.share({ title:"Sinema", text:`Rejoins le salon « ${roomLabel(S.room)} » sur Sinema`, url:link }); return; }catch{} }
  try{ await navigator.clipboard.writeText(link); $("copyLink").textContent = "Copié ✓"; setTimeout(() => $("copyLink").textContent = "Copier", 1500); }
  catch{ $("shareLink").select(); }
};
$("leaveBtn").onclick = () => $("leaveConfirm").hidden = false;
$("leaveNo").onclick = () => $("leaveConfirm").hidden = true;
$("leaveYes").onclick = async () => {
  const { error } = await sb.rpc("leave_room", { p_room: S.room.id });
  if (error) return reportError(error);
  if (S.channel){ sb.removeChannel(S.channel); S.channel = null; }
  S.room = null; LS.set("cad-room",""); await loadRooms(); closeSheets();
  if (S.rooms[0]) await openRoom(S.rooms[0]); else onboard(null);
};
$("logoutBtn").onclick = logout;
$("applyFilters").onclick = async () => {
  S.filters = { mode:segValue($("modeSeg")) || "top", genre:$("fGenre").value, period:$("fPeriod").value, rating:segValue($("rateSeg")), country:$("fCountry").value };
  LS.set("sinema-filters", JSON.stringify(S.filters));
  closeSheets(); setView("swipe");
  S.loading = false; await refill(true).catch(reportError); renderAll();
};
$("resetFilters").onclick = () => { S.filters = { ...DEFAULT_FILTERS }; renderFilters(); };

// ================== Événements ==================
$("like").onclick = () => act("like"); $("nope").onclick = () => act("nope"); $("vu").onclick = () => act("vu"); $("skip").onclick = () => act("skip");
$("undo").onclick = undo;
$("hideSeen").onchange = renderMatches;
document.addEventListener("keydown", e => {
  if (["INPUT","SELECT","TEXTAREA"].includes(e.target.tagName) || $("view-swipe").hidden || !$("menuSheet").hidden || !$("filtersSheet").hidden) return;
  if (e.key === "ArrowRight") act("like");
  else if (e.key === "ArrowLeft") act("nope");
  else if (e.key === "ArrowUp"){ e.preventDefault(); act("vu"); }
  else if (e.key === "ArrowDown"){ e.preventDefault(); act("skip"); }
  else if (e.key === "Backspace") undo();
});

boot().catch(reportError);
