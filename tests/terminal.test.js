/* Le Voyage du Paquet : tests de l'invite de commandes simulée (js/terminal.js).
   Analyse des commandes, et sorties cohérentes avec l'état de la maison, panne par panne.
   Copyright (c) 2026 anotherj4ck. Code sous licence MIT : voir LICENSE. */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const net = require('../js/net.js');
const data = require('../js/data.js');
const term = require('../js/terminal.js');

const NOW = new Date('2026-10-07T09:30:00');
const home = change => Object.assign(net.freshState(data.OK_CFG), change);   // la maison, avec une panne éventuelle
const ticket = id => { const st = home({}); data.TICKETS.find(t => t.id === id).apply(st); return st; };
const out = (cmd, st = home({})) => term.run(cmd, { st, home: data.HOME, now: NOW });
const text = (cmd, st) => out(cmd, st).lines.join('\n');

describe('Analyse de la ligne de commande', () => {
  it('nom de la commande en minuscules, arguments séparés, espaces en trop ignorés', () => {
    assert.deepEqual(term.parse('  PING   exemple.fr  '), { cmd: 'ping', name: 'PING', args: ['exemple.fr'] });
    assert.deepEqual(term.parse('ipconfig.exe /all'), { cmd: 'ipconfig', name: 'ipconfig.exe', args: ['/all'] });
    assert.deepEqual(term.parse(''), { cmd: '', name: '', args: [] });
  });
  it('commande inconnue : le message de Windows, avec le mot tapé', () => {
    assert.deepEqual(out('dir').lines, ["'dir' n'est pas reconnu en tant que commande interne", 'ou externe, un programme exécutable ou un fichier de commandes.']);
  });
  it('help liste les commandes ; cls et clear effacent l\'écran', () => {
    for (const c of ['ipconfig', 'ping', 'nslookup', 'tracert']) assert.match(text('help'), new RegExp(c));
    assert.equal(out('clear').clear, true);
    assert.equal(out('cls').clear, true);
  });
  it('les options de ping sont sautées pour trouver la cible', () => {
    assert.match(text('ping -n 4 192.168.1.1'), /Réponse de 192\.168\.1\.1/);
  });
  it('sans cible : une ligne d\'utilisation', () => {
    assert.match(text('ping'), /Utilisation : ping/);
    assert.match(text('tracert'), /Utilisation : tracert/);
  });
  it('la saisie reste du texte brut : une balise HTML tapée revient telle quelle, en chaîne', () => {
    const r = out('<img src=x onerror=alert(1)>');
    assert.ok(r.lines.every(l => typeof l === 'string'));
    assert.match(r.lines[0], /^'<img' n'est pas reconnu/);
  });
});

describe('ipconfig', () => {
  it('maison normale : adresse donnée par la box, passerelle 192.168.1.1', () => {
    const t = text('ipconfig');
    assert.match(t, /Carte Ethernet Ethernet :/);
    assert.match(t, /Adresse IPv4\. \. \. \. \. \. \. \. \. \. \. \. \. \.: 192\.168\.1\.10\n/);
    assert.match(t, /Passerelle par défaut\. \. \. \. \. \. \. \. \. : 192\.168\.1\.1$/);
  });
  it('câble débranché ou switch éteint : média déconnecté', () => {
    assert.match(text('ipconfig', home({ pcCable: false })), /Statut du média\. \. .*: Média déconnecté/);
    assert.match(text('ipconfig', home({ switchOn: false })), /Média déconnecté/);
  });
  it('ticket DHCP : adresse d\'autoconfiguration en 169.254, masque 255.255.0.0, pas de passerelle', () => {
    const t = text('ipconfig', ticket('dhcp'));
    assert.match(t, /Adresse IPv4 d'autoconfiguration \. \. \. : 169\.254\.161\.126/);
    assert.match(t, /Masque de sous-réseau\. \. \. \. \. \. \. \. \. : 255\.255\.0\.0/);
    assert.match(t, /Passerelle par défaut\. \. \. \. \. \. \. \. \. :$/m);
  });
  it('ticket conflit : l\'adresse est marquée (Dupliqué)', () => {
    assert.match(text('ipconfig', ticket('conflit')), /: 192\.168\.1\.12\(Dupliqué\)/);
  });
  it('ipconfig /all : nom du PC, adresse physique, DHCP, bail, serveurs DHCP et DNS', () => {
    const t = text('ipconfig /all');
    for (const re of [/Nom de l'hôte .*: PC-FIXE/, /Adresse physique .*: 3C-52-82-4F-A1-7E/, /DHCP activé.*: Oui/,
      /Bail obtenu.*: mercredi 7 octobre 2026/, /Serveur DHCP .*: 192\.168\.1\.1/, /Serveurs DNS.*: 192\.168\.1\.1/, /192\.168\.1\.10\(préféré\)/]) assert.match(t, re);
  });
  it('ipconfig /all en adresse fixe : DHCP désactivé, serveur DNS choisi à la main', () => {
    const t = text('ipconfig /all', ticket('dns'));
    assert.match(t, /DHCP activé.*: Non/);
    assert.match(t, /Serveurs DNS.*: 203\.0\.113\.53/);
  });
  it('ipconfig /renew : échec tant que le DHCP est coupé, puis nouvelle adresse', () => {
    const st = ticket('dhcp');
    assert.match(text('ipconfig /renew', st), /impossible de contacter votre serveur DHCP/);
    assert.equal(out('ipconfig /renew', st).renew, undefined);
    st.boxDhcp = true;
    const r = out('ipconfig /renew', st);
    assert.equal(r.renew, true);
    assert.match(r.lines.join('\n'), /Adresse IPv4.*: 192\.168\.1\.10/);
  });
  it('ipconfig /renew, câble débranché ou switch éteint : le message relevé sur Windows 11, coupé après « lorsque »', () => {
    for (const st of [home({ pcCable: false }), home({ switchOn: false })]) {
      const r = out('ipconfig /renew', st);
      assert.deepEqual(r.lines, ['', 'Configuration IP de Windows', '', 'Aucune opération ne peut être effectuée sur Ethernet lorsque', 'son média est déconnecté.']);
      assert.equal(r.renew, undefined);
    }
  });
  it('le message d\'une carte désactivée n\'apparaît dans aucun ticket', () => {
    for (const t of data.TICKETS) {
      for (const cmd of ['ipconfig', 'ipconfig /all', 'ipconfig /renew', 'ping 203.0.113.10', 'tracert 203.0.113.10']) {
        assert.doesNotMatch(text(cmd, ticket(t.id)), /aucun adaptateur|état autorisé/, `${t.id} : ${cmd}`);
      }
    }
  });
});

describe('ping', () => {
  it('la box répond tout de suite (TTL 64), le serveur en 14 ms avec un TTL de 60', () => {
    assert.match(text('ping 192.168.1.1'), /Réponse de 192\.168\.1\.1 : octets=32 temps<1ms TTL=64/);
    const t = text('ping exemple.fr');
    assert.match(t, /Envoi d’une requête 'ping' sur exemple\.fr \[203\.0\.113\.10\] avec 32 octets de données :/);
    assert.match(t, /temps=14 ms TTL=60/);
    assert.match(t, /envoyés = 4, reçus = 4, perdus = 0 \(perte 0%\)/);
  });
  it('ticket DNS : l\'adresse IP répond, le nom ne se traduit pas', () => {
    const st = ticket('dns');
    assert.match(text('ping 203.0.113.10', st), /reçus = 4, perdus = 0/);
    assert.match(text('ping exemple.fr', st), /La requête Ping n'a pas pu trouver l'hôte exemple\.fr\. Vérifiez le nom et essayez à nouveau\./);
  });
  it('mauvaise passerelle : le PC répond lui-même « Impossible de joindre l\'hôte de destination »', () => {
    const t = text('ping 203.0.113.10', ticket('gw'));
    assert.match(t, /Réponse de 192\.168\.1\.10 : Impossible de joindre l'hôte de destination\./);
    assert.match(t, /reçus = 4, perdus = 0/); // particularité de Windows : ces réponses d'erreur comptent comme reçues
  });
  it('mauvaise passerelle : la box, voisine directe, répond quand même', () => {
    assert.match(text('ping 192.168.1.1', ticket('gw')), /Réponse de 192\.168\.1\.1 : octets=32/);
  });
  it('masque trop étroit : la box n\'est plus joignable, le portable (dans la plage) si', () => {
    const st = ticket('mask');
    assert.match(text('ping 192.168.1.1', st), /PING : échec de la transmission\. Défaillance générale\./);
    assert.match(text('ping 192.168.1.11', st), /Réponse de 192\.168\.1\.11 : octets=32 temps<1ms TTL=128/);
  });
  it('switch éteint : défaillance générale, mais la boucle locale 127.0.0.1 répond', () => {
    const st = home({ switchOn: false });
    assert.match(text('ping 192.168.1.1', st), /envoyés = 4, reçus = 0, perdus = 4 \(perte 100%\)/);
    assert.match(text('ping 127.0.0.1', st), /Réponse de 127\.0\.0\.1/);
  });
  it('fibre coupée : la box répond, Internet non (délai dépassé)', () => {
    const st = home({ fiberOk: false });
    assert.match(text('ping 192.168.1.1', st), /reçus = 4/);
    assert.match(text('ping 203.0.113.10', st), /Délai d'attente de la demande dépassé\./);
  });
  it('adresse du réseau qui n\'existe pas : hôte injoignable', () => {
    assert.match(text('ping 192.168.1.77'), /Impossible de joindre l'hôte de destination/);
  });
});

describe('nslookup', () => {
  it('maison normale : réponse de la box', () => {
    assert.deepEqual(out('nslookup exemple.fr').lines, ['Serveur :   UnKnown', 'Address:  192.168.1.1', '', 'Réponse ne faisant pas autorité :', 'Nom :    exemple.fr', 'Address:  203.0.113.10']);
  });
  it('ticket DNS : délai dépassé avec le serveur choisi à la main', () => {
    const t = text('nslookup exemple.fr', ticket('dns'));
    assert.match(t, /^DNS request timed out\./);
    assert.match(t, /Address:  203\.0\.113\.53/);
    assert.match(t, /\*\*\* Le délai de la requête sur UnKnown est dépassé\.$/);
  });
  it('relais DNS de la box en panne : « Server failed »', () => {
    assert.match(text('nslookup exemple.fr', home({ boxDns: false })), /ne parvient pas à trouver exemple\.fr : Server failed/);
  });
  it('nom inconnu : « Non-existent domain »', () => {
    assert.match(text('nslookup inconnu.fr'), /ne parvient pas à trouver inconnu\.fr : Non-existent domain/);
  });
  it('le DNS du FAI, mis à la main, répond aussi', () => {
    const st = home({}); Object.assign(st.pc, { mode: 'manuel', dns: '198.51.100.53' });
    assert.match(text('nslookup exemple.fr', st), /Address:  203\.0\.113\.10$/);
  });
});

describe('tracert', () => {
  it('maison normale : box, FAI, Paris, Amsterdam, serveur', () => {
    const r = out('tracert exemple.fr').lines;
    assert.equal(r[1], 'Détermination de l’itinéraire vers exemple.fr [203.0.113.10]');
    assert.equal(r[2], 'avec un maximum de 30 sauts :');
    const hops = r.filter(l => /^ {0,2}\d+ /.test(l)).map(l => l.trim().split(/\s+/).pop());
    assert.deepEqual(hops, ['192.168.1.1', '198.51.100.1', '192.0.2.10', '192.0.2.20', '203.0.113.10']);
    assert.equal(r.at(-1), 'Itinéraire déterminé.');
  });
  it('format des lignes : numéro, trois mesures, hôte ; vers une adresse IP, l\'en-tête tient sur une ligne', () => {
    const r = out('tracert 203.0.113.10').lines;
    assert.equal(r[1], 'Détermination de l’itinéraire vers 203.0.113.10 avec un maximum de 30 sauts.');
    assert.equal(r[2], '');
    assert.ok(r.includes('  1    <1 ms    <1 ms    <1 ms  192.168.1.1'));
  });
  it('câble débranché ou switch éteint : la sortie relevée sur Windows 11, code 1231', () => {
    const relevé = ['', 'Détermination de l’itinéraire vers 203.0.113.10 avec un maximum de 30 sauts.', '', '  1  Erreur de transmission : code 1231', '', 'Itinéraire déterminé.'];
    assert.deepEqual(out('tracert 203.0.113.10', home({ pcCable: false })).lines, relevé);
    assert.deepEqual(out('tracert 203.0.113.10', home({ switchOn: false })).lines, relevé);
  });
  it('sans adresse utilisable (APIPA, adresse en double, masque qui exclut la passerelle) : même code 1231, par déduction', () => {
    for (const id of ['dhcp', 'conflit', 'mask']) {
      const r = out('tracert 203.0.113.10', ticket(id)).lines;
      assert.equal(r[3], '  1  Erreur de transmission : code 1231', id);
      assert.equal(r.at(-1), 'Itinéraire déterminé.', id);
    }
    assert.doesNotMatch(text('tracert 203.0.113.10', home({ pcCable: false })), /pilote IP/);
  });
  it('fibre coupée : la box répond, puis plus rien jusqu\'au 30e saut', () => {
    const r = out('tracert 203.0.113.10', home({ fiberOk: false })).lines;
    assert.ok(r.includes("  2     *        *        *     Délai d'attente de la demande dépassé."));
    assert.ok(r.some(l => l.startsWith(' 30 ')));
  });
  it('ticket DNS : impossible de résoudre le nom, mais l\'adresse se trace', () => {
    const st = ticket('dns');
    assert.match(text('tracert exemple.fr', st), /Impossible de résoudre le nom du système cible exemple\.fr\./);
    assert.match(text('tracert 203.0.113.10', st), /Itinéraire déterminé\./);
  });
  it('mauvaise passerelle : le PC signale l\'hôte injoignable', () => {
    assert.match(text('tracert 203.0.113.10', ticket('gw')), /PC-FIXE \[192\.168\.1\.10\]  rapports : Impossible de joindre l'hôte de destination\./);
  });
});
