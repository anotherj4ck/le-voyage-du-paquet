/* Le Voyage du Paquet : la visite guidée en 10 étapes, l'inspecteur de paquet et les tableaux
   (NAT, routage, ARP, MAC) affichés dans le récit. Les textes des étapes sont dans data.js.
   Copyright (c) 2026 anotherj4ck. Code sous licence MIT : voir LICENSE.
   Les textes pédagogiques qu'il contient relèvent de LICENSE-CONTENU (tous droits réservés). */
VDP.tour = (function () {
'use strict';
const { IP, MAC } = VDP.data;
const {
  $, $$, clamp, ease, esc, cssVar, clone, HAS3D, makeCtx, tween, wait, kill, swallow, V3, rig,
  followObj, aspectK, view, tagClass, clearTagClasses, popText, Poly, EQ, LINKS, SCREENS,
  glowLink, pathBetween, Packet, ORDER, burstRing, ringAt, ringOff, blinkPorts, setAmbient,
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
  $('#step-more-body').innerHTML = st.more || '';
  $('#step-more').hidden = !st.more;
  $('#step-more').open = false;
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
  if (go) go.addEventListener('click', () => VDP.setMode('game'));
  st.play(tour.ctx).catch(swallow);
}

// Quitte la visite (passage au jeu) : animation arrêtée, scène nettoyée, paquet caché
function stopTour() {
  setPaused(false);
  kill(tour.ctx);
  resetScene();
  if (TP) TP.show(false);
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
  $('#next').addEventListener('click', () => { if (tour.i === STEPS.length - 1) VDP.setMode('game'); else goStep(tour.i + 1); });
  $('#replay').addEventListener('click', () => goStep(tour.i));
  $('#pause').addEventListener('click', () => setPaused(!tour.paused));
  $('#paused-badge').addEventListener('click', () => setPaused(false));
  $$('.speed button').forEach(b => b.addEventListener('click', () => {
    tour.speed = parseFloat(b.dataset.speed);
    if (tour.ctx && !tour.paused) tour.ctx.speed = tour.speed;
    $$('.speed button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  }));
}

return { state: tour, STEPS, goStep, initTour, setPaused, stopTour };
}());
