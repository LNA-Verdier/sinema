import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, TMDB_TOKEN } from "./config.js";

// ================== Utilitaires ==================
const $ = id => document.getElementById(id);
const LS = { get(k){ try{ return localStorage.getItem(k); }catch{ return null; } }, set(k,v){ try{ localStorage.setItem(k,v); }catch{} } };
const IMG = (path, size="w500") => path ? `https://image.tmdb.org/t/p/${size}${path}` : "";
const fmtMins = m => m ? `${Math.floor(m/60)} h ${String(m%60).padStart(2,"0")}` : "";
const COLORS = ["#D9361E","#2A6FDB","#1E8F5A","#A33DB8","#C98B1E"];
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function showNotice(t){ const n=$("notice"); n.textContent=t; n.hidden=!t; }
function reportError(err){
  console.error(err);
  showNotice("Oups, une erreur est survenue : « "+((err && err.message) || err)+" ». Recharge la page, et si ça persiste envoie ce message à Claude.");
}
window.addEventListener("error", e => reportError(e.error || e.message));
window.addEventListener("unhandledrejection", e => reportError(e.reason));

// ================== TMDB ==================
async function tmdb(path, params = {}){
  const qs = new URLSearchParams({ language: "fr-FR", ...params });
  const r = await fetch(`https://api.themoviedb.org/3${path}?${qs}`, { headers: { Authorization: `Bearer ${TMDB_TOKEN}`, accept: "application/json" } });
  if (r.status === 401) throw new Error("Jeton TMDB refusé : vérifie TMDB_TOKEN dans config.js");
  if (!r.ok) throw new Error(`TMDB a répondu ${r.status}`);
  return r.json();
}
let GENRE_NAMES = {};
const details = new Map(); // id -> promesse des détails (durée, plateformes FR)
function getDetails(id){
  if (!details.has(id)) details.set(id, tmdb(`/movie/${id}`, { append_to_response: "watch/providers" }).then(d => ({
    runtime: d.runtime,
    genres: (d.genres||[]).map(g=>g.name),
    providers: ((d["watch/providers"]?.results?.FR?.flatrate) || []).slice(0,5).map(p=>({ name:p.provider_name, logo:p.logo_path })),
    link: d["watch/providers"]?.results?.FR?.link || `https://www.themoviedb.org/movie/${id}`,
  })).catch(() => null));
  return details.get(id);
}
// Instantané minimal stocké avec chaque swipe (affiche des matchs sans rappeler TMDB)
const snapshot = m => ({ id:m.id, title:m.title, year:m.year, poster:m.poster, overview:(m.overview||"").slice(0,300), genres:m.genres, vote:m.vote });
function normalize(m){
  return { id:m.id, title:m.title, year:(m.release_date||"").slice(0,4), poster:m.poster_path, overview:m.overview,
    genres:(m.genre_ids||[]).map(g=>GENRE_NAMES[g]).filter(Boolean).slice(0,3), vote:m.vote_average };
}

// ================== État ==================
const S = {
  me:null, name:LS.get("cad-name")||"", roomId:null, roomCode:null,
  members:{},            // user_id -> nom
  swipes:new Map(),      // movie_id -> { movie, by: { user_id: verdict } }
  watched:new Set(),
  queue:[], page:0, totalPages:1, genre:"", loading:false,
  history:[], busy:false,
};
let sb;

// ================== Démarrage ==================
async function boot(){
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TMDB_TOKEN){
    showNotice("Configuration incomplète : renseigne SUPABASE_URL, SUPABASE_ANON_KEY et TMDB_TOKEN dans config.js.");
    return;
  }
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  let { data:{ session } } = await sb.auth.getSession();
  if (!session){
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) throw new Error("Connexion impossible ("+error.message+"). As-tu activé les connexions anonymes dans Supabase ?");
    session = data.session;
  }
  S.me = session.user.id;

  const hashCode = (location.hash||"").replace("#","").toUpperCase();
  const saved = LS.get("cad-room");
  if (hashCode && hashCode !== saved) return onboard(hashCode);
  if (saved && S.name) return enterRoom(saved);
  if (saved) return onboard(saved);
  onboard(null);
}

function onboard(code){
  $("view-onboard").hidden = false;
  $("nameInput").value = S.name;
  $("joinBlock").hidden = !code; $("createBlock").hidden = !!code;
  if (code) $("joinCodeLabel").textContent = code;
  const name = () => { const v=$("nameInput").value.trim(); if(!v){ $("nameInput").focus(); return null; } S.name=v; LS.set("cad-name", v); return v; };
  $("onboardForm").onsubmit = async e => {
    e.preventDefault(); if (!name()) return;
    const btn = code ? $("joinBtn") : $("createBtn"); btn.disabled = true;
    try{
      if (code) await enterRoom(code);
      else {
        const { data, error } = await sb.rpc("create_room", { p_name: S.name });
        if (error) throw error;
        await enterRoom(data, true);
      }
    } catch(err){ reportError(err); } finally { btn.disabled = false; }
  };
  $("joinCodeBtn").onclick = async () => {
    const c = $("codeInput").value.trim().toUpperCase();
    if (c.length !== 6){ showNotice("Le code fait 6 caractères."); return; }
    if (!name()) return;
    try{ await enterRoom(c); } catch(err){ reportError(err); }
  };
}

async function enterRoom(code, justCreated = false){
  const { data:roomId, error } = await sb.rpc("join_room", { p_code: code, p_name: S.name });
  if (error){
    if (/room_not_found/.test(error.message)){ LS.set("cad-room",""); showNotice("Ce salon n'existe pas. Vérifie le code ou crée un nouveau salon."); onboard(null); return; }
    throw error;
  }
  S.roomId = roomId; S.roomCode = code; LS.set("cad-room", code);
  history.replaceState(null, "", "#"+code);
  showNotice("");
  $("view-onboard").hidden = true; $("tabs").hidden = false; setTab("swipe");

  const [g] = await Promise.all([ tmdb("/genre/movie/list"), loadRoom() ]);
  GENRE_NAMES = Object.fromEntries(g.genres.map(x=>[x.id,x.name]));
  const sel = $("genre"); sel.length = 1;
  g.genres.forEach(x => { const o=document.createElement("option"); o.value=x.id; o.textContent=x.name; sel.appendChild(o); });
  subscribe();
  await refill(true);
  renderAll();
  if (justCreated) openShare();
}

async function loadRoom(){
  const [m, s, w] = await Promise.all([
    sb.from("members").select("user_id,name").eq("room_id", S.roomId),
    sb.from("swipes").select("user_id,movie_id,verdict,movie").eq("room_id", S.roomId),
    sb.from("watched").select("movie_id").eq("room_id", S.roomId),
  ]);
  for (const r of [m,s,w]) if (r.error) throw r.error;
  S.members = Object.fromEntries(m.data.map(x=>[x.user_id, x.name]));
  S.swipes = new Map();
  s.data.forEach(applySwipe);
  S.watched = new Set(w.data.map(x=>x.movie_id));
}
function applySwipe(row){
  const e = S.swipes.get(row.movie_id) || { movie: row.movie, by: {} };
  e.by[row.user_id] = row.verdict;
  if (row.movie && row.movie.title) e.movie = row.movie;
  S.swipes.set(row.movie_id, e);
}
function removeSwipe(row){
  const e = S.swipes.get(row.movie_id); if (!e) return;
  delete e.by[row.user_id];
  if (!Object.keys(e.by).length) S.swipes.delete(row.movie_id);
}

function subscribe(){
  const f = `room_id=eq.${S.roomId}`;
  sb.channel("room-"+S.roomId)
    .on("postgres_changes", { event:"*", schema:"public", table:"swipes", filter:f }, ({ eventType, new:n, old:o }) => {
      if (eventType === "DELETE"){ if (o.room_id === S.roomId){ removeSwipe(o); renderAll(); } return; }
      if (n.user_id === S.me) return; // déjà appliqué localement
      const before = matchKind(n.movie_id);
      applySwipe(n);
      const after = matchKind(n.movie_id);
      if (after && after !== before) celebrate(n.movie_id, after);
      // un film que l'autre aime remonte dans ma pile
      if (n.verdict === "like" && !myVerdict(n.movie_id) && !S.queue.some(q=>q.id===n.movie_id) && n.movie?.title && genreOk(n.movie)){
        S.queue.splice(Math.min(2, S.queue.length), 0, n.movie);
      }
      renderAll();
    })
    .on("postgres_changes", { event:"*", schema:"public", table:"watched", filter:f }, ({ eventType, new:n, old:o }) => {
      if (eventType === "DELETE"){ if (o.room_id !== S.roomId) return; S.watched.delete(o.movie_id); } else S.watched.add(n.movie_id);
      renderMatches();
    })
    .on("postgres_changes", { event:"*", schema:"public", table:"members", filter:f }, ({ new:n }) => {
      if (n && n.user_id){ S.members[n.user_id] = n.name; renderPeople(); }
    })
    .subscribe();
  // en revenant sur l'onglet, on resynchronise (le temps réel peut avoir décroché)
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && S.roomId){ try{ await loadRoom(); renderAll(); }catch(err){ reportError(err); } }
  });
}

// ================== Pile de films ==================
const myVerdict = id => S.swipes.get(id)?.by[S.me];
const others = () => Object.keys(S.members).filter(u => u !== S.me);
const othersWith = (id, verdict) => { const by = S.swipes.get(id)?.by || {}; return others().filter(u => by[u] === verdict); };
const nameOf = u => S.members[u] || "l'autre";
const namesOf = us => us.map(nameOf).join(", ");
const genreOk = m => !S.genre || (m.genres||[]).includes(GENRE_NAMES[S.genre]);

function matchKind(id){
  const mine = myVerdict(id);
  if (mine === "like" && othersWith(id,"like").length) return "match";
  if (mine === "like" && othersWith(id,"seen").length) return "revoir";
  if (mine === "seen" && othersWith(id,"like").length) return "revoir";
  return null;
}

async function refill(reset = false){
  if (reset){
    S.queue = []; S.page = 0; S.totalPages = 1;
    // d'abord les films que l'autre a aimés et que je n'ai pas encore swipés
    for (const [id, e] of S.swipes){
      if (!myVerdict(id) && others().some(u => e.by[u] === "like") && e.movie?.title && genreOk(e.movie)) S.queue.push(e.movie);
    }
  }
  if (S.loading) return;
  S.loading = true;
  try{
    let guard = 0;
    while (S.queue.length < 8 && S.page < S.totalPages && S.page < 500 && guard++ < 6){
      S.page++;
      const params = { sort_by:"popularity.desc", include_adult:"false", "vote_count.gte":"300", page:String(S.page), watch_region:"FR" };
      if (S.genre) params.with_genres = S.genre;
      const d = await tmdb("/discover/movie", params);
      S.totalPages = d.total_pages || 1;
      const seen = new Set(S.queue.map(q=>q.id));
      d.results.map(normalize).forEach(m => { if (!myVerdict(m.id) && !seen.has(m.id)) S.queue.push(m); });
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
  if (fans.length){ const p=document.createElement("div"); p.className="partner"; p.textContent=`${namesOf(fans)} a envie de le voir`; el.appendChild(p); }
  return el;
}

async function fillDetails(el, m){
  const d = await getDetails(m.id);
  if (!d || !el.isConnected) return;
  el.querySelector(".dur").textContent = fmtMins(d.runtime);
  const pv = el.querySelector(".providers"); pv.innerHTML = "";
  if (d.providers.length){
    d.providers.forEach(p => { const i=document.createElement("img"); i.src=IMG(p.logo,"w92"); i.alt=p.name; i.title=p.name; pv.appendChild(i); });
  } else { const s=document.createElement("span"); s.className="none"; s.textContent="Pas en streaming par abonnement en France"; pv.appendChild(s); }
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
    e.querySelector("span").textContent = S.loading ? "On cherche des films pour vous." : "Plus de films pour ce filtre. Change de genre ou va voir vos films en commun.";
    st.appendChild(e);
  }
  top3.slice().reverse().forEach((m, ri) => {
    const idx = top3.length-1-ri;
    const el = cardEl(m, idx===0 ? "" : idx===1 ? "back" : "back2");
    st.appendChild(el);
    if (idx === 0){ attachDrag(el); fillDetails(el, m); }
  });
  // précharge les affiches suivantes
  S.queue.slice(3,6).forEach(m => { if (m.poster){ const i=new Image(); i.src=IMG(m.poster,"w780"); } });
  ["like","nope","vu","skip"].forEach(b => $(b).disabled = !top3.length);
  $("undo").disabled = !S.history.length;
}

function renderPeople(){
  const p = $("people"); p.innerHTML = "";
  const ids = [S.me, ...others()];
  ids.forEach((u, i) => {
    const c = document.createElement("span"); c.className = "chip";
    const n = (u === S.me ? S.name : nameOf(u)) || "?";
    c.innerHTML = `<i></i><b></b>`;
    c.querySelector("i").textContent = n.slice(0,1).toUpperCase(); c.querySelector("i").style.background = COLORS[i % COLORS.length];
    c.querySelector("b").textContent = u === S.me ? `${n} (toi)` : n;
    p.appendChild(c);
  });
  if (!others().length){ const s=document.createElement("span"); s.textContent="En attente de ta moitié"; p.appendChild(s); }
}

function matchList(){
  const out = [];
  for (const [id, e] of S.swipes){ const k = matchKind(id); if (k) out.push({ id, kind:k, movie:e.movie }); }
  return out;
}
function renderMatches(){
  const all = matchList();
  $("mcount").textContent = all.filter(x => !S.watched.has(x.id)).length;
  const list = $("mlist"); list.innerHTML = "";
  const hide = $("hideSeen").checked;
  const shown = all.filter(x => !(hide && S.watched.has(x.id)))
    .sort((a,b) => (S.watched.has(a.id) - S.watched.has(b.id)) || (a.kind === "match" ? -1 : 1) - (b.kind === "match" ? -1 : 1));
  if (!shown.length){
    const e=document.createElement("div"); e.className="lempty";
    e.textContent = all.length ? "Tous vos films en commun sont marqués comme vus."
      : others().length ? "Pas encore de match. Continuez à swiper, les films que l'autre aime remontent dans ta pile."
      : "Pas encore de match. Invite ta moitié avec le bouton « Inviter ».";
    list.appendChild(e); return;
  }
  shown.forEach(({ id, kind, movie:m }) => {
    const done = S.watched.has(id);
    const row = document.createElement("div"); row.className = "row" + (done ? " done" : "");
    row.innerHTML = `${m.poster ? `<img alt="">` : `<div class="mini"></div>`}<div class="info"><div class="t"></div><div class="m"></div><div class="pv"></div></div><button class="seen" type="button"></button>`;
    if (m.poster){ const i=row.querySelector("img"); i.src=IMG(m.poster,"w185"); i.alt="Affiche : "+m.title; i.loading="lazy"; }
    const t = row.querySelector(".t");
    if (kind === "revoir"){ const k=document.createElement("span"); k.className="kind"; k.textContent="À revoir"; t.appendChild(k); }
    t.appendChild(document.createTextNode(m.title));
    let meta = [m.year, (m.genres||[]).join(", ")].filter(Boolean).join(" · ");
    if (kind === "revoir"){ const who = myVerdict(id) === "seen" ? "toi" : namesOf(othersWith(id,"seen")); meta += ` · déjà vu par ${who}`; }
    row.querySelector(".m").textContent = meta;
    getDetails(id).then(d => { if (!d) return; const pv=row.querySelector(".pv"); d.providers.forEach(p => { const i=document.createElement("img"); i.src=IMG(p.logo,"w92"); i.alt=p.name; i.title=p.name; pv.appendChild(i); }); });
    const b = row.querySelector(".seen"); b.textContent = done ? "Vu ✓" : "Marquer vu";
    b.onclick = () => toggleWatched(id);
    list.appendChild(row);
  });
}
function renderAll(){ renderPeople(); renderStage(); renderMatches(); }

// ================== Actions ==================
function attachDrag(el){
  let x0=0, y0=0, dx=0, dy=0, active=false, moved=false;
  const yes=el.querySelector(".hint.yes"), no=el.querySelector(".hint.no"), vu=el.querySelector(".hint.vu");
  el.addEventListener("pointerdown", e => { active=true; moved=false; x0=e.clientX; y0=e.clientY; dx=dy=0; el.setPointerCapture(e.pointerId); el.classList.add("dragging"); });
  el.addEventListener("pointermove", e => {
    if (!active) return; dx=e.clientX-x0; dy=e.clientY-y0; if (Math.abs(dx)+Math.abs(dy) > 8) moved=true;
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
    else { el.style.transform=""; yes.style.opacity=no.style.opacity=vu.style.opacity=0; if (!moved) el.classList.toggle("open"); }
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

const VERDICT = { like:"like", nope:"nope", vu:"seen" };
async function act(kind){
  if (S.busy || !S.queue.length) return;
  S.busy = true;
  try{
    const m = S.queue[0];
    await flyOut(kind);
    S.queue.shift();
    if (kind === "skip"){
      S.queue.push(m); // « plus tard » : retour en fin de pile
    } else {
      const verdict = VERDICT[kind];
      applySwipe({ user_id:S.me, movie_id:m.id, verdict, movie:snapshot(m) });
      S.history.push(m);
      const k = matchKind(m.id); if (k) celebrate(m.id, k);
      const { error } = await sb.from("swipes").upsert({ room_id:S.roomId, user_id:S.me, movie_id:m.id, verdict, movie:snapshot(m) });
      if (error) throw error;
    }
  } catch(err){ reportError(err); }
  finally { S.busy = false; }
  renderStage(); renderMatches();
  if (S.queue.length < 5) refill().then(renderStage).catch(reportError);
}

async function undo(){
  const m = S.history.pop(); if (!m || S.busy) return;
  removeSwipe({ user_id:S.me, movie_id:m.id });
  S.queue.unshift(m);
  renderStage(); renderMatches();
  const { error } = await sb.from("swipes").delete().match({ room_id:S.roomId, user_id:S.me, movie_id:m.id });
  if (error) reportError(error);
}

async function toggleWatched(id){
  const had = S.watched.has(id);
  if (had) S.watched.delete(id); else S.watched.add(id);
  renderMatches();
  const q = had ? sb.from("watched").delete().match({ room_id:S.roomId, movie_id:id })
                : sb.from("watched").upsert({ room_id:S.roomId, movie_id:id }, { ignoreDuplicates:true });
  const { error } = await q; if (error) reportError(error);
}

let matchTimer;
function celebrate(id, kind){
  const m = S.swipes.get(id)?.movie || {};
  $("matchTitle").textContent = m.title || "";
  const img = $("matchPoster"); img.hidden = !m.poster; if (m.poster) img.src = IMG(m.poster, "w342");
  $("matchBox").classList.toggle("revoir", kind === "revoir");
  $("matchKind").textContent = kind === "revoir" ? "Match à revoir" : "C'est un match";
  if (kind === "match") $("matchWho").textContent = `Toi et ${namesOf(othersWith(id,"like"))} voulez le voir. Ajouté à vos films.`;
  else if (myVerdict(id) === "like") $("matchWho").textContent = `Tu as envie de le voir et ${namesOf(othersWith(id,"seen"))} l'a déjà vu. À revoir ensemble ?`;
  else $("matchWho").textContent = `Tu l'as déjà vu et ${namesOf(othersWith(id,"like"))} a envie de le voir. À lui faire découvrir ?`;
  $("match").hidden = false; clearTimeout(matchTimer); matchTimer = setTimeout(() => $("match").hidden = true, 2800);
}

// ================== Partage ==================
function openShare(){
  const link = `${location.origin}${location.pathname}#${S.roomCode}`;
  $("shareCode").textContent = S.roomCode; $("shareLink").value = link;
  $("shareSheet").hidden = false;
  if (navigator.share) $("copyLink").textContent = "Partager le lien";
}
$("shareBtn").onclick = openShare;
$("closeShare").onclick = () => $("shareSheet").hidden = true;
$("copyLink").onclick = async () => {
  const link = $("shareLink").value;
  if (navigator.share){ try{ await navigator.share({ title:"Sinema", text:"Viens swiper des films avec moi", url:link }); return; }catch{} }
  try{ await navigator.clipboard.writeText(link); $("copyLink").textContent = "Lien copié"; }
  catch{ $("shareLink").select(); }
};

// ================== Événements ==================
$("like").onclick = () => act("like"); $("nope").onclick = () => act("nope"); $("vu").onclick = () => act("vu"); $("skip").onclick = () => act("skip");
$("undo").onclick = undo;
$("genre").onchange = async e => { S.genre = e.target.value; await refill(true).catch(reportError); renderStage(); };
$("hideSeen").onchange = renderMatches;
function setTab(t){
  $("tab-swipe").setAttribute("aria-selected", t==="swipe"); $("tab-matches").setAttribute("aria-selected", t==="matches");
  $("view-swipe").hidden = t !== "swipe"; $("view-matches").hidden = t !== "matches";
}
$("tab-swipe").onclick = () => setTab("swipe"); $("tab-matches").onclick = () => setTab("matches");
document.addEventListener("keydown", e => {
  if (["INPUT","SELECT"].includes(e.target.tagName) || $("view-swipe").hidden) return;
  if (e.key === "ArrowRight") act("like");
  else if (e.key === "ArrowLeft") act("nope");
  else if (e.key === "ArrowUp"){ e.preventDefault(); act("vu"); }
  else if (e.key === "ArrowDown"){ e.preventDefault(); act("skip"); }
  else if (e.key === "Backspace") undo();
});
window.addEventListener("hashchange", () => { const c = location.hash.replace("#","").toUpperCase(); if (c && c !== S.roomCode) location.reload(); });

boot().catch(reportError);
