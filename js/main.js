/* Le Voyage du Paquet : initialisation. Bascule entre la visite et le jeu, boucle d'animation,
   raccourcis clavier, démarrage. Chargé en dernier : net, data, scene, tour et game sont prêts.
   Copyright (c) 2026 anotherj4ck. Code sous licence MIT : voir LICENSE.
   Les textes pédagogiques qu'il contient relèvent de LICENSE-CONTENU (tous droits réservés). */
(() => {
'use strict';
const {
  $, HAS3D, tickTweens, updaters, viewport, applyTheme, OVERLAY, applyViewShift,
  resize, render, rig, snapRig, closeFiche, buildWorld,
} = VDP.scene;
const { state: tour, goStep, initTour, setPaused, stopTour } = VDP.tour;
const { initGame, enterGame, exitGame, tagClick } = VDP.game;

/* =====================================================================
   Modes, boucle principale, démarrage
   ===================================================================== */
VDP.mode = null; // ce qui est affiché : 'tour' (visite) ou 'game' (jeu)
// Bascule entre la visite et le jeu ; aussi appelée par la visite et le jeu (VDP.setMode)
function setMode(m) {
  if (m === VDP.mode) return;
  VDP.mode = m;
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

function start() {
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
    if (VDP.mode !== 'tour' || e.ctrlKey || e.metaKey || e.altKey) return;
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
  const first = location.hash === '#jeu' ? 'game' : 'tour';
  setMode(first);
  if (HAS3D) snapRig();
  requestAnimationFrame(t => { lastT = t; requestAnimationFrame(frame); });
}

start();
})();
