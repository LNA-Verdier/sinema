// Avatars Sinema : un personnage du monde du cinéma, une couleur de fond et des accessoires.
// Tout est dessiné en SVG (viewBox 64×64). Les visages ont les yeux en x=26 et x=38 pour que les accessoires s'alignent.
const INK = "#1B1D27";
const eyes = y => `<circle cx="26" cy="${y}" r="2.6" fill="${INK}"/><circle cx="38" cy="${y}" r="2.6" fill="${INK}"/>`;
const smile = y => `<path d="M27 ${y}q5 4 10 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
const blush = y => `<circle cx="21" cy="${y}" r="2.4" fill="#FF8A8A" opacity=".55"/><circle cx="43" cy="${y}" r="2.4" fill="#FF8A8A" opacity=".55"/>`;

// eye : hauteur des yeux, top : sommet de la tête (pour les chapeaux), neck : bas du personnage (nœud papillon)
export const BASES = [
  { id:"popcorn", label:"Popcorn", eye:39, top:12, neck:56, svg:`
    <g fill="#FFF3D6" stroke="${INK}" stroke-width="1.6"><circle cx="22" cy="22" r="6"/><circle cx="42" cy="22" r="6"/><circle cx="32" cy="17" r="7"/><circle cx="27" cy="26" r="5"/><circle cx="37" cy="26" r="5"/></g>
    <path d="M17 28h30l-4 28H21z" fill="#fff" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M23 28l1.6 28M32 28v28M41 28l-1.6 28" stroke="#E2453A" stroke-width="4"/>
    <path d="M17 28h30l-4 28H21z" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <rect x="21" y="34" width="22" height="13" rx="6" fill="#fff"/>${eyes(39)}${smile(42)}` },
  { id:"clap", label:"Clap", eye:41, top:15, neck:57, svg:`
    <g transform="rotate(-12 16 22)"><rect x="14" y="17" width="36" height="8" rx="1.5" fill="#fff" stroke="${INK}" stroke-width="1.6"/>
      <path d="M20 17l-4 8M28 17l-4 8M36 17l-4 8M44 17l-4 8" stroke="${INK}" stroke-width="3"/></g>
    <rect x="14" y="27" width="36" height="28" rx="3" fill="#2B2E3A" stroke="${INK}" stroke-width="1.6"/>
    <path d="M14 30h36" stroke="#fff" stroke-width="1.4" opacity=".6"/>
    <circle cx="26" cy="41" r="4" fill="#fff"/><circle cx="38" cy="41" r="4" fill="#fff"/>${eyes(41)}
    <path d="M27 47q5 4 10 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>` },
  { id:"camera", label:"Caméra", eye:37, top:8, neck:52, svg:`
    <circle cx="24" cy="16" r="8" fill="#3A3E4F" stroke="${INK}" stroke-width="1.6"/><circle cx="41" cy="16" r="8" fill="#3A3E4F" stroke="${INK}" stroke-width="1.6"/>
    <circle cx="24" cy="16" r="2.4" fill="#9AA0B8"/><circle cx="41" cy="16" r="2.4" fill="#9AA0B8"/>
    <rect x="13" y="25" width="36" height="24" rx="5" fill="#545A70" stroke="${INK}" stroke-width="1.6"/>
    <path d="M49 31l8-4v20l-8-4z" fill="#3A3E4F" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    <rect x="18" y="31" width="26" height="12" rx="6" fill="#fff"/>${eyes(37)}${smile(40)}` },
  { id:"ticket", label:"Ticket", eye:32, top:16, neck:50, svg:`
    <path d="M12 18h40v9a5 5 0 0 0 0 10v9H12v-9a5 5 0 0 0 0-10z" fill="#F4C04E" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M44 20v24" stroke="${INK}" stroke-width="1.4" stroke-dasharray="2 3"/>${eyes(32)}${smile(35)}${blush(36)}` },
  { id:"ghost", label:"Fantôme", eye:30, top:12, neck:52, svg:`
    <path d="M16 54V30a16 16 0 0 1 32 0v24l-5-4-5 4-6-4-6 4-5-4z" fill="#F4F6FF" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <ellipse cx="26" cy="30" rx="3.2" ry="4.2" fill="${INK}"/><ellipse cx="38" cy="30" rx="3.2" ry="4.2" fill="${INK}"/>
    <ellipse cx="32" cy="40" rx="3" ry="3.6" fill="${INK}"/>` },
  { id:"robot", label:"Robot", eye:32, top:14, neck:52, svg:`
    <path d="M32 14v-5" stroke="${INK}" stroke-width="2"/><circle cx="32" cy="8" r="3" fill="#FF5A4E" stroke="${INK}" stroke-width="1.4"/>
    <rect x="16" y="18" width="32" height="28" rx="6" fill="#C9D1E4" stroke="${INK}" stroke-width="1.8"/>
    <rect x="12" y="27" width="4" height="9" rx="1.5" fill="#9AA6C2" stroke="${INK}" stroke-width="1.4"/><rect x="48" y="27" width="4" height="9" rx="1.5" fill="#9AA6C2" stroke="${INK}" stroke-width="1.4"/>
    <circle cx="26" cy="32" r="4.2" fill="#fff" stroke="${INK}" stroke-width="1.4"/><circle cx="38" cy="32" r="4.2" fill="#fff" stroke="${INK}" stroke-width="1.4"/>${eyes(32)}
    <rect x="25" y="39" width="14" height="3.5" rx="1.5" fill="${INK}"/><rect x="24" y="46" width="16" height="7" rx="2" fill="#9AA6C2" stroke="${INK}" stroke-width="1.4"/>` },
  { id:"alien", label:"Extraterrestre", eye:33, top:14, neck:55, svg:`
    <path d="M24 16l-4-7M40 16l4-7" stroke="${INK}" stroke-width="2" stroke-linecap="round"/><circle cx="20" cy="8" r="2.6" fill="#7CE38B"/><circle cx="44" cy="8" r="2.6" fill="#7CE38B"/>
    <path d="M32 14c12 0 18 8 18 18 0 12-9 21-18 21s-18-9-18-21c0-10 6-18 18-18z" fill="#7CE38B" stroke="${INK}" stroke-width="1.8"/>
    <ellipse cx="25" cy="33" rx="5" ry="6.5" fill="${INK}" transform="rotate(-18 25 33)"/><ellipse cx="39" cy="33" rx="5" ry="6.5" fill="${INK}" transform="rotate(18 39 33)"/>
    <circle cx="23.5" cy="31" r="1.4" fill="#fff"/><circle cx="37.5" cy="31" r="1.4" fill="#fff"/>${smile(43)}` },
  { id:"reel", label:"Bobine", eye:34, top:14, neck:54, svg:`
    <circle cx="32" cy="34" r="20" fill="#3A3E4F" stroke="${INK}" stroke-width="1.8"/>
    <g fill="#23263A"><circle cx="32" cy="21" r="4"/><circle cx="20" cy="40" r="4"/><circle cx="44" cy="40" r="4"/></g>
    <rect x="19" y="28" width="26" height="14" rx="7" fill="#fff"/>${eyes(34)}${smile(37)}` },
  { id:"star", label:"Étoile", eye:35, top:10, neck:54, svg:`
    <path d="M32 9l6.5 14 15.3 1.8-11.3 10.4 3 15.1L32 42.6 18.5 50.3l3-15.1L10.2 24.8 25.5 23z" fill="#FFD25E" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    ${eyes(33)}${smile(37)}${blush(37)}` },
  { id:"soda", label:"Soda", eye:38, top:15, neck:58, svg:`
    <path d="M36 22l6-14" stroke="#E2453A" stroke-width="3" stroke-linecap="round"/>
    <path d="M18 24h28" stroke="${INK}" stroke-width="1.8"/><path d="M17 20h30l-1 6H18z" fill="#fff" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M19 26h26l-3 30H22z" fill="#4D8DF0" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <rect x="22" y="32" width="20" height="13" rx="6" fill="#fff"/>${eyes(38)}${smile(41)}` },
];

export const COLORS = ["#F0573D","#F28C38","#F4C04E","#59B86A","#2BB3A6","#3E8EDE","#6C63D9","#B05CC9","#E9659A","#5E6378"];

const hat = {
  none:null,
  beret:{ label:"Béret", svg:t => `<path d="M17 ${t+2}c2-7 11-10 19-9 8 1 12 5 11 9-6 2-24 3-30 0z" fill="#2E3242" stroke="${INK}" stroke-width="1.6"/><circle cx="33" cy="${t-6}" r="1.8" fill="#2E3242"/>` },
  tophat:{ label:"Haut-de-forme", svg:t => `<rect x="22" y="${t-14}" width="20" height="15" rx="2" fill="#1F2230" stroke="${INK}" stroke-width="1.4"/><rect x="22" y="${t-4}" width="20" height="3" fill="#E2453A"/><rect x="15" y="${t}" width="34" height="4" rx="2" fill="#1F2230" stroke="${INK}" stroke-width="1.4"/>` },
  crown:{ label:"Couronne", svg:t => `<path d="M20 ${t+2}l-1-12 7 6 6-9 6 9 7-6-1 12z" fill="#FFD25E" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="32" cy="${t-3}" r="1.6" fill="#E2453A"/>` },
  cap:{ label:"Casquette", svg:t => `<path d="M18 ${t+3}a14 11 0 0 1 28 0z" fill="#3E8EDE" stroke="${INK}" stroke-width="1.6"/><path d="M44 ${t+3}h12a2 2 0 0 1-2 3H44z" fill="#2C6FB8" stroke="${INK}" stroke-width="1.4"/>` },
  cowboy:{ label:"Chapeau de cowboy", svg:t => `<path d="M23 ${t+1}c0-7 4-11 9-11s9 4 9 11z" fill="#A86B3C" stroke="${INK}" stroke-width="1.6"/><path d="M11 ${t-1}c5 6 37 6 42 0-3 6-10 8-21 8s-18-2-21-8z" fill="#A86B3C" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>` },
};
const eyewear = {
  none:null,
  glasses:{ label:"Lunettes", svg:y => `<g fill="none" stroke="${INK}" stroke-width="2"><circle cx="26" cy="${y}" r="5.5"/><circle cx="38" cy="${y}" r="5.5"/><path d="M31.5 ${y}h1"/></g>` },
  shades:{ label:"Lunettes de soleil", svg:y => `<path d="M18 ${y-4}h28v2l-2 5a4 4 0 0 1-4 2h-3a4 4 0 0 1-4-3l-1-2-1 2a4 4 0 0 1-4 3h-3a4 4 0 0 1-4-2l-2-5z" fill="#14161F"/><path d="M21 ${y-2}l3 0" stroke="#fff" stroke-width="1.2" opacity=".6"/>` },
  "3d":{ label:"Lunettes 3D", svg:y => `<rect x="18" y="${y-5}" width="28" height="10" rx="2" fill="#fff" stroke="${INK}" stroke-width="1.6"/><rect x="20.5" y="${y-3}" width="10" height="6" rx="1" fill="#E2453A" opacity=".85"/><rect x="33.5" y="${y-3}" width="10" height="6" rx="1" fill="#3E8EDE" opacity=".85"/>` },
  monocle:{ label:"Monocle", svg:y => `<circle cx="38" cy="${y}" r="5.5" fill="#fff" fill-opacity=".25" stroke="#C9A227" stroke-width="2"/><path d="M43 ${y+3}q2 8-2 14" fill="none" stroke="#C9A227" stroke-width="1.2"/>` },
};
const face = {
  none:null,
  mustache:{ label:"Moustache", svg:y => `<path d="M32 ${y+5}c-3-3-8-3-10 0 3 3 8 2 10 0zm0 0c3-3 8-3 10 0-3 3-8 2-10 0z" fill="#4A3426"/>` },
  cigar:{ label:"Pipe", svg:y => `<path d="M36 ${y+7}h8" stroke="#6B4630" stroke-width="2.4" stroke-linecap="round"/><path d="M43 ${y+5}h5v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2z" fill="#6B4630"/>` },
};
const neck = {
  none:null,
  bowtie:{ label:"Nœud papillon", svg:n => `<path d="M32 ${n}l-8-4v8zm0 0l8-4v8z" fill="#E2453A" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/><circle cx="32" cy="${n}" r="1.8" fill="#B8322A"/>` },
  scarf:{ label:"Écharpe", svg:n => `<path d="M20 ${n-2}q12 5 24 0v4q-12 5-24 0z" fill="#59B86A" stroke="${INK}" stroke-width="1.2"/><path d="M38 ${n+1}l2 7h-4z" fill="#59B86A" stroke="${INK}" stroke-width="1.2"/>` },
  medal:{ label:"Médaille", svg:n => `<path d="M28 ${n-4}l4 6 4-6" fill="none" stroke="#3E8EDE" stroke-width="2"/><circle cx="32" cy="${n+3}" r="3.4" fill="#FFD25E" stroke="${INK}" stroke-width="1.2"/>` },
};
export const SLOTS = [
  { key:"head", label:"Chapeau", items:hat },
  { key:"eyes", label:"Lunettes", items:eyewear },
  { key:"face", label:"Visage", items:face },
  { key:"neck", label:"Cou", items:neck },
];

export const DEFAULT_AVATAR = { b:"popcorn", c:0, head:"none", eyes:"none", face:"none", neck:"none" };

// Avatar valide à partir de données inconnues (stockées ou anciennes)
export function cleanAvatar(a){
  const x = { ...DEFAULT_AVATAR, ...(a && typeof a === "object" ? a : {}) };
  if (!BASES.some(b => b.id === x.b)) x.b = DEFAULT_AVATAR.b;
  x.c = Number.isInteger(+x.c) && +x.c >= 0 && +x.c < COLORS.length ? +x.c : 0;
  for (const s of SLOTS) if (!(x[s.key] in s.items)) x[s.key] = "none";
  return { b:x.b, c:x.c, head:x.head, eyes:x.eyes, face:x.face, neck:x.neck };
}

// Avatar par défaut stable pour quelqu'un qui n'en a pas encore choisi
export function avatarFor(seed){
  let h = 0; for (const ch of String(seed||"")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { ...DEFAULT_AVATAR, b: BASES[h % BASES.length].id, c: (h >> 4) % COLORS.length };
}

export function avatarSVG(a, size = 40, title = ""){
  const av = cleanAvatar(a);
  const base = BASES.find(b => b.id === av.b);
  const parts = [
    `<circle cx="32" cy="32" r="32" fill="${COLORS[av.c]}"/>`,
    `<g clip-path="url(#c)">${base.svg}</g>`,
    face[av.face] ? face[av.face].svg(base.eye) : "",
    eyewear[av.eyes] ? eyewear[av.eyes].svg(base.eye) : "",
    neck[av.neck] ? neck[av.neck].svg(base.neck) : "",
    hat[av.head] ? hat[av.head].svg(base.top) : "",
  ].join("");
  const t = title ? `<title>${title.replace(/[<&>"]/g, "")}</title>` : "";
  return `<svg class="avatar" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${(title||"Avatar").replace(/[<&>"]/g,"")}">${t}<defs><clipPath id="c"><circle cx="32" cy="32" r="32"/></clipPath></defs>${parts}</svg>`;
}
