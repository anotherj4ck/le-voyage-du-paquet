/* Le Voyage du Paquet : tests de la lecture de l'adresse de la page (js/route.js).
   #jeu ouvre le jeu, #ticket-1 à #ticket-9 ouvrent directement un ticket, le reste ouvre la visite.
   Copyright (c) 2026 anotherj4ck. Code sous licence MIT : voir LICENSE. */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const data = require('../js/data.js');
const { parseHash } = require('../js/route.js');

const N = data.TICKETS.length;
const game = ticket => ({ mode: 'game', ticket });

describe('Adresse de la page', () => {
  it('#jeu ouvre l\'accueil du jeu', () => {
    assert.deepEqual(parseHash('#jeu', N), game(null));
  });
  it('#ticket-1 à #ticket-9 ouvrent chacun leur ticket (numéro affiché = index + 1)', () => {
    assert.equal(N, 9);
    for (let n = 1; n <= N; n++) assert.deepEqual(parseHash(`#ticket-${n}`, N), game(n - 1), `#ticket-${n}`);
  });
  it('majuscules, zéro devant et espaces tolérés : une adresse recopiée à la main fonctionne', () => {
    assert.deepEqual(parseHash('#Ticket-3', N), game(2));
    assert.deepEqual(parseHash('#TICKET-03', N), game(2));
    assert.deepEqual(parseHash(' #ticket-9 ', N), game(8));
    assert.deepEqual(parseHash('#JEU', N), game(null));
  });
  it('numéro hors de la liste : le jeu s\'ouvre sur son accueil, sans erreur', () => {
    for (const h of ['#ticket-0', `#ticket-${N + 1}`, '#ticket-42', '#ticket-999']) assert.deepEqual(parseHash(h, N), game(null), h);
  });
  it('autre adresse : rien de particulier, la visite guidée s\'ouvre', () => {
    for (const h of ['', '#', '#memo', '#ticket', '#ticket-', '#ticket-abc', '#ticket-1x', '#ticket--1', '#ticket-1.5', '#ticket-1234', 'jeu', 'ticket-3']) {
      assert.equal(parseHash(h, N), null, JSON.stringify(h));
    }
    assert.equal(parseHash(undefined, N), null);
  });
  it('le nombre de tickets vient des données : un dixième ticket deviendrait accessible sans toucher au code', () => {
    assert.deepEqual(parseHash('#ticket-10', 10), game(9));
    assert.deepEqual(parseHash('#ticket-10', N), game(null));
  });
});
