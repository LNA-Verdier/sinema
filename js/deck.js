// Sinema · deck.js — Pile de cartes : filtres TMDB, remplissage, tri chez moi / au cinéma, rendu des cartes et actions (swipe, annuler, vu).
import { avatarSVG, avatarFor } from "./avatars.js?v=202611011920";
import { $, LS, isOffline, showOffline, ANIM, FAMILY, GENRES, IMG, S, fmtMins, genreMatch, getDetails, isAnimCat, isTv, normalize, posterSize, reduceMotion, reportError, sb, snapshot, tmdb, tmdbPage, typeOf } from "./core.js?v=202611011920";
import { matchKind, movieOf, nameOf, openRoom, others, renderRoomBadges, roomLabel } from "./rooms.js?v=202611011920";
import { renderMatches, renderMine } from "./lists.js?v=202611011920";
import { openMenu } from "./sheets.js?v=202611011920";
import { renderAll, renderLists, scheduleBadges, setView } from "./main.js?v=202611011920";

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

// Hors connexion, les choix attendent dans une boîte d'envoi (sur l'appareil) et partent au retour du réseau.
const OUTBOX = "sinema-outbox";
const netError = error => isOffline() || /Failed to fetch|NetworkError|Load failed|network/i.test(error?.message || "");
function outbox(){ try{ const o = JSON.parse(LS.get(OUTBOX) || "{}"); return o && o.me === S.me ? o.rows : {}; }catch{ return {}; } }
function setOutbox(rows){ LS.set(OUTBOX, Object.keys(rows).length ? JSON.stringify({ me:S.me, rows }) : ""); }
async function saveVerdict(id, verdict, movie){
  const row = { user_id:S.me, movie_id:id, verdict, movie, updated_at:new Date().toISOString() };
  const { error } = await sb.from("user_swipes").upsert(row);
  if (!error) return;
  if (!netError(error)) throw error;
  setOutbox({ ...outbox(), [id]: row });
  showOffline();
}
const pendingRows = () => Object.values(outbox());
// à la connexion et au retour du réseau
async function flushOutbox(){
  const rows = Object.values(outbox());
  if (!rows.length) return 0;
  const { error } = await sb.from("user_swipes").upsert(rows);
  if (error){ if (netError(error)) return 0; throw error; }
  setOutbox({});
  return rows.length;
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

export { flushOutbox, pendingRows, OUTBOX, act, celebrate, filterOk, refill, removeVerdict, renderPeople, renderStage, setVerdict, toast, toggleWatched, undo };
