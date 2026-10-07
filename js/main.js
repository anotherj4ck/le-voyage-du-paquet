/* Le Voyage du Paquet : script principal du site.
   Copyright (c) 2026 anotherj4ck. Code sous licence MIT : voir LICENSE.
   Les textes pédagogiques qu’il contient relèvent de LICENSE-CONTENU (tous droits réservés). */
(() => {
'use strict';

/* =====================================================================
   Outils
   ===================================================================== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = {
  linear: t => t,
  inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t * t,
  back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
function isDark() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark' || t === 'light') return t === 'dark';
  return matchMedia('(prefers-color-scheme: dark)').matches;
}
function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) { return false; }
}
const HAS3D = typeof THREE !== 'undefined' && webglOK();

/* =====================================================================
   Moteur d'animation : des "contextes" annulables (visite, jeu, effets)
   ===================================================================== */
const CANCEL = { cancelled: true };
const ACTIVE = new Set();
function makeCtx(speed = 1) { return { alive: true, speed, tasks: new Set() }; }
function tween(ctx, dur, fn, ez = ease.inOut) {
  return new Promise((res, rej) => {
    if (!ctx.alive) { rej(CANCEL); return; }
    const tk = { ctx, t: 0, dur: Math.max(dur, 1e-4), fn, ez, res, rej };
    ctx.tasks.add(tk);
    ACTIVE.add(tk);
  });
}
const wait = (ctx, s) => tween(ctx, s, () => {}, ease.linear);
function kill(ctx) {
  if (!ctx) return;
  ctx.alive = false;
  for (const tk of ctx.tasks) { ACTIVE.delete(tk); tk.rej(CANCEL); }
  ctx.tasks.clear();
}
function tickTweens(dt) {
  for (const tk of [...ACTIVE]) {
    if (!ACTIVE.has(tk)) continue;
    tk.t += dt * (tk.ctx.speed == null ? 1 : tk.ctx.speed); // vitesse 0 = pause
    const p = Math.min(1, tk.t / tk.dur);
    try { tk.fn(tk.ez(p), p); } catch (e) { console.error(e); }
    if (p >= 1) { ACTIVE.delete(tk); tk.ctx.tasks.delete(tk); tk.res(); }
  }
}
const swallow = e => { if (e !== CANCEL) console.error(e); };
const FX = makeCtx(1); // effets d'ambiance, jamais annulés
const updaters = [];   // fonctions (dt, t) appelées à chaque image

/* =====================================================================
   Rendu 3D : scène, lumières, thème
   ===================================================================== */
const viewport = $('#viewport');
const canvas = $('#gl');
const tagsEl = $('#tags');
const fxEl = $('#fx');
let VW = 1, VH = 1;
let renderer = null, scene = null, camera = null, hemi = null, sun = null;
const V3 = HAS3D ? THREE.Vector3 : function () {};
const themed = [];      // [matériau, jeton CSS, propriété]
const themeHooks = [];  // fonctions(dark)

function themeMat(mat, token, prop = 'color') {
  themed.push([mat, token, prop]);
  mat[prop].set(cssVar(token) || '#888888');
  return mat;
}
function applyTheme() {
  if (!HAS3D) return;
  const bg = cssVar('--scene-bg') || '#dde4eb';
  scene.background.set(bg);
  scene.fog.color.set(bg);
  for (const [m, tok, prop] of themed) { const v = cssVar(tok); if (v) m[prop].set(v); }
  const dark = isDark();
  hemi.intensity = dark ? 0.62 : 0.85;
  hemi.color.set(dark ? '#9fb3cf' : '#ffffff');
  hemi.groundColor.set(dark ? '#141c26' : '#8d99a8');
  sun.intensity = dark ? 0.62 : 0.72;
  for (const fn of themeHooks) fn(dark);
}

if (HAS3D) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#dde4eb');
  scene.fog = new THREE.Fog(0xdde4eb, 120, 260);
  camera = new THREE.PerspectiveCamera(36, 1, 0.5, 700);
  hemi = new THREE.HemisphereLight(0xffffff, 0x8d99a8, 0.85);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffffff, 0.72);
  sun.position.set(-22, 62, 38);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -62; sc.right = 62; sc.top = 46; sc.bottom = -46; sc.near = 5; sc.far = 190;
  sun.shadow.bias = -0.0006;
  sun.target.position.set(-3, 0, 0);
  scene.add(sun.target);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.22);
  fill.position.set(35, 22, 55);
  scene.add(fill);
}

const OVERLAY = matchMedia('(min-width: 1100px)'); // panneaux posés sur la scène
let shiftFn = null;  // décale le centre de la vue quand un panneau couvre un côté
function applyViewShift() {
  if (!HAS3D) return;
  const px = shiftFn ? shiftFn() : 0;
  if (px) camera.setViewOffset(VW, VH, -px, 0, VW, VH);
  else camera.clearViewOffset();
}
function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  if (!w || !h) return;
  VW = w; VH = h;
  if (HAS3D) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    applyViewShift();
  }
}
if ('ResizeObserver' in window) new ResizeObserver(resize).observe(viewport);
window.addEventListener('resize', resize);

/* =====================================================================
   Caméra : orbite douce autour d'une cible, pilotée par les étapes
   ===================================================================== */
const rig = {
  target: HAS3D ? new V3(-2, 0, 0) : null,
  r: 90, th: 0, ph: 0.95,
  goal: { target: HAS3D ? new V3(-2, 0, 0) : null, r: 90, th: 0, ph: 0.95 },
  follow: null,
  followOffset: HAS3D ? new V3() : null,
  onRecenter: null,
};
const MIN_R = 7, MAX_R = 160;
function setView(v, instant) {
  if (!HAS3D) return;
  rig.follow = null;
  rig.goal.target.set(v.t[0], v.t[1], v.t[2]);
  rig.goal.r = v.r; rig.goal.th = v.th; rig.goal.ph = v.ph;
  if (instant || REDUCED) snapRig();
}
function followObj(obj, r, th, ph, offset) {
  if (!HAS3D) return;
  rig.follow = obj;
  rig.followOffset.set(...(offset || [0, 0, 0]));
  if (r != null) rig.goal.r = r;
  if (th != null) rig.goal.th = th;
  if (ph != null) rig.goal.ph = ph;
}
function snapRig() {
  rig.target.copy(rig.goal.target);
  rig.r = rig.goal.r; rig.th = rig.goal.th; rig.ph = rig.goal.ph;
}
function updateRig(dt) {
  if (rig.follow) rig.goal.target.copy(rig.follow.position).add(rig.followOffset);
  const k = REDUCED ? 1 : 1 - Math.exp(-dt * 2.8);
  rig.target.lerp(rig.goal.target, k);
  rig.r = lerp(rig.r, rig.goal.r, k);
  rig.th = lerp(rig.th, rig.goal.th, k);
  rig.ph = lerp(rig.ph, rig.goal.ph, k);
  const sp = Math.sin(rig.ph);
  camera.position.set(
    rig.target.x + rig.r * sp * Math.sin(rig.th),
    rig.target.y + rig.r * Math.cos(rig.ph),
    rig.target.z + rig.r * sp * Math.cos(rig.th)
  );
  camera.lookAt(rig.target);
}

// Souris, doigt, molette
const pointers = new Map();
canvas.addEventListener('pointerdown', e => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (pointers.size === 1) {
    rig.goal.th -= (e.clientX - p.x) * 0.0062;
    rig.goal.ph = clamp(rig.goal.ph - (e.clientY - p.y) * 0.005, 0.2, 1.42);
  } else if (pointers.size === 2) {
    const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)[1];
    const before = Math.hypot(p.x - other.x, p.y - other.y);
    const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
    if (before > 10 && after > 10) rig.goal.r = clamp(rig.goal.r * before / after, MIN_R, MAX_R);
  }
  p.x = e.clientX; p.y = e.clientY;
});
const endPointer = e => {
  pointers.delete(e.pointerId);
  if (!pointers.size) canvas.classList.remove('dragging');
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  rig.goal.r = clamp(rig.goal.r * Math.exp(e.deltaY * 0.0012), MIN_R, MAX_R);
}, { passive: false });
$('#zoom-in').addEventListener('click', () => { rig.goal.r = clamp(rig.goal.r * 0.8, MIN_R, MAX_R); });
$('#zoom-out').addEventListener('click', () => { rig.goal.r = clamp(rig.goal.r * 1.25, MIN_R, MAX_R); });
$('#recenter').addEventListener('click', () => { if (rig.onRecenter) rig.onRecenter(); });

/* =====================================================================
   Étiquettes HTML accrochées à des points 3D
   ===================================================================== */
const TAGS = [];
const TAG = {};
const _v = HAS3D ? new V3() : null;
function addTag({ id, name, short = '', addr = '', key = '', pos, zone = false, minor = false, detail = false, onClick }) {
  const el = document.createElement('div');
  el.className = 'tag' + (zone ? ' zone' : '') + (minor ? ' minor' : '') + (detail ? ' detail' : '');
  const inner = document.createElement(zone ? 'div' : 'button');
  inner.className = 'in';
  if (!zone) inner.type = 'button';
  inner.innerHTML = (key ? `<span class="key">${esc(key)}</span>` : '') +
    (short ? `<b class="full">${esc(name)}</b><b class="short">${esc(short)}</b>` : `<b>${esc(name)}</b>`) +
    (addr ? `<span class="addr">${esc(addr)}</span>` : '');
  el.appendChild(inner);
  tagsEl.appendChild(el);
  const t = { id, el, inner, pos: new V3(pos[0], pos[1], pos[2]), visible: true, shown: true };
  if (onClick) inner.addEventListener('click', onClick);
  TAGS.push(t);
  TAG[id] = t;
  return t;
}
function showTag(id, on) {
  const t = TAG[id];
  if (!t) return;
  t.visible = on;
  if (!on) { t.el.style.display = 'none'; t.shown = false; }
}
function tagClass(id, cls, on) { if (TAG[id]) TAG[id].el.classList.toggle(cls, !!on); }
function clearTagClasses(...classes) { for (const t of TAGS) t.el.classList.remove(...classes); }
function screenOf(pos) {
  _v.copy(pos).project(camera);
  return { x: (_v.x + 1) / 2 * VW, y: (1 - _v.y) / 2 * VH, behind: _v.z > 1 };
}
function updateTags() {
  for (const t of TAGS) {
    if (!t.visible) continue;
    _v.copy(t.pos).project(camera);
    const off = _v.z > 1 || _v.x < -1.15 || _v.x > 1.15 || _v.y < -1.2 || _v.y > 1.25;
    if (off !== !t.shown) { t.el.style.display = off ? 'none' : ''; t.shown = !off; }
    if (off) continue;
    t.el.style.transform = `translate3d(${((_v.x + 1) / 2 * VW).toFixed(1)}px,${((1 - _v.y) / 2 * VH).toFixed(1)}px,0)`;
  }
  const pxu = VH / (2 * rig.r * Math.tan(camera.fov * Math.PI / 360)); // pixels par unité au centre
  tagsEl.classList.toggle('far', pxu < 21);
  tagsEl.classList.toggle('tiny', pxu < 11);
}
function popText(pos, text, cls) {
  if (!HAS3D) return;
  const s = screenOf(pos);
  if (s.behind) return;
  const el = document.createElement('div');
  el.className = 'pop ' + (cls || '');
  el.textContent = text;
  el.style.transform = `translate3d(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px,0) translate(-50%,-50%)`;
  fxEl.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

/* =====================================================================
   Chemins : polylignes parcourues à vitesse constante
   ===================================================================== */
class Poly {
  constructor(pts) {
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.length = this.cum[this.cum.length - 1];
  }
  seg(d) {
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < d) i++;
    return i;
  }
  at(d, out) {
    d = clamp(d, 0, this.length);
    const i = this.seg(d);
    const a = this.pts[i - 1], b = this.pts[i];
    const L = this.cum[i] - this.cum[i - 1] || 1;
    return out.copy(a).lerp(b, (d - this.cum[i - 1]) / L);
  }
  dir(d, out) {
    d = clamp(d, 0, this.length);
    const i = this.seg(d);
    return out.copy(this.pts[i]).sub(this.pts[i - 1]).normalize();
  }
}

/* =====================================================================
   Textures dessinées au canvas
   ===================================================================== */
const LABEL_TEX = [];
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.22, 'rgba(255,255,255,.6)');
  grd.addColorStop(0.55, 'rgba(255,255,255,.14)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function drawLock(g, x, y, s, color, open) {
  g.save();
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = s * 0.16;
  g.beginPath();
  if (open) g.arc(x + s * 0.32, y - s * 0.12, s * 0.3, Math.PI, Math.PI * 1.95);
  else g.arc(x, y - s * 0.12, s * 0.3, Math.PI, 0);
  g.stroke();
  g.fillRect(x - s * 0.45, y - s * 0.12, s * 0.9, s * 0.72);
  g.restore();
}
// Texture d'étiquette pour une face de tranche de paquet ; redessinée quand les polices arrivent
function labelTexture(opts) {
  const c = document.createElement('canvas');
  c.width = opts.w; c.height = opts.h;
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.labelOpts = opts;
  tex.redraw = () => {
    const o = tex.labelOpts, g = c.getContext('2d'), w = c.width, h = c.height;
    g.fillStyle = o.bg; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, 0, w, h * 0.12);
    g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(0, h * 0.9, w, h * 0.1);
    if (o.text) {
      g.fillStyle = o.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      let size = h * 0.34;
      const font = s => `700 ${s}px "IBM Plex Mono", ui-monospace, monospace`;
      g.font = font(size);
      while (g.measureText(o.text).width > w * 0.84 && size > 8) { size -= 1; g.font = font(size); }
      g.fillText(o.text, w / 2, o.icon ? h * 0.7 : h / 2);
    }
    if (o.icon === 'lock' || o.icon === 'open') drawLock(g, w / 2, h * 0.36, h * 0.3, o.fg, o.icon === 'open');
    tex.needsUpdate = true;
  };
  tex.redraw();
  LABEL_TEX.push(tex);
  return tex;
}
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => { for (const t of LABEL_TEX) t.redraw(); }).catch(() => {});
}

/* =====================================================================
   Données du réseau (plages RFC 5737 pour Internet, RFC 1918 pour le LAN)
   ===================================================================== */
const IP = {
  srv: '203.0.113.10', boxW: '198.51.100.42', boxL: '192.168.1.1',
  pc: '192.168.1.10', laptop: '192.168.1.11', console: '192.168.1.12',
};
const MAC = {
  srv: '00:50:56:a1:0c:21',
  r1a: '00:25:90:aa:01:01', r1b: '00:25:90:aa:01:02',
  r2a: '00:1c:73:5b:02:01', r2b: '00:1c:73:5b:02:02',
  faiA: '00:1b:21:3a:7c:01', faiB: '00:1b:21:3a:7c:40',
  boxW: '9c:24:72:5e:10:01', boxL: '9c:24:72:5e:10:02',
  pc: '3c:52:82:4f:a1:7e', laptop: 'f4:5c:89:b2:33:0c', console: '7c:bb:8a:12:9d:e4',
};
const INFO = {
  srv: { name: 'Serveur web', lay: 'Couches 1 à 7', role: "Héberge le site exemple.fr dans un datacenter. Il reçoit ta requête HTTPS sur le port 443 et renvoie la page, découpée en paquets.", addr: [['IP', IP.srv], ['Port', '443 (HTTPS)'], ['MAC', MAC.srv]] },
  r1: { name: 'Routeur Amsterdam', lay: 'Couche 3 · Réseau', role: "Routeur d'un opérateur de transit. Il lit l'IP de destination, choisit la sortie dans sa table de routage, baisse le TTL et refait l'en-tête Ethernet.", addr: [['MAC côté serveur', MAC.r1a], ['MAC côté Paris', MAC.r1b]] },
  r2: { name: 'Routeur Paris', lay: 'Couche 3 · Réseau', role: "Routeur d'un opérateur présent sur un point d'échange (IXP) à Paris. Un point d'échange est une infrastructure de commutation où se raccordent les routeurs de plusieurs opérateurs pour échanger leur trafic. Même travail : IP de destination, table de routage, TTL − 1, nouvelle trame.", addr: [['MAC côté Amsterdam', MAC.r2a], ['MAC côté FAI', MAC.r2b]] },
  r3: { name: 'Routeur Francfort', lay: 'Couche 3 · Réseau', role: "Un autre chemin possible. Si le lien Amsterdam → Paris tombe, les protocoles de routage (BGP entre opérateurs) font passer le trafic par ici.", addr: [] },
  r4: { name: 'Routeur Londres', lay: 'Couche 3 · Réseau', role: "Encore un chemin de secours. Internet est un maillage : il existe presque toujours plusieurs routes vers une destination.", addr: [] },
  fai: { name: 'Routeur du FAI', lay: 'Couche 3 · Réseau', role: "Le dernier routeur avant chez toi, chez ton fournisseur d'accès. Il sait que 198.51.100.42 se trouve au bout de ta fibre.", addr: [['MAC côté Internet', MAC.faiA], ['MAC côté abonné', MAC.faiB]] },
  fiber: { name: 'Fibre optique', lay: 'Couche 1 · Physique', role: "Le lien WAN entre le FAI et ta box. Les bits y voyagent sous forme d'impulsions de lumière dans un fil de verre, sur plusieurs kilomètres.", addr: [['Débit', '1 à plusieurs Gbit/s selon l\'offre'], ['Côté FAI', 'réseau du fournisseur'], ['Côté maison', 'port WAN de la box']] },
  box: { name: 'Box internet', lay: 'Couches 1 à 4, et plus', role: "La frontière entre le WAN et ton LAN. Elle fait routeur, NAT, pare-feu, serveur DHCP, switch et point d'accès Wi-Fi dans un seul boîtier.", addr: [['IP WAN (publique)', IP.boxW], ['IP LAN (privée)', IP.boxL + '/24'], ['MAC WAN', MAC.boxW], ['MAC LAN', MAC.boxL]] },
  sw: { name: 'Switch', lay: 'Couche 2 · Liaison', role: "Relie les appareils du LAN. Il apprend quelle adresse MAC se trouve derrière chaque port et n'envoie la trame que sur le bon port.", addr: [['IP', 'aucune (switch non administrable)'], ['Ports', '8 × 1 Gbit/s']] },
  pc: { name: 'PC fixe', lay: 'Couches 1 à 7', role: "Ton poste. Sa carte réseau reçoit la trame, puis le système remonte les couches jusqu'au navigateur.", addr: [['IP', IP.pc + '/24'], ['MAC', MAC.pc], ['Passerelle', IP.boxL], ['Navigateur', 'port 52344']] },
  laptop: { name: 'Portable', lay: 'Couches 1 à 7', role: "Un autre appareil du LAN, occupé à regarder une vidéo. Il partage la même IP publique que le PC grâce au NAT.", addr: [['IP', IP.laptop + '/24'], ['MAC', MAC.laptop]] },
  console: { name: 'Console', lay: 'Couches 1 à 7', role: "Elle joue en ligne. Son trafic passe lui aussi par la box et sa table NAT.", addr: [['IP', IP.console + '/24'], ['MAC', MAC.console]] },
};

/* Fiche d'équipement (clic sur une étiquette) */
const fiche = $('#fiche');
function openFiche(id) {
  const f = INFO[id];
  if (!f) return;
  $('#fiche-title').textContent = f.name;
  $('#fiche-lay').textContent = f.lay;
  $('#fiche-role').textContent = f.role;
  $('#fiche-addr').innerHTML = f.addr.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  fiche.hidden = false;
}
$('#fiche-close').addEventListener('click', () => { fiche.hidden = true; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') fiche.hidden = true; });

/* =====================================================================
   Géométrie de la scène
   y = 0 : dessus des plateaux. x : Internet à gauche, maison à droite.
   ===================================================================== */
const EQ = {};      // équipements : pos (sol), station (où le paquet s'arrête), ringR
const LINKS = {};   // câbles : floor (points), mat, mesh
const AMBIENT = []; // petits paquets d'ambiance sur Internet
const LEDS = [];    // diodes qui clignotent
const SW_LEDS = []; // diodes des ports du switch
let GLOW_TEX = null;
let M = {};         // matériaux partagés
let focusRing = null;
const SCREENS = {}; // textures d'écrans

function stdMat(color, o = {}) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.62, metalness: 0.06 }, o));
}
function mesh(geo, material, x = 0, y = 0, z = 0, parent = scene) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const boxG = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cylG = (rt, rb, h, s = 24) => new THREE.CylinderGeometry(rt, rb, h, s);
function inkFor(hex) {
  const c = new THREE.Color(hex);
  const L = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return L > 0.45 ? '#141d28' : '#ffffff';
}

function makeMaterials() {
  M = {
    ground: themeMat(stdMat('#c9d3dd', { roughness: 0.95 }), '--scene-ground'),
    plate: themeMat(stdMat('#f3f6f8', { roughness: 0.9 }), '--scene-plate'),
    plateSide: themeMat(stdMat('#aebbc8', { roughness: 0.9 }), '--scene-plate-side'),
    floor: themeMat(stdMat('#eadfce', { roughness: 0.85 }), '--scene-floor'),
    wall: themeMat(stdMat('#f8f4ec', { roughness: 0.9 }), '--scene-wall'),
    dark: themeMat(stdMat('#2b3440', { roughness: 0.45, metalness: 0.25 }), '--scene-dark'),
    light: themeMat(stdMat('#e9edf1', { roughness: 0.4, metalness: 0.05 }), '--scene-light'),
    unit: stdMat('#596473', { roughness: 0.5, metalness: 0.3 }),
    trim: stdMat('#c3ccd6', { roughness: 0.5 }),
    wood: stdMat('#b48a5e', { roughness: 0.8 }),
    router: themeMat(stdMat('#2a74cf', { roughness: 0.4, metalness: 0.15 }), '--l3'),
    routerTop: stdMat('#ffffff', { roughness: 0.6 }),
    switchTop: themeMat(stdMat('#d9650f', { roughness: 0.5 }), '--l2'),
    white: stdMat('#ffffff', { roughness: 0.5 }),
    black: stdMat('#0d1117', { roughness: 0.6 }),
    tile: themeMat(stdMat('#aebbc8', { roughness: 0.7 }), '--scene-plate-side'),
    pot: stdMat('#b5653a', { roughness: 0.8 }),
    leaf: stdMat('#3f8f5a', { roughness: 0.75, flatShading: true }),
    cloud: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.55, flatShading: true }),
    windowLit: new THREE.MeshStandardMaterial({ color: '#ffe7a3', emissive: '#ffd666', emissiveIntensity: 0.35 }),
  };
  themeHooks.push(dark => {
    M.windowLit.emissiveIntensity = dark ? 0.9 : 0.3;
    M.cloud.opacity = dark ? 0.16 : 0.55;
    M.wood.color.set(dark ? '#6b5038' : '#b48a5e');
  });
}

function led(x, y, z, color, parent = scene, size = 0.09) {
  const m = new THREE.Mesh(boxG(size, size, 0.03), new THREE.MeshBasicMaterial({ color }));
  m.position.set(x, y, z);
  parent.add(m);
  const l = { m, base: new THREE.Color(color), phase: Math.random() * 10, rate: 0.6 + Math.random() * 2.4 };
  LEDS.push(l);
  return l;
}

function buildGround() {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), M.ground);
  g.rotation.x = -Math.PI / 2;
  g.position.y = -1.2;
  g.receiveShadow = true;
  scene.add(g);
  const plate = (cx, cz, w, d) => {
    const m = new THREE.Mesh(boxG(w, 1.2, d), [M.plateSide, M.plateSide, M.plate, M.plateSide, M.plateSide, M.plateSide]);
    m.position.set(cx, -0.6, cz);
    m.receiveShadow = true;
    m.castShadow = true;
    scene.add(m);
  };
  plate(-22.5, 0, 31, 24);   // Internet
  plate(0, 0, 9, 14);        // FAI
  plate(19.75, 0, 23.5, 21); // maison

  // la maison : sol, murs en coupe, une plante
  mesh(boxG(23, 0.05, 20.4), M.floor, 19.75, 0.005, 0).castShadow = false;
  mesh(boxG(23.6, 2.4, 0.3), M.wall, 19.75, 1.2, -10.35);
  mesh(boxG(0.3, 2.4, 21), M.wall, 31.6, 1.2, 0);
  mesh(boxG(0.3, 2.4, 6), M.wall, 7.95, 1.2, -7.4);
  mesh(cylG(0.36, 0.27, 0.62), M.pot, 30.4, 0.31, -9.4);
  const leaves = mesh(new THREE.IcosahedronGeometry(0.75, 0), M.leaf, 30.4, 1.15, -9.4);
  leaves.scale.set(1, 1.25, 1);

  // le "nuage" Internet, symbole des schémas réseau
  [[-24, 7.4, -11.5, 2.6], [-21, 8.2, -11.8, 3.2], [-17.6, 7.5, -11.4, 2.5], [-19.5, 6.8, -10.8, 2.2], [-22.6, 6.7, -10.9, 2.0]]
    .forEach(([x, y, z, r]) => { const c = mesh(new THREE.IcosahedronGeometry(r, 1), M.cloud, x, y, z); c.castShadow = false; c.receiveShadow = false; });
}

function buildDatacenter() {
  mesh(boxG(7.6, 0.04, 4.4), M.tile, -33.5, 0.02, -3.1).castShadow = false;
  for (const x of [-35.6, -33.5, -31.4]) {
    mesh(boxG(1.95, 4.2, 1.8), M.dark, x, 2.1, -3.2);
    for (let i = 0; i < 7; i++) {
      const y = 0.5 + i * 0.52;
      mesh(boxG(1.72, 0.36, 0.06), M.unit, x, y, -2.27).castShadow = false;
      led(x + 0.62, y, -2.22, i % 3 === 0 ? '#5aa2ff' : '#3ccf7a');
      led(x + 0.45, y, -2.22, '#3ccf7a', scene, 0.07);
    }
  }
  EQ.srv = { pos: new V3(-33.5, 0, -3.2), station: new V3(-33.5, 2.5, -0.6), ringR: 2.9 };
}

function makeArrow(material) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(boxG(0.5, 0.05, 0.13), material);
  shaft.position.x = 0.25;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 3), material);
  head.rotation.y = Math.PI / 2;
  head.position.x = 0.58;
  g.add(shaft, head);
  return g;
}

function buildRouter(id, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  scene.add(g);
  mesh(cylG(1.25, 1.25, 0.8, 40), M.router, 0, 0.4, 0, g);
  mesh(cylG(1.22, 1.22, 0.04, 40), M.routerTop, 0, 0.82, 0, g).castShadow = false;
  for (let k = 0; k < 4; k++) {
    const ang = k * Math.PI / 2 + Math.PI / 4;
    const inward = k % 2 === 0;
    const a = makeArrow(M.router);
    const r = inward ? 1.02 : 0.16;
    a.position.set(Math.cos(ang) * r, 0.86, -Math.sin(ang) * r);
    a.rotation.y = ang + (inward ? Math.PI : 0);
    g.add(a);
  }
  EQ[id] = { pos: new V3(x, 0, z), station: new V3(x, 2.05, z), ringR: 1.9, group: g };
}

function buildFAI() {
  mesh(boxG(5, 3.4, 4), M.wall, 0, 1.7, -3.4);
  mesh(boxG(5.3, 0.25, 4.3), M.dark, 0, 3.5, -3.4);
  mesh(boxG(1.1, 1.7, 0.08), M.dark, 0, 0.85, -1.37);
  for (const wx of [-1.7, 1.7]) for (const wy of [1.1, 2.45]) mesh(boxG(0.9, 0.7, 0.08), M.windowLit, wx, wy, -1.37).castShadow = false;
  mesh(cylG(0.06, 0.08, 2.2, 8), M.dark, 1.6, 4.7, -4.2);
  const dish = mesh(new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.light, 1.6, 5.4, -3.95);
  dish.rotation.x = Math.PI / 2.4;
  led(1.6, 5.85, -4.2, '#ff5a5f', scene, 0.14);
  buildRouter('fai', 0, 3);
}

/* ---------- la maison : box, switch, appareils ---------- */
const BOX_LEDS = {};  // power, fibre
let PC_CABLE = null;  // bout du câble du PC : branché ou qui pend
function screenTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const s = { canvas: c, tex, draw: state => { draw(c.getContext('2d'), w, h, state); tex.needsUpdate = true; } };
  return s;
}
function drawBrowser(g, w, h, state) {
  g.fillStyle = '#20303f'; g.fillRect(0, 0, w, h);
  const bx = w * 0.05, by = h * 0.07, bw = w * 0.9, bh = h * 0.86;
  g.fillStyle = '#f4f6f8'; g.fillRect(bx, by, bw, bh);
  g.fillStyle = '#d6dce3'; g.fillRect(bx, by, bw, h * 0.11);
  g.fillStyle = '#ffffff'; g.fillRect(bx + w * 0.03, by + h * 0.022, bw * 0.72, h * 0.066);
  g.fillStyle = '#1b8a4a'; g.fillRect(bx + w * 0.045, by + h * 0.04, w * 0.016, h * 0.03);
  g.fillStyle = '#334'; g.font = `600 ${Math.round(h * 0.045)}px monospace`; g.textBaseline = 'middle';
  g.fillText('https://exemple.fr', bx + w * 0.075, by + h * 0.056);
  const top = by + h * 0.15;
  if (state === 'page') {
    g.fillStyle = '#2a74cf'; g.fillRect(bx, top - h * 0.03, bw, h * 0.13);
    g.fillStyle = '#ffffff'; g.font = `700 ${Math.round(h * 0.07)}px sans-serif`;
    g.fillText('Bienvenue sur exemple.fr', bx + w * 0.04, top + h * 0.035);
    g.fillStyle = '#c9d3dd';
    for (let i = 0; i < 5; i++) g.fillRect(bx + w * 0.04, top + h * (0.16 + i * 0.075), bw * (i === 4 ? 0.3 : 0.5), h * 0.03);
    const grd = g.createLinearGradient(0, top + h * 0.15, 0, top + h * 0.6);
    grd.addColorStop(0, '#f2bf1d'); grd.addColorStop(1, '#d9650f');
    g.fillStyle = grd; g.fillRect(bx + bw * 0.6, top + h * 0.15, bw * 0.34, h * 0.46);
  } else {
    g.fillStyle = '#c9d3dd'; g.fillRect(bx + bw * 0.25, top + h * 0.3, bw * 0.5, h * 0.035);
    g.fillStyle = '#2a74cf'; g.fillRect(bx + bw * 0.25, top + h * 0.3, bw * 0.5 * (state === 'wait' ? 0.35 : 0.08), h * 0.035);
    g.fillStyle = '#556'; g.font = `600 ${Math.round(h * 0.05)}px sans-serif`; g.textAlign = 'center';
    g.fillText(state === 'wait' ? 'En attente de exemple.fr…' : 'Chargement…', bx + bw / 2, top + h * 0.45);
    g.textAlign = 'left';
  }
}
function drawVideo(g, w, h) {
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, '#1d3557'); grd.addColorStop(1, '#5aa2ff');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = '#f5c518'; g.beginPath(); g.arc(w * 0.72, h * 0.32, h * 0.12, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0f2238'; g.beginPath(); g.moveTo(0, h * 0.85); g.lineTo(w * 0.35, h * 0.45); g.lineTo(w * 0.6, h * 0.75); g.lineTo(w, h * 0.5); g.lineTo(w, h); g.lineTo(0, h); g.fill();
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(w * 0.05, h * 0.9, w * 0.9, h * 0.03);
  g.fillStyle = '#ff4d4d'; g.fillRect(w * 0.05, h * 0.9, w * 0.4, h * 0.03);
}
function drawGame(g, w, h) {
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#7ad3ff'); grd.addColorStop(1, '#c6f0ff');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = '#3cc48f'; g.fillRect(0, h * 0.72, w, h * 0.28);
  g.fillStyle = '#2f9e6f'; for (let i = 0; i < 6; i++) g.fillRect(w * (0.08 + i * 0.17), h * 0.72, w * 0.08, h * 0.04);
  g.fillStyle = '#d9650f'; g.fillRect(w * 0.3, h * 0.55, w * 0.07, h * 0.17);
  g.fillStyle = '#ffffff'; g.fillRect(w * 0.31, h * 0.58, w * 0.02, h * 0.03);
  g.fillStyle = '#a3713f'; g.fillRect(w * 0.6, h * 0.42, w * 0.16, h * 0.06);
  g.fillStyle = '#141d28'; g.font = `700 ${Math.round(h * 0.09)}px monospace`; g.fillText('P1  ♥♥♥', w * 0.04, h * 0.14);
}

function buildHouse() {
  // Box internet
  const bx = new THREE.Group(); bx.position.set(11.5, 0, 0.5); scene.add(bx);
  mesh(boxG(2.5, 0.7, 1.6), M.light, 0, 0.35, 0, bx);
  mesh(boxG(2.3, 0.02, 1.4), M.trim, 0, 0.71, 0, bx).castShadow = false;
  for (const ax of [-0.95, 0.95]) { const a = mesh(cylG(0.05, 0.06, 1.1, 8), M.dark, ax, 1.2, -0.62, bx); a.rotation.z = ax > 0 ? -0.12 : 0.12; }
  BOX_LEDS.power = led(-0.85, 0.45, 0.815, '#3ccf7a', bx, 0.1); BOX_LEDS.fibre = led(-0.6, 0.45, 0.815, '#3ccf7a', bx, 0.1);
  led(-0.35, 0.45, 0.815, '#5aa2ff', bx, 0.1); led(-0.1, 0.45, 0.815, '#f5c518', bx, 0.1);
  EQ.box = { pos: new V3(11.5, 0, 0.5), station: new V3(11.5, 2.05, 0.5), ringR: 2.1, group: bx };

  // Switch : boîtier sombre, dessus orange comme la couche 2
  const sw = new THREE.Group(); sw.position.set(17, 0, 0.5); scene.add(sw);
  mesh(boxG(2.8, 0.5, 1.4), M.dark, 0, 0.25, 0, sw);
  mesh(boxG(2.72, 0.03, 1.32), M.switchTop, 0, 0.515, 0, sw).castShadow = false;
  [[-0.36, 1], [-0.12, -1], [0.12, 1], [0.36, -1]].forEach(([z, d]) => {
    const a = makeArrow(M.white); a.scale.setScalar(0.9);
    a.position.set(d > 0 ? -0.42 : 0.42, 0.535, z); a.rotation.y = d > 0 ? 0 : Math.PI; sw.add(a);
  });
  for (let i = 0; i < 8; i++) {
    const px = -1.12 + i * 0.32;
    mesh(boxG(0.22, 0.15, 0.04), M.black, px, 0.2, 0.71, sw).castShadow = false;
    SW_LEDS.push(led(px, 0.37, 0.715, i < 4 ? '#3ccf7a' : '#2b3440', sw, 0.07));
  }
  EQ.sw = { pos: new V3(17, 0, 0.5), station: new V3(17, 1.7, 0.5), ringR: 2.2, group: sw };

  // PC fixe : bureau, écran, tour
  mesh(boxG(4, 0.12, 2.1), M.wood, 25.5, 1.0, -6.3);
  for (const [lx, lz] of [[23.7, -7.2], [27.3, -7.2], [23.7, -5.4], [27.3, -5.4]]) mesh(boxG(0.1, 0.95, 0.1), M.wood, lx, 0.47, lz);
  mesh(boxG(0.7, 0.04, 0.4), M.dark, 25.5, 1.08, -6.6);
  mesh(boxG(0.1, 0.5, 0.08), M.dark, 25.5, 1.32, -6.66);
  mesh(boxG(2.3, 1.4, 0.1), M.dark, 25.5, 2.15, -6.64);
  SCREENS.pc = screenTex(512, 300, drawBrowser);
  SCREENS.pc.draw('wait');
  const pcScr = new THREE.Mesh(new THREE.PlaneGeometry(2.16, 1.27), new THREE.MeshBasicMaterial({ map: SCREENS.pc.tex }));
  pcScr.position.set(25.5, 2.15, -6.585); scene.add(pcScr);
  mesh(boxG(1.3, 0.04, 0.42), M.dark, 25.5, 1.08, -5.75);
  mesh(boxG(0.8, 1.7, 1.6), M.dark, 22.9, 0.85, -6);
  led(23.31, 1.5, -5.6, '#5aa2ff', scene, 0.08);
  EQ.pc = { pos: new V3(25.5, 0, -6.3), station: new V3(25.5, 2.1, -4.85), ringR: 2.9 };

  // Portable sur une petite table
  mesh(boxG(1.8, 0.08, 1.2), M.wood, 25.5, 0.8, 0.5);
  for (const [lx, lz] of [[24.75, 0], [26.25, 0], [24.75, 1], [26.25, 1]]) mesh(boxG(0.08, 0.76, 0.08), M.wood, lx, 0.38, lz);
  mesh(boxG(1.1, 0.05, 0.75), M.light, 25.5, 0.865, 0.62);
  const lid = new THREE.Group(); lid.position.set(25.5, 0.89, 0.25); lid.rotation.x = -0.22; scene.add(lid);
  mesh(boxG(1.1, 0.72, 0.04), M.light, 0, 0.36, 0, lid);
  SCREENS.laptop = screenTex(256, 160, drawVideo);
  SCREENS.laptop.draw();
  const lap = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.6), new THREE.MeshBasicMaterial({ map: SCREENS.laptop.tex }));
  lap.position.set(0, 0.37, 0.025); lid.add(lap);
  EQ.laptop = { pos: new V3(25.5, 0, 0.5), station: new V3(25.5, 2.0, 1.45), ringR: 1.6 };

  // Console et télé
  mesh(boxG(4, 0.55, 1.2), M.wood, 25.5, 0.275, 6.4);
  mesh(boxG(0.9, 0.04, 0.4), M.dark, 25.5, 0.57, 6.3);
  mesh(boxG(0.12, 0.3, 0.08), M.dark, 25.5, 0.72, 6.28);
  mesh(boxG(3.0, 1.75, 0.1), M.dark, 25.5, 1.72, 6.25);
  SCREENS.tv = screenTex(320, 180, drawGame);
  SCREENS.tv.draw();
  const tv = new THREE.Mesh(new THREE.PlaneGeometry(2.84, 1.6), new THREE.MeshBasicMaterial({ map: SCREENS.tv.tex }));
  tv.position.set(25.5, 1.72, 6.305); scene.add(tv);
  mesh(boxG(1.0, 0.22, 0.75), M.light, 24.0, 0.66, 6.6);
  led(24.0, 0.66, 6.98, '#5aa2ff', scene, 0.08);
  EQ.console = { pos: new V3(25.5, 0, 6.4), station: new V3(25.5, 1.9, 7.65), ringR: 2.6 };
}

/* ---------- câbles ---------- */
const LINKDEF = {
  'srv>r1': [[-33.5, -2.25], [-29.6, -2.25], [-26.15, -3.55]],
  'r1>r2': [[-23.9, -3.45], [-19.2, -0.6], [-15.15, 2.05]],
  'r1>r3': [[-23.85, -4.55], [-18.15, -7.05]],
  'r3>r2': [[-16.6, -6.3], [-14.35, 1.3]],
  'r1>r4': [[-25.5, -2.85], [-27.1, 4.8]],
  'r4>r2': [[-26.3, 6.25], [-15.2, 2.9]],
  'r2>fai': [[-12.75, 2.6], [-7.2, 2.85], [-4.4, 2.95], [-1.25, 3]],
  'fai>box': [[1.25, 3], [4.5, 3], [7.9, 3], [9.4, 1.4], [10.25, 0.5]],
  'box>sw': [[12.75, 0.5], [15.6, 0.5]],
  'sw>pc': [[18.4, 0.25], [20.6, 0.25], [20.6, -6], [22.5, -6]],
  'sw>laptop': [[18.4, 0.55], [24.6, 0.55]],
  'sw>console': [[18.4, 0.85], [21.5, 0.85], [21.5, 6.85], [23.5, 6.85]],
};
function buildCables() {
  for (const [key, pts] of Object.entries(LINKDEF)) {
    const fiber = key === 'fai>box';
    const wan = ['srv>r1', 'r1>r2', 'r1>r3', 'r3>r2', 'r1>r4', 'r4>r2', 'r2>fai'].includes(key);
    const radius = fiber ? 0.075 : wan ? 0.11 : 0.07;
    const mat = fiber
      ? new THREE.MeshStandardMaterial({ color: '#f2bf1d', emissive: '#f2bf1d', emissiveIntensity: 0.15, roughness: 0.4 })
      : themeMat(new THREE.MeshStandardMaterial({ color: '#7f8c9b', emissive: '#000000', roughness: 0.55 }), '--scene-cable');
    let m;
    if (key === 'sw>pc') {
      // le dernier tronçon peut être "débranché" : il disparaît et une fiche RJ45 pend au sol
      m = tubeMesh([...pts.slice(0, -1), [21.7, -6]], radius, mat);
      const end = tubeMesh([[21.7, -6], [22.5, -6]], radius, mat);
      const loose = new THREE.Group();
      scene.add(loose);
      tubeMesh([[21.7, -6], [21.9, -5.4], [22.3, -4.95]], radius, mat, loose);
      const plug = mesh(boxG(0.38, 0.17, 0.24), M.light, 22.45, 0.1, -4.82, loose);
      plug.rotation.y = -0.85;
      loose.visible = false;
      PC_CABLE = { end, loose };
    } else {
      m = tubeMesh(pts, radius, mat);
    }
    LINKS[key] = { mat, mesh: m, base: mat.emissiveIntensity, baseEmissive: mat.emissive.getHex() };
  }
}
function tubeMesh(pts2, radius, mat, parent = scene) {
  const path = new THREE.CurvePath();
  const v = pts2.map(([x, z]) => new V3(x, radius + 0.02, z));
  for (let i = 1; i < v.length; i++) path.add(new THREE.LineCurve3(v[i - 1], v[i]));
  const m = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(12, v.length * 14), radius, 8, false), mat);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function linkKey(a, b) { return LINKDEF[a + '>' + b] ? a + '>' + b : b + '>' + a; }
function glowLink(a, b, color, on) {
  if (!HAS3D) return;
  const L = LINKS[linkKey(a, b)];
  if (!L) return;
  if (on) { L.mat.emissive.set(color); L.mat.emissiveIntensity = 0.85; }
  else { L.mat.emissive.setHex(L.baseEmissive); L.mat.emissiveIntensity = L.base; }
}
function pathBetween(a, b, lift = 0.55) {
  let pts = LINKDEF[a + '>' + b], rev = false;
  if (!pts) { pts = LINKDEF[b + '>' + a]; rev = true; }
  const v = pts.map(([x, z]) => new V3(x, lift, z));
  if (rev) v.reverse();
  const A = EQ[a].station, B = EQ[b].station, out = [A.clone()];
  if (a !== 'srv') out.push(new V3(v[0].x, A.y, v[0].z));
  out.push(...v);
  if (b !== 'srv') out.push(new V3(v[v.length - 1].x, B.y, v[v.length - 1].z));
  out.push(B.clone());
  return new Poly(out);
}

/* ---------- le paquet : une pile de tranches colorées ---------- */
const ORDER = ['eth', 'ip', 'tcp', 'data', 'fcs'];
const SLAB_DEF = {
  eth: { len: 0.42, tok: '--l2', text: 'ETH' },
  ip: { len: 0.46, tok: '--l3', text: 'IP' },
  tcp: { len: 0.44, tok: '--l4', text: 'TCP' },
  data: { len: 0.98, tok: '--l7', text: 'DONNÉES', icon: 'lock' },
  fcs: { len: 0.14, tok: '--l2', text: '' },
};
const GAP = 0.035;
const SLAB_TEX = {};
const PACKETS = new Set();
function slabTex(k, variant) {
  const id = k + (variant || '');
  if (SLAB_TEX[id]) return SLAB_TEX[id];
  const d = SLAB_DEF[k], col = cssVar(d.tok) || '#888888';
  const opts = variant === 'open'
    ? { w: Math.round(d.len * 330), h: 200, bg: col, fg: inkFor(col), text: 'HTML', icon: 'open' }
    : { w: Math.max(48, Math.round(d.len * 330)), h: 200, bg: col, fg: inkFor(col), text: d.text, icon: d.icon };
  return (SLAB_TEX[id] = labelTexture(opts));
}
function glowStyle(mat, dark, kind) {
  mat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
  if (kind === 'amb') { mat.color.set(dark ? '#7fc4ff' : '#2a74cf'); mat.opacity = dark ? 0.9 : 0.55; }
  else { mat.color.set(dark ? '#ffd76a' : '#f2bf1d'); mat.opacity = dark ? 0.75 : 0.5; }
  mat.needsUpdate = true;
}
class Packet {
  constructor(scale = 1) {
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.slabs = {}; this.on = {};
    this.mode = 'display'; this.heading = 0; this.bob = Math.random() * 6;
    for (const k of ORDER) {
      const d = SLAB_DEF[k], col = cssVar(d.tok) || '#888888';
      const side = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, metalness: 0.05, transparent: true });
      const face = d.text ? new THREE.MeshStandardMaterial({ map: slabTex(k), roughness: 0.55, transparent: true }) : side;
      const m = new THREE.Mesh(boxG(d.len, 0.62, 0.62), [side, side, side, side, face, face]);
      m.castShadow = true;
      this.body.add(m);
      this.slabs[k] = { m, side, face, len: d.len };
      this.on[k] = true;
    }
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, transparent: true, depthWrite: false }));
    this.glow.scale.setScalar(3.3);
    this.group.add(this.glow);
    glowStyle(this.glow.material, isDark(), 'pkt');
    this.glowBase = this.glow.material.opacity;
    this.group.scale.setScalar(scale);
    this.layout(true);
    scene.add(this.group);
    PACKETS.add(this);
  }
  opacity(k, o) { const s = this.slabs[k]; s.side.opacity = o; s.face.opacity = o; }
  targetX() {
    let total = 0, n = 0;
    for (const k of ORDER) if (this.on[k]) { total += this.slabs[k].len; n++; }
    total += GAP * Math.max(0, n - 1);
    let x = total / 2;
    const out = {};
    for (const k of ORDER) if (this.on[k]) { out[k] = x - this.slabs[k].len / 2; x -= this.slabs[k].len + GAP; }
    return out;
  }
  layout(instant, ctx = FX, dur = 0.35) {
    const tx = this.targetX();
    if (instant) { for (const k in tx) this.slabs[k].m.position.x = tx[k]; return Promise.resolve(); }
    const from = {};
    for (const k in tx) from[k] = this.slabs[k].m.position.x;
    return tween(ctx, dur, e => { for (const k in tx) this.slabs[k].m.position.x = lerp(from[k], tx[k], e); });
  }
  setLayers(list) {
    for (const k of ORDER) {
      this.on[k] = list.includes(k);
      const s = this.slabs[k];
      s.m.visible = this.on[k];
      s.m.position.y = 0; s.m.rotation.z = 0; s.m.scale.setScalar(1);
      this.opacity(k, 1);
    }
    this.layout(true);
  }
  async attach(ctx, k, dur = 0.55) {
    if (this.on[k]) return;
    this.on[k] = true;
    const s = this.slabs[k], tx = this.targetX();
    s.m.visible = true; s.m.rotation.z = 0;
    s.m.position.set(tx[k], 1.6, 0); s.m.scale.setScalar(0.2); this.opacity(k, 0);
    await Promise.all([
      this.layout(false, ctx, dur * 0.6),
      tween(ctx, dur, (e, p) => {
        s.m.position.y = lerp(1.6, 0, e);
        s.m.scale.setScalar(lerp(0.2, 1, Math.min(1, p * 1.6)));
        this.opacity(k, Math.min(1, p * 2.2));
      }, ease.back),
    ]);
  }
  async detach(ctx, k, dur = 0.55, dir = 1) {
    if (!this.on[k]) return;
    this.on[k] = false;
    const s = this.slabs[k], x0 = s.m.position.x;
    const fly = tween(ctx, dur, e => {
      s.m.position.y = e * 1.8; s.m.position.x = x0 + e * 0.7 * dir; s.m.rotation.z = -e * 0.9 * dir;
      this.opacity(k, 1 - e);
    }, ease.out).then(() => { s.m.visible = false; s.m.rotation.z = 0; s.m.position.y = 0; this.opacity(k, 1); });
    await wait(ctx, dur * 0.35);
    await Promise.all([fly, this.layout(false, ctx, dur * 0.6)]);
  }
  async rewrap(ctx) { // nouvelle trame : en-tête Ethernet et FCS refaits
    await Promise.all([this.detach(ctx, 'eth', 0.5, 1), this.detach(ctx, 'fcs', 0.5, -1)]);
    await wait(ctx, 0.12);
    await Promise.all([this.attach(ctx, 'eth', 0.55), this.attach(ctx, 'fcs', 0.55)]);
  }
  unlock(open) { this.slabs.data.face.map = slabTex('data', open ? 'open' : ''); this.slabs.data.face.needsUpdate = true; }
  place(v) { this.group.position.copy(v); }
  show(v) { this.group.visible = v; }
  async travel(ctx, poly, speed = 9, ez = ease.inOut) {
    this.mode = 'travel';
    const P = new V3(), D = new V3(), L = poly.length;
    await tween(ctx, L / speed, e => {
      const d = e * L;
      this.group.position.copy(poly.at(d, P));
      poly.dir(Math.min(d + 0.05, L), D);
      if (Math.abs(D.x) + Math.abs(D.z) > 0.25) this.heading = Math.atan2(-D.z, D.x);
    }, ez);
    this.mode = 'display';
  }
  update(dt, t) {
    const want = this.mode === 'travel' ? this.heading : rig.th + Math.PI;
    const r = this.group.rotation;
    const diff = ((want - r.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    r.y += diff * (1 - Math.exp(-dt * (this.mode === 'travel' ? 12 : 5)));
    this.body.position.y = this.mode === 'display' && !REDUCED ? Math.sin(t * 2.2 + this.bob) * 0.06 : 0;
    this.glow.material.opacity = this.glowBase * (0.85 + 0.15 * Math.sin(t * 4 + this.bob));
  }
  dispose() {
    scene.remove(this.group);
    PACKETS.delete(this);
    for (const k of ORDER) {
      const s = this.slabs[k];
      s.m.geometry.dispose(); s.side.dispose(); if (s.face !== s.side) s.face.dispose();
    }
    this.glow.material.dispose();
  }
}

/* ---------- effets ---------- */
function burstRing(pos, color, r = 1.8) {
  if (!HAS3D) return;
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(pos.x, 0.08, pos.z);
  scene.add(m);
  tween(FX, 0.85, e => { m.scale.setScalar(1 + e * 0.9); m.material.opacity = 0.9 * (1 - e); }, ease.out)
    .then(() => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }).catch(swallow);
}
function ringAt(id) {
  if (!HAS3D) return;
  const e = EQ[id];
  focusRing.visible = true;
  focusRing.position.set(e.pos.x, 0.08, e.pos.z);
  focusRing.userData.r = e.ringR;
}
function ringOff() { if (HAS3D) focusRing.visible = false; }
function blinkPorts(ports) { for (const i of ports) if (SW_LEDS[i] && SW_LEDS[i].mode !== 'off') SW_LEDS[i].boost = 0.9; }
function setLed(l, mode, color) { if (!l) return; l.mode = mode; if (color) l.base.set(color); l.dirty = true; }
// Montre dans la scène l'état matériel du jeu : câble du PC, alimentation du switch, fibre
function applyHomeVisuals(st) {
  if (!HAS3D || !PC_CABLE) return;
  PC_CABLE.end.visible = st.pcCable;
  PC_CABLE.loose.visible = !st.pcCable;
  SW_LEDS.forEach((l, i) => setLed(l, !st.switchOn || (i === 1 && !st.pcCable) ? 'off' : 'blink'));
  setLed(BOX_LEDS.fibre, st.fiberOk ? 'blink' : 'on', st.fiberOk ? '#3ccf7a' : '#ff3b3b');
  const L = LINKS['fai>box'];
  L.mat.color.set(st.fiberOk ? '#f2bf1d' : '#5f6672');
  L.baseEmissive = st.fiberOk ? 0xf2bf1d : 0x000000;
  L.base = st.fiberOk ? 0.15 : 0;
  L.mat.emissive.setHex(L.baseEmissive);
  L.mat.emissiveIntensity = L.base;
}

/* ---------- ambiance : le trafic des autres sur Internet ---------- */
let ambientOn = true;
const AMB_LINKS = ['r1>r3', 'r3>r2', 'r1>r4', 'r4>r2', 'r1>r2', 'srv>r1', 'r2>fai'];
function respawnAmbient(a) {
  const key = AMB_LINKS[Math.floor(Math.random() * AMB_LINKS.length)];
  const pts = LINKDEF[key].map(([x, z]) => new V3(x, 0.42, z));
  if (Math.random() < 0.5) pts.reverse();
  a.poly = new Poly(pts); a.d = 0; a.speed = 4 + Math.random() * 5;
}

/* ---------- assemblage ---------- */
function buildWorld() {
  if (!HAS3D) return;
  GLOW_TEX = glowTexture();
  makeMaterials();
  buildGround();
  buildDatacenter();
  buildRouter('r1', -25, -4);
  buildRouter('r2', -14, 2.5);
  buildRouter('r3', -17, -7.5);
  buildRouter('r4', -27.5, 6);
  buildFAI();
  buildHouse();
  buildCables();

  focusRing = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64),
    new THREE.MeshBasicMaterial({ color: '#f2bf1d', transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
  focusRing.rotation.x = -Math.PI / 2;
  focusRing.visible = false;
  focusRing.userData.r = 2;
  scene.add(focusRing);

  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, transparent: true, depthWrite: false }));
    s.scale.setScalar(0.95);
    glowStyle(s.material, isDark(), 'amb');
    scene.add(s);
    const a = { s };
    respawnAmbient(a);
    a.d = Math.random() * a.poly.length;
    AMBIENT.push(a);
  }

  themeHooks.push(dark => {
    focusRing.material.color.set(dark ? '#f5c518' : '#c98400');
    for (const a of AMBIENT) glowStyle(a.s.material, dark, 'amb');
    for (const p of PACKETS) { glowStyle(p.glow.material, dark, 'pkt'); p.glowBase = p.glow.material.opacity; }
  });

  const T = (id, name, addr, pos, o = {}) => addTag({ id, name, addr, pos, key: o.key, short: o.short, minor: o.minor, detail: o.detail, onClick: () => tagClick(id) });
  T('srv', 'Serveur web', IP.srv, [-33.5, 0, -2.2], { short: 'Serveur' });
  T('r1', 'Routeur Amsterdam', '', [-25, 0, -2.7], { short: 'Amsterdam' });
  T('r2', 'Routeur Paris', '', [-14, 0, 3.8], { short: 'Paris' });
  T('r3', 'Francfort', '', [-17, 0, -6.2], { minor: true });
  T('r4', 'Londres', '', [-27.5, 0, 7.3], { minor: true });
  T('fai', 'Routeur du FAI', '', [0, 0, 4.3], { short: 'FAI' });
  T('fiber', 'Fibre optique', 'lien WAN', [5.6, 0, 3.1], { minor: true, detail: true });
  T('box', 'Box internet', 'WAN 198.51.100.42 · LAN 192.168.1.1', [11.5, 0, 1.35], { short: 'Box' });
  T('sw', 'Switch', 'couche 2, sans IP', [17, 0, 1.25]);
  T('pc', 'PC fixe', IP.pc, [25.5, 0, -5.2], { key: '1', short: 'PC' });
  T('laptop', 'Portable', IP.laptop, [25.5, 0, 1.15], { key: '2' });
  T('console', 'Console', IP.console, [25.5, 0, 7.05], { key: '3' });
  addTag({ id: 'z-net', name: 'Internet · WAN', zone: true, pos: [-22.5, -0.2, 12.05] });
  addTag({ id: 'z-fai', name: "Fournisseur d'accès", zone: true, pos: [0, -0.2, 7.05] });
  addTag({ id: 'z-home', name: 'Ta maison · LAN', zone: true, pos: [19.75, -0.2, 10.55] });

  updaters.push((dt, t) => {
    if (focusRing.visible) focusRing.scale.setScalar(focusRing.userData.r * (1 + 0.06 * Math.sin(t * 4)));
    for (const l of LEDS) {
      let on;
      if (l.mode === 'off') on = false;
      else if (l.mode === 'on') on = true;
      else if (l.boost > 0) { l.boost -= dt; on = Math.sin(t * 40) > 0; }
      else on = Math.sin(t * l.rate * 2 + l.phase) > -0.35;
      if (on !== l.on || l.dirty) {
        l.on = on; l.dirty = false;
        l.m.material.color.copy(l.base).multiplyScalar(on ? 1 : l.mode === 'off' ? 0.1 : 0.25);
      }
    }
    for (const a of AMBIENT) {
      a.s.visible = ambientOn;
      if (!ambientOn) continue;
      a.d += a.speed * dt;
      if (a.d >= a.poly.length) respawnAmbient(a);
      a.poly.at(a.d, a.s.position);
    }
    for (const p of PACKETS) p.update(dt, t);
  });
}

/* =====================================================================
   Inspecteur de paquet (façon Wireshark)
   ===================================================================== */
const LAYERS = [
  { k: 'eth', l: 2, name: 'Ethernet II', pdu: 'trame', fields: [['dst', 'MAC destination'], ['src', 'MAC source'], ['type', 'Type']] },
  { k: 'ip', l: 3, name: 'Internet Protocol v4', pdu: 'paquet', fields: [['src', 'IP source'], ['dst', 'IP destination'], ['ttl', 'TTL'], ['proto', 'Protocole']] },
  { k: 'tcp', l: 4, name: 'Transmission Control Protocol', pdu: 'segment', fields: [['sport', 'Port source'], ['dport', 'Port destination'], ['flags', 'Drapeaux']] },
  { k: 'data', l: 7, name: 'Données (TLS → HTTP)', pdu: 'données', fields: [['desc', 'Contenu'], ['size', 'Taille']] },
];
const inspTree = $('#insp-tree');
const INSP = {}; // k -> { row, dd: {field: el} }
let PK = null;   // état courant du paquet affiché

(function buildInspector() {
  const empty = document.createElement('p');
  empty.className = 'insp-empty';
  empty.id = 'insp-empty';
  empty.textContent = "Aucun paquet en vue pour l'instant. Passe à l'étape suivante pour en suivre un.";
  inspTree.appendChild(empty);
  for (const L of LAYERS) {
    const row = document.createElement('div');
    row.className = 'layer';
    row.dataset.l = L.l;
    row.innerHTML = `<div class="lh"><span class="lname">${esc(L.name)}<span class="badge">lu ici</span></span><span class="pdu">${esc(L.pdu)}</span></div>` +
      `<dl>${L.fields.map(([f, label]) => `<dt>${esc(label)}</dt><dd data-f="${f}"></dd>`).join('')}</dl>`;
    inspTree.appendChild(row);
    const dd = {};
    for (const [f] of L.fields) dd[f] = row.querySelector(`dd[data-f="${f}"]`);
    INSP[L.k] = { row, dd };
  }
})();

const clone = o => JSON.parse(JSON.stringify(o));
function merge(base, patch) {
  const out = clone(base);
  for (const k in patch) {
    if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k])) out[k] = Object.assign(out[k] || {}, patch[k]);
    else out[k] = patch[k];
  }
  return out;
}
function flashEl(el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
function renderPK(flash = true) {
  $('#insp-empty').hidden = !!PK;
  for (const L of LAYERS) {
    const I = INSP[L.k];
    I.row.hidden = !PK;
    if (!PK) continue;
    I.row.classList.toggle('gone', !PK.has[L.k]);
    I.row.classList.toggle('reading', PK.read === L.k || (Array.isArray(PK.read) && PK.read.includes(L.k)));
    for (const [f] of L.fields) {
      const v = PK[L.k] && PK[L.k][f] != null ? String(PK[L.k][f]) : '';
      if (I.dd[f].textContent !== v) {
        const had = I.dd[f].textContent !== '';
        I.dd[f].textContent = v;
        if (flash && had) flashEl(I.dd[f]);
      }
    }
  }
}
function setPK(state, layers) {           // remplace tout, sans clignotement
  PK = state ? clone(state) : null;
  if (PK) {
    PK.has = {};
    for (const k of ['eth', 'ip', 'tcp', 'data']) PK.has[k] = layers ? layers.includes(k) : true;
    PK.read = null;
  }
  for (const L of LAYERS) for (const [f] of L.fields) { INSP[L.k].dd[f].textContent = ''; INSP[L.k].dd[f].classList.remove('flash'); }
  renderPK(false);
}
function patchPK(patch) {                  // modifie quelques champs, avec clignotement
  if (!PK) return;
  for (const k in patch) {
    if (k === 'has') Object.assign(PK.has, patch.has);
    else if (k === 'read') PK.read = patch.read;
    else PK[k] = Object.assign(PK[k] || {}, patch[k]);
  }
  renderPK(true);
}
const where = t => { $('#insp-where').textContent = t || ''; };
const inspNote = html => { $('#insp-note').innerHTML = html || ''; };

/* =====================================================================
   États du paquet suivi
   ===================================================================== */
const ALL = ['eth', 'ip', 'tcp', 'data', 'fcs'];
const REQ = {
  eth: { dst: MAC.boxL, src: MAC.pc, type: 'IPv4 (0x0800)' },
  ip: { src: IP.pc, dst: IP.srv, ttl: 64, proto: 'TCP (6)' },
  tcp: { sport: 52344, dport: 443, flags: 'PSH, ACK' },
  data: { desc: 'Requête « GET / », chiffrée (TLS 1.3)', size: '517 octets' },
};
const RESP = {
  eth: { dst: MAC.r1a, src: MAC.srv, type: 'IPv4 (0x0800)' },
  ip: { src: IP.srv, dst: IP.boxW, ttl: 64, proto: 'TCP (6)' },
  tcp: { sport: 443, dport: 40001, flags: 'PSH, ACK' },
  data: { desc: 'Réponse « 200 OK » + page HTML, chiffrée (TLS 1.3)', size: '1 380 octets' },
};
const HOP = {
  r1: { eth: { src: MAC.r1b, dst: MAC.r2a }, ip: { ttl: 63 } },
  r2: { eth: { src: MAC.r2b, dst: MAC.faiA }, ip: { ttl: 62 } },
  fai: { eth: { src: MAC.faiB, dst: MAC.boxW }, ip: { ttl: 61 } },
  nat: { ip: { dst: IP.pc, ttl: 60 }, tcp: { dport: 52344 } },
  lan: { eth: { src: MAC.boxL, dst: MAC.pc } },
};
const R_AT_R2 = merge(merge(RESP, HOP.r1), HOP.r2);
const R_AT_BOX = merge(R_AT_R2, HOP.fai);
const R_NAT = merge(R_AT_BOX, HOP.nat);
const R_LAN = merge(R_NAT, HOP.lan);

/* =====================================================================
   Tables affichées dans le récit
   ===================================================================== */
function netTable(caption, head, rows) {
  return `<div class="table-wrap"><table class="net-table"><caption>${caption}</caption>` +
    `<thead><tr>${head.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>` +
    rows.map(r => `<tr${r.cls ? ` class="${r.cls}"` : ''}${r.id ? ` id="${r.id}"` : ''}>${r.cells.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') +
    `</tbody></table></div>`;
}
function natTable(opts = {}) {
  const rows = [];
  if (opts.withPc !== false) rows.push({ id: 'nat-pc', cls: opts.pcCls || '', cells: ['40001', '192.168.1.10:52344', 'PC fixe'] });
  rows.push({ cells: ['40002', '192.168.1.11:61022', 'Portable'] });
  rows.push({ cells: ['40003', '192.168.1.12:3074', 'Console'] });
  return netTable('Table NAT de la box', ['Port public', 'Vers (IP:port privés)', 'Appareil'], rows);
}
function routeTable(which) {
  if (which === 'r1') return netTable('Table de routage · Amsterdam', ['Réseau', 'Sortie', 'Vers'], [
    { cells: ['203.0.113.0/24', 'port 1', 'connecté (datacenter)'] },
    { cls: 'match', cells: ['198.51.100.0/24', 'port 2', 'Paris'] },
    { cells: ['0.0.0.0/0', 'port 3', 'Francfort'] },
  ]);
  return netTable('Table de routage · Paris', ['Réseau', 'Sortie', 'Vers'], [
    { cells: ['203.0.113.0/24', 'port 1', 'Amsterdam'] },
    { cls: 'match', cells: ['198.51.100.0/24', 'port 4', 'routeur du FAI'] },
    { cells: ['0.0.0.0/0', 'port 2', 'Londres'] },
  ]);
}
function setTable(html) { $('#step-table').innerHTML = html || ''; }

/* =====================================================================
   Visite guidée
   ===================================================================== */
let TP = null;                       // le paquet suivi
const tour = { i: 0, ctx: null, speed: 1, paused: false };
// Pause : on fige l'animation de l'étape (vitesse 0). Changer d'étape relance la lecture.
function setPaused(p) {
  tour.paused = !!p;
  if (tour.ctx) tour.ctx.speed = tour.paused ? 0 : tour.speed;
  const b = $('#pause');
  b.setAttribute('aria-pressed', String(tour.paused));
  b.querySelector('span').textContent = tour.paused ? 'Reprendre' : 'Pause';
  b.title = (tour.paused ? 'Reprendre' : 'Mettre en pause') + ' (Espace)';
  b.querySelector('.i-pause').toggleAttribute('hidden', tour.paused); // attribut : les éléments SVG n'ont pas de propriété .hidden
  b.querySelector('.i-play').toggleAttribute('hidden', !tour.paused);
  $('#paused-badge').hidden = !tour.paused;
}
const extras = new Set();            // petits paquets temporaires
const FIBER_GLOW = '#fff2b0';
const WHERE = {
  srv: 'dans le serveur web', r1: "dans le routeur d'Amsterdam", r2: 'dans le routeur de Paris',
  fai: 'dans le routeur du FAI', box: 'dans la box', sw: 'dans le switch', pc: 'dans le PC fixe',
};
const TOWARD = {
  srv: 'vers le serveur web', r1: 'vers Amsterdam', r2: 'vers Paris', fai: 'vers le FAI',
  box: 'vers la box', sw: 'vers le switch', pc: 'vers le PC fixe',
};

const VIEWS = {
  overview: { t: [-3, 0, 0], r: 62, th: 0, ph: 0.92, wide: true, p: { t: [3, 0, 0], r: 88, th: 1.32, ph: 0.62 }, d: { t: [0, 0, 4], r: 66, th: 0.6, ph: 0.9 } },
  server: { t: [-33.5, 1.9, -1.2], r: 12.5, th: 0.42, ph: 1.08 },
  box: { t: [12, 1.5, 0.5], r: 11.5, th: 0.12, ph: 1.0 },
  box2: { t: [12.4, 1.5, 0.5], r: 11.5, th: -0.3, ph: 1.0 },
  pc: { t: [25.2, 1.9, -5.3], r: 10.5, th: 0.28, ph: 1.05 },
  game: { t: [17.5, 0.6, 1.2], r: 31, th: -0.06, ph: 0.9, n: { t: [19.5, 0.6, 1.0], r: 37, th: 0.32, ph: 0.86 }, p: { t: [19, 0.6, 1.0], r: 44, th: 0.6, ph: 0.8 } },
};
function aspectK() { const a = VW / Math.max(1, VH); return a < 1.55 ? Math.min(2.2, 1.55 / a) : 1; }
function fitView(v) {
  if (OVERLAY.matches && v.d) return { ...v, ...v.d };
  const a = VW / Math.max(1, VH);
  if (a >= 0.95 && a < 1.3 && v.n) return { ...v, ...v.n, r: v.n.r * Math.sqrt(1.3 / a) };
  const portrait = a < 0.95 && v.p;
  const o = portrait ? { ...v, ...v.p } : { ...v };
  o.r = o.r * (portrait ? Math.max(1, Math.sqrt(0.86 / a)) : v.wide ? aspectK() : Math.sqrt(aspectK()));
  return o;
}
function view(name, instant) { setView(fitView(VIEWS[name]), instant); }
function followTP(r, th, ph) { if (TP) followObj(TP.group, r * Math.sqrt(aspectK()), th, ph, [0, 0.3, 0]); }

// petites aides qui ne font rien sans 3D
const placeAt = id => { if (TP) { TP.place(EQ[id].station); TP.show(true); } };
const layers = list => { if (TP) TP.setLayers(list); };
const ring = id => ringAt(id);
const pkPos = () => (TP ? TP.group.position.clone().add(new V3(0, 1.1, 0)) : null);
const pop = (txt, cls = 'good') => { if (TP) popText(pkPos(), txt, cls); };
async function move(ctx, a, b, speed = 8, glow) {
  where(TOWARD[b] ? 'en route ' + TOWARD[b] : '');
  if (!TP) return wait(ctx, 0.8);
  if (glow) glowLink(a, b, glow, true);
  try { await TP.travel(ctx, pathBetween(a, b), speed); }
  finally { if (glow) glowLink(a, b, null, false); }
  where(WHERE[b] || '');
}
const rewrap = ctx => (TP ? TP.rewrap(ctx) : wait(ctx, 0.8));
const attach = (ctx, k) => (TP ? TP.attach(ctx, k) : wait(ctx, 0.5));
const detach = (ctx, k, dir) => (TP ? TP.detach(ctx, k, 0.55, dir) : wait(ctx, 0.5));
function flip(ctx, keys) {
  if (!TP) return wait(ctx, 0.6);
  return tween(ctx, 0.7, e => { for (const k of keys) TP.slabs[k].m.rotation.x = e * Math.PI * 2; })
    .finally(() => { for (const k of keys) TP.slabs[k].m.rotation.x = 0; });
}
async function shrinkTP(ctx) {
  if (!TP) return;
  await tween(ctx, 0.5, e => TP.group.scale.setScalar(Math.max(0.01, 1 - e)), ease.in);
  TP.show(false);
  TP.group.scale.setScalar(1);
}
async function flyInto(ctx, target) {
  if (!TP) return;
  const from = TP.group.position.clone(), s0 = TP.group.scale.x;
  TP.mode = 'travel';
  await tween(ctx, 0.9, e => {
    TP.group.position.lerpVectors(from, target, e);
    TP.group.scale.setScalar(Math.max(0.02, s0 * (1 - e * 0.95)));
  }, ease.in);
  TP.show(false);
  TP.mode = 'display';
  TP.group.scale.setScalar(1);
}
async function routerHop(ctx, id, patch) {
  ring(id); where(WHERE[id]);
  patchPK({ read: 'ip' });
  await wait(ctx, 1.3);
  patchPK({ ip: { ttl: patch.ip.ttl } });
  pop('TTL ' + patch.ip.ttl, 'good');
  await wait(ctx, 0.7);
  patchPK({ read: 'eth' });
  await rewrap(ctx);
  patchPK({ eth: patch.eth });
  await wait(ctx, 0.7);
  patchPK({ read: null });
  ringOff();
}
async function stream(ctx) {
  if (!HAS3D) return;
  const legs = [['srv', 'r1'], ['r1', 'r2'], ['r2', 'fai'], ['fai', 'box'], ['box', 'sw'], ['sw', 'pc']];
  const pts = [];
  legs.forEach(([a, b], i) => { const p = pathBetween(a, b).pts; pts.push(...(i ? p.slice(1) : p)); });
  const poly = new Poly(pts);
  while (ctx.alive) {
    const p = new Packet(0.42);
    extras.add(p);
    p.travel(ctx, poly, 15, ease.linear).then(() => { extras.delete(p); p.dispose(); }).catch(() => {});
    await wait(ctx, 0.5);
  }
}
const arpTable = () => netTable('Table ARP de la box', ['Adresse IP', 'Adresse MAC', 'Type'], [
  { id: 'arp-pc', cells: ['192.168.1.10', MAC.pc, 'dynamique'] },
  { cells: ['192.168.1.11', MAC.laptop, 'dynamique'] },
  { cells: ['192.168.1.12', MAC.console, 'dynamique'] },
]);
const macTable = () => netTable('Table MAC du switch', ['Port', 'Adresse MAC', 'Appareil'], [
  { cells: ['1', MAC.boxL, 'box'] },
  { id: 'mac-pc', cells: ['2', MAC.pc, 'PC fixe'] },
  { cells: ['3', MAC.laptop, 'portable'] },
  { cells: ['4', MAC.console, 'console'] },
]);
const wanTable = () => netTable('WAN et LAN', ['', 'WAN', 'LAN'], [
  { cells: ['Où', 'Internet, FAI', 'chez toi'] },
  { cells: ['IP de la box', '198.51.100.42', '192.168.1.1'] },
  { cells: ['Adresse', 'publique', 'privée'] },
  { cells: ['Géré par', 'opérateurs', 'toi (la box)'] },
]);
const mark = id => { const el = document.getElementById(id); if (el) el.classList.add('match'); };

const STEPS = [
  {
    title: 'Bienvenue à bord', chip: [0, "Vue d'ensemble"],
    body: `<p>Tu cliques sur un lien. Moins d'une seconde plus tard, la page s'affiche. Entre les deux, des paquets de données ont traversé des routeurs dans plusieurs pays, une fibre optique, ta box et un switch.</p>
<p>On va en suivre un, pas à pas, depuis le serveur web jusqu'à ton écran.</p>
<div class="keyline">Fais glisser la scène pour tourner autour, zoome avec la molette ou en pinçant. Clique sur une étiquette pour ouvrir la fiche de l'équipement.</div>
<div class="keyline">Pour expliquer à ton rythme : <strong>Pause</strong> (ou la touche Espace) fige l'animation, et les flèches ← → changent d'étape.</div>`,
    setup() { if (TP) TP.show(false); setPK(null); setTable(''); },
    cam() { view('overview'); },
    async play(ctx) {
      await wait(ctx, 0.8);
      for (const id of ['z-net', 'z-fai', 'z-home']) { tagClass(id, 'hot', true); await wait(ctx, 1.2); tagClass(id, 'hot', false); }
    },
  },
  {
    title: "L'aller : ta requête sort", chip: [4, 'Couches 3 et 4'],
    body: `<p>Avant toute réponse, ton PC a envoyé une requête au serveur : « donne-moi la page d'accueil ». Elle part de <code>192.168.1.10</code>, port <code>52344</code>, vers <code>203.0.113.10</code>, port <code>443</code> (HTTPS).</p>
<p>Juste avant, le DNS a traduit <code>exemple.fr</code> en <code>203.0.113.10</code>, puis TCP (la poignée de main en 3 temps) et TLS ont ouvert une connexion chiffrée avec le serveur.</p>
<p>En sortant, la box remplace ton adresse privée par son adresse publique <code>198.51.100.42</code> et prend un port à elle, <code>40001</code>. Elle note la correspondance dans sa <strong>table NAT</strong>.</p>
<div class="keyline">Retiens la ligne 40001 : c'est elle qui permettra à la réponse de retrouver ton PC.</div>`,
    setup() { placeAt('pc'); layers(ALL); if (TP) TP.unlock(false); setPK(REQ, ALL); where(WHERE.pc); setTable(natTable({ withPc: false })); },
    cam() { followTP(21, 0.25, 0.98); },
    async play(ctx) {
      await wait(ctx, 0.9);
      await move(ctx, 'pc', 'sw', 8); blinkPorts([1, 0]);
      await move(ctx, 'sw', 'box', 8);
      ring('box'); where('dans la box : traduction NAT');
      patchPK({ read: ['ip', 'tcp'] });
      await wait(ctx, 1.0);
      await flip(ctx, ['ip', 'tcp']);
      patchPK({ ip: { src: IP.boxW, ttl: 63 }, tcp: { sport: 40001 } });
      setTable(natTable({ pcCls: 'new match' }));
      pop('NAT : 192.168.1.10:52344 → 198.51.100.42:40001');
      await wait(ctx, 1.6);
      patchPK({ read: 'eth' });
      await rewrap(ctx);
      patchPK({ read: null, eth: { src: MAC.boxW, dst: MAC.faiB } });
      ringOff();
      inspNote("Suite de l'aller en accéléré : chaque routeur refait la trame et baisse le TTL.");
      const hops = [
        ['box', 'fai', { eth: { src: MAC.faiA, dst: MAC.r2b }, ip: { ttl: 62 } }, FIBER_GLOW],
        ['fai', 'r2', { eth: { src: MAC.r2a, dst: MAC.r1b }, ip: { ttl: 61 } }],
        ['r2', 'r1', { eth: { src: MAC.r1a, dst: MAC.srv }, ip: { ttl: 60 } }],
        ['r1', 'srv', null],
      ];
      for (const [a, b, patch, glow] of hops) { await move(ctx, a, b, 15, glow); if (patch) patchPK(patch); }
      where('reçue par le serveur web');
      await shrinkTP(ctx);
    },
  },
  {
    title: 'Le serveur emballe sa réponse', chip: [7, 'Couches 7 → 1'],
    body: `<p>Le serveur prépare la page. Avant de l'envoyer, chaque couche du modèle TCP/IP ajoute son <strong>en-tête</strong> devant les données, comme des enveloppes glissées les unes dans les autres : c'est l'<strong>encapsulation</strong>.</p>
<ul><li><strong>Données</strong> : la page HTML, chiffrée par TLS (le cadenas).</li>
<li><strong>+ en-tête TCP</strong> = un <strong>segment</strong> : ports 443 → 40001.</li>
<li><strong>+ en-tête IP</strong> = un <strong>paquet</strong> : 203.0.113.10 → 198.51.100.42.</li>
<li><strong>+ en-tête Ethernet</strong> = une <strong>trame</strong> : les MAC du prochain saut, et le FCS à la fin pour détecter les erreurs.</li></ul>
<div class="keyline">Le serveur répond à l'adresse qu'il a vue passer : 198.51.100.42, port 40001. Il ne connaît pas ton PC, seulement ta box.</div>`,
    setup() { placeAt('srv'); layers(['data']); if (TP) TP.unlock(false); setPK(RESP, ['data']); where(WHERE.srv); setTable(''); },
    cam() { view('server'); },
    async play(ctx) {
      if (TP) { TP.group.scale.setScalar(0.01); await tween(ctx, 0.6, e => TP.group.scale.setScalar(Math.max(0.01, e)), ease.back); }
      await wait(ctx, 1.0);
      await attach(ctx, 'tcp'); patchPK({ has: { tcp: true } }); pop('Segment');
      await wait(ctx, 1.2);
      await attach(ctx, 'ip'); patchPK({ has: { ip: true } }); pop('Paquet');
      await wait(ctx, 1.2);
      await Promise.all([attach(ctx, 'eth'), attach(ctx, 'fcs')]); patchPK({ has: { eth: true } }); pop('Trame');
    },
  },
  {
    title: 'Internet, de routeur en routeur', chip: [3, 'Couche 3 · Réseau'],
    body: `<p>Chaque routeur fait le même travail : il lit l'<strong>IP de destination</strong>, cherche la meilleure route dans sa <strong>table de routage</strong>, puis passe le paquet au routeur suivant.</p>
<p>À chaque saut, il jette l'ancien en-tête Ethernet et en met un neuf, avec de nouvelles adresses MAC. Il baisse aussi le <strong>TTL</strong> de 1 : à zéro, le paquet serait détruit.</p>
<div class="keyline">Les adresses IP restent les mêmes tout au long d'Internet ; seul le NAT de la box traduira l'adresse de destination. Les adresses MAC source et destination de la trame, elles, sont réécrites par chaque routeur.</div>`,
    setup() { placeAt('srv'); layers(ALL); setPK(RESP, ALL); where(WHERE.srv); setTable(routeTable('r1')); },
    cam() { followTP(19, 0.12, 0.98); },
    async play(ctx) {
      await wait(ctx, 0.6);
      await move(ctx, 'srv', 'r1', 8);
      await routerHop(ctx, 'r1', HOP.r1);
      setTable(routeTable('r2'));
      await move(ctx, 'r1', 'r2', 8);
      await routerHop(ctx, 'r2', HOP.r2);
    },
  },
  {
    title: 'Le FAI et la fibre : le WAN', chip: [3, 'Couches 1 à 3'],
    body: `<p>Le paquet arrive chez ton fournisseur d'accès. Son routeur sait que <code>198.51.100.42</code> est au bout de ta fibre : il refait la trame et l'envoie dans ce lien. Dans la fibre, les bits voyagent sous forme d'impulsions de lumière.</p>
<p>Tout ce qui est hors de chez toi forme le <strong>WAN</strong>, le réseau étendu. Ta box a un pied de chaque côté : une adresse <strong>publique</strong> côté WAN, une adresse <strong>privée</strong> côté LAN.</p>`,
    setup() { placeAt('r2'); layers(ALL); setPK(R_AT_R2, ALL); where(WHERE.r2); setTable(wanTable()); },
    cam() { followTP(20, 0.05, 0.98); },
    async play(ctx) {
      await wait(ctx, 0.6);
      await move(ctx, 'r2', 'fai', 8);
      await routerHop(ctx, 'fai', HOP.fai);
      tagClass('fiber', 'hot', true);
      await move(ctx, 'fai', 'box', 6, FIBER_GLOW);
      tagClass('fiber', 'hot', false);
      where('dans la box, côté WAN');
    },
  },
  {
    title: "La box traduit l'adresse (NAT)", chip: [4, 'Couches 3 et 4'],
    body: `<p>La box reçoit un paquet pour <code>198.51.100.42</code>, port <code>40001</code>. C'est bien son adresse, mais le paquet n'est pas pour elle.</p>
<p>Elle cherche le port 40001 dans sa <strong>table NAT</strong>, retrouve la ligne créée à l'aller et réécrit la destination : <code>192.168.1.10</code>, port <code>52344</code>. Comme tout routeur, elle baisse aussi le TTL.</p>
<div class="keyline">Un paquet qui arrive sans ligne correspondante dans la table NAT est jeté : par effet de bord, cela protège le LAN. Mais le NAT n'est pas un pare-feu : la box en a un vrai en plus, un pare-feu à état.</div>`,
    setup() { placeAt('box'); layers(ALL); setPK(R_AT_BOX, ALL); where(WHERE.box); setTable(natTable()); },
    cam() { view('box'); },
    async play(ctx) {
      ring('box');
      await wait(ctx, 0.9);
      patchPK({ read: ['ip', 'tcp'] });
      await wait(ctx, 1.2);
      mark('nat-pc');
      await wait(ctx, 1.4);
      await flip(ctx, ['ip', 'tcp']);
      patchPK({ ip: { dst: IP.pc, ttl: 60 }, tcp: { dport: 52344 } });
      pop('→ 192.168.1.10:52344');
      await wait(ctx, 1.0);
      patchPK({ read: null });
    },
  },
  {
    title: 'Une trame neuve pour le LAN', chip: [2, 'Couche 2 · Liaison'],
    body: `<p>Pour livrer le paquet sur le réseau local, la box a besoin de l'adresse MAC de <code>192.168.1.10</code>. Elle la trouve dans sa <strong>table ARP</strong>.</p>
<p>Sans cette ligne, elle demanderait à tout le LAN « Qui a 192.168.1.10 ? » et seul le PC répondrait, avec sa MAC.</p>
<p>Elle emballe alors le paquet dans une trame neuve : de <code>9c:24:72:5e:10:02</code>, sa MAC côté LAN, vers <code>3c:52:82:4f:a1:7e</code>, celle du PC.</p>`,
    setup() { placeAt('box'); layers(ALL); setPK(R_NAT, ALL); where(WHERE.box); setTable(arpTable()); },
    cam() { view('box2'); },
    async play(ctx) {
      ring('box');
      await wait(ctx, 1.0);
      mark('arp-pc');
      await wait(ctx, 1.3);
      patchPK({ read: 'eth' });
      await rewrap(ctx);
      patchPK({ eth: HOP.lan.eth });
      await wait(ctx, 0.9);
      patchPK({ read: null });
    },
  },
  {
    title: 'Le switch aiguille la trame', chip: [2, 'Couche 2 · Liaison'],
    body: `<p>La trame entre par le port 1 du switch. Pour l'aiguiller, il lit la <strong>MAC de destination</strong> et consulte sa <strong>table MAC</strong> : <code>3c:52:82:4f:a1:7e</code> se trouve derrière le port 2. Cette table, il la remplit tout seul en notant la MAC source de chaque trame qui arrive.</p>
<p>Il envoie la trame sur ce port uniquement, sans rien y changer. Face à une MAC inconnue, il l'enverrait sur tous les autres ports (inondation, ou <em>flooding</em>).</p>
<div class="keyline">Le switch n'a pas besoin d'adresse IP pour travailler : il reste en couche 2.</div>`,
    setup() { placeAt('box'); layers(ALL); setPK(R_LAN, ALL); where(WHERE.box); setTable(macTable()); },
    cam() { followTP(15, 0.18, 1.0); },
    async play(ctx) {
      await wait(ctx, 0.6);
      await move(ctx, 'box', 'sw', 6); blinkPorts([0]);
      ring('sw');
      patchPK({ read: 'eth' });
      await wait(ctx, 1.2);
      mark('mac-pc');
      await wait(ctx, 1.4);
      blinkPorts([1]);
      patchPK({ read: null });
      ringOff();
      await move(ctx, 'sw', 'pc', 6);
    },
  },
  {
    title: 'Le PC déballe le paquet', chip: [7, 'Couches 1 → 7'],
    body: `<p>La carte réseau reçoit la trame, puis le système remonte les couches en retirant un en-tête à chaque étage : c'est la <strong>désencapsulation</strong>.</p>
<ul><li>FCS correct, MAC de destination = la mienne : on retire l'en-tête Ethernet.</li>
<li>IP de destination = la mienne : on retire l'en-tête IP.</li>
<li>Port 52344 : c'est le navigateur. On retire l'en-tête TCP.</li>
<li>TLS déchiffre les données, le navigateur affiche la page.</li></ul>`,
    setup() { placeAt('pc'); layers(ALL); if (TP) TP.unlock(false); setPK(R_LAN, ALL); where(WHERE.pc); setTable(''); if (SCREENS.pc) SCREENS.pc.draw('loading'); },
    cam() { view('pc'); },
    async play(ctx) {
      ring('pc');
      await wait(ctx, 0.9);
      patchPK({ read: 'eth' }); await wait(ctx, 1.0); pop('MAC ✓');
      await Promise.all([detach(ctx, 'eth', 1), detach(ctx, 'fcs', -1)]);
      patchPK({ has: { eth: false }, read: 'ip' }); await wait(ctx, 1.0); pop('IP ✓');
      await detach(ctx, 'ip', 1);
      patchPK({ has: { ip: false }, read: 'tcp' }); await wait(ctx, 1.0); pop('Port 52344 : navigateur');
      await detach(ctx, 'tcp', 1);
      patchPK({ has: { tcp: false }, read: 'data' }); await wait(ctx, 0.8);
      if (TP) TP.unlock(true);
      patchPK({ data: { desc: 'Page HTML de exemple.fr, déchiffrée' } }); pop('Déchiffré');
      await wait(ctx, 1.0);
      await flyInto(ctx, new V3(25.5, 2.15, -6.5));
      if (SCREENS.pc) SCREENS.pc.draw('page');
      if (HAS3D) burstRing(EQ.pc.pos, cssVar('--ok') || '#1b8a4a', 2.6);
      patchPK({ read: null });
      where('affichée dans le navigateur');
      ringOff();
    },
  },
  {
    title: 'Une page, des centaines de paquets', chip: [0, 'Récapitulatif'],
    body: `<p>Tu viens de suivre un seul paquet. Une page web en demande souvent des centaines, qui font tous ce trajet en quelques dizaines de millisecondes.</p>
<ul><li><strong>Encapsulation</strong> au départ, <strong>désencapsulation</strong> à l'arrivée.</li>
<li>Les <strong>routeurs</strong> lisent l'IP et refont la trame : les MAC de la trame changent à chaque saut, le TTL baisse.</li>
<li>La <strong>box</strong> traduit l'adresse publique en adresse privée grâce à sa table NAT.</li>
<li>Le <strong>switch</strong> ne lit que les adresses MAC : la destination pour aiguiller, la source pour apprendre.</li></ul>
<div class="keyline">Les couleurs suivent les couches : bleu pour la couche 3 (les routeurs, l'en-tête IP), orange pour la couche 2 (le switch, la trame).</div>
<p><button class="btn primary" id="go-game" type="button">Passer au jeu : trouve la panne →</button></p>`,
    setup() { if (TP) TP.show(false); setPK(null); setTable(''); if (SCREENS.pc) SCREENS.pc.draw('page'); },
    cam() { view('overview'); },
    async play(ctx) { await wait(ctx, 0.8); await stream(ctx); },
  },
];

function resetScene() {
  ringOff();
  clearTagClasses('hot', 'dim', 'ok', 'ko');
  if (HAS3D) for (const key in LINKS) { const [a, b] = key.split('>'); glowLink(a, b, null, false); }
  for (const p of extras) p.dispose();
  extras.clear();
  if (TP) {
    TP.show(true); TP.mode = 'display'; TP.unlock(false); TP.group.scale.setScalar(1);
    for (const k of ORDER) TP.slabs[k].m.rotation.x = 0;
  }
  where(''); inspNote('');
  ambientOn = true;
}

function goStep(i) {
  i = clamp(i, 0, STEPS.length - 1);
  tour.i = i;
  kill(tour.ctx);
  tour.ctx = makeCtx(tour.speed);
  setPaused(false);
  const st = STEPS[i];
  $('#step-count').textContent = `Étape ${i + 1} / ${STEPS.length}`;
  const chip = $('#layer-chip');
  chip.dataset.l = st.chip[0];
  chip.textContent = st.chip[1];
  $('#step-title').textContent = st.title;
  $('#step-body').innerHTML = st.body;
  $$('#dots button').forEach((b, j) => {
    b.classList.toggle('cur', j === i);
    b.classList.toggle('done', j < i);
    if (j === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  });
  $('#prev').disabled = i === 0;
  $('#next').textContent = i === STEPS.length - 1 ? 'Jouer →' : 'Suivant →';
  $('#story-scroll').scrollTop = 0;
  resetScene();
  if (SCREENS.pc && i < 8) SCREENS.pc.draw('wait');
  st.setup();
  rig.onRecenter = () => st.cam();
  st.cam();
  const go = $('#go-game');
  if (go) go.addEventListener('click', () => setMode('game'));
  st.play(tour.ctx).catch(swallow);
}

function initTour() {
  if (HAS3D) { TP = new Packet(1); TP.show(false); }
  const dots = $('#dots');
  STEPS.forEach((s, j) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `Étape ${j + 1} : ${s.title}`);
    b.title = s.title;
    b.addEventListener('click', () => goStep(j));
    dots.appendChild(b);
  });
  $('#prev').addEventListener('click', () => goStep(tour.i - 1));
  $('#next').addEventListener('click', () => { if (tour.i === STEPS.length - 1) setMode('game'); else goStep(tour.i + 1); });
  $('#replay').addEventListener('click', () => goStep(tour.i));
  $('#pause').addEventListener('click', () => setPaused(!tour.paused));
  $('#paused-badge').addEventListener('click', () => setPaused(false));
  $$('.speed button').forEach(b => b.addEventListener('click', () => {
    tour.speed = parseFloat(b.dataset.speed);
    if (tour.ctx && !tour.paused) tour.ctx.speed = tour.speed;
    $$('.speed button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  }));
}

/* =====================================================================
   Jeu : trouve la panne — données et simulation
   ===================================================================== */
const OK_CFG = { ip: '192.168.1.10', mask: '255.255.255.0', gw: '192.168.1.1' };
const LAPTOP_CFG = { ip: '192.168.1.11', mask: '255.255.255.0', gw: '192.168.1.1' };
const CONSOLE_CFG = { ip: '192.168.1.12', mask: '255.255.255.0', gw: '192.168.1.1' };
const FIELDS = ['ip', 'mask', 'gw'];
const FIELD_LABEL = { ip: 'Adresse IP', mask: 'Masque', gw: 'Passerelle' };
// valeurs proposées dans l'éditeur : la bonne, la valeur actuelle, et des pièges qui ne marchent pas
const CHOICES = {
  ip: ['192.168.1.10', '192.168.2.10', '192.168.0.10', '192.168.1.1'],
  mask: ['255.255.255.0', '255.255.255.248', '255.255.255.252'],
  gw: ['192.168.1.1', '192.168.1.254', '192.168.1.100', '192.168.1.10'],
};
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const okColor = () => cssVar('--ok') || '#1b8a4a';
const badColor = () => cssVar('--bad') || '#cf3a40';

const ipInt = a => a.split('.').reduce((n, x) => ((n << 8) + Number(x)) >>> 0, 0);
const intIp = n => [24, 16, 8, 0].map(b => (n >>> b) & 255).join('.');
function netRange(c) {
  const m = ipInt(c.mask), net = (ipInt(c.ip) & m) >>> 0, bc = (net | (~m >>> 0)) >>> 0;
  return [intIp(net), intIp(bc)];
}
function rangeText(c) {
  const [a, b] = netRange(c), pa = a.split('.'), pb = b.split('.');
  return pa.slice(0, 3).join('.') === pb.slice(0, 3).join('.') ? `${a} à .${pb[3]}` : `${a} à ${b}`;
}
// Adresses utilisables : toutes sauf la première (adresse du réseau) et la dernière (diffusion)
function usableText(c) {
  const [a, b] = netRange(c).map(ipInt);
  if (b - a < 2) return 'aucune';
  const f = intIp(a + 1), l = intIp(b - 1), pf = f.split('.'), pl = l.split('.');
  return pf.slice(0, 3).join('.') === pl.slice(0, 3).join('.') ? `.${pf[3]} à .${pl[3]}` : `${f} à ${l}`;
}
const netText = c => `${rangeText(c)} (utilisables : ${usableText(c)})`;
function configProblem(c) {
  if (c.ip === IP.boxL) return `Conflit d'adresses : ${IP.boxL} est déjà utilisée par la box.`;
  if (c.gw === c.ip) return `La passerelle indiquée (${c.gw}) est l'adresse du PC lui-même.`;
  const m = ipInt(c.mask);
  if (((ipInt(c.ip) & m) >>> 0) !== ((ipInt(c.gw) & m) >>> 0)) {
    return `La passerelle ${c.gw} n'est pas dans le réseau du PC (${rangeText(c)}, utilisables : ${usableText(c)}) : il ne sait pas comment la joindre, le paquet ne part pas.`;
  }
  return null;
}
const freshState = () => ({ pcCable: true, switchOn: true, fiberOk: true, pc: { ...OK_CFG } });

// Où s'arrête un paquet de test envoyé vers Internet ?
function simulate(from) {
  const st = G.st;
  const cfg = from === 'pc' ? st.pc : LAPTOP_CFG;
  // Sans lien physique (câble débranché, ou switch éteint en face), la carte voit « média déconnecté » : rien ne part
  if ((from === 'pc' && !st.pcCable) || !st.switchOn) {
    return { stop: from, msg: `Le paquet ne quitte même pas ${from === 'pc' ? 'le PC' : 'le portable'} : la carte réseau signale « câble réseau débranché » (média déconnecté).` };
  }
  const pb = from === 'pc' ? configProblem(cfg) : null;
  if (pb) return { stop: 'pc', msg: pb };
  if (cfg.gw !== IP.boxL) return { stop: 'sw', arp: cfg.gw, msg: `Pour sortir, le PC cherche sa passerelle et demande à tout le réseau « Qui a ${cfg.gw} ? ». Personne ne répond : aucun appareil n'a cette adresse.` };
  if (!st.fiberOk) return { stop: 'box', msg: "La box reçoit le paquet mais ne peut pas l'envoyer sur Internet : la fibre ne reçoit aucun signal." };
  return { ok: true };
}

/* ---------- les tickets ---------- */
const TICKETS = [
  {
    id: 'cable', from: 'Léa', tutorial: true,
    text: "Bonjour, depuis ce matin le PC fixe n'a plus Internet. Le portable marche bien. J'ai passé l'aspirateur sous le bureau hier, je ne sais pas si ça a un rapport.",
    apply: st => { st.pcCable = false; },
    explain: () => "Le câble réseau du PC était débranché (merci l'aspirateur). Sans lien physique, rien ne sort : le paquet ne quittait même pas le PC.",
    reflex: 'Vérifie les câbles et les voyants avant de toucher à la configuration : on commence par la couche 1.',
  },
  {
    id: 'switch', from: 'Karim',
    text: "Plus rien ne marche à la maison : ni le PC, ni le portable, ni la console. Pourtant la box a l'air allumée.",
    apply: st => { st.switchOn = false; },
    explain: () => 'Le switch était éteint. Sans signal en face, chaque appareil branché dessus affichait « câble réseau débranché », alors que les câbles étaient bien en place.',
    reflex: "Quand tous les appareils sont touchés, cherche l'équipement qu'ils partagent : switch, box ou ligne.",
  },
  {
    id: 'fiber', from: 'Mme Duval',
    text: "Aucun appareil n'a Internet depuis 10 h. On a déjà tout redémarré, rien à faire.",
    apply: st => { st.fiberOk = false; },
    explain: () => "La fibre ne recevait plus de lumière : le voyant de la box était rouge. La coupure venait du fournisseur d'accès, impossible à réparer depuis la maison.",
    reflex: 'Voyant fibre rouge : problème de ligne. Redémarrer la box ne sert à rien, on appelle le FAI.',
  },
  {
    id: 'ip', from: 'Sophie',
    text: "Mon fils a modifié les réglages réseau du PC pour un jeu. Depuis, plus d'Internet sur le PC. Le portable va bien.",
    apply: (st, v) => { st.pc.ip = v || '192.168.2.10'; },
    explain: st0 => `Le PC était en ${st0.pc.ip} : il n'était plus dans le même réseau que la box (192.168.1.x). Il ne pouvait donc pas joindre sa passerelle.`,
    reflex: 'Compare avec un appareil qui marche : la ligne qui diffère montre la panne.',
  },
  {
    id: 'mask', from: 'Paul',
    text: "Un ami a configuré le PC fixe à la main. Depuis, il n'a jamais eu Internet. Le portable, lui, marche.",
    apply: (st, v) => { st.pc.mask = v || '255.255.255.248'; },
    explain: st0 => { const [a, b] = netRange(st0.pc); return `Avec le masque ${st0.pc.mask}, le PC croyait que son réseau allait de ${a} à ${b} (utilisables : ${usableText(st0.pc)}). La box (192.168.1.1) était donc « hors réseau » pour lui.`; },
    reflex: 'Le masque dit qui sont les voisins directs. Avec 255.255.255.0, tout 192.168.1.x est dans le même réseau.',
  },
  {
    id: 'gw', from: 'Nadia',
    text: "On a changé de box le mois dernier. Le portable marche, mais le PC fixe, réglé en adresse fixe, n'a plus Internet.",
    apply: (st, v) => { st.pc.gw = v || '192.168.1.254'; },
    explain: st0 => `La passerelle pointait vers ${st0.pc.gw}${st0.pc.gw === '192.168.1.254' ? ", l'adresse de l'ancienne box" : ''}. Le PC demandait « Qui a ${st0.pc.gw} ? » et personne ne répondait.`,
    reflex: "La passerelle doit être l'adresse de la box sur le réseau local : ici 192.168.1.1.",
  },
];
const VARIANTS = { ip: ['192.168.2.10', '192.168.0.10'], mask: ['255.255.255.248', '255.255.255.252'], gw: ['192.168.1.254', '192.168.1.100'] };
const RANDOM_TEXT = "Le PC fixe n'a plus Internet depuis qu'on a touché à ses réglages réseau. Le portable, lui, marche.";
const COACH = [
  { text: '<b>Étape 1 sur 4.</b> On commence toujours par tester. Clique sur « Tester depuis le PC ».', target: '#g-test-pc', next: 'test:pc:ko' },
  { text: "<b>Étape 2 sur 4.</b> Le paquet n'a même pas quitté le PC. Inspecte-le : clique sur « PC fixe », ici ou sur son étiquette dans la scène.", target: '.chip[data-eq="pc"]', tag: 'pc', next: 'inspect:pc' },
  { text: '<b>Étape 3 sur 4.</b> Regarde la ligne « Câble réseau », puis clique sur « Rebrancher le câble ».', target: '[data-act="cable"]', next: 'fixed' },
  { text: '<b>Étape 4 sur 4.</b> Après une intervention, on vérifie toujours : refais un test depuis le PC.', target: '#g-test-pc', next: 'solved' },
];

const G = {
  run: 0, idx: 0, random: false, ticket: TICKETS[0], text: '', st: freshState(), st0: null,
  stars: 3, total: 0, results: [], randomSolved: 0, busy: false, solved: false, editing: false,
  sel: null, coach: -1, lastRandom: -1, finished: false,
};
const faultsOf = st => (st.pcCable ? 0 : 1) + (st.switchOn ? 0 : 1) + (st.fiberOk ? 0 : 1) + FIELDS.filter(k => st.pc[k] !== OK_CFG[k]).length;

/* =====================================================================
   Jeu : trouve la panne — interface, réparations, animations
   ===================================================================== */
let gameCtx = makeCtx(1);
const TEST_PKS = new Set();
const screenEl = $('#g-screen'), cardEl = $('#g-card');
const STOP_AT = { pc: 'au PC fixe', laptop: 'au portable', sw: 'au switch', box: 'à la box' };
const INSPECTABLE = ['pc', 'laptop', 'console', 'sw', 'box', 'fiber', 'fai'];

function showCard(html, focusSel) {
  cardEl.innerHTML = html;
  screenEl.hidden = false;
  const f = focusSel && cardEl.querySelector(focusSel);
  if (f) f.focus({ preventScroll: true });
}
function hideCard() { screenEl.hidden = true; }
function result(html, kind) { const r = $('#g-result'); r.className = 'result' + (kind ? ' ' + kind : ''); r.innerHTML = html; }
function setTools(on) { $('#g-test-pc').disabled = !on; $('#g-test-laptop').disabled = !on; }
const yes = (ok, good, bad) => (ok ? `<span class="ok-t">✓ ${good}</span>` : `<span class="ko-t">✗ ${bad}</span>`);
const li = (k, v) => `<li><span class="k">${k}</span>${v}</li>`;

function renderHud() {
  $('#g-title').textContent = G.random ? 'Panne au hasard' : `Ticket ${G.idx + 1} / ${TICKETS.length}`;
  const s = $('#g-stars');
  s.innerHTML = '★'.repeat(G.stars) + `<span class="off">${'★'.repeat(3 - G.stars)}</span>`;
  s.setAttribute('aria-label', `${G.stars} étoile${G.stars > 1 ? 's' : ''} sur 3`);
  $('#g-total').textContent = G.random
    ? `Pannes au hasard résolues : ${G.randomSolved}`
    : `Total : ${G.total} étoile${G.total > 1 ? 's' : ''} sur ${TICKETS.length * 3}`;
}
function renderTicket() {
  $('#g-ticket').innerHTML = `<div class="who"><span>Ticket n° ${1041 + G.idx}</span><span>de ${esc(G.ticket.from)}</span></div><p>« ${esc(G.text)} »</p>`;
}
function cfgTable(c, ref, editable) {
  const cell = f => (editable
    ? `<select id="g-f-${f}" aria-label="${FIELD_LABEL[f]} du PC fixe">${optionsFor(f).map(v => `<option${v === c[f] ? ' selected' : ''}>${v}</option>`).join('')}</select>`
    : c[f]);
  const rows = FIELDS.map(f => [FIELD_LABEL[f], cell(f), ref && ref[f]]);
  rows.push(['Réseau', `<span id="g-net">${netText(c)}</span>`, ref && netText(ref)]);
  return `<div class="table-wrap"><table class="cfg"><thead><tr><th scope="col"></th><th scope="col">${ref ? 'PC fixe' : 'Valeur'}</th>${ref ? '<th scope="col">Portable</th>' : ''}</tr></thead><tbody>` +
    rows.map((r, i) => `<tr${i === 3 ? ' class="net"' : ''}><td>${r[0]}</td><td>${r[1]}</td>${ref ? `<td>${r[2]}</td>` : ''}</tr>`).join('') + '</tbody></table></div>';
}
function optionsFor(f) {
  const cur = G.st.pc[f], ok = OK_CFG[f], set = [ok];
  if (cur !== ok) set.push(cur);
  for (const v of CHOICES[f]) { if (set.length >= 3) break; if (!set.includes(v)) set.push(v); }
  return set.sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
}
function actsHtml(acts) {
  const off = G.solved || G.busy;
  return `<div class="acts">${acts.map(([k, l]) => `<button class="btn" type="button" data-act="${k}"${off || (k === 'edit' && G.editing) ? ' disabled' : ''}>${esc(l)}</button>`).join('')}</div>`;
}
function renderEq() {
  const st = G.st, id = G.sel, el = $('#g-eq');
  if (!id) { el.innerHTML = ''; return; }
  let h = '';
  if (id === 'pc') {
    h = `<h3>PC fixe</h3><ul class="state">${li('Câble réseau', yes(st.pcCable, 'branché', 'débranché'))}${li('Lien réseau', yes(st.pcCable && st.switchOn, 'actif', st.pcCable ? 'aucun signal en face' : 'aucun'))}</ul>` +
      actsHtml([['cable', 'Rebrancher le câble'], ['reboot-pc', 'Redémarrer le PC'], ['edit', 'Modifier la configuration IP']]) +
      `<p class="note">Sa configuration réseau (comme un <code>ipconfig</code>), à côté de celle du portable qui sert de référence :</p>` +
      cfgTable(st.pc, LAPTOP_CFG, G.editing) +
      (G.editing ? `<p class="note">Choisis les valeurs dans la colonne du PC, puis applique.</p><div class="acts"><button class="btn primary" type="button" data-act="apply">Appliquer</button><button class="btn" type="button" data-act="cancel">Annuler</button></div>` : '');
  } else if (id === 'laptop' || id === 'console') {
    const lap = id === 'laptop';
    h = `<h3>${lap ? 'Portable' : 'Console'}</h3><ul class="state">${li('Câble réseau', yes(true, 'branché'))}${li('Lien réseau', yes(st.switchOn, 'actif', 'aucun signal en face'))}</ul>` +
      actsHtml([['reboot-' + id, `Redémarrer ${lap ? 'le portable' : 'la console'}`]]) +
      `<p class="note">Sa configuration réseau. Elle sert de référence pour comparer.</p>${cfgTable(lap ? LAPTOP_CFG : CONSOLE_CFG)}`;
  } else if (id === 'sw') {
    h = `<h3>Switch</h3><ul class="state">${li('Alimentation', yes(st.switchOn, 'allumé', 'éteint'))}${li('Voyants des ports', yes(st.switchOn, 'ils clignotent', 'tous éteints'))}${li('Port 2 (PC fixe)', yes(st.switchOn && st.pcCable, 'lien actif', 'pas de lien'))}</ul>` +
      actsHtml([st.switchOn ? ['reboot-sw', 'Redémarrer le switch'] : ['power-sw', 'Rallumer le switch']]) +
      `<p class="note">Ce switch (non administrable) n'a pas d'adresse IP : il relie les appareils de la maison à la box.</p>`;
  } else if (id === 'box') {
    h = `<h3>Box internet</h3><ul class="state">${li('Alimentation', yes(true, 'allumée'))}${li('Voyant fibre', yes(st.fiberOk, 'vert', 'rouge, aucun signal'))}${li('Adresse côté maison', '192.168.1.1')}${li('Réseau de la maison', netText(OK_CFG))}</ul>` +
      actsHtml([['reboot-box', 'Redémarrer la box'], ['call-fai', 'Appeler le FAI']]) +
      `<p class="note">Son adresse 192.168.1.1 est la passerelle de tous les appareils de la maison.</p>`;
  } else if (id === 'fiber') {
    h = `<h3>Fibre et FAI</h3><ul class="state">${li('Signal lumineux', yes(st.fiberOk, 'reçu', 'aucun'))}</ul>` +
      actsHtml([['call-fai', 'Appeler le FAI']]) +
      `<p class="note">La ligne et le routeur du FAI appartiennent à l'opérateur : on ne peut pas les réparer depuis la maison.</p>`;
  }
  el.innerHTML = h;
}
function revealEq(sel) {
  const target = (sel && $(sel)) || $('#g-eq');
  if (target && target.scrollIntoView) target.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' });
}

/* ---------- guide pas à pas (premier ticket) ---------- */
function renderCoach() {
  $$('.coach-target').forEach(el => el.classList.remove('coach-target'));
  clearTagClasses('coach');
  const box = $('#g-coach');
  if (G.coach < 0 || G.coach >= COACH.length || G.solved) { box.hidden = true; return; }
  const c = COACH[G.coach];
  box.hidden = false;
  box.innerHTML = c.text;
  const el = $(c.target);
  if (el) el.classList.add('coach-target');
  if (c.tag) tagClass(c.tag, 'coach', true);
}
function coachEvent(ev) {
  if (G.coach < 0) return;
  if (COACH[G.coach] && COACH[G.coach].next === ev) G.coach++;
  renderCoach();
}

/* ---------- inspecter ---------- */
const FOCUS = {
  pc: { t: [24.2, 1, -5.6], r: 12, th: 0.15, ph: 0.98 },
  laptop: { t: [25.5, 1, 0.6], r: 10, th: 0.1, ph: 0.98 },
  console: { t: [25, 1, 6.6], r: 11, th: 0.1, ph: 0.98 },
  sw: { t: [17, 0.4, 0.9], r: 9, th: 0.05, ph: 0.92 },
  box: { t: [11.5, 0.5, 0.9], r: 8, th: 0.05, ph: 0.92 },
  fiber: { t: [5, 0.5, 2.6], r: 17, th: 0.05, ph: 0.9 },
};
function gameInspect(id) {
  if (id === 'fai') id = 'fiber';
  if (!INSPECTABLE.includes(id)) return;
  G.sel = id;
  G.editing = false;
  $$('.inspect .chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.eq === id)));
  clearTagClasses('hot');
  tagClass(id, 'hot', true);
  ringAt(id === 'fiber' ? 'fai' : id);
  if (FOCUS[id] && !G.busy) setView(fitView(FOCUS[id]));
  renderEq();
  coachEvent('inspect:' + id);
  revealEq();
}
function tagClick(id) {
  if (MODE === 'game' && INSPECTABLE.includes(id)) { if (screenEl.hidden) gameInspect(id); return; }
  openFiche(id);
}

/* ---------- réparer ---------- */
function gameAction(k) {
  if (G.busy || G.solved) return;
  const st = G.st;
  if (k === 'edit') { G.editing = true; renderEq(); renderCoach(); const s = $('#g-f-ip'); if (s) s.focus({ preventScroll: true }); revealEq('#g-eq .cfg'); return; }
  if (k === 'cancel') { G.editing = false; renderEq(); renderCoach(); return; }
  let useful = false, text = '';
  switch (k) {
    case 'cable':
      if (!st.pcCable) { st.pcCable = true; useful = true; text = "Câble rebranché : le voyant du port s'allume."; }
      else text = 'Le câble était déjà bien branché.';
      break;
    case 'reboot-pc': text = 'Le PC redémarre… et le problème est toujours là.'; break;
    case 'reboot-laptop': text = "Le portable redémarre. Ça n'a rien changé."; break;
    case 'reboot-console': text = "La console redémarre. Ça n'a rien changé."; break;
    case 'power-sw': st.switchOn = true; useful = true; text = 'Le switch est rallumé : ses voyants clignotent à nouveau.'; break;
    case 'reboot-sw': text = 'Le switch redémarre… rien ne change.'; break;
    case 'reboot-box': text = st.fiberOk ? 'La box redémarre… rien ne change.' : 'La box redémarre… le voyant fibre reste rouge.'; break;
    case 'call-fai':
      if (!st.fiberOk) { st.fiberOk = true; useful = true; text = 'Le FAI confirme une coupure dans le quartier. La ligne est rétablie : le voyant fibre repasse au vert.'; }
      else text = 'Le FAI ne voit aucun incident sur ta ligne.';
      break;
    case 'apply': {
      const next = {};
      for (const f of FIELDS) next[f] = ($('#g-f-' + f) || {}).value || st.pc[f];
      let changed = 0, fixed = 0, broken = 0;
      for (const f of FIELDS) {
        if (next[f] === st.pc[f]) continue;
        changed++;
        if (next[f] === OK_CFG[f]) fixed++;
        else if (st.pc[f] === OK_CFG[f]) broken++;
      }
      G.editing = false;
      if (!changed) { renderEq(); renderCoach(); result('Aucune modification.', 'info'); return; }
      st.pc = next;
      if (broken) text = 'Attention : cette modification crée un nouveau problème.';
      else if (fixed) { useful = true; text = 'Configuration modifiée.'; }
      else text = 'Configuration modifiée, mais ça ne règle rien.';
      break;
    }
    default: return;
  }
  if (useful) text += ' Refais un test pour vérifier.';
  else if (G.ticket.tutorial && !G.random) text += ' (Pas de pénalité pendant le ticket guidé.)';
  else { G.stars = Math.max(1, G.stars - 1); text += ' Réparation inutile : une étoile en moins.'; }
  result(text, useful ? 'info' : 'ko');
  applyHomeVisuals(st);
  renderEq();
  renderHud();
  coachEvent(useful ? 'fixed' : 'useless');
}

/* ---------- tester : le paquet s'arrête là où ça bloque ---------- */
const above = v => v.clone().add(new V3(0, 1, 0));
function disposeTestPks() { for (const p of TEST_PKS) p.dispose(); TEST_PKS.clear(); }
async function failAt(ctx, pk, at) {
  const x0 = pk.group.position.x;
  await tween(ctx, 0.5, (e, p) => { pk.group.position.x = x0 + Math.sin(p * 30) * 0.12 * (1 - p); }, ease.linear);
  burstRing(EQ[at].pos, badColor(), EQ[at].ringR);
  popText(above(EQ[at].station), '✗', 'bad');
  await tween(ctx, 0.45, e => pk.group.scale.setScalar(Math.max(0.01, 0.62 * (1 - e))), ease.in);
}
async function arpRipple(ctx, gw) {
  const c = cssVar('--l2') || '#d9650f';
  popText(above(EQ.sw.station), `Qui a ${gw} ?`, '');
  burstRing(EQ.sw.pos, c, 3.4);
  await wait(ctx, 0.4);
  for (const id of ['box', 'laptop', 'console', 'pc']) burstRing(EQ[id].pos, c, 1.5);
  await wait(ctx, 0.6);
  for (const id of ['box', 'laptop', 'console']) popText(above(EQ[id].station), 'pas moi', '');
  await wait(ctx, 1.1);
}
async function animateTest(from, r) {
  if (!HAS3D) { await wait(gameCtx, 0.6); return; }
  const ctx = gameCtx;
  const pk = new Packet(0.62);
  TEST_PKS.add(pk);
  pk.setLayers(['eth', 'ip', 'fcs']);
  pk.place(EQ[from].station);
  followObj(pk.group, 24 * Math.sqrt(aspectK()), -0.05, 0.95, [0, 0.3, 0]);
  const legs = [[from, 'sw'], ['sw', 'box'], ['box', 'fai'], ['fai', 'r2'], ['r2', 'r1'], ['r1', 'srv']];
  try {
    pk.group.scale.setScalar(0.01);
    await tween(ctx, 0.35, e => pk.group.scale.setScalar(Math.max(0.01, e * 0.62)), ease.back);
    if (r.stop === from || r.stop === 'pc') { await failAt(ctx, pk, from); return; }
    for (const [a, b] of legs) {
      const inside = ['pc', 'laptop', 'sw', 'box'].includes(b);
      await pk.travel(ctx, pathBetween(a, b), inside ? 9 : 20);
      if (!r.ok && b === r.stop) break;
    }
    if (!r.ok) {
      if (r.arp) await arpRipple(ctx, r.arp);
      await failAt(ctx, pk, r.stop);
      return;
    }
    popText(above(EQ.srv.station), 'Réponse', 'good');
    for (const [a, b] of legs.slice().reverse()) await pk.travel(ctx, pathBetween(b, a), ['pc', 'laptop', 'sw'].includes(a) ? 12 : 24);
    burstRing(EQ[from].pos, okColor(), EQ[from].ringR);
    popText(above(EQ[from].station), '✓', 'good');
    if (from === 'pc' && SCREENS.pc) SCREENS.pc.draw('page');
  } finally {
    TEST_PKS.delete(pk);
    pk.dispose();
    if (MODE === 'game') view('game');
  }
}
async function gameTest(from) {
  if (G.busy || G.solved) return;
  G.busy = true;
  const run = G.run;
  setTools(false);
  renderEq();
  renderCoach();
  const r = simulate(from);
  const who = from === 'pc' ? 'le PC fixe' : 'le portable';
  result(`<b>Test en cours depuis ${who}…</b>Un paquet de test (ping) part vers Internet.`, 'info');
  try { await animateTest(from, r); } catch (e) { if (e !== CANCEL) console.error(e); return; }
  if (run !== G.run) return;
  G.busy = false;
  setTools(true);
  renderEq();
  if (r.ok) {
    if (from === 'pc') {
      result('<b>✓ Le test passe.</b>Le paquet est allé jusqu\'au serveur et la réponse est revenue : le PC fixe a Internet.', 'ok');
      solve();
      return;
    }
    result("<b>✓ Depuis le portable, ça marche.</b>Le paquet est allé et revenu. Si le PC fixe n'a pas Internet, la panne vient de lui ou de son câble.", 'ok');
  } else {
    const shared = from === 'laptop' ? ' Le portable est touché lui aussi : la panne est sur un équipement commun.' : '';
    result(`<b>✗ Échec : le paquet s'arrête ${STOP_AT[r.stop]}.</b>${esc(r.msg)}${shared}`, 'ko');
  }
  coachEvent(`test:${from}:${r.ok ? 'ok' : 'ko'}`);
}

/* ---------- déroulé ---------- */
function solve() {
  G.solved = true;
  setTools(false);
  if (G.random) G.randomSolved++;
  else if (G.results[G.idx] == null) { G.results[G.idx] = G.stars; G.total += G.stars; }
  const last = !G.random && G.idx === TICKETS.length - 1;
  const label = G.random ? 'Nouvelle panne' : last ? 'Voir le bilan' : 'Ticket suivant →';
  const sv = $('#g-solved');
  sv.innerHTML = `<h3>Ticket résolu ${'★'.repeat(G.stars)}</h3><p>${esc(G.ticket.explain(G.st0))}</p><p class="reflex"><b>Le réflexe :</b> ${esc(G.ticket.reflex)}</p><button class="btn primary" id="g-next" type="button">${label}</button>`;
  sv.hidden = false;
  $('#g-next').addEventListener('click', nextTicket);
  renderHud();
  renderEq();
  renderCoach();
  ringOff();
  $('#game').scrollTop = 0;
  if (!OVERLAY.matches) sv.scrollIntoView({ block: 'nearest' });
}
function nextTicket() {
  if (G.random) return startRandom();
  if (G.idx < TICKETS.length - 1) return startTicket(G.idx + 1);
  G.finished = true;
  finalCard();
}
function startRandom() {
  let i;
  do { i = Math.floor(Math.random() * TICKETS.length); } while (i === G.lastRandom && TICKETS.length > 1);
  G.lastRandom = i;
  startTicket(i, true);
}
function startTicket(i, random = false) {
  G.run++;
  kill(gameCtx);
  gameCtx = makeCtx(1);
  disposeTestPks();
  G.idx = i; G.random = random; G.ticket = TICKETS[i];
  G.st = freshState();
  G.ticket.apply(G.st, random && VARIANTS[G.ticket.id] ? pick(VARIANTS[G.ticket.id]) : undefined);
  G.st0 = clone(G.st);
  G.text = random && VARIANTS[G.ticket.id] ? RANDOM_TEXT : G.ticket.text;
  G.stars = 3; G.solved = false; G.busy = false; G.editing = false; G.sel = null;
  G.coach = G.ticket.tutorial && !random ? 0 : -1;
  applyHomeVisuals(G.st);
  if (SCREENS.pc) SCREENS.pc.draw('wait');
  $('#g-solved').hidden = true;
  $$('.inspect .chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
  clearTagClasses('hot', 'coach');
  ringOff();
  result('', '');
  setTools(true);
  renderHud(); renderTicket(); renderEq(); renderCoach();
  hideCard();
  if (MODE === 'game') view('game');
  $('#game').scrollTop = 0;
}
function introCard() {
  const resume = !G.finished && G.results.some(v => v != null);
  showCard(`<h2>Trouve la panne</h2>
<p>Tu es au support informatique. Des utilisateurs t'envoient des tickets : quelque chose ne marche plus chez eux. À toi de trouver où ça coince.</p>
<ul><li><strong>Teste</strong> la connexion : un paquet part vers Internet et s'arrête là où ça bloque.</li>
<li><strong>Inspecte</strong> les équipements : clique sur leur nom dans le panneau ou sur leur étiquette dans la scène.</li>
<li><strong>Répare</strong>, puis refais un test pour vérifier.</li></ul>
<p>Tester et inspecter ne coûte rien. Chaque réparation inutile fait perdre une étoile. Le premier ticket est guidé.</p>
<div class="row"><button class="btn primary" id="g-start" type="button">${resume ? `Reprendre (ticket ${G.idx + 1} / ${TICKETS.length})` : 'Commencer'}</button></div>`, '#g-start');
  $('#g-start').addEventListener('click', () => hideCard());
}
function finalCard() {
  showCard(`<h2>Tous les tickets sont résolus</h2>
<p>Tu as gagné <strong>${G.total} étoile${G.total > 1 ? 's' : ''} sur ${TICKETS.length * 3}</strong>.</p>
<p><strong>Les réflexes à retenir</strong></p>
<ul>${TICKETS.map(t => `<li>${esc(t.reflex)}</li>`).join('')}</ul>
<div class="row"><button class="btn primary" id="g-random" type="button">Panne au hasard</button><button class="btn" id="g-restart" type="button">Refaire les tickets</button><button class="btn" id="g-tour" type="button">Revoir la visite</button></div>`, '#g-random');
  $('#g-random').addEventListener('click', startRandom);
  $('#g-restart').addEventListener('click', () => { G.results = []; G.total = 0; G.finished = false; startTicket(0); });
  $('#g-tour').addEventListener('click', () => setMode('tour'));
}

function enterGame() {
  shiftFn = () => (OVERLAY.matches ? ($('#game').getBoundingClientRect().right - viewport.getBoundingClientRect().left) / 2 : 0);
  applyViewShift();
  rig.onRecenter = () => view('game');
  for (const id of ['srv', 'r1', 'r2', 'r3', 'r4', 'z-net']) showTag(id, false);
  if (G.finished) { startTicket(0); finalCard(); }
  else { startTicket(G.idx); introCard(); }
  if (HAS3D) snapRig();
}
function exitGame() {
  shiftFn = null;
  applyViewShift();
  G.run++;
  G.busy = false;
  kill(gameCtx);
  gameCtx = makeCtx(1);
  disposeTestPks();
  hideCard();
  applyHomeVisuals(freshState());
  clearTagClasses('hot', 'coach');
  $$('.coach-target').forEach(el => el.classList.remove('coach-target'));
  ringOff();
  for (const t of TAGS) t.visible = true;
}
function initGame() {
  $('#g-test-pc').addEventListener('click', () => gameTest('pc'));
  $('#g-test-laptop').addEventListener('click', () => gameTest('laptop'));
  $$('.inspect .chip').forEach(c => c.addEventListener('click', () => gameInspect(c.dataset.eq)));
  $('#g-eq').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) gameAction(b.dataset.act); });
  // pendant la modification, la ligne « Réseau » suit les valeurs choisies
  $('#g-eq').addEventListener('change', e => {
    if (!e.target.matches('select')) return;
    const c = {};
    for (const f of FIELDS) c[f] = ($('#g-f-' + f) || {}).value || G.st.pc[f];
    const net = $('#g-net');
    if (net) net.textContent = netText(c);
  });
  renderHud();
}

/* =====================================================================
   Modes, boucle principale, démarrage
   ===================================================================== */
let MODE = null;
function setMode(m) {
  if (m === MODE) return;
  MODE = m;
  document.body.classList.toggle('mode-game', m === 'game');
  document.body.classList.toggle('mode-tour', m === 'tour');
  $('#tab-tour').setAttribute('aria-selected', String(m === 'tour'));
  $('#tab-game').setAttribute('aria-selected', String(m === 'game'));
  $('#story').hidden = m !== 'tour';
  $('#inspector').hidden = m !== 'tour';
  $('#game').hidden = m !== 'game';
  fiche.hidden = true;
  if (m === 'game') {
    setPaused(false);
    kill(tour.ctx);
    resetScene();
    if (TP) TP.show(false);
    enterGame();
  } else {
    exitGame();
    goStep(tour.i);
  }
}

let ELAPSED = 0, lastT = 0;
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  ELAPSED += dt;
  tickTweens(dt);
  for (const fn of updaters) fn(dt, ELAPSED);
  if (HAS3D) {
    updateRig(dt);
    renderer.render(scene, camera);
    updateTags();
  }
  requestAnimationFrame(frame);
}

function start(data) {
  data = data || {};
  resize();
  if (HAS3D) {
    buildWorld();
    applyTheme();
    $('#loading').hidden = true;
  } else {
    $('#loading').textContent = "La 3D n'a pas pu démarrer sur cet appareil (WebGL indisponible). Le récit, l'inspecteur de paquet et le jeu restent utilisables.";
  }
  initTour();
  initGame();
  const mq = matchMedia('(prefers-color-scheme: dark)');
  if (mq.addEventListener) mq.addEventListener('change', applyTheme);
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const relayout = () => { applyViewShift(); if (rig.onRecenter) rig.onRecenter(); };
  if (OVERLAY.addEventListener) OVERLAY.addEventListener('change', relayout);
  $('#tab-tour').addEventListener('click', () => setMode('tour'));
  $('#tab-game').addEventListener('click', () => setMode('game'));
  // Raccourcis actifs quand la scène est à l'écran (sinon Espace et PageDown font défiler la page)
  const stageInView = () => { const r = viewport.getBoundingClientRect(); return r.bottom > 120 && r.top < window.innerHeight - 120; };
  let eatSpaceUp = false;
  document.addEventListener('keydown', e => {
    if (MODE !== 'tour' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (!stageInView()) return;
    if ([' ', 'k', 'K', 'p', 'P'].includes(e.key)) {
      e.preventDefault();
      if (e.key === ' ') eatSpaceUp = true; // évite que la barre d'espace « clique » aussi le bouton qui a le focus
      if (!e.repeat) setPaused(!tour.paused);
      return;
    }
    if (e.target.closest && e.target.closest('[role="tab"]')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goStep(tour.i + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goStep(tour.i - 1); }
  });
  document.addEventListener('keyup', e => { if (e.key === ' ' && eatSpaceUp) { eatSpaceUp = false; e.preventDefault(); } });
  tour.i = Number.isInteger(data.step) ? clamp(data.step, 0, STEPS.length - 1) : 0;
  const first = data.mode === 'game' || data.mode === 'tour' ? data.mode : (location.hash === '#jeu' ? 'game' : 'tour');
  setMode(first);
  if (HAS3D) snapRig();
  requestAnimationFrame(t => { lastT = t; requestAnimationFrame(frame); });
}

const hot = window.claude && window.claude.hot;
if (hot && typeof hot.snapshot === 'function') {
  try { hot.snapshot(() => ({ mode: MODE, step: tour.i })); } catch (e) { /* hôte sans rechargement à chaud */ }
}
if (hot && typeof hot.ready === 'function') hot.ready(start);
else start((hot && hot.data) || {});
})();
