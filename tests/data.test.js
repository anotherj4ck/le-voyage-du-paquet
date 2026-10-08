/* Le Voyage du Paquet : tests des contenus (js/data.js), textes de la visite et tickets du jeu.
   Chaque ticket doit créer une vraie panne, que la simulation détecte : un ticket ajouté est vérifié d'office.
   Copyright (c) 2026 anotherj4ck. Code sous licence MIT : voir LICENSE. */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const net = require('../js/net.js');
const data = require('../js/data.js');
const term = require('../js/terminal.js');

const REF = data.HOME; // le réseau tel que la simulation le voit
const fresh = () => net.freshState(data.OK_CFG);
const broken = (ticket, variant) => { const st = fresh(); ticket.apply(st, variant); return st; };
// Le switch, la fibre et le DNS de la box servent à tous : leur panne touche aussi le portable, les autres non
function assertLaptop(st) {
  const shared = !st.switchOn || !st.fiberOk || !st.boxDns;
  assert.equal(net.simulate(st, 'laptop', REF).ok === true, !shared);
}

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
        assertLaptop(broken(t));
      });
      it('a un message, une explication et un réflexe', () => {
        for (const s of [t.from, t.text, t.explain(broken(t)), t.reflex]) assert.ok(typeof s === 'string' && s.trim().length > 0);
      });
      for (const v of data.VARIANTS[t.id] || []) {
        it(`panne au hasard, variante ${v} : la panne est détectée, et le portable la situe`, () => {
          const st = broken(t, v);
          assert.equal(net.faultsOf(st, data.OK_CFG), 1);
          assert.notEqual(net.simulate(st, 'pc', REF).ok, true);
          assertLaptop(st);
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

describe('Couches de lecture : « L\'essentiel » et « Pour aller plus loin »', () => {
  const text = html => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
  const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g, MACS = /\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/g;
  const PORT = /\b\d{3,5}\b/g; // les numéros de port cités (443, 40001, 52344), une fois les adresses retirées
  const cited = html => { const t = text(html); return [...(t.match(IPV4) || []), ...(t.replace(IPV4, '').match(PORT) || [])]; };

  it('un bloc « Pour aller plus loin » aux étapes 2 à 9, aucun aux étapes 1 et 10', () => {
    data.STEPS.forEach((s, i) => assert.equal(Boolean(s.more), i > 0 && i < 9, s.id));
  });
  it('HTML bien formé : balises fermées, et pas de <details> dans les textes (le bloc est dans index.html)', () => {
    for (const s of data.STEPS) for (const html of [s.body, s.more || '']) {
      for (const tag of ['p', 'ul', 'li', 'div', 'strong', 'code', 'em']) {
        const open = (html.match(new RegExp(`<${tag}[ >]`, 'g')) || []).length, close = (html.match(new RegExp(`</${tag}>`, 'g')) || []).length;
        assert.equal(open, close, `${s.id} : <${tag}>`);
      }
      assert.doesNotMatch(html, /<\/?(details|summary)/, s.id);
    }
  });
  it('sans ouvrir le bloc, aucune adresse IP ni aucun port ne sort de nulle part : chacun est présenté dans l\'essentiel d\'une étape précédente', () => {
    const known = new Set(cited(data.STEPS[1].body)); // l'étape 2, où le trajet commence, présente les adresses et les ports
    for (const s of data.STEPS.slice(2)) {
      for (const n of cited(s.body)) assert.ok(known.has(n), `${s.id} : ${n} n'est présenté dans aucun essentiel avant`);
    }
    for (const v of [data.IP.pc, data.IP.srv, data.IP.boxW, '52344', '443', '40001']) assert.ok(known.has(v), v);
  });
  it('une adresse MAC citée dans l\'essentiel dit à quel appareil elle appartient', () => {
    for (const s of data.STEPS) {
      for (const m of text(s.body).match(MACS) || []) assert.match(text(s.body), new RegExp(`${m}, (la MAC|celle) d`), `${s.id} : ${m}`);
    }
  });
  it('les commandes à essayer dans le jeu existent dans l\'invite de commandes, et nslookup y trouve la même adresse', () => {
    const cmds = data.STEPS.flatMap(s => [...(s.more || '').matchAll(/<code>([a-z]+(?: [^<]*)?)<\/code>/g)].map(m => m[1]));
    assert.deepEqual(cmds, ['nslookup exemple.fr', 'tracert']);
    const w = { st: net.freshState(data.OK_CFG), home: data.HOME, now: new Date('2026-10-08T09:00:00') };
    for (const c of cmds) assert.doesNotMatch(term.run(c, w).lines.join('\n'), /n'est pas reconnu/, c);
    assert.ok(term.run('nslookup exemple.fr', w).lines.some(l => l.includes(data.IP.srv)));
  });
});
