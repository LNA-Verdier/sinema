// Sinema · sheets.js — Feuilles : menu des salons, filtres (années, plateformes, pays, genres, personne) et profil (avatar, e-mail, mot de passe).
import { avatarSVG, BASES, COLORS as AV_COLORS, SLOTS, cleanAvatar } from "./avatars.js?v=202611011916";
import { $, DEFAULT_FILTERS, HOME, IMG, LS, S, genreOptions, refreshSegs, reportError, sb, segSelectBy, segValue, showNotice, tmdb } from "./core.js?v=202611011916";
import { PASS_OK, authMessage, logout } from "./auth.js?v=202611011916";
import { loadRooms, newMatches, onboard, openRoom, roomLabel } from "./rooms.js?v=202611011916";
import { refill, renderPeople } from "./deck.js?v=202611011916";
import { renderAll, saveFilters, setView } from "./main.js?v=202611011916";

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
  S.room = null; LS.set("sinema-room",""); await loadRooms(); closeSheets();
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
    S.name = name; S.avatar = avatar; LS.set("sinema-name", name);
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

export { activeFilterCount, availHelp, clearRoomInputs, closeSheets, modeHelp, openMenu, renderMenu };
