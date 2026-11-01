// Sinema · lists.js — Listes : « Nos matchs » et « Ma watchlist » (lignes, tri, pages, bandeau des genres, film surprise).
import { $, ICON, IMG, LS, S, getDetails, isTv, reduceMotion, tmdbPage } from "./core.js?v=202611011924";
import { matchList, nameOf, others, verdictOf } from "./rooms.js?v=202611011924";
import { removeVerdict, setVerdict, toggleWatched } from "./deck.js?v=202611011924";

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

export { genreEdges, renderMatches, renderMine };
