/* Le Voyage du Paquet : le jeu « Trouve la panne ». Tickets, tests animés, inspection et réparation
   des équipements, guide pas à pas, étoiles. Les tickets eux-mêmes sont dans data.js.
   Copyright (c) 2026 anotherj4ck. Code sous licence MIT : voir LICENSE.
   Les textes pédagogiques qu'il contient relèvent de LICENSE-CONTENU (tous droits réservés). */
VDP.game = (function () {
'use strict';
const { FIELDS, netText, pcConfig, freshState, faultsOf, simulate } = VDP.net;
const {
  OK_CFG, LAPTOP_CFG, CONSOLE_CFG, FIELD_LABEL, MODE_LABEL, CHOICES, HOME, TICKETS, VARIANTS,
  RANDOM_TEXT, COACH,
} = VDP.data;
const {
  $, $$, REDUCED, ease, esc, cssVar, clone, HAS3D, CANCEL, makeCtx, tween, wait, kill,
  viewport, V3, OVERLAY, setViewShift, rig, setView, followObj, snapRig, aspectK, fitView,
  view, TAGS, showTag, tagClass, clearTagClasses, popText, openFiche, EQ, SCREENS, pathBetween,
  Packet, burstRing, ringAt, ringOff, applyHomeVisuals,
} = VDP.scene;

/* =====================================================================
   Jeu : trouve la panne — données et simulation
   ===================================================================== */
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
const STOP_AT = { pc: 'au PC fixe', laptop: 'au portable', sw: 'au switch', box: 'à la box', r2: 'sur Internet' };
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
// Valeurs affichées d'une configuration réellement utilisée (voir pcConfig)
const shown = (c, mode) => ({
  mode: MODE_LABEL[mode] || MODE_LABEL.manuel, ip: c.apipa ? `${c.ip} (APIPA)` : c.ip,
  mask: c.mask, gw: c.gw || 'aucune', dns: c.dns || 'aucun',
});
function selectFor(f, disabled) {
  const opts = f === 'mode' ? Object.keys(MODE_LABEL) : optionsFor(f), cur = G.st.pc[f];
  return `<select id="g-f-${f}" aria-label="${FIELD_LABEL[f]} du PC fixe"${disabled ? ' disabled' : ''}>` +
    opts.map(v => `<option value="${v}"${v === cur ? ' selected' : ''}>${f === 'mode' ? MODE_LABEL[v] : v}</option>`).join('') + '</select>';
}
// Tableau de configuration (comme un ipconfig) : un appareil, et éventuellement le portable en référence
function cfgTable(c, mode, ref, editable) {
  const a = shown(c, mode), b = ref && shown(ref, ref.mode);
  const cell = f => (editable ? selectFor(f, f !== 'mode' && G.st.pc.mode === 'dhcp') : a[f]);
  const rows = ['mode', ...FIELDS].map(f => [FIELD_LABEL[f], cell(f), b && b[f]]);
  rows.push(['Réseau', `<span id="g-net">${netText(c)}</span>`, ref && netText(ref)]);
  return `<div class="table-wrap"><table class="cfg"><thead><tr><th scope="col"></th><th scope="col">${ref ? 'PC fixe' : 'Valeur'}</th>${ref ? '<th scope="col">Portable</th>' : ''}</tr></thead><tbody>` +
    rows.map((r, i) => `<tr${i === rows.length - 1 ? ' class="net"' : ''}><td>${r[0]}</td><td>${r[1]}</td>${ref ? `<td>${r[2]}</td>` : ''}</tr>`).join('') + '</tbody></table></div>';
}
// Configuration choisie dans l'éditeur. Passer en DHCP, c'est redemander une adresse : on l'obtient si le serveur répond.
function editedPc() {
  const st = G.st, val = f => ($('#g-f-' + f) || {}).value || st.pc[f];
  const next = { ...st.pc, mode: val('mode') };
  if (next.mode === 'manuel') for (const f of FIELDS) next[f] = val(f);
  else if (st.pc.mode !== 'dhcp') next.lease = st.boxDhcp;
  return next;
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
    h = `<h3>PC fixe</h3><ul class="state">${li('Câble réseau', yes(st.pcCable, 'branché', 'débranché'))}${li('Lien réseau', yes(st.pcCable && st.switchOn, 'actif', st.pcCable ? 'aucun signal en face' : 'aucun'))}${li('Adressage', st.pc.mode === 'dhcp' ? 'automatique (DHCP)' : 'manuel (adresse fixe)')}</ul>` +
      actsHtml([['cable', 'Rebrancher le câble'], ['renew', "Renouveler l'adresse IP"], ['reboot-pc', 'Redémarrer le PC'], ['edit', 'Modifier la configuration IP']]) +
      `<p class="note">Sa configuration réseau (comme un <code>ipconfig</code>), à côté de celle du portable qui sert de référence :</p>` +
      cfgTable(pcConfig(st, HOME), st.pc.mode, LAPTOP_CFG, G.editing) +
      (G.editing ? `<p class="note">Choisis les valeurs dans la colonne du PC, puis applique. En DHCP, c'est la box qui les donne.</p><div class="acts"><button class="btn primary" type="button" data-act="apply">Appliquer</button><button class="btn" type="button" data-act="cancel">Annuler</button></div>` : '');
  } else if (id === 'laptop' || id === 'console') {
    const lap = id === 'laptop', cfg = lap ? LAPTOP_CFG : CONSOLE_CFG;
    h = `<h3>${lap ? 'Portable' : 'Console'}</h3><ul class="state">${li('Câble réseau', yes(true, 'branché'))}${li('Lien réseau', yes(st.switchOn, 'actif', 'aucun signal en face'))}</ul>` +
      actsHtml([['reboot-' + id, `Redémarrer ${lap ? 'le portable' : 'la console'}`]]) +
      `<p class="note">Sa configuration réseau. Elle sert de référence pour comparer.</p>${cfgTable(cfg, cfg.mode)}`;
  } else if (id === 'sw') {
    h = `<h3>Switch</h3><ul class="state">${li('Alimentation', yes(st.switchOn, 'allumé', 'éteint'))}${li('Voyants des ports', yes(st.switchOn, 'ils clignotent', 'tous éteints'))}${li('Port 2 (PC fixe)', yes(st.switchOn && st.pcCable, 'lien actif', 'pas de lien'))}</ul>` +
      actsHtml([st.switchOn ? ['reboot-sw', 'Redémarrer le switch'] : ['power-sw', 'Rallumer le switch']]) +
      `<p class="note">Ce switch (non administrable) n'a pas d'adresse IP : il relie les appareils de la maison à la box.</p>`;
  } else if (id === 'box') {
    h = `<h3>Box internet</h3><ul class="state">${li('Alimentation', yes(true, 'allumée'))}${li('Voyant fibre', yes(st.fiberOk, 'vert', 'rouge, aucun signal'))}${li('Serveur DHCP', yes(st.boxDhcp, 'actif', 'désactivé'))}${li('Relais DNS', yes(st.boxDns, 'répond', 'ne répond plus'))}${li('Adresse côté maison', '192.168.1.1')}${li('Réseau de la maison', netText(OK_CFG))}</ul>` +
      actsHtml([['reboot-box', 'Redémarrer la box'], ...(st.boxDhcp ? [] : [['dhcp-on', 'Réactiver le serveur DHCP']]), ['call-fai', 'Appeler le FAI']]) +
      `<p class="note">Son adresse 192.168.1.1 est la passerelle et le serveur DNS des appareils de la maison ; son serveur DHCP leur donne leur adresse.</p>`;
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
  if (VDP.mode === 'game' && INSPECTABLE.includes(id)) { if (screenEl.hidden) gameInspect(id); return; }
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
    case 'reboot-pc': // au démarrage, un PC en DHCP redemande une adresse
      if (st.pc.mode === 'dhcp' && !st.pc.lease && st.boxDhcp) { st.pc.lease = true; useful = true; text = `Le PC redémarre et redemande une adresse : le serveur DHCP de la box lui donne ${HOME.lease.ip}.`; }
      else text = 'Le PC redémarre… et le problème est toujours là.';
      break;
    case 'renew':
      if (st.pc.mode !== 'dhcp') text = "Le PC est en adresse fixe : il n'a pas d'adresse à redemander.";
      else if (!st.boxDhcp) text = `Le PC redemande une adresse… aucun serveur DHCP ne répond : il reste en ${pcConfig(st, HOME).ip}.`;
      else if (st.pc.lease) text = `Le PC renouvelle son bail : il garde ${HOME.lease.ip}. Ça ne change rien.`;
      else { st.pc.lease = true; useful = true; text = `Le PC redemande une adresse : le serveur DHCP de la box lui donne ${HOME.lease.ip}.`; }
      break;
    case 'dhcp-on':
      st.boxDhcp = true; useful = true;
      text = 'Le serveur DHCP de la box est réactivé. Un appareil resté en 169.254 doit maintenant redemander une adresse.';
      break;
    case 'reboot-laptop': text = "Le portable redémarre. Ça n'a rien changé."; break;
    case 'reboot-console': text = "La console redémarre. Ça n'a rien changé."; break;
    case 'power-sw': st.switchOn = true; useful = true; text = 'Le switch est rallumé : ses voyants clignotent à nouveau.'; break;
    case 'reboot-sw': text = 'Le switch redémarre… rien ne change.'; break;
    case 'reboot-box':
      if (!st.boxDns) { st.boxDns = true; useful = true; text = 'La box redémarre : son relais DNS répond de nouveau.'; }
      else text = st.fiberOk ? 'La box redémarre… rien ne change.' : 'La box redémarre… le voyant fibre reste rouge.';
      break;
    case 'call-fai':
      if (!st.fiberOk) { st.fiberOk = true; useful = true; text = 'Le FAI confirme une coupure dans le quartier. La ligne est rétablie : le voyant fibre repasse au vert.'; }
      else text = 'Le FAI ne voit aucun incident sur ta ligne.';
      break;
    case 'apply': {
      const next = editedPc();
      G.editing = false;
      if (next.mode === st.pc.mode && FIELDS.every(f => next[f] === st.pc[f])) { renderEq(); renderCoach(); result('Aucune modification.', 'info'); return; }
      // champs faux en adresse fixe (en DHCP, c'est la box qui donne les valeurs)
      const wrong = p => (p.mode === 'dhcp' ? [] : FIELDS.filter(f => p[f] !== OK_CFG[f]));
      const before = { ok: !!simulate(st, 'pc', HOME).ok, faults: faultsOf(st, OK_CFG), wrong: wrong(st.pc) };
      st.pc = next;
      const okAfter = !!simulate(st, 'pc', HOME).ok;
      const noLease = next.mode === 'dhcp' && !next.lease ? ' Le PC est passé en DHCP, mais aucun serveur ne répond : il se donne une adresse en 169.254.' : '';
      // un champ juste devient faux, ou un test qui passait ne passe plus : nouveau problème
      if (wrong(next).some(f => !before.wrong.includes(f)) || (before.ok && !okAfter)) text = 'Attention : cette modification crée un nouveau problème.' + noLease;
      else if ((okAfter && !before.ok) || faultsOf(st, OK_CFG) < before.faults) {
        useful = true;
        text = next.mode === 'dhcp' ? `Le PC passe en DHCP : la box lui donne ${HOME.lease.ip}.` : 'Configuration modifiée.';
      } else text = noLease ? noLease.trim() : 'Configuration modifiée, mais ça ne règle rien.';
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
    if (VDP.mode === 'game') view('game');
  }
}
async function gameTest(from) {
  if (G.busy || G.solved) return;
  G.busy = true;
  const run = G.run;
  setTools(false);
  renderEq();
  renderCoach();
  const r = simulate(G.st, from, HOME);
  const who = from === 'pc' ? 'le PC fixe' : 'le portable';
  result(`<b>Test en cours depuis ${who}…</b>Il demande d'abord l'adresse de exemple.fr au serveur DNS, puis un paquet de test (ping) part vers le serveur.`, 'info');
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

/* ---------- invite de commandes du PC : gratuite, elle ne coûte jamais d'étoile ---------- */
const term = { history: [], pos: 0 };
function termPrint(text) {
  const out = $('#g-term-out'), pre = document.createElement('pre');
  pre.textContent = text; // jamais innerHTML : ce que tape l'utilisateur ne doit pas devenir du HTML
  out.appendChild(pre);
  out.scrollTop = out.scrollHeight;
}
function termReset() {
  $('#g-term-out').replaceChildren();
  termPrint('Invite de commandes simulée du PC fixe. Tape help pour la liste des commandes.');
}
function termRun(line) {
  if (line.trim() && term.history[term.history.length - 1] !== line) term.history.push(line);
  term.pos = term.history.length;
  const r = VDP.term.run(line, { st: G.st, home: HOME });
  if (r.clear) { $('#g-term-out').replaceChildren(); return; }
  termPrint([VDP.term.PROMPT + line, ...r.lines].join('\n'));
  if (r.renew && !G.solved && !G.st.pc.lease) { G.st.pc.lease = true; renderEq(); } // ipconfig /renew a obtenu une adresse
}
// Flèches haut et bas : parcourir les commandes déjà tapées
function termHistory(e) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  term.pos = e.key === 'ArrowUp' ? Math.max(0, term.pos - 1) : Math.min(term.history.length, term.pos + 1);
  e.target.value = term.history[term.pos] || '';
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
  G.text = random && VARIANTS[G.ticket.id] ? (RANDOM_TEXT[G.ticket.id] || RANDOM_TEXT.default) : G.ticket.text;
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
  termReset();
  hideCard();
  if (VDP.mode === 'game') view('game');
  $('#game').scrollTop = 0;
}
// Ouvre directement un ticket, sans la carte d'accueil (adresse #ticket-3)
function openTicket(i) { startTicket(i); }

function introCard() {
  const resume = !G.finished && G.results.some(v => v != null);
  showCard(`<h2>Trouve la panne</h2>
<p>Tu es au support informatique. Des utilisateurs t'envoient des tickets : quelque chose ne marche plus chez eux. À toi de trouver où ça coince.</p>
<ul><li><strong>Teste</strong> la connexion : un paquet part vers Internet et s'arrête là où ça bloque.</li>
<li><strong>Inspecte</strong> les équipements : clique sur leur nom dans le panneau ou sur leur étiquette dans la scène.</li>
<li><strong>Répare</strong>, puis refais un test pour vérifier.</li></ul>
<p>Tester, inspecter et taper des commandes dans l'invite du PC ne coûte rien. Chaque réparation inutile fait perdre une étoile. Le premier ticket est guidé.</p>
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
  $('#g-tour').addEventListener('click', () => VDP.setMode('tour'));
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
  $('#g-term-form').addEventListener('submit', e => { e.preventDefault(); const i = $('#g-term-in'); termRun(i.value); i.value = ''; });
  $('#g-term-in').addEventListener('keydown', termHistory);
  $('#g-term').addEventListener('toggle', e => { if (e.target.open) $('#g-term-in').focus({ preventScroll: true }); });
  // pendant la modification, la ligne « Réseau » suit les valeurs choisies ; en DHCP, c'est la box qui les donne
  $('#g-eq').addEventListener('change', e => {
    if (!e.target.matches('select')) return;
    const next = editedPc();
    for (const f of FIELDS) { const s = $('#g-f-' + f); if (s) s.disabled = next.mode === 'dhcp'; }
    const net = $('#g-net');
    if (net) net.textContent = netText(pcConfig({ ...G.st, pc: next }, HOME));
  });
  renderHud();
}

return { initGame, enterGame, exitGame, tagClick, openTicket };
}());
