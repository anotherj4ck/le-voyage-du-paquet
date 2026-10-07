/* Le Voyage du Paquet : la scène 3D et ses outils. Moteur d'animation, rendu three.js, caméra,
   étiquettes et fiches des équipements, géométrie, paquet en tranches, effets.
   Copyright (c) 2026 anotherj4ck. Code sous licence MIT : voir LICENSE.
   Les textes pédagogiques qu'il contient relèvent de LICENSE-CONTENU (tous droits réservés). */
VDP.scene = (function () {
'use strict';
const { IP, INFO } = VDP.data;

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
const clone = o => JSON.parse(JSON.stringify(o));
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
// fn() : décalage en pixels du centre de la vue (null : aucun)
function setViewShift(fn) { shiftFn = fn; applyViewShift(); }
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
const closeFiche = () => { fiche.hidden = true; };
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
const setAmbient = on => { ambientOn = on; };
function respawnAmbient(a) {
  const key = AMB_LINKS[Math.floor(Math.random() * AMB_LINKS.length)];
  const pts = LINKDEF[key].map(([x, z]) => new V3(x, 0.42, z));
  if (Math.random() < 0.5) pts.reverse();
  a.poly = new Poly(pts); a.d = 0; a.speed = 4 + Math.random() * 5;
}

/* ---------- assemblage ---------- */
// onTagClick(id) : ce que fait un clic sur une étiquette (fiche en visite, inspection en jeu)
function buildWorld(onTagClick) {
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

  const T = (id, name, addr, pos, o = {}) => addTag({ id, name, addr, pos, key: o.key, short: o.short, minor: o.minor, detail: o.detail, onClick: () => onTagClick(id) });
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
   Cadrages de la caméra, adaptés à la forme de l'écran (visite et jeu)
   ===================================================================== */
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

// Une image : caméra, rendu 3D, étiquettes
function render(dt) {
  updateRig(dt);
  renderer.render(scene, camera);
  updateTags();
}

return {
  $, $$, clamp, lerp, REDUCED, ease, esc, cssVar, clone, isDark, HAS3D,
  CANCEL, makeCtx, tween, wait, kill, tickTweens, swallow, FX, updaters,
  viewport, V3, applyTheme, OVERLAY, applyViewShift, setViewShift, resize, render,
  rig, setView, followObj, snapRig, aspectK, fitView, view,
  TAGS, showTag, tagClass, clearTagClasses, popText, Poly, openFiche, closeFiche,
  EQ, LINKS, SCREENS, glowLink, pathBetween, Packet, ORDER,
  burstRing, ringAt, ringOff, blinkPorts, applyHomeVisuals, setAmbient, buildWorld,
};
}());
