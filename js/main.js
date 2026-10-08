/* Le Voyage du Paquet : initialisation. Bascule entre la visite et le jeu, thème clair / sombre,
   boucle d'animation, raccourcis clavier, adresse de la page, démarrage.
   Chargé en dernier : net, data, terminal, route, scene, tour et game sont prêts.
   Copyright (c) 2026 anotherj4ck. Code sous licence MIT : voir LICENSE.
   Les textes pédagogiques qu'il contient relèvent de LICENSE-CONTENU (tous droits réservés). */
(() => {
'use strict';
const {
  $, isDark, HAS3D, tickTweens, updaters, viewport, applyTheme, OVERLAY, applyViewShift,
  resize, render, rig, snapRig, closeFiche, buildWorld,
} = VDP.scene;
const { state: tour, goStep, initTour, setPaused, stopTour } = VDP.tour;
const { initGame, enterGame, exitGame, tagClick, openTicket } = VDP.game;
const { parseHash } = VDP.route;
const { TICKETS } = VDP.data;

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

/* =====================================================================
   Thème clair / sombre : suit le système, sauf choix fait avec le bouton.
   Le choix mémorisé est déjà appliqué dans le <head> de index.html, avant l'affichage.
   ===================================================================== */
const THEME_KEY = 'vdp-theme';
function renderThemeButton() {
  const b = $('#theme-toggle'), dark = isDark();
  const label = dark ? 'Passer au thème clair' : 'Passer au thème sombre';
  b.setAttribute('aria-label', label);
  b.title = label;
  b.querySelector('.i-moon').toggleAttribute('hidden', dark); // attribut : les éléments SVG n'ont pas de propriété .hidden
  b.querySelector('.i-sun').toggleAttribute('hidden', !dark);
}
function toggleTheme() {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next); // la scène 3D et le bouton suivent (MutationObserver)
  try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* stockage bloqué : le choix vaut pour cette visite */ }
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

// Adresse de la page : #jeu ouvre le jeu, #ticket-3 ouvre directement le ticket 3.
// Aussi quand on modifie l'adresse d'une page déjà ouverte : un formateur passe d'un cas à l'autre.
function route() {
  const r = parseHash(location.hash, TICKETS.length);
  if (!r) return false;
  setMode('game');
  if (r.ticket !== null) openTicket(r.ticket);
  return true;
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
  const themeChanged = () => { applyTheme(); renderThemeButton(); };
  if (mq.addEventListener) mq.addEventListener('change', themeChanged);
  new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const relayout = () => { applyViewShift(); if (rig.onRecenter) rig.onRecenter(); };
  if (OVERLAY.addEventListener) OVERLAY.addEventListener('change', relayout);
  $('#theme-toggle').addEventListener('click', toggleTheme);
  renderThemeButton();
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
  if (!route()) setMode('tour');
  window.addEventListener('hashchange', route);
  if (HAS3D) snapRig();
  requestAnimationFrame(t => { lastT = t; requestAnimationFrame(frame); });
}

start();
})();
