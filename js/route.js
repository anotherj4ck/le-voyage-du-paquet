/* Le Voyage du Paquet : lecture de l'adresse de la page. #jeu ouvre le jeu ; #ticket-1 à #ticket-9 ouvrent
   directement un ticket, pour qu'un formateur arrive sur un cas précis. Logique pure, testée dans Node.
   Chargé par le navigateur (VDP.route) et par Node pour les tests (module.exports, en fin de fichier).
   Copyright (c) 2026 anotherj4ck. Code sous licence MIT : voir LICENSE. */
var VDP = (typeof window !== 'undefined' && window.VDP) || {};

VDP.route = (function () {
'use strict';

// hash : la fin de l'adresse (« #ticket-3 ») ; count : le nombre de tickets.
// Renvoie { mode: 'game', ticket } (ticket : index à partir de 0, ou null pour l'accueil du jeu),
// ou null quand l'adresse ne demande rien de particulier (la visite guidée s'ouvre).
function parseHash(hash, count) {
  const h = String(hash || '').trim().toLowerCase();
  if (h === '#jeu') return { mode: 'game', ticket: null };
  const m = /^#ticket-(\d{1,3})$/.exec(h);
  if (!m) return null;
  const n = Number(m[1]);
  return { mode: 'game', ticket: n >= 1 && n <= count ? n - 1 : null };
}

return { parseHash };
}());

if (typeof module !== 'undefined') module.exports = VDP.route;
