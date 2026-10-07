/* Le Voyage du Paquet : tests des contenus du jeu (js/data.js).
   Chaque ticket doit créer une vraie panne, que la simulation détecte : un ticket ajouté est vérifié d'office.
   Copyright (c) 2026 anotherj4ck. Code sous licence MIT : voir LICENSE. */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const net = require('../js/net.js');
const data = require('../js/data.js');

const REF = data.HOME; // le réseau tel que la simulation le voit
const fresh = () => net.freshState(data.OK_CFG);
const broken = (ticket, variant) => { const st = fresh(); ticket.apply(st, variant); return st; };

describe('Configurations de référence', () => {
  it('le PC, le portable et la console sont bien configurés', () => {
    for (const c of [data.OK_CFG, data.LAPTOP_CFG, data.CONSOLE_CFG]) assert.equal(net.configProblem(c, data.IP.boxL), null);
  });
  it('sans panne, le test passe', () => {
    assert.deepEqual(net.simulate(fresh(), 'pc', REF), { ok: true });
  });
  it('l\'éditeur propose toujours la bonne valeur de chaque champ', () => {
    for (const f of net.FIELDS) assert.ok(data.CHOICES[f].includes(data.OK_CFG[f]), f);
  });
});

describe('Tickets du jeu', () => {
  it('identifiants uniques, et le premier ticket est le ticket guidé', () => {
    const ids = data.TICKETS.map(t => t.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(data.TICKETS[0].tutorial, true);
  });
  for (const t of data.TICKETS) {
    describe(`ticket « ${t.id} » (${t.from})`, () => {
      it('crée exactement une panne, que le test depuis le PC détecte', () => {
        const st = broken(t);
        assert.equal(net.faultsOf(st, data.OK_CFG), 1);
        assert.notEqual(net.simulate(st, 'pc', REF).ok, true);
      });
      it('le test depuis le portable distingue panne du PC et panne commune', () => {
        const st = broken(t);
        const shared = !st.switchOn || !st.fiberOk || !st.boxDns; // switch, fibre et DNS de la box servent à tous
        assert.equal(net.simulate(st, 'laptop', REF).ok === true, !shared);
      });
      it('a un message, une explication et un réflexe', () => {
        for (const s of [t.from, t.text, t.explain(broken(t)), t.reflex]) assert.ok(typeof s === 'string' && s.trim().length > 0);
      });
      for (const v of data.VARIANTS[t.id] || []) {
        it(`panne au hasard, variante ${v} : la panne est détectée`, () => {
          const st = broken(t, v);
          assert.equal(net.faultsOf(st, data.OK_CFG), 1);
          assert.notEqual(net.simulate(st, 'pc', REF).ok, true);
        });
      }
    });
  }
});

describe('Textes des étapes', () => {
  it('10 étapes, chacune avec un identifiant unique, un titre et un texte', () => {
    assert.equal(data.STEPS.length, 10);
    assert.equal(new Set(data.STEPS.map(s => s.id)).size, 10);
    for (const s of data.STEPS) assert.ok(s.title && s.body.length > 50, s.id);
  });
});
