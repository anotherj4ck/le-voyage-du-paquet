/* Le Voyage du Paquet : script principal du site.
   Copyright (c) 2026 anotherj4ck. Code sous licence MIT : voir LICENSE.
   Les textes pédagogiques qu’il contient relèvent de LICENSE-CONTENU (tous droits réservés). */
(() => {
'use strict';
const { IP, OK_CFG, LAPTOP_CFG, CONSOLE_CFG, FIELD_LABEL, CHOICES, TICKETS, VARIANTS, RANDOM_TEXT, COACH } = VDP.data;
const {
  $, $$, clamp, ease, esc, cssVar, clone, HAS3D, REDUCED,
  CANCEL, makeCtx, tween, wait, kill, tickTweens, updaters,
  viewport, V3, applyTheme, OVERLAY, applyViewShift, setViewShift, resize, render,
  rig, setView, followObj, snapRig, aspectK, fitView, view,
  TAGS, showTag, tagClass, clearTagClasses, popText, openFiche, closeFiche,
  EQ, SCREENS, pathBetween, Packet,
  burstRing, ringAt, ringOff, applyHomeVisuals, buildWorld,
} = VDP.scene;
const { state: tour, STEPS, goStep, initTour, setPaused, stopTour } = VDP.tour;


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
// Bascule entre la visite et le jeu ; aussi appelée par la visite et le jeu (VDP.setMode)
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
    stopTour();
    enterGame();
  } else {
    exitGame();
    goStep(tour.i);
  }
}

VDP.setMode = setMode;

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
