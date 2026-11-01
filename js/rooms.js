// Sinema · rooms.js — Salons : création, rejoindre, ouverture, temps réel, calcul des matchs et pastilles de nouveautés.
import { cleanAvatar, avatarFor } from "./avatars.js?v=202611011916";
import { $, LS, S, reportError, sb, segMove, segSelectBy, showNotice } from "./core.js?v=202611011916";
import { celebrate, filterOk, refill, renderStage, toast } from "./deck.js?v=202611011916";
import { renderMatches } from "./lists.js?v=202611011916";
import { clearRoomInputs, closeSheets, openMenu, renderMenu } from "./sheets.js?v=202611011916";
import { renderAll, renderLists, scheduleBadges, setView } from "./main.js?v=202611011916";

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
  S.room = room; LS.set("sinema-room", room.code);
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

export { loadMine, loadRoom, loadRooms, matchKind, matchList, movieOf, nameOf, newMatches, onboard, openRoom, others, renderRoomBadges, roomLabel, showOb, subscribeMine, verdictOf };
