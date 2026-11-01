import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, TMDB_TOKEN } from "./config.js?v=202611011937";
import { BASES, COLORS as AV_COLORS, SLOTS, avatarSVG, avatarFor, cleanAvatar } from "./avatars.js?v=202611011937";

// ================== Utilitaires ==================
const $ = id => document.getElementById(id);
const LS = { get(k){ try{ return localStorage.getItem(k); }catch{ return null; } }, set(k,v){ try{ localStorage.setItem(k,v); }catch{} } };
const IMG = (path, size="w500") => path ? `https://image.tmdb.org/t/p/${size}${path}` : "";
// Taille d'affiche TMDB suffisante pour la carte, selon sa largeur réelle en pixels (écrans haute densité compris)
function posterSize(){
  const px = Math.min(window.innerWidth, 460) * (window.devicePixelRatio || 1);
  return px <= 360 ? "w342" : px <= 520 ? "w500" : "w780";
}
const fmtMins = m => m ? `${Math.floor(m/60)} h ${String(m%60).padStart(2,"0")}` : "";
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
// « Script error. » sans détail vient d'un script externe à la page (extension, bloqueur, navigateur intégré) :
// on le journalise sans l'afficher, il ne concerne pas Sinema.
window.addEventListener("error", e => {
  if (!e.error && /^Script error\.?$/i.test(e.message || "")){ console.warn("Erreur externe ignorée", e); return; }
  reportError(e.error || e.message);
});
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
// Les séries sont rangées avec un identifiant négatif : les numéros TMDB des films et des séries se chevauchent.
const isTv = id => id < 0;
const tmdbPath = id => `${isTv(id) ? "tv" : "movie"}/${Math.abs(id)}`;
const tmdbPage = id => `https://www.themoviedb.org/${tmdbPath(id)}`;
const GENRES = { movie:{}, tv:{} };
const details = new Map();
function getDetails(id){
  if (!details.has(id)) details.set(id, tmdb(`/${tmdbPath(id)}`, { append_to_response: isTv(id) ? "watch/providers,credits" : "watch/providers,credits,release_dates" }).then(d => ({
    runtime: isTv(id) ? (d.episode_run_time || [])[0] : d.runtime,
    seasons: d.number_of_seasons,
    directorLabel: isTv(id) ? "Créée par" : "De",
    directors: isTv(id) ? (d.created_by || []).map(c => c.name).slice(0,2) : (d.credits?.crew || []).filter(c => c.job === "Director").map(c => c.name).slice(0,2),
    cast: (d.credits?.cast || []).slice(0,4).map(c => c.name),
    providers: ((d["watch/providers"]?.results?.FR?.flatrate) || []).slice(0,5).map(p=>({ name:p.provider_name, logo:p.logo_path })),
    watchLink: d["watch/providers"]?.results?.FR?.link || null,
    title: isTv(id) ? d.name : d.title, poster: d.poster_path,
    releaseDate: (isTv(id) ? d.first_air_date : d.release_date) || null,
    // au moins une offre en France pour regarder chez soi (abonnement, gratuit, avec pub, location, achat)
    hasHomeOffer: ["flatrate","free","ads","rent","buy"].some(k => (d["watch/providers"]?.results?.FR?.[k] || []).length > 0),
    // plateformes d'abonnement / gratuites où le titre est inclus (pour « Mes plateformes »)
    subProviderIds: ["flatrate","free","ads"].flatMap(k => (d["watch/providers"]?.results?.FR?.[k] || []).map(p => p.provider_id)),
    // dernière sortie en salle en France (types TMDB 2 = limitée, 3 = salles)
    frTheatrical: ((d.release_dates?.results || []).find(r => r.iso_3166_1 === "FR")?.release_dates || [])
      .filter(r => r.type === 2 || r.type === 3).map(r => r.release_date?.slice(0,10)).filter(Boolean).sort().at(-1) || null,
  })).catch(() => null));
  return details.get(id);
}
// ---------- Trois catégories à la place du genre « Animation » ----------
// anime : animation en japonais (Ghibli, Shinkai, mangas…) — prioritaire
// anim_family : animation marquée « Familial », hors japonais (Disney, Pixar, DreamWorks, Illumination…)
// anim_other : le reste de l'animation (adulte, d'auteur)
const ANIM = 16, FAMILY = 10751;
const ANIM_CATS = [["anime","Anime"],["anim_family","Animation familiale"],["anim_other","Autre animation"]];
const isAnimCat = g => ANIM_CATS.some(([k]) => k === g);
function animCat(genreIds, lang){
  if (!(genreIds||[]).includes(ANIM)) return null;
  if (lang === "ja") return "anime";
  return genreIds.includes(FAMILY) ? "anim_family" : "anim_other";
}
// Un résultat TMDB correspond-il aux genres choisis (OU) ?
function genreMatch(x, genres){
  if (!genres.length) return true;
  const ids = x.genre_ids || [], cat = animCat(ids, x.original_language);
  return genres.some(g => isAnimCat(g) ? g === cat : ids.includes(+g));
}
// Genres proposés dans le filtre : « Animation » remplacé par les trois catégories, à sa place
function genreOptions(type){
  const out = [];
  Object.entries(GENRES[type]).forEach(([id, label]) => { if (+id === ANIM) out.push(...ANIM_CATS); else out.push([id, label]); });
  return out;
}
const snapshot = m => ({ id:m.id, type:m.type, title:m.title, year:m.year, date:m.date, poster:m.poster, overview:(m.overview||"").slice(0,600), genres:m.genres, vote:m.vote });
function normalize(m, type){
  const tv = type === "tv";
  const date = (tv ? m.first_air_date : m.release_date) || "";
  return { id: tv ? -m.id : m.id, type, title: tv ? m.name : m.title, year:date.slice(0,4), date,
    poster:m.poster_path, overview:m.overview, vote:m.vote_average,
    genres:(m.genre_ids||[]).map(g => g === ANIM && m.original_language === "ja" ? "Anime" : GENRES[type][g]).filter(Boolean).slice(0,3) };
}
const typeOf = m => m?.type || (m?.id < 0 ? "tv" : "movie");

// ================== État ==================
const DEFAULT_FILTERS = { mode:"top", genres:[], period:"", rating:"", countries:[], person:null, avail:"home", strict:false };
function loadFilters(){
  let all = {}; try{ all = JSON.parse(LS.get("sinema-filters2") || "{}"); }catch{}
  const fix = f => { const x = { ...DEFAULT_FILTERS, ...(f||{}) }; if (!Array.isArray(x.countries)) x.countries = []; if (x.country){ x.countries = [x.country]; } delete x.country;
    if (x.avail !== "cinema" && x.avail !== "soon") x.avail = "home";
    if (!Array.isArray(x.genres)) x.genres = []; if (x.genre){ x.genres = [String(x.genre)]; } delete x.genre;
    if (x.genres.includes(String(ANIM))) x.genres = [...x.genres.filter(g => g !== String(ANIM)), ...ANIM_CATS.map(([k]) => k)]; x.strict = !!x.strict; return x; };
  const r = { movie:fix(all.movie), tv:fix(all.tv) }; r.tv.person = null; return r;
}
const S = {
  me:null, email:"", name:"", avatar:null,
  avatars:{},             // user_id -> avatar (salon courant)
  rooms:[],               // [{ id, code, name }]
  room:null,              // salon courant
  members:{},             // user_id -> pseudo (salon courant)
  mine:new Map(),         // movie_id -> { verdict, movie }  (mes choix, tous salons)
  theirs:new Map(),       // user_id -> Map(movie_id -> { verdict, movie })  (autres membres du salon)
  watched:new Set(),
  type: LS.get("sinema-type") === "tv" ? "tv" : "movie",
  filtersBy: loadFilters(),
  get filters(){ return this.filtersBy[this.type]; },
  set filters(v){ this.filtersBy[this.type] = v; },
  mineType:"", mineQuery:"", mineGenre:"", mineSort: LS.get("sinema-mine-sort") || "added",
  queue:[], pending:[], pageOrder:null,
  platforms: (() => { try{ return JSON.parse(LS.get("sinema-platforms") || "[]"); }catch{ return []; } })(), pageIdx:0, totalPages:1, loading:false,
  history:[], busy:false, channel:null, view:"swipe", mineTab:"like",
};
let sb;

// ================== Démarrage ==================
async function boot(){
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TMDB_TOKEN){
    showNotice("Configuration incomplète : renseigne SUPABASE_URL, SUPABASE_ANON_KEY et TMDB_TOKEN dans config.js.");
    return;
  }
  ["tabs","authSeg","mineSeg","modeSeg","rateSeg","typeSeg","mineTypeSeg","availSeg","onboardSeg"].forEach(id => segInit($(id), b => onSeg(id, b)));
  segSelectBy($("typeSeg"), b => b.dataset.v === S.type);
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
  else if (id === "mineSeg"){ S.mineTab = btn.dataset.v; S.mineGenre = ""; $("surprise").hidden = true; renderMine(); }
  else if (id === "modeSeg") modeHelp();
  else if (id === "availSeg") availHelp();
  else if (id === "onboardSeg") showOb(btn.dataset.v);
  else if (id === "typeSeg") switchType(btn.dataset.v);
  else if (id === "mineTypeSeg"){ S.mineType = btn.dataset.v; renderMine(); }
}

async function afterLogin(session){
  ["view-auth","view-reset"].forEach(v => $(v).hidden = true);
  S.me = session.user.id;
  S.email = session.user.email || "";
  S.name = session.user.user_metadata?.name || LS.get("cad-name") || (S.email.split("@")[0]);
  S.avatar = cleanAvatar(session.user.user_metadata?.avatar || avatarFor(S.me));
  if (Array.isArray(session.user.user_metadata?.platforms)) S.platforms = session.user.user_metadata.platforms.filter(Number.isInteger);
  const [gm, gt] = await Promise.all([ tmdb("/genre/movie/list"), tmdb("/genre/tv/list"), loadMine(), loadRooms() ]);
  GENRES.movie = Object.fromEntries(gm.genres.map(x=>[x.id,x.name]));
  GENRES.tv = Object.fromEntries(gt.genres.map(x=>[x.id,x.name]));
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
const roomLabel = r => r?.name || "Salon sans nom"; // jamais le code d'invitation, qui doit rester discret

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
  document.querySelector(".app").dataset.view = "onboard";
  ["view-swipe","view-matches","view-mine"].forEach(v => $(v).hidden = true);
  $("tabs").hidden = true; $("menuBtn").hidden = !S.rooms.length;
  $("view-onboard").hidden = false;
  $("joinInvite").hidden = !code; $("firstRoom").hidden = !!code;
  $("onboardTitle").textContent = code ? "Tu es invité !" : "Bienvenue !";
  $("onboardLead").hidden = !!code;
  if (code) $("joinCodeLabel").textContent = code;
  $("joinInviteBtn").onclick = () => guarded($("joinInviteBtn"), () => joinRoom(code));
  $("inviteOtherBtn").onclick = () => { onboard(null); segSelectBy($("onboardSeg"), b => b.dataset.v === "create"); showOb("create"); };
  requestAnimationFrame(() => segMove($("onboardSeg"), false));
}
function showOb(v){ $("obJoin").hidden = v !== "join"; $("obCreate").hidden = v !== "create"; }
async function guarded(btn, fn){
  if (btn.disabled) return;
  btn.disabled = true;
  try{ await fn(); }catch(err){ reportError(err); }
  finally{ btn.disabled = false; }
}
$("firstCreateBtn").onclick = () => guarded($("firstCreateBtn"), () => createRoom($("newRoomName").value));
$("joinCodeBtn").onclick = () => guarded($("joinCodeBtn"), () => joinRoom($("codeInput").value));
$("menuCreateBtn").onclick = () => guarded($("menuCreateBtn"), () => createRoom($("menuRoomName").value));
$("menuJoinBtn").onclick = () => guarded($("menuJoinBtn"), () => joinRoom($("menuCode").value));

async function createRoom(roomName){
  showNotice("");
  const { data:code, error } = await sb.rpc("create_room", { p_name: S.name, p_room_name: (roomName||"").trim() || null });
  if (error){
    if (/too_many_rooms/.test(error.message)) return showNotice("Tu as atteint la limite de 10 salons créés. Rejoins plutôt un salon existant avec son code.");
    return reportError(error);
  }
  sb.rpc("set_profile", { p_name:S.name, p_avatar:S.avatar }).then(() => {}, () => {});
  clearRoomInputs(); closeSheets();
  await openRoom(await findRoom(r => r.code === code), { justCreated:true });
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
  clearRoomInputs();
  await sb.rpc("set_profile", { p_name:S.name, p_avatar:S.avatar }).then(() => {}, () => {});
  closeSheets();
  await openRoom(await findRoom(r => r.id === roomId, { id:roomId, code, name:null }), { justJoined:true });
}

// Retrouve un salon tout juste créé ou rejoint, même si la liste met un instant à le refléter.
async function findRoom(pred, fallback){
  for (let i = 0; i < 3; i++){
    try{ await loadRooms(); }catch(err){ console.warn(err); }
    const r = S.rooms.find(pred); if (r) return r;
    await new Promise(res => setTimeout(res, 400 * (i + 1)));
  }
  if (fallback){ S.rooms.push(fallback); return fallback; }
  return null;
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
  lastBadge = Object.fromEntries(S.rooms.map(r => [r.id, newMatches(r.id).length]));
  renderAll();
  if (justCreated) openMenu();
  if (justJoined){
    const n = matchList().filter(x => x.kind !== "partial").length;
    if (n) showNotice(`Bienvenue ! Grâce à vos choix passés, vous avez déjà ${n} titre${n>1?"s":""} en commun dans ce salon.`);
  }
}

// Charge les membres et les choix de tous mes salons (pour les pastilles de nouveaux matchs),
// puis prépare le salon courant.
async function loadRoom(){
  const roomIds = S.rooms.map(r => r.id);
  if (!roomIds.includes(S.room.id)) roomIds.push(S.room.id);
  const [m, w] = await Promise.all([
    sb.from("members").select("room_id,user_id,name,avatar").in("room_id", roomIds),
    sb.from("watched").select("movie_id").eq("room_id", S.room.id),
  ]);
  for (const r of [m,w]) if (r.error) throw r.error;
  S.roomMembers = new Map();
  m.data.forEach(x => { if (!S.roomMembers.has(x.room_id)) S.roomMembers.set(x.room_id, []); S.roomMembers.get(x.room_id).push(x.user_id); });
  const here = m.data.filter(x => x.room_id === S.room.id);
  S.members = Object.fromEntries(here.map(x=>[x.user_id, x.name]));
  S.avatars = Object.fromEntries(here.map(x=>[x.user_id, cleanAvatar(x.avatar || avatarFor(x.user_id))]));
  S.avatars[S.me] = S.avatar;
  S.watched = new Set(w.data.map(x=>x.movie_id));
  const people = [...new Set(m.data.map(x => x.user_id))].filter(u => u !== S.me);
  S.theirs = new Map(people.map(u => [u, new Map()]));
  if (people.length){
    const { data, error } = await sb.from("user_swipes").select("user_id,movie_id,verdict,movie").in("user_id", people);
    if (error) throw error;
    data.forEach(r => S.theirs.get(r.user_id)?.set(r.movie_id, { verdict:r.verdict, movie:r.movie }));
  }
}

// Mes choix faits sur un autre appareil arrivent en direct
function subscribeMine(){
  if (S.mineChannel) return;   // déjà abonné (ex. après une réinitialisation de mot de passe)
  S.mineChannel = sb.channel("mine-"+S.me)
    .on("postgres_changes", { event:"*", schema:"public", table:"user_swipes", filter:`user_id=eq.${S.me}` }, ({ eventType, new:n, old:o }) => {
      if (eventType === "DELETE") S.mine.delete(o.movie_id);
      else S.mine.set(n.movie_id, { verdict:n.verdict, movie:n.movie, at:n.updated_at });
      renderLists(); scheduleBadges();
    }).subscribe();
}

// Filtre temps réel « user_id dans (membres de mes salons) » : la base n'envoie que ce qui nous concerne
// (au-delà de 100 personnes, limite du filtre, on revient à l'écoute large triée côté appli).
function peopleFilter(){
  const ids = [...S.theirs.keys()];
  return ids.length && ids.length <= 100 ? `user_id=in.(${ids.join(",")})` : null;
}
function subscribeRoom(){
  if (S.channel) sb.removeChannel(S.channel);
  const roomId = S.room.id, f = `room_id=eq.${roomId}`;
  S.channel = sb.channel("room-"+roomId)
    .on("postgres_changes", { event:"*", schema:"public", table:"user_swipes", ...(peopleFilter() ? { filter: peopleFilter() } : {}) }, ({ eventType, new:n, old:o }) => {
      const row = eventType === "DELETE" ? o : n;
      if (!row || row.user_id === S.me || !S.theirs.has(row.user_id)) return;
      const inRoom = row.user_id in S.members;
      const before = matchKind(row.movie_id);
      if (eventType === "DELETE") S.theirs.get(row.user_id).delete(row.movie_id);
      else S.theirs.get(row.user_id).set(row.movie_id, { verdict:n.verdict, movie:n.movie });
      const after = matchKind(row.movie_id);
      if (inRoom && after && after !== "partial" && after !== before) celebrate(row.movie_id, after);
      if (inRoom && n?.verdict === "like" && !S.mine.has(n.movie_id) && !S.queue.some(q=>q.id===n.movie_id) && n.movie?.title && filterOk(n.movie)){
        (S.pending = S.pending || []).splice(Math.floor(Math.random() * (S.pending.length + 1)), 0, n.movie);
      }
      renderStage(); renderLists(); scheduleBadges();
    })
    .on("postgres_changes", { event:"*", schema:"public", table:"watched", filter:f }, ({ eventType, new:n, old:o }) => {
      if (eventType === "DELETE"){ if (o.room_id !== roomId) return; S.watched.delete(o.movie_id); } else S.watched.add(n.movie_id);
      renderMatches();
    })
    .on("postgres_changes", { event:"*", schema:"public", table:"members", filter:f }, async () => {
      try{ const before = peopleFilter(); await loadRoom(); renderAll(); if (peopleFilter() !== before) subscribeRoom(); }catch(err){ reportError(err); }
    })
    .on("postgres_changes", { event:"UPDATE", schema:"public", table:"rooms", filter:`id=eq.${roomId}` }, ({ new:n }) => {
      S.room.name = n.name; const r = S.rooms.find(x => x.id === roomId); if (r) r.name = n.name;
      $("roomName").textContent = roomLabel(S.room); renderMenu();
    })
    .subscribe();
}
// Au retour sur l'appli, on resynchronise au plus une fois toutes les 3 minutes (le temps réel couvre le reste)
let lastSync = Date.now();
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !S.room || Date.now() - lastSync < 180000) return;
  lastSync = Date.now();
  try{ await Promise.all([loadMine(), loadRoom()]); renderAll(); }catch(err){ reportError(err); }
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
function matchKind(id){ return matchKindIn([S.me, ...others()], id); }
function matchKindIn(ids, id){
  if (ids.length < 2) return null;
  const v = ids.map(u => verdictOf(u, id));
  const likes = v.filter(x => x === "like").length, seens = v.filter(x => x === "seen").length;
  if (likes === ids.length) return "match";
  if (likes >= 1 && seens >= 1 && likes + seens === ids.length) return "revoir";
  if (ids.length >= 3 && likes >= 2) return "partial";
  return null;
}
// ---------- Pastilles « nouveaux matchs » par salon ----------
// On mémorise (sur l'appareil) les matchs déjà vus de chaque salon ; les autres sont « nouveaux ».
const seenKey = roomId => "sinema-seen-" + roomId;
function roomMatchIds(roomId){
  const ids = S.roomMembers?.get(roomId) || [];
  if (ids.length < 2) return [];
  const all = new Set([...S.mine.keys(), ...[...S.theirs.values()].flatMap(mp => [...mp.keys()])]);
  return [...all].filter(id => { const k = matchKindIn(ids, id); return k === "match" || k === "revoir"; });
}
function seenSet(roomId){ try{ const v = LS.get(seenKey(roomId)); return v ? new Set(JSON.parse(v)) : null; }catch{ return null; } }
function markRoomSeen(roomId){ LS.set(seenKey(roomId), JSON.stringify(roomMatchIds(roomId))); }
function newMatches(roomId){
  const seen = seenSet(roomId), ids = roomMatchIds(roomId);
  if (!seen){ LS.set(seenKey(roomId), JSON.stringify(ids)); return []; } // premier passage : on ne signale pas l'historique
  return ids.filter(id => !seen.has(id));
}
let lastBadge = {};
function renderRoomBadges(){
  if (!S.room) return;
  markRoomSeen(S.room.id);
  let total = 0;
  for (const r of S.rooms){
    if (r.id === S.room.id) continue;
    const fresh = newMatches(r.id), n = fresh.length;
    total += n;
    if (n > (lastBadge[r.id] || 0)){ const id = fresh.at(-1); toast(id, matchKindIn(S.roomMembers.get(r.id), id), r); }
    lastBadge[r.id] = n;
  }
  const b = $("roomBadge"); b.hidden = !total; b.textContent = total;
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
  if (typeOf(m) !== S.type) return false;
  // genres cumulatifs : il suffit d'en avoir un parmi ceux choisis
  if (f.genres.length && !f.genres.some(g => isAnimCat(g)
      ? (m.genres||[]).some(n => n === "Animation" || n === "Anime")   // la langue n'est pas stockée : on accepte toute animation
      : (m.genres||[]).includes(GENRES[S.type][g]))) return false;
  if (f.avail === "cinema" || f.avail === "soon") return false; // seuls les titres trouvés par TMDB pour ce mode passent
  if (f.period){ const [a,b] = f.period.split("-"); const y = +m.year; if (!y || (a && y < +a) || (b && y > +b)) return false; }
  if (f.rating && (m.vote||0) < +f.rating) return false;
  if (f.person) return false; // le casting n'est pas connu dans l'instantané : seuls les films trouvés par TMDB passent
  return true; // le pays n'est pas connu dans l'instantané : on n'exclut pas
}
const isoDay = d => d.toISOString().slice(0,10);
// « Sortie le 17 nov. 2026 » pour une date future, sinon rien
function futureLabel(date){
  if (!date || date <= isoDay(new Date())) return "";
  return "Sortie le " + new Date(date + "T12:00:00").toLocaleDateString("fr-FR", { day:"numeric", month:"short", year:"numeric" });
}
function discoverParams(page){
  const f = S.filters, tv = S.type === "tv";
  const p = { include_adult:"false", page:String(page) };
  if (f.mode === "gems"){ p.sort_by = "vote_average.desc"; p["vote_count.gte"] = "60"; p["vote_count.lte"] = "1500"; p["vote_average.gte"] = f.rating || "6.8"; }
  else if (f.mode === "mix"){ p.sort_by = "popularity.desc"; p["vote_count.gte"] = "80"; }
  else { p.sort_by = "popularity.desc"; p["vote_count.gte"] = "300"; }
  if (f.rating && f.mode !== "gems") p["vote_average.gte"] = f.rating;
  if (f.genres.length){
    const real = f.genres.filter(g => !isAnimCat(g)), cats = f.genres.filter(isAnimCat);
    if (!real.length && cats.length === 1){
      // une seule catégorie d'animation : on cible au mieux côté TMDB
      if (cats[0] === "anime"){ p.with_genres = String(ANIM); p.with_original_language = "ja"; }
      else if (cats[0] === "anim_family") p.with_genres = `${ANIM},${FAMILY}`;          // « , » = les deux à la fois
      else { p.with_genres = String(ANIM); p.without_genres = String(FAMILY); }
    } else {
      p.with_genres = [...real, ...(cats.length ? [ANIM] : [])].join("|");             // « | » = l'un ou l'autre
    }
    // le tri fin (langue japonaise, familial) se fait ensuite dans refill avec genreMatch
  }
  if (f.countries?.length) p.with_origin_country = f.countries.join("|"); // « | » = l'un ou l'autre
  if (f.person && !tv) p.with_people = String(f.person.id);
  const dateKey = tv ? "first_air_date" : "primary_release_date";
  if (f.period){
    const [a,b] = f.period.split("-");
    if (a) p[`${dateKey}.gte`] = `${a}-01-01`;
    if (b) p[`${dateKey}.lte`] = `${b}-12-31`;
  }
  if (f.avail === "cinema" && !tv){
    // sorties en salle en France ces 6 dernières semaines : peu de votes encore, on lève le seuil
    const now = new Date(), from = new Date(now - 42*864e5);
    p.region = "FR"; p.with_release_type = "3|2";
    p["release_date.gte"] = isoDay(from); p["release_date.lte"] = isoDay(now);
    p["vote_count.gte"] = "0"; delete p["vote_count.lte"];
    if (f.mode !== "gems") p.sort_by = "popularity.desc";
  } else if (f.avail === "soon"){
    // sorties à venir dans les 6 prochains mois (en salle en France pour les films)
    const now = new Date(), from = new Date(+now + 864e5), to = new Date(+now + 183*864e5);
    if (tv){ p["first_air_date.gte"] = isoDay(from); p["first_air_date.lte"] = isoDay(to); }
    else { p.region = "FR"; p.with_release_type = "3|2"; p["release_date.gte"] = isoDay(from); p["release_date.lte"] = isoDay(to); }
    p["vote_count.gte"] = "0"; delete p["vote_count.lte"]; delete p["vote_average.gte"];
    p.sort_by = "popularity.desc";
  } else {
    // « Chez moi » : tout ce qui est déjà sorti. Les films encore en salle en France sont écartés carte par carte (voir vetQueue).
    const today = isoDay(new Date());
    if (!p[`${dateKey}.lte`] || p[`${dateKey}.lte`] > today) p[`${dateKey}.lte`] = today;
    if (f.strict){
      // option stricte : seulement ce qui se regarde tout de suite en France
      p.watch_region = "FR";
      if (S.platforms.length){ p.with_watch_providers = S.platforms.join("|"); p.with_watch_monetization_types = "flatrate|free|ads"; }
      else p.with_watch_monetization_types = "flatrate|free|ads|rent|buy";
    }
  }
  return p;
}
const shuffle = a => { for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };

// Recette de la pile :
// - la découverte TMDB est tirée au hasard (pages mélangées, résultats mélangés) pour que chacun ait un ordre différent ;
// - les titres aimés par les autres membres sont glissés au hasard, environ 1 carte sur 4, jamais en tête de pile
//   et sans être signalés : assez pour obtenir vite des matchs, sans dévoiler les choix de chacun.
const SHARE_RATE = 0.25;
function collectPending(){
  const pending = new Map();
  for (const m of S.theirs.values()) for (const [id, e] of m){
    if (e.verdict === "like" && !S.mine.has(id) && e.movie?.title && filterOk(e.movie)) pending.set(id, e.movie);
  }
  S.pending = shuffle([...pending.values()]);
}
function pushWithShared(batch){
  const ids = new Set(S.queue.map(q => q.id));
  for (const m of batch){
    if (S.queue.length >= 2 && S.pending.length && Math.random() < SHARE_RATE){
      const p = S.pending.shift(); if (!ids.has(p.id) && !S.mine.has(p.id)){ S.queue.push(p); ids.add(p.id); }
    }
    if (!ids.has(m.id)){ S.queue.push(m); ids.add(m.id); }
  }
}
// Filtre par personne : TMDB renvoie tous les films où la personne apparaît, quel que soit son rôle
// (producteur, scénariste, remerciements…). On ne garde que ceux où elle a le rôle attendu :
// réalisation pour un réalisateur, jeu pour un acteur ou une actrice.
async function loadPersonFilm(){
  const p = S.filters.person;
  if (!p || S.type === "tv"){ S.personFilms = null; return; }
  if (S.personFilms?.key === `${p.id}:${p.role}`) return;
  const role = p.role || (/Réalisation/.test(p.dept || "") ? "director" : "actor");
  const c = await tmdb(`/person/${p.id}/movie_credits`);
  const ids = role === "director"
    ? (c.crew || []).filter(x => x.job === "Director" || x.job === "Co-Director").map(x => x.id)
    : (c.cast || []).map(x => x.id);
  S.personFilms = { key:`${p.id}:${p.role}`, ids:new Set(ids) };
}
async function refill(reset = false){
  if (reset){
    S.queue = []; S.pageOrder = null; S.pageIdx = 0; S.totalPages = 1;
    collectPending();
  }
  if (S.loading) return;
  S.loading = true;
  try{ await loadPersonFilm(); }catch(err){ S.personFilms = null; console.warn(err); }
  try{
    let guard = 0;
    while (S.queue.length < 8 && guard++ < 6){
      let page;
      if (S.pageOrder){ if (S.pageIdx >= S.pageOrder.length) break; page = S.pageOrder[S.pageIdx++]; }
      else page = 1;
      const d = await tmdb(`/discover/${S.type}`, discoverParams(page));
      S.totalPages = Math.min(d.total_pages || 1, 500);
      if (!S.pageOrder){
        // Populaires / Pépites : on pioche au hasard dans les pages par paquets de 8 (du plus connu au moins connu).
        // Mélange : n'importe quelle page parmi 300.
        const n = S.totalPages;
        if (S.filters.mode === "mix") S.pageOrder = shuffle(Array.from({ length: Math.min(n, 300) - 1 }, (_, i) => i + 2));
        else { S.pageOrder = []; for (let a = 2; a <= Math.min(n, 200); a += 8) S.pageOrder.push(...shuffle(Array.from({ length: Math.min(8, n - a + 1) }, (_, i) => a + i))); }
        S.pageIdx = 0;
      }
      const inQueue = new Set(S.queue.map(q=>q.id));
      const batch = shuffle(d.results.filter(x => genreMatch(x, S.filters.genres) && (!S.personFilms || S.personFilms.ids.has(x.id))).map(x => normalize(x, S.type)).filter(m => !S.mine.has(m.id) && !inQueue.has(m.id)));
      pushWithShared(batch);
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
      <p class="credits"></p>
      <p class="overview"></p>
      <button class="more" type="button" hidden>Voir plus</button>
      <div class="providers"></div>
    </div>`;
  if (m.poster){ const img = el.querySelector("img.poster"); img.src = IMG(m.poster, posterSize()); img.alt = "Affiche : " + m.title; }
  else el.querySelector(".noposter").textContent = m.title;
  (m.genres||[]).forEach(g => { const s=document.createElement("span"); s.textContent=g; el.querySelector(".genres").appendChild(s); });
  el.querySelector("h2").textContent = m.title;
  el.querySelector(".year").textContent = [typeOf(m) === "tv" ? "Série" : "", futureLabel(m.date) || m.year].filter(Boolean).join(" · ");
  el.querySelector(".rating").textContent = m.vote ? `★ ${m.vote.toFixed(1)}` : "";
  el.querySelector(".overview").textContent = m.overview || "Pas de résumé en français.";
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
  el.querySelector(".dur").textContent = [d.seasons ? `${d.seasons} saison${d.seasons>1?"s":""}` : "", d.runtime ? (isTv(m.id) ? `épisodes de ${d.runtime} min` : fmtMins(d.runtime)) : ""].filter(Boolean).join(" · ");
  const soon = futureLabel(d.frTheatrical) || futureLabel(d.releaseDate);
  if (soon) el.querySelector(".year").textContent = [isTv(m.id) ? "Série" : "", soon].filter(Boolean).join(" · ");
  const cr = el.querySelector(".credits"); cr.textContent = "";
  const addPart = (label, names) => { if (!names.length) return; if (cr.childNodes.length) cr.append(" · "); cr.append(label + " "); const b=document.createElement("b"); b.textContent = names.join(", "); cr.append(b); };
  addPart(d.directorLabel, d.directors); addPart("Avec", d.cast);
  const more = el.querySelector(".more"), ov = el.querySelector(".overview");
  requestAnimationFrame(() => { more.hidden = ov.scrollHeight <= ov.clientHeight + 2 && cr.scrollWidth <= cr.clientWidth + 2; });
  const pv = el.querySelector(".providers"); pv.innerHTML = "";
  if (d.providers.length) d.providers.forEach(p => { const i=document.createElement("img"); i.src=IMG(p.logo,"w92"); i.alt=p.name; i.title=p.name; pv.appendChild(i); });
  else { const s=document.createElement("span"); s.className="none"; s.textContent="Pas en streaming par abonnement en France"; pv.appendChild(s); }
  const link = (href, text) => { const a = document.createElement("a"); a.className="tmdblink"; a.href=href; a.target="_blank"; a.rel="noopener"; a.textContent=text; a.addEventListener("pointerdown", e => e.stopPropagation()); pv.appendChild(a); };
  if (d.watchLink) link(d.watchLink, "Où le voir ↗");   // toutes les offres en France (location, achat, abonnement)
  link(tmdbPage(m.id), "Fiche TMDB ↗");                 // fiche complète : casting, bandes-annonces, avis
}

// En mode « Chez moi », on vérifie les prochaines cartes et on retire discrètement :
// - un film sorti en salle en France il y a moins de 4 mois (ou bientôt) et sans offre de VOD : il est encore au cinéma
//   (4 mois = délai minimum avant la VOD dans la chronologie des médias française) ;
// - avec l'option stricte, tout titre sans offre en France (ou absent de mes plateformes si j'en ai choisi).
// Les films jamais sortis en salle en France restent dans la pile.
const CINEMA_WINDOW_DAYS = 120;
function keepAtHome(d){
  if (!d) return true;
  const f = S.filters;
  if (f.strict){
    if (S.platforms.length) return d.subProviderIds.some(id => S.platforms.includes(id));
    return d.hasHomeOffer;
  }
  const today = isoDay(new Date());
  if (d.releaseDate && d.releaseDate > today) return false;        // pas encore sorti nulle part
  if (d.frTheatrical && !d.hasHomeOffer){
    const days = (Date.now() - Date.parse(d.frTheatrical)) / 864e5;
    if (days < CINEMA_WINDOW_DAYS) return false; // en salle en ce moment, ou sortie à venir en France
  }
  return true;
}
let vetting = false;
async function vetQueue(){
  if (vetting || S.filters.avail !== "home") return;
  vetting = true;
  try{
    let changed = false;
    const batch = S.queue.slice(0, 4);
    const infos = await Promise.all(batch.map(m => getDetails(m.id)));   // les 4 vérifications en même temps
    if (S.filters.avail === "home") batch.forEach((m, i) => {
      if (!keepAtHome(infos[i])){ const k = S.queue.indexOf(m); if (k > -1){ S.queue.splice(k, 1); changed = true; } }
    });
    if (changed){
      renderStage();
      // garde-fou : on ne relance pas indéfiniment la recherche si TMDB renvoie surtout des titres sans offre
      if (S.queue.length < 5 && (S.vetRefills = (S.vetRefills||0) + 1) <= 5) refill().then(() => { renderStage(); vetQueue(); }).catch(reportError);
    } else S.vetRefills = 0;
  } finally { vetting = false; }
}
function renderStage(){
  queueMicrotask(vetQueue);
  const st = $("stage"); st.innerHTML = "";
  const top3 = S.queue.slice(0,3);
  if (!top3.length){
    const e=document.createElement("div"); e.className="empty";
    e.innerHTML = `<strong></strong><span></span>`;
    e.querySelector("strong").textContent = S.loading ? "Chargement…" : "Pile terminée";
    e.querySelector("span").textContent = S.loading ? "On cherche des titres pour vous." : "Plus rien pour ces filtres. Élargis-les ou passe en mode Mélange.";
    st.appendChild(e);
  }
  top3.slice().reverse().forEach((m, ri) => {
    const idx = top3.length-1-ri;
    const el = cardEl(m, idx===0 ? "" : idx===1 ? "back" : "back2");
    st.appendChild(el);
    if (idx === 0){ attachDrag(el); setupMore(el); fillDetails(el, m); }
  });
  S.queue.slice(3,6).forEach(m => { if (m.poster){ const i=new Image(); i.src=IMG(m.poster, posterSize()); } });
  ["like","nope","vu","skip"].forEach(b => $(b).disabled = !top3.length);
  $("undo").disabled = !S.history.length;
}

function renderPeople(){
  const p = $("people"); p.innerHTML = "";
  const ids = [S.me, ...others()];
  ids.slice(0,5).forEach((u, i) => {
    const c = document.createElement("span"); c.className = "chip";
    const n = (u === S.me ? S.name : nameOf(u)) || "?";
    c.innerHTML = avatarSVG(S.avatars[u] || avatarFor(u), 22, n) + `<b></b>`;
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
  const a = document.createElement("a"); a.href = tmdbPage(id); a.target = "_blank"; a.rel = "noopener"; a.className = "titlelink";
  a.textContent = m.title || `Titre ${Math.abs(id)}`; a.title = "Voir la fiche sur TMDB";
  row.querySelector(".t").appendChild(a);
  if (!m.title){ // ancienne donnée sans fiche : on complète le titre et l'affiche depuis TMDB
    a.textContent = "Chargement…";
    getDetails(id).then(d => { if (!d) return; a.textContent = d.title || `Titre ${Math.abs(id)}`;
      if (d.poster){ const mini = row.querySelector(".mini"); if (mini){ const i = document.createElement("img"); i.src = IMG(d.poster, "w185"); i.alt = "Affiche : " + (d.title||""); mini.replaceWith(i); } } });
  }
  row.querySelector(".m").textContent = [isTv(id) ? "Série" : "", m.year, m.vote ? `★ ${(+m.vote).toFixed(1)}` : "", (m.genres||[]).join(", ")].filter(Boolean).join(" · ");
  return row;
}

function renderMatches(){
  S.matchesDirty = false;
  const all = matchList();
  const order = { match:0, revoir:1, partial:2 };
  $("mcount").textContent = all.filter(x => x.kind !== "partial" && !S.watched.has(x.id)).length;
  const list = $("mlist"); list.innerHTML = "";
  const hide = $("hideSeen").checked;
  const shown = all.filter(x => !(hide && S.watched.has(x.id)))
    .sort((a,b) => (S.watched.has(a.id) - S.watched.has(b.id)) || order[a.kind]-order[b.kind] || b.likes-a.likes);
  if (!shown.length){
    const e=document.createElement("div"); e.className="lempty";
    e.textContent = all.length ? "Tous vos titres en commun sont marqués comme vus."
      : others().length ? "Pas encore de titre en commun. Continuez à swiper, ils apparaîtront ici dès que vous serez d'accord."
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

const MINE_PAGE = 20;
// Tri de la watchlist. « Au hasard » garde le même ordre tant qu'on ne relance pas le tri.
function sortMine(list){
  const dateOf = e => e.movie?.date || (e.movie?.year ? `${e.movie.year}-01-01` : "");
  const by = {
    added:  (a,b) => (b[1].at||"").localeCompare(a[1].at||""),
    rating: (a,b) => (b[1].movie?.vote||0) - (a[1].movie?.vote||0),
    newest: (a,b) => dateOf(b[1]).localeCompare(dateOf(a[1])),
    oldest: (a,b) => (dateOf(a[1]) || "9999").localeCompare(dateOf(b[1]) || "9999"),
    title:  (a,b) => (a[1].movie?.title||"").localeCompare(b[1].movie?.title||"", "fr", { sensitivity:"base" }),
    random: (a,b) => randRank(a[0]) - randRank(b[0]),
  }[S.mineSort] || ((a,b) => 0);
  return [...list].sort(by);
}
let randSeed = Math.random();
function randRank(id){ let h = Math.floor(randSeed * 1e9) ^ id; h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^ (h >>> 16)) >>> 0; }
function renderMine(){
  S.mineDirty = false;
  const q = S.mineQuery.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // filtres type + recherche, appliqués avant de compter : les compteurs suivent ce qui est affiché
  const pool = [...S.mine.entries()]
    .filter(([id]) => !S.mineType || (S.mineType === "tv") === isTv(id))
    .filter(([, e]) => !q || ((e.movie?.title||"") + " " + (e.movie?.genres||[]).join(" ") + " " + (e.movie?.year||"")).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q));
  // pastilles de genres : ceux présents dans l'onglet courant (avec leur nombre)
  const tabPool = pool.filter(([, e]) => e.verdict === S.mineTab);
  const gcount = new Map(); tabPool.forEach(([, e]) => (e.movie?.genres||[]).forEach(g => gcount.set(g, (gcount.get(g)||0) + 1)));
  if (S.mineGenre && !gcount.has(S.mineGenre)) S.mineGenre = "";
  const gbox = $("mineGenres"); gbox.innerHTML = ""; gbox.hidden = gcount.size < 2;
  gbox.parentElement.hidden = gcount.size < 2;
  const sorted = [...gcount.entries()].sort((a,b) => b[1]-a[1]);
  sorted.forEach(([g, n], i) => {
    const b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-pressed", S.mineGenre === g);
    b.textContent = g; const c = document.createElement("span"); c.textContent = n; b.appendChild(c);
    b.onclick = () => { S.mineGenre = S.mineGenre === g ? "" : g; renderMine(); };
    gbox.appendChild(b);
  });
  requestAnimationFrame(genreEdges);
  // compteurs : selon Tout / Films / Séries uniquement (la recherche ne les modifie pas)
  const counts = { like:0, nope:0, seen:0 };
  for (const [id, e] of S.mine) if (!S.mineType || (S.mineType === "tv") === isTv(id)) counts[e.verdict]++;
  Object.entries(counts).forEach(([k,v]) => $("n-"+k).textContent = v);
  const list = $("minelist"); list.innerHTML = "";
  const all = sortMine(tabPool.filter(([, e]) => !S.mineGenre || (e.movie?.genres||[]).includes(S.mineGenre)));
  // affichage par tranches de 20, avec « Afficher plus » (on repart de 20 quand l'onglet, le type ou la recherche changent)
  const key = `${S.mineTab}|${S.mineType}|${q}|${S.mineGenre}|${S.mineSort}`;
  if (S.mineKey !== key){ S.mineKey = key; S.mineLimit = MINE_PAGE; }
  const items = all.slice(0, S.mineLimit);
  S.mineVisible = all.map(([id]) => id);
  if (!items.length){
    const e=document.createElement("div"); e.className="lempty";
    e.textContent = (q || S.mineType) ? "Aucun titre ne correspond à ta recherche."
      : { like:"Aucune envie pour l'instant.", nope:"Aucun titre écarté.", seen:"Aucun titre marqué déjà vu." }[S.mineTab];
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
  if (all.length > MINE_PAGE){
    const foot = document.createElement("div"); foot.className = "morebar";
    const info = document.createElement("span"); info.className = "fine"; info.textContent = `${items.length} sur ${all.length}`;
    foot.appendChild(info);
    if (items.length < all.length){
      const more = document.createElement("button"); more.type = "button"; more.className = "ghost";
      more.textContent = `Afficher ${Math.min(MINE_PAGE, all.length - items.length)} de plus`;
      more.onclick = () => { S.mineLimit += MINE_PAGE; renderMine(); };
      foot.appendChild(more);
    }
    list.appendChild(foot);
  }
}

function renderMenu(){
  const list = $("roomList"); list.innerHTML = "";
  S.rooms.forEach(r => {
    const b = document.createElement("button"); b.type="button"; b.className="roomitem";
    b.setAttribute("aria-current", S.room && r.id === S.room.id);
    b.innerHTML = `<b></b><span></span>`;
    b.querySelector("b").textContent = roomLabel(r);
    const fresh = S.room && r.id === S.room.id ? 0 : newMatches(r.id).length;
    // pas de code d'invitation ici (il reste masqué dans « Salon actuel ») : on affiche le nombre de membres
    const nm = S.roomMembers?.get(r.id)?.length || 0;
    b.querySelector("span").textContent = S.room && r.id === S.room.id ? "actuel" : nm ? `${nm} membre${nm>1?"s":""}` : "";
    if (fresh){ const c = document.createElement("i"); c.className = "count"; c.textContent = `${fresh} nouveau${fresh>1?"x":""} match${fresh>1?"s":""}`; b.querySelector("b").after(c); }
    b.onclick = async () => { if (S.room?.id === r.id) return closeSheets(); closeSheets(); try{ await openRoom(r); }catch(err){ reportError(err); } };
    list.appendChild(b);
  });
  $("currentRoom").hidden = !S.room;
  if (S.room){
    $("renameInput").value = S.room.name || "";
    $("shareCode").textContent = "••••••••"; $("revealCode").textContent = "Afficher"; $("revealCode").setAttribute("aria-pressed","false");
  }
  $("profileAvatar").innerHTML = avatarSVG(S.avatar, 44, S.name);
  $("profileName").textContent = S.name; $("accountEmail").textContent = S.email;
  $("leaveConfirm").hidden = true;
}

function renderFilters(){
  const f = S.filters, tv = S.type === "tv";
  $("filtersTitle").textContent = tv ? "Filtres séries" : "Filtres films";
  $("periodLabel").textContent = tv ? "Première diffusion" : "Année de sortie";
  $("availCinema").hidden = tv;
  segSelectBy($("availSeg"), b => b.dataset.v === (tv && f.avail === "cinema" ? "home" : f.avail));
  $("fStrict").checked = !!f.strict; draftPlatforms = [...S.platforms];
  availHelp(); renderPlatforms();
  segSelectBy($("modeSeg"), b => b.dataset.v === f.mode);
  segSelectBy($("rateSeg"), b => b.dataset.v === f.rating);
  draftGenres = [...f.genres]; draftCountries = [...f.countries]; setYears(f.period);
  renderSummaries();
  $("personBlock").hidden = tv;
  draftPerson = f.person; renderPerson();
  modeHelp();
}
function modeHelp(){
  const w = S.type === "tv" ? "séries" : "films";
  $("modeHelp").textContent = { top:`Les ${w} les plus populaires du moment, puis de moins en moins connus.`,
    mix:`Un tirage au hasard parmi des milliers de ${w}, connus ou non.`,
    gems:`Des ${w} très bien notés mais peu vus : de quoi faire des découvertes.` }[segValue($("modeSeg"))];
}
// ---------- Curseur d'années à deux poignées ----------
const YEAR_MIN = 1920, YEAR_MAX = new Date().getFullYear();
function setYears(period){
  const [a, b] = (period || "").split("-");
  const lo = Math.max(YEAR_MIN, +a || YEAR_MIN), hi = Math.min(YEAR_MAX, +b || YEAR_MAX);
  for (const id of ["yearMin","yearMax"]){ const r = $(id); r.min = YEAR_MIN; r.max = YEAR_MAX; r.step = 1; }
  $("yearMin").value = lo; $("yearMax").value = hi; drawYears();
}
function getYears(){
  const lo = +$("yearMin").value, hi = +$("yearMax").value;
  return lo <= YEAR_MIN && hi >= YEAR_MAX ? "" : `${lo > YEAR_MIN ? lo : ""}-${hi < YEAR_MAX ? hi : ""}`;
}
function drawYears(){
  const lo = +$("yearMin").value, hi = +$("yearMax").value, span = YEAR_MAX - YEAR_MIN;
  $("yearFill").style.left = ((lo - YEAR_MIN) / span * 100) + "%";
  $("yearFill").style.right = ((YEAR_MAX - hi) / span * 100) + "%";
  $("yearVal").textContent = lo <= YEAR_MIN && hi >= YEAR_MAX ? "Toutes les années" : lo === hi ? String(lo) : `${lo <= YEAR_MIN ? "Avant" : lo} – ${hi}`;
  // la poignée de gauche passe au premier plan quand elle est collée à droite (sinon on ne pourrait plus la déplacer)
  $("yearMin").style.zIndex = lo > YEAR_MAX - 5 ? 3 : 1;
}
$("yearMin").addEventListener("input", () => { if (+$("yearMin").value > +$("yearMax").value) $("yearMin").value = $("yearMax").value; drawYears(); });
$("yearMax").addEventListener("input", () => { if (+$("yearMax").value < +$("yearMin").value) $("yearMax").value = $("yearMin").value; drawYears(); });
(() => { const t = $("yearTicks"); [YEAR_MIN, 1950, 1980, 2000, YEAR_MAX].forEach(y => { const s = document.createElement("span"); s.textContent = y; s.style.left = ((y - YEAR_MIN) / (YEAR_MAX - YEAR_MIN) * 100) + "%"; t.appendChild(s); }); })();

function availHelp(){
  const w = S.type === "tv" ? "séries" : "films", v = segValue($("availSeg"));
  $("availHelp").textContent = v === "cinema"
    ? "Les films sortis en salle en France ces 6 dernières semaines."
    : v === "soon" ? (S.type === "tv" ? "Les séries qui commencent dans les 6 prochains mois." : "Les films qui sortent en salle en France dans les 6 prochains mois.")
    : S.type === "tv" ? `Toutes les ${w} déjà diffusées.` : `Tous les ${w} déjà sortis, sauf ceux encore à l'affiche en France.`;
  $("strictBlock").hidden = v !== "home";
  $("platformBlock").hidden = v !== "home" || !$("fStrict").checked;
}
// ---------- Mes plateformes ----------
let draftPlatforms = [], PROVIDERS = null;
async function loadProviders(){
  if (PROVIDERS) return PROVIDERS;
  const [a, b] = await Promise.all([ tmdb("/watch/providers/movie", { watch_region:"FR" }), tmdb("/watch/providers/tv", { watch_region:"FR" }) ]);
  const all = new Map();
  [...a.results, ...b.results].forEach(p => { if (!all.has(p.provider_id)) all.set(p.provider_id, p); });
  PROVIDERS = [...all.values()].sort((x, y) => (x.display_priorities?.FR ?? x.display_priority ?? 99) - (y.display_priorities?.FR ?? y.display_priority ?? 99)).slice(0, 40);
  return PROVIDERS;
}
async function renderPlatforms(){ renderSummaries(); if (!PROVIDERS) loadProviders().then(renderSummaries).catch(() => {}); }

// ---------- Sélecteurs à choix multiples ----------
const COUNTRIES = [["FR","France"],["US","États-Unis"],["GB","Royaume-Uni"],["BE","Belgique"],["CA","Canada"],["IT","Italie"],["ES","Espagne"],["DE","Allemagne"],
  ["JP","Japon"],["KR","Corée du Sud"],["CN","Chine"],["HK","Hong Kong"],["TW","Taïwan"],["IN","Inde"],["IE","Irlande"],["DK","Danemark"],["SE","Suède"],["NO","Norvège"],
  ["FI","Finlande"],["IS","Islande"],["NL","Pays-Bas"],["CH","Suisse"],["AT","Autriche"],["PL","Pologne"],["RO","Roumanie"],["GR","Grèce"],["TR","Turquie"],["IR","Iran"],
  ["IL","Israël"],["MX","Mexique"],["AR","Argentine"],["BR","Brésil"],["CL","Chili"],["CO","Colombie"],["AU","Australie"],["NZ","Nouvelle-Zélande"],["ZA","Afrique du Sud"],
  ["SN","Sénégal"],["MA","Maroc"],["TN","Tunisie"],["DZ","Algérie"],["EG","Égypte"],["LB","Liban"],["TH","Thaïlande"],["PH","Philippines"],["ID","Indonésie"]];
let draftGenres = [], draftCountries = [];
function summary(sel, names, none){
  if (!sel.length) return { text:none, empty:true };
  const n = sel.map(v => names.get(String(v))).filter(Boolean);
  if (n.length < sel.length) return { text:`${sel.length} sélectionné${sel.length>1?"s":""}`, empty:false };
  return { text: n.length <= 2 ? n.join(", ") : `${n.slice(0,2).join(", ")} +${n.length-2}`, empty:false };
}
function setSum(id, { text, empty }){ const el = $(id); el.textContent = text; el.classList.toggle("placeholder", empty); }
function renderSummaries(){
  setSum("genreSum", summary(draftGenres, new Map(genreOptions(S.type)), "Tous les genres"));
  setSum("countrySum", summary(draftCountries, new Map(COUNTRIES), "Tous les pays"));
  setSum("platformSum", summary(draftPlatforms, new Map((PROVIDERS||[]).map(p => [String(p.provider_id), p.provider_name])), "Toutes les plateformes"));
}
let picker = null;
function openPicker({ title, hint, items, selected, search, onDone }){
  picker = { items, sel:new Set(selected.map(String)), onDone };
  $("pickerTitle").textContent = title; $("pickerHint").textContent = hint || ""; $("pickerHint").hidden = !hint;
  $("pickerSearch").value = ""; $("pickerSearch").hidden = !search;
  drawPicker(); $("pickerSheet").hidden = false;
  if (search && matchMedia("(hover:hover)").matches) $("pickerSearch").focus();
}
function drawPicker(){
  const q = $("pickerSearch").value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const list = $("pickerList"); list.innerHTML = "";
  const rows = picker.items.filter(it => !q || it.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q));
  if (!rows.length){ list.innerHTML = `<p class="fine" style="padding:8px 6px">Aucun résultat.</p>`; return; }
  rows.forEach(it => {
    const b = document.createElement("button"); b.type = "button"; b.setAttribute("role","option");
    b.setAttribute("aria-selected", picker.sel.has(String(it.v)));
    b.innerHTML = `<span class="box"></span>` + (it.img ? `<img alt="">` : "") + `<span></span>`;
    if (it.img) b.querySelector("img").src = it.img;
    b.lastChild.textContent = it.label;
    b.onclick = () => { const k = String(it.v); picker.sel.has(k) ? picker.sel.delete(k) : picker.sel.add(k); b.setAttribute("aria-selected", picker.sel.has(k)); };
    list.appendChild(b);
  });
}
$("pickerSearch").addEventListener("input", drawPicker);
$("pickerClear").onclick = () => { picker.sel.clear(); drawPicker(); };
$("pickerDone").onclick = () => { picker.onDone([...picker.sel]); $("pickerSheet").hidden = true; renderSummaries(); };
$("pickerClose").onclick = () => { $("pickerSheet").hidden = true; };
$("genreBtn").onclick = () => openPicker({
  title:"Genres", hint:"Les titres d'au moins un des genres choisis sont proposés.",
  items:genreOptions(S.type).map(([v, label]) => ({ v, label })), selected:draftGenres, search:false,
  onDone: sel => { draftGenres = sel; } });
$("countryBtn").onclick = () => openPicker({
  title:"Pays de production", hint:"Les titres produits dans au moins un des pays choisis sont proposés.",
  items:COUNTRIES.map(([v, label]) => ({ v, label })), selected:draftCountries, search:true,
  onDone: sel => { draftCountries = sel; } });
$("platformBtn").onclick = async () => {
  try{ await loadProviders(); }catch{ return showNotice("Impossible de charger la liste des plateformes."); }
  openPicker({ title:"Mes plateformes", hint:"Seuls les catalogues des plateformes choisies sont proposés quand l'option « tout de suite » est active.",
    items:PROVIDERS.map(p => ({ v:p.provider_id, label:p.provider_name, img:IMG(p.logo_path, "w92") })), selected:draftPlatforms, search:true,
    onDone: sel => { draftPlatforms = sel.map(Number); } });
};
$("fStrict").addEventListener("change", () => {
  // désactiver l'option stricte remet « Mes plateformes » à zéro
  if (!$("fStrict").checked){ draftPlatforms = []; renderSummaries(); }
  availHelp();
});
function activeFilterCount(){ const f=S.filters; return ["period","rating","person","strict"].filter(k => f[k]).length + (f.genres.length ? 1 : 0) + (f.avail !== "home" ? 1 : 0) + (f.countries?.length ? 1 : 0) + (f.mode !== "top" ? 1 : 0); }

const saveFilters = () => LS.set("sinema-filters2", JSON.stringify(S.filtersBy));
async function switchType(type){
  if (type === S.type) return;
  S.type = type; LS.set("sinema-type", type);
  S.history = []; S.loading = false;
  renderStage();
  await refill(true).catch(reportError); renderAll();
}

// Les listes ne sont construites que si elles sont affichées ; sinon elles le seront à l'ouverture de l'onglet.
function renderLists(){
  if (S.view === "matches") renderMatches(); else { S.matchesDirty = true; updateMatchCount(); }
  if (S.view === "mine") renderMine(); else S.mineDirty = true;
}
function updateMatchCount(){ $("mcount").textContent = matchList().filter(x => x.kind !== "partial" && !S.watched.has(x.id)).length; }
// Pastilles des autres salons : un seul calcul même si plusieurs changements arrivent d'affilée
let badgeTimer = 0;
function scheduleBadges(){ clearTimeout(badgeTimer); badgeTimer = setTimeout(renderRoomBadges, 250); }
function renderAll(){
  renderPeople(); renderStage(); renderLists(); renderRoomBadges();
  const n = activeFilterCount(); $("fcount").hidden = !n; $("fcount").textContent = n;
}

function setView(v){
  // en quittant « Ma watchlist », la recherche, le genre choisi et la suggestion sont remis à zéro
  if (S.view === "mine" && v !== "mine" && (S.mineQuery || S.mineGenre)){
    S.mineQuery = ""; $("mineSearch").value = ""; S.mineGenre = ""; $("surprise").hidden = true; renderMine();
  }
  S.view = v; document.querySelector(".app").dataset.view = v;
  if (v === "matches" && S.matchesDirty) renderMatches();
  if (v === "mine" && S.mineDirty) renderMine();
  segSelectBy($("tabs"), b => b.dataset.view === v);
  $("view-swipe").hidden = v !== "swipe"; $("view-matches").hidden = v !== "matches"; $("view-mine").hidden = v !== "mine";
  // une barre qui était masquée n'a pas pu placer son curseur : on le recalcule (sans toucher aux onglets, pour garder leur animation)
  requestAnimationFrame(() => { document.querySelectorAll(".seg:not(.tabs)").forEach(sg => segMove(sg, false)); if (v === "mine") genreEdges(); });
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
  renderStage(); renderLists(); scheduleBadges();
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
  renderLists(); scheduleBadges();
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
  // Vu ensemble ici = je l'ai vu : mon choix passe à « déjà vu », donc dans mes autres salons
  // le titre reste proposé « à revoir » à ceux qui en ont envie.
  if (!had && S.mine.get(id)?.verdict === "like"){
    const movie = S.mine.get(id).movie || movieOf(id);
    S.mine.set(id, { verdict:"seen", movie, at:new Date().toISOString() });
    saveVerdict(id, "seen", movie).catch(reportError);
    renderMine(); renderRoomBadges();
  }
  renderMatches();
  const q = had ? sb.from("watched").delete().match({ room_id:S.room.id, movie_id:id })
                : sb.from("watched").upsert({ room_id:S.room.id, movie_id:id }, { ignoreDuplicates:true });
  const { error } = await q; if (error) reportError(error);
}

// Notification de match : un bandeau compact en haut de l'écran, cliquable
let matchTimer, toastTarget = null;
function celebrate(id, kind){ toast(id, kind, null); }
function toast(id, kind, room){
  const m = movieOf(id), t = $("match");
  $("matchTitle").textContent = m.title || "Nouveau titre";
  const img = $("matchPoster"); img.hidden = !m.poster; if (m.poster) img.src = IMG(m.poster, "w92");
  $("matchKind").textContent = (kind === "revoir" ? "Match à revoir" : "Match !") + (room ? ` · ${roomLabel(room)}` : "");
  t.classList.toggle("revoir", kind === "revoir");
  toastTarget = room;
  t.hidden = false; t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
  clearTimeout(matchTimer); matchTimer = setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.hidden = true, 250); }, 2600);
}
$("match").onclick = async () => {
  $("match").hidden = true;
  if (toastTarget && toastTarget.id !== S.room?.id){ S.view = "matches"; try{ await openRoom(toastTarget); }catch(err){ reportError(err); } }
  else setView("matches");
};

// ================== Feuilles : menu et filtres ==================
// Vide les champs de création / d'invitation (pour ne pas réutiliser un ancien code par erreur)
function clearRoomInputs(){ ["codeInput","menuCode","newRoomName","menuRoomName"].forEach(id => $(id).value = ""); }
function openMenu(){ clearRoomInputs(); renderMenu(); $("newRoomForm").hidden = true; $("joinRoomForm").hidden = true; $("menuSheet").hidden = false; }
function openFilters(){ renderFilters(); $("filtersSheet").hidden = false; refreshSegs(); }
function closeSheets(){ ["menuSheet","filtersSheet","profileSheet","pickerSheet"].forEach(id => $(id).hidden = true); $("personList").hidden = true; }
document.querySelectorAll(".overlay").forEach(o => {
  o.addEventListener("click", e => {
    if (o.id === "pickerSheet"){ if (e.target === o) o.hidden = true; return; }
    if (e.target === o || e.target.closest("[data-close]")) closeSheets();
  });
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
$("revealCode").onclick = () => {
  const show = $("revealCode").getAttribute("aria-pressed") !== "true";
  $("revealCode").setAttribute("aria-pressed", show); $("revealCode").textContent = show ? "Masquer" : "Afficher";
  $("shareCode").textContent = show ? S.room.code : "••••••••";
};
$("copyLink").onclick = async () => {
  const link = `${HOME}?salon=${S.room.code}`;
  if (navigator.share){ try{ await navigator.share({ title:"Sinema", text:`Rejoins le salon « ${roomLabel(S.room)} » sur Sinema`, url:link }); return; }catch{} }
  try{ await navigator.clipboard.writeText(link); $("copyLink").textContent = "Lien copié ✓"; setTimeout(() => $("copyLink").textContent = "Copier le lien d'invitation", 1500); }
  catch{ showNotice("Copie impossible ici. Voici le lien : " + link); }
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
  S.filters = { mode:segValue($("modeSeg")) || "top", genres:draftGenres, period:getYears(), rating:segValue($("rateSeg")), countries:draftCountries, person: S.type === "tv" ? null : draftPerson, avail:segValue($("availSeg")) || "home", strict:$("fStrict").checked };
  if (!S.filters.strict || S.filters.avail !== "home") draftPlatforms = []; // pas d'option stricte = pas de plateformes retenues
  saveFilters();
  if (JSON.stringify(draftPlatforms) !== JSON.stringify(S.platforms)){
    S.platforms = draftPlatforms; LS.set("sinema-platforms", JSON.stringify(S.platforms));
    sb.auth.updateUser({ data:{ platforms:S.platforms } }).catch(() => {});
  }
  closeSheets(); setView("swipe");
  S.loading = false; await refill(true).catch(reportError); renderAll();
};
$("resetFilters").onclick = () => { S.filters = { ...DEFAULT_FILTERS }; renderFilters(); };

// ---------- Filtre par réalisateur / acteur ----------
let draftPerson = null, personTimer = null, personReq = 0;
const DEPT = { Acting:"Acteur·rice", Directing:"Réalisation", Writing:"Scénario", Production:"Production" };
function renderPerson(){
  $("personChosen").hidden = !draftPerson; $("fPerson").hidden = !!draftPerson;
  if (draftPerson) $("personLabel").textContent = `${draftPerson.name}${draftPerson.dept ? " · " + draftPerson.dept : ""}`;
  $("fPerson").value = ""; $("personList").hidden = true; $("fPerson").setAttribute("aria-expanded","false");
}
$("personClear").onclick = () => { draftPerson = null; renderPerson(); $("fPerson").focus(); };
$("fPerson").addEventListener("input", () => {
  clearTimeout(personTimer);
  const q = $("fPerson").value.trim();
  if (q.length < 2){ $("personList").hidden = true; return; }
  personTimer = setTimeout(async () => {
    const my = ++personReq;
    try{
      const d = await tmdb("/search/person", { query:q, include_adult:"false" });
      if (my !== personReq) return;
      const list = $("personList"); list.innerHTML = "";
      const people = d.results.filter(p => p.known_for_department === "Acting" || p.known_for_department === "Directing").slice(0,6);
      if (!people.length){ list.innerHTML = `<div class="fine" style="padding:10px">Personne trouvé.</div>`; }
      people.forEach(p => {
        const b = document.createElement("button"); b.type = "button"; b.setAttribute("role","option");
        b.innerHTML = (p.profile_path ? `<img alt="">` : `<span class="ph"></span>`) + `<span class="s-info"><b></b><small></small></span>`;
        if (p.profile_path) b.querySelector("img").src = IMG(p.profile_path, "w92");
        b.querySelector("b").textContent = p.name;
        const known = (p.known_for || []).map(k => k.title || k.name).filter(Boolean).slice(0,2).join(", ");
        b.querySelector("small").textContent = [DEPT[p.known_for_department] || "", known].filter(Boolean).join(" · ");
        b.onclick = () => { draftPerson = { id:p.id, name:p.name, dept:DEPT[p.known_for_department] || "", role: p.known_for_department === "Directing" ? "director" : "actor" }; renderPerson(); };
        list.appendChild(b);
      });
      list.hidden = false; $("fPerson").setAttribute("aria-expanded","true");
    }catch(err){ reportError(err); }
  }, 250);
});
$("fPerson").addEventListener("keydown", e => {
  const opts = [...$("personList").querySelectorAll("button")]; if (!opts.length || $("personList").hidden) return;
  let i = opts.findIndex(o => o.getAttribute("aria-selected") === "true");
  if (e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); i = e.key === "ArrowDown" ? Math.min(opts.length-1, i+1) : Math.max(0, i-1); opts.forEach((o,k) => o.setAttribute("aria-selected", k===i)); opts[i].scrollIntoView({ block:"nearest" }); }
  else if (e.key === "Enter" && i >= 0){ e.preventDefault(); opts[i].click(); }
  else if (e.key === "Escape") $("personList").hidden = true;
});

// ---------- Profil ----------
let draftAv = null;
function openProfile(){
  draftAv = { ...S.avatar };
  $("pseudoInput").value = S.name; $("profileEmail").textContent = S.email; $("newEmail").value = "";
  $("pwForm").hidden = true; $("pwCode").value = ""; $("pwNew").value = "";
  $("menuSheet").hidden = true; $("profileSheet").hidden = false;
  renderAvatarEditor();
}
function renderAvatarEditor(){
  $("avPreview").innerHTML = avatarSVG(draftAv, 104, "Aperçu de ton avatar");
  const grid = $("avBases"); grid.innerHTML = "";
  BASES.forEach(b => {
    const btn = document.createElement("button"); btn.type="button"; btn.title=b.label; btn.setAttribute("aria-label", b.label);
    btn.setAttribute("aria-pressed", draftAv.b === b.id);
    btn.innerHTML = avatarSVG({ ...draftAv, b:b.id, head:"none", eyes:"none", face:"none", neck:"none" }, 52, b.label);
    btn.onclick = () => { draftAv.b = b.id; renderAvatarEditor(); };
    grid.appendChild(btn);
  });
  const sw = $("avColors"); sw.innerHTML = "";
  AV_COLORS.forEach((c, i) => {
    const btn = document.createElement("button"); btn.type="button"; btn.style.background = c; btn.setAttribute("aria-label", `Couleur ${i+1}`);
    btn.setAttribute("aria-pressed", draftAv.c === i); btn.onclick = () => { draftAv.c = i; renderAvatarEditor(); };
    sw.appendChild(btn);
  });
  const slots = $("avSlots"); slots.innerHTML = "";
  SLOTS.forEach(slot => {
    const wrap = document.createElement("div"); wrap.className = "stack"; wrap.style.gap = "6px";
    const lab = document.createElement("label"); lab.textContent = slot.label; wrap.appendChild(lab);
    const row = document.createElement("div"); row.className = "opts";
    Object.entries(slot.items).forEach(([key, item]) => {
      const btn = document.createElement("button"); btn.type="button";
      const label = item ? item.label : "Aucun";
      btn.title = label; btn.setAttribute("aria-label", label); btn.setAttribute("aria-pressed", draftAv[slot.key] === key);
      btn.innerHTML = avatarSVG({ ...draftAv, [slot.key]:key }, 40, label);
      btn.onclick = () => { draftAv[slot.key] = key; renderAvatarEditor(); };
      row.appendChild(btn);
    });
    wrap.appendChild(row); slots.appendChild(wrap);
  });
}
$("profileBtn").onclick = openProfile;
$("saveProfile").onclick = async () => {
  const name = $("pseudoInput").value.trim();
  if (!name) return showNotice("Indique un pseudo.");
  const avatar = cleanAvatar(draftAv), btn = $("saveProfile"); btn.disabled = true;
  try{
    const [{ error:e1 }, { error:e2 }] = await Promise.all([
      sb.rpc("set_profile", { p_name:name, p_avatar:avatar }),
      sb.auth.updateUser({ data:{ name, avatar } }),
    ]);
    if (e1 || e2) throw (e1 || e2);
    S.name = name; S.avatar = avatar; LS.set("cad-name", name);
    S.members[S.me] = name; S.avatars[S.me] = avatar;
    renderPeople(); btn.textContent = "Profil enregistré ✓";
    setTimeout(() => btn.textContent = "Enregistrer le profil", 1600);
  }catch(err){ reportError(err); }
  finally{ btn.disabled = false; }
};
$("emailBtn").onclick = async () => {
  const email = $("newEmail").value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return showNotice("Cette adresse e-mail n'est pas valide.");
  if (email.toLowerCase() === S.email.toLowerCase()) return showNotice("C'est déjà ton adresse actuelle.");
  const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: HOME });
  if (error) return showNotice(authMessage(error));
  closeSheets();
  showNotice(`Un lien de confirmation a été envoyé à ${email} (et peut-être aussi à ton adresse actuelle). Le changement sera effectif une fois le lien validé.`);
};
$("sendCodeBtn").onclick = async () => {
  const btn = $("sendCodeBtn"); btn.disabled = true;
  const { error } = await sb.auth.reauthenticate();
  btn.disabled = false;
  if (error) return showNotice(authMessage(error));
  $("pwForm").hidden = false; btn.textContent = "Renvoyer un code"; $("pwCode").focus();
  showNotice(`Code envoyé à ${S.email}. Il est valable quelques minutes.`);
};
$("pwBtn").onclick = async () => {
  const nonce = $("pwCode").value.trim(), password = $("pwNew").value;
  if (!nonce) return showNotice("Saisis le code reçu par e-mail.");
  if (!PASS_OK(password)) return showNotice("Mot de passe trop faible : 10 caractères minimum, avec des lettres et des chiffres.");
  const { error } = await sb.auth.updateUser({ password, nonce });
  if (error) return showNotice(/nonce|otp|expired|invalid/i.test(error.message) ? "Code incorrect ou expiré. Demande un nouveau code." : authMessage(error));
  closeSheets(); showNotice("Mot de passe modifié.");
};

// ================== Événements ==================
$("like").onclick = () => act("like"); $("nope").onclick = () => act("nope"); $("vu").onclick = () => act("vu"); $("skip").onclick = () => act("skip");
$("undo").onclick = undo;
$("hideSeen").onchange = renderMatches;
$("mineSearch").addEventListener("input", e => { S.mineQuery = e.target.value; renderMine(); });
// Bandeau de genres sur une ligne : fondus et flèches selon la position du défilement
function genreEdges(){
  const g = $("mineGenres"), start = g.scrollLeft <= 4, end = g.scrollLeft + g.clientWidth >= g.scrollWidth - 4;
  g.classList.toggle("start", start); g.classList.toggle("end", end);
  $("gPrev").disabled = start; $("gNext").disabled = end;
  $("gPrev").hidden = $("gNext").hidden = start && end;   // tout tient sur la ligne : pas de flèches
}
$("mineGenres").addEventListener("scroll", genreEdges);
// Défilement par pastilles entières, toujours aligné à gauche : vers la droite, la pastille coupée devient la première ;
// vers la gauche, on recule d'environ une largeur en commençant par un genre entier
const ARROW_ZONE = 0; // les flèches sont désormais à côté du bandeau, elles ne masquent plus rien
// Défilement animé (même rendu sur tous les navigateurs), désactivé si l'utilisateur limite les animations
let glideAnim = 0;
function glide(el, delta, ms = 380){
  const from = el.scrollLeft, to = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, from + delta));
  cancelAnimationFrame(glideAnim);
  if (reduceMotion() || Math.abs(to - from) < 2){ el.scrollLeft = to; return; }
  const t0 = performance.now(), ease = t => 1 - Math.pow(1 - t, 3);
  const step = now => { const t = Math.min(1, (now - t0) / ms); el.scrollLeft = from + (to - from) * ease(t); if (t < 1) glideAnim = requestAnimationFrame(step); };
  glideAnim = requestAnimationFrame(step);
}
function genreStep(dir){
  const g = $("mineGenres"), box = g.getBoundingClientRect(), chips = [...g.querySelectorAll("button")];
  const left = box.left + ARROW_ZONE, right = box.right - ARROW_ZONE;
  if (dir > 0){
    const cut = chips.find(c => c.getBoundingClientRect().right > right + 1);
    if (cut) glide(g, cut.getBoundingClientRect().left - left);
  } else {
    // retour d'environ une largeur, en alignant toujours un genre entier sur le bord gauche
    const pos = c => c.getBoundingClientRect().left - box.left + g.scrollLeft;   // position dans le bandeau
    const desired = g.scrollLeft - g.clientWidth;
    let first = chips.find(c => pos(c) >= desired - 1) || chips[0];
    if (pos(first) >= g.scrollLeft - 1){ const i = chips.indexOf(first); first = chips[Math.max(0, i - 1)]; } // avancer d'au moins un genre
    glide(g, pos(first) - g.scrollLeft);
  }
}
$("gPrev").onclick = () => genreStep(-1);
$("gNext").onclick = () => genreStep(1);
// molette verticale = défilement horizontal au-dessus du bandeau
$("mineGenres").addEventListener("wheel", e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)){ e.preventDefault(); $("mineGenres").scrollLeft += e.deltaY; } }, { passive:false });
window.addEventListener("resize", () => genreEdges());
// le bandeau est souvent rempli alors que l'onglet est masqué : on recalcule dès qu'il prend sa vraie taille
if ("ResizeObserver" in window) new ResizeObserver(() => genreEdges()).observe($("mineGenres"));
$("mineSort").value = S.mineSort;
$("mineSort").addEventListener("change", e => { S.mineSort = e.target.value; LS.set("sinema-mine-sort", S.mineSort); if (S.mineSort === "random") randSeed = Math.random(); renderMine(); });
// « Surprends-moi » : un titre tiré au hasard parmi ceux affichés, mis en avant en haut de la liste
$("surpriseBtn").onclick = () => {
  const ids = [...$("minelist").querySelectorAll(".row")].length ? S.mineVisible || [] : [];
  const box = $("surprise");
  if (!ids.length){ box.hidden = true; return; }
  const id = ids[Math.floor(Math.random() * ids.length)], e = S.mine.get(id);
  box.innerHTML = `<p class="lab">Et pourquoi pas…</p>`;
  const row = rowEl(e.movie || {}, id);
  const close = document.createElement("button"); close.type = "button"; close.className = "iconbtn"; close.textContent = "✕"; close.setAttribute("aria-label","Fermer");
  close.onclick = () => box.hidden = true;
  row.querySelector(".side").appendChild(close);
  getDetails(id).then(d => { if (!d) return; const pv = row.querySelector(".pv"); d.providers.forEach(p => { const i=document.createElement("img"); i.src=IMG(p.logo,"w92"); i.alt=p.name; i.title=p.name; pv.appendChild(i); }); });
  box.appendChild(row); box.hidden = false;
};
document.addEventListener("keydown", e => {
  if (["INPUT","SELECT","TEXTAREA"].includes(e.target.tagName) || $("view-swipe").hidden || !$("menuSheet").hidden || !$("filtersSheet").hidden) return;
  if (e.key === "ArrowRight") act("like");
  else if (e.key === "ArrowLeft") act("nope");
  else if (e.key === "ArrowUp"){ e.preventDefault(); act("vu"); }
  else if (e.key === "ArrowDown"){ e.preventDefault(); act("skip"); }
  else if (e.key === "Backspace") undo();
});

boot().catch(reportError);
