// Sinema · service worker : ouverture du site sans réseau et cache des affiches.
//  - fichiers du site (versionnés ?v=…) : servis depuis le cache, téléchargés une seule fois
//  - page d'accueil : réseau d'abord, cache si hors connexion
//  - lectures Supabase et TMDB : réseau d'abord, dernière réponse connue si hors connexion
//  - affiches TMDB : cache d'abord, 400 images au plus
const VERSION = "?v=202611011900";
const STATIC = "sinema-static-" + VERSION.slice(3);
const DATA = "sinema-data";
const IMAGES = "sinema-images";
const MAX_IMAGES = 400;
const SHELL = [
  "./", "style.css" + VERSION, "config.js" + VERSION,
  ...["main", "core", "auth", "rooms", "deck", "lists", "sheets", "avatars"].map(m => `js/${m}.js${VERSION}`),
  "icon.svg", "icon-180.png", "manifest.webmanifest",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(STATIC).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("sinema-static-") && k !== STATIC).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function cacheFirst(req, name){
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok) await c.put(req, r.clone());
  return r;
}
// Affiches : demandées en CORS pour pouvoir les garder (une réponse opaque occuperait des Mo de quota).
async function poster(req){
  const c = await caches.open(IMAGES);
  const hit = await c.match(req.url);
  if (hit) return hit;
  let r;
  try{ r = await fetch(req.url, { mode:"cors", credentials:"omit" }); }catch{ return fetch(req); }
  if (r.ok){
    await c.put(req.url, r.clone());
    c.keys().then(k => k.length > MAX_IMAGES && Promise.all(k.slice(0, k.length - MAX_IMAGES).map(x => c.delete(x))));
  }
  return r;
}
async function page(req){
  const c = await caches.open(STATIC);
  try{
    const r = await fetch(req);
    if (r.ok) await c.put("./", r.clone());
    return r;
  }catch(err){
    const hit = await c.match("./");
    if (hit) return hit;
    throw err;
  }
}
async function networkFirst(req, name){
  const c = await caches.open(name);
  try{
    const r = await fetch(req);
    if (r.ok) await c.put(req, r.clone());
    return r;
  }catch(err){
    const hit = await c.match(req, { ignoreVary:true });
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate" && url.origin === location.origin) return e.respondWith(page(req));
  if (url.origin === location.origin && url.search.startsWith("?v=")) return e.respondWith(cacheFirst(req, STATIC));
  if (url.origin === location.origin && /\.(svg|png|webmanifest)$/.test(url.pathname)) return e.respondWith(networkFirst(req, STATIC));
  if (url.hostname === "cdn.jsdelivr.net" || url.hostname === "fonts.gstatic.com") return e.respondWith(cacheFirst(req, STATIC));
  if (url.hostname === "fonts.googleapis.com") return e.respondWith(networkFirst(req, STATIC));
  if (url.hostname === "image.tmdb.org") return e.respondWith(poster(req));
  if (url.hostname.endsWith(".supabase.co") && (url.pathname.startsWith("/rest/v1/") || url.pathname.startsWith("/functions/v1/tmdb")))
    return e.respondWith(networkFirst(req, DATA));
  if (url.hostname === "api.themoviedb.org") return e.respondWith(networkFirst(req, DATA));
});
