// Sinema · core.js — Socle partagé : utilitaires, barres de choix, accès TMDB, genres, état de l'application (S) et client Supabase.
import { TMDB_TOKEN } from "../config.js?v=202611011848";

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
const setSb = client => { sb = client; }; // client Supabase, créé au démarrage par main.js

export { setSb, $, ANIM, DEFAULT_FILTERS, FAMILY, GENRES, HOME, ICON, IMG, LS, S, fmtMins, genreMatch, genreOptions, getDetails, isAnimCat, isTv, normalize, posterSize, reduceMotion, refreshSegs, reportError, sb, segInit, segMove, segSelectBy, segValue, showNotice, snapshot, tmdb, tmdbPage, typeOf };
