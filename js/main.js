// Sinema · main.js — Point d'entrée : démarrage, après connexion, changement d'onglet et de type, rendu global, raccourcis clavier.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js?v=202611011924";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { cleanAvatar, avatarFor } from "./avatars.js?v=202611011924";
import { $, GENRES, LS, OFFLINE_TEXT, S, isOffline, reportError, showOffline, sb, segInit, setSb, segMove, segSelectBy, showNotice, tmdb } from "./core.js?v=202611011924";
import { setAuthMode, showAuth, showReset } from "./auth.js?v=202611011924";
import { loadMine, loadRoom, loadRooms, matchList, onboard, openRoom, renderRoomBadges, showOb, subscribeMine } from "./rooms.js?v=202611011924";
import { act, flushOutbox, pendingRows, refill, renderPeople, renderStage, undo } from "./deck.js?v=202611011924";
import { genreEdges, renderMatches, renderMine } from "./lists.js?v=202611011924";
import { activeFilterCount, availHelp, modeHelp } from "./sheets.js?v=202611011924";

// ================== Démarrage ==================
async function boot(){
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY){
    showNotice("Configuration incomplète : renseigne SUPABASE_URL et SUPABASE_ANON_KEY dans config.js.");
    return;
  }
  ["tabs","authSeg","mineSeg","modeSeg","rateSeg","typeSeg","mineTypeSeg","availSeg","onboardSeg"].forEach(id => segInit($(id), b => onSeg(id, b)));
  segSelectBy($("typeSeg"), b => b.dataset.v === S.type);
  const url = new URL(location.href);
  const h = location.hash.slice(1);
  const invite = (url.searchParams.get("salon") || (/^[A-Za-z0-9]{6,8}$/.test(h) ? h : "")).toUpperCase();
  if (invite) LS.set("sinema-invite", invite);
  const isRecovery = /type=recovery/.test(location.hash);

  setSb(createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:"implicit" } }));
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
  S.name = session.user.user_metadata?.name || LS.get("sinema-name") || (S.email.split("@")[0]);
  S.avatar = cleanAvatar(session.user.user_metadata?.avatar || avatarFor(S.me));
  if (Array.isArray(session.user.user_metadata?.platforms)) S.platforms = session.user.user_metadata.platforms.filter(Number.isInteger);
  await flushOutbox().catch(reportError); // choix faits hors connexion lors d'une visite précédente
  const [gm, gt] = await Promise.all([ tmdb("/genre/movie/list"), tmdb("/genre/tv/list"), loadMine(), loadRooms() ]);
  pendingRows().forEach(r => S.mine.set(r.movie_id, { verdict:r.verdict, movie:r.movie, at:r.updated_at })); // encore hors connexion
  GENRES.movie = Object.fromEntries(gm.genres.map(x=>[x.id,x.name]));
  GENRES.tv = Object.fromEntries(gt.genres.map(x=>[x.id,x.name]));
  subscribeMine();

  const invite = LS.get("sinema-invite");
  if (invite){
    LS.set("sinema-invite","");
    const known = S.rooms.find(r => r.code === invite);
    if (known) return openRoom(known);
    return onboard(invite);
  }
  const saved = S.rooms.find(r => r.code === LS.get("sinema-room")) || S.rooms[0];
  if (saved) return openRoom(saved);
  onboard(null);
}

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

// ================== Événements ==================
$("like").onclick = () => act("like"); $("nope").onclick = () => act("nope"); $("vu").onclick = () => act("vu"); $("skip").onclick = () => act("skip");
$("undo").onclick = undo;
$("hideSeen").onchange = renderMatches;
$("mineSearch").addEventListener("input", e => { S.mineQuery = e.target.value; renderMine(); });
document.addEventListener("keydown", e => {
  if (["INPUT","SELECT","TEXTAREA"].includes(e.target.tagName) || $("view-swipe").hidden || !$("menuSheet").hidden || !$("filtersSheet").hidden) return;
  if (e.key === "ArrowRight") act("like");
  else if (e.key === "ArrowLeft") act("nope");
  else if (e.key === "ArrowUp"){ e.preventDefault(); act("vu"); }
  else if (e.key === "ArrowDown"){ e.preventDefault(); act("skip"); }
  else if (e.key === "Backspace") undo();
});

// ---------- Hors connexion ----------
window.addEventListener("offline", showOffline);
window.addEventListener("online", async () => {
  if ($("notice").textContent === OFFLINE_TEXT) showNotice("");
  if (!S.me) return;
  try{
    const sent = await flushOutbox();
    await Promise.all([loadMine(), S.room ? loadRoom() : null]);
    pendingRows().forEach(r => S.mine.set(r.movie_id, { verdict:r.verdict, movie:r.movie, at:r.updated_at }));
    renderAll();
    if (S.queue.length < 5) refill().then(renderStage).catch(reportError);
    if (sent) console.info(`${sent} choix envoyés au retour du réseau`);
  }catch(err){ reportError(err); }
});
// le service worker garde le site et les affiches pour les visites sans réseau
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost"))
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(err => console.warn("Service worker non installé", err)));

boot().catch(reportError);
if (isOffline()) showOffline();

export { afterLogin, renderAll, renderLists, saveFilters, scheduleBadges, setView };
