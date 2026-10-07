/* Le Voyage du Paquet : script principal du site.
   Copyright (c) 2026 anotherj4ck. Code sous licence MIT : voir LICENSE.
   Les textes pédagogiques qu’il contient relèvent de LICENSE-CONTENU (tous droits réservés). */
(() => {
'use strict';
const { IP, MAC, OK_CFG, LAPTOP_CFG, CONSOLE_CFG, FIELD_LABEL, CHOICES, TICKETS, VARIANTS, RANDOM_TEXT, COACH } = VDP.data;
const {
  $, $$, clamp, ease, esc, cssVar, clone, HAS3D, REDUCED,
  CANCEL, makeCtx, tween, wait, kill, tickTweens, swallow, updaters,
  viewport, V3, applyTheme, OVERLAY, applyViewShift, setViewShift, resize, render,
  rig, setView, followObj, snapRig, aspectK, fitView, view,
  TAGS, showTag, tagClass, clearTagClasses, popText, Poly, openFiche, closeFiche,
  EQ, LINKS, SCREENS, glowLink, pathBetween, Packet, ORDER,
  burstRing, ringAt, ringOff, blinkPorts, applyHomeVisuals, setAmbient, buildWorld,
} = VDP.scene;


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

// Ce que fait chaque étape (mise en place, caméra, animation). Les textes sont dans data.js, sous le même id.
const ACTIONS = {
  accueil: {
    setup() { if (TP) TP.show(false); setPK(null); setTable(''); },
    cam() { view('overview'); },
    async play(ctx) {
      await wait(ctx, 0.8);
      for (const id of ['z-net', 'z-fai', 'z-home']) { tagClass(id, 'hot', true); await wait(ctx, 1.2); tagClass(id, 'hot', false); }
    },
  },
  aller: {
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
  emballage: {
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
  routeurs: {
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
  wan: {
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
  nat: {
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
  trame: {
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
  switch: {
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
  deballage: {
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
  recap: {
    setup() { if (TP) TP.show(false); setPK(null); setTable(''); if (SCREENS.pc) SCREENS.pc.draw('page'); },
    cam() { view('overview'); },
    async play(ctx) { await wait(ctx, 0.8); await stream(ctx); },
  },
};
const STEPS = VDP.data.STEPS.map(s => ({ ...s, ...ACTIONS[s.id] }));

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
  setAmbient(true);
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
const { FIELDS, netText, freshState, simulate } = VDP.net;
const REF = { boxIp: IP.boxL, laptop: LAPTOP_CFG }; // réseau de référence de la simulation
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const okColor = () => cssVar('--ok') || '#1b8a4a';
const badColor = () => cssVar('--bad') || '#cf3a40';


const G = {
  run: 0, idx: 0, random: false, ticket: TICKETS[0], text: '', st: freshState(OK_CFG), st0: null,
  stars: 3, total: 0, results: [], randomSolved: 0, busy: false, solved: false, editing: false,
  sel: null, coach: -1, lastRandom: -1, finished: false,
};

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
  const r = simulate(G.st, from, REF);
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
  G.st = freshState(OK_CFG);
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
  setViewShift(() => (OVERLAY.matches ? ($('#game').getBoundingClientRect().right - viewport.getBoundingClientRect().left) / 2 : 0));
  rig.onRecenter = () => view('game');
  for (const id of ['srv', 'r1', 'r2', 'r3', 'r4', 'z-net']) showTag(id, false);
  if (G.finished) { startTicket(0); finalCard(); }
  else { startTicket(G.idx); introCard(); }
  if (HAS3D) snapRig();
}
function exitGame() {
  setViewShift(null);
  G.run++;
  G.busy = false;
  kill(gameCtx);
  gameCtx = makeCtx(1);
  disposeTestPks();
  hideCard();
  applyHomeVisuals(freshState(OK_CFG));
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
  closeFiche();
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
  if (HAS3D) render(dt);
  requestAnimationFrame(frame);
}

function start(data) {
  data = data || {};
  resize();
  if (HAS3D) {
    buildWorld(tagClick);
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
