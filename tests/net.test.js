/* Le Voyage du Paquet : tests unitaires de la logique réseau (js/net.js).
   Lanceur intégré de Node (node:test, node:assert), aucune dépendance. Lancer : npm test
   Copyright (c) 2026 anotherj4ck. Code sous licence MIT : voir LICENSE. */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const net = require('../js/net.js');

// Le réseau de la maison, comme dans la scène : la box en 192.168.1.1 (passerelle et DNS), le PC en .10, le portable en .11
const BOX = '192.168.1.1';
const PC_OK = { ip: '192.168.1.10', mask: '255.255.255.0', gw: BOX, dns: BOX }; // adresse fixe correcte
const REF = { boxIp: BOX, laptop: { ip: '192.168.1.11', mask: '255.255.255.0', gw: BOX, dns: BOX } };
const pc = change => ({ ...PC_OK, ...change });                     // configuration du PC modifiée
const home = change => Object.assign(net.freshState(PC_OK), change); // état de la maison modifié

describe('netRange : première et dernière adresse du réseau', () => {
  it('/24 (255.255.255.0) : de 192.168.1.0 à 192.168.1.255', () => {
    assert.deepEqual(net.netRange(pc({ mask: '255.255.255.0' })), ['192.168.1.0', '192.168.1.255']);
  });
  it('/29 (255.255.255.248) : de 192.168.1.8 à 192.168.1.15', () => {
    assert.deepEqual(net.netRange(pc({ mask: '255.255.255.248' })), ['192.168.1.8', '192.168.1.15']);
  });
  it('/30 (255.255.255.252) : de 192.168.1.8 à 192.168.1.11', () => {
    assert.deepEqual(net.netRange(pc({ mask: '255.255.255.252' })), ['192.168.1.8', '192.168.1.11']);
  });
  it('/16 : la plage déborde sur le troisième octet', () => {
    assert.deepEqual(net.netRange({ ip: '10.1.2.3', mask: '255.255.0.0' }), ['10.1.0.0', '10.1.255.255']);
  });
});

describe('Plages affichées dans le jeu, avec les adresses utilisables', () => {
  it('/24 : utilisables de .1 à .254', () => {
    assert.equal(net.netText(PC_OK), '192.168.1.0 à .255 (utilisables : .1 à .254)');
  });
  it('/29 : utilisables de .9 à .14 (sans l\'adresse du réseau ni celle de diffusion)', () => {
    assert.equal(net.netText(pc({ mask: '255.255.255.248' })), '192.168.1.8 à .15 (utilisables : .9 à .14)');
  });
  it('/30 : seulement deux adresses utilisables', () => {
    assert.equal(net.usableText(pc({ mask: '255.255.255.252' })), '.9 à .10');
  });
  it('/31 et /32 : aucune adresse utilisable', () => {
    assert.equal(net.usableText(pc({ mask: '255.255.255.254' })), 'aucune');
    assert.equal(net.usableText(pc({ mask: '255.255.255.255' })), 'aucune');
  });
});

describe('configProblem : ce qui empêche le PC de sortir de son réseau', () => {
  it('configuration correcte : aucun problème', () => {
    assert.equal(net.configProblem(PC_OK, BOX), null);
  });
  it('IP hors du réseau de la box (192.168.2.10)', () => {
    assert.match(net.configProblem(pc({ ip: '192.168.2.10' }), BOX),
      /^La passerelle 192\.168\.1\.1 n'est pas dans le réseau du PC \(192\.168\.2\.0 à \.255, utilisables : \.1 à \.254\)/);
  });
  it('masque trop étroit (/29) : la box se retrouve hors réseau', () => {
    assert.match(net.configProblem(pc({ mask: '255.255.255.248' }), BOX),
      /n'est pas dans le réseau du PC \(192\.168\.1\.8 à \.15, utilisables : \.9 à \.14\)/);
  });
  it('passerelle = l\'adresse du PC lui-même', () => {
    assert.equal(net.configProblem(pc({ gw: '192.168.1.10' }), BOX), 'La passerelle indiquée (192.168.1.10) est l\'adresse du PC lui-même.');
  });
  it('conflit d\'adresses avec la box', () => {
    assert.equal(net.configProblem(pc({ ip: BOX }), BOX), 'Conflit d\'adresses : 192.168.1.1 est déjà utilisée par la box.');
  });
  it('passerelle hors du réseau (10.0.0.1)', () => {
    assert.match(net.configProblem(pc({ gw: '10.0.0.1' }), BOX), /^La passerelle 10\.0\.0\.1 n'est pas dans le réseau du PC/);
  });
  it('passerelle dans le réseau mais qui n\'existe pas : la configuration seule ne le voit pas', () => {
    assert.equal(net.configProblem(pc({ gw: '192.168.1.254' }), BOX), null);
  });
});

describe('simulate : où s\'arrête le test de connexion, panne par panne', () => {
  it('sans panne : le test passe, depuis le PC comme depuis le portable', () => {
    assert.deepEqual(net.simulate(home({}), 'pc', REF), { ok: true });
    assert.deepEqual(net.simulate(home({}), 'laptop', REF), { ok: true });
  });
  it('câble du PC débranché : arrêt au PC (média déconnecté), le portable marche', () => {
    const st = home({ pcCable: false });
    const r = net.simulate(st, 'pc', REF);
    assert.equal(r.stop, 'pc');
    assert.match(r.msg, /câble réseau débranché.*média déconnecté/);
    assert.deepEqual(net.simulate(st, 'laptop', REF), { ok: true });
  });
  it('switch éteint : chaque appareil voit « média déconnecté » et rien ne part', () => {
    const st = home({ switchOn: false });
    assert.equal(net.simulate(st, 'pc', REF).stop, 'pc');
    const r = net.simulate(st, 'laptop', REF);
    assert.equal(r.stop, 'laptop');
    assert.match(r.msg, /ne quitte même pas le portable.*média déconnecté/);
  });
  it('fibre coupée : arrêt à la box, pour tous les appareils', () => {
    const st = home({ fiberOk: false });
    assert.equal(net.simulate(st, 'pc', REF).stop, 'box');
    assert.equal(net.simulate(st, 'laptop', REF).stop, 'box');
  });
  it('IP du PC hors réseau : arrêt au PC, le portable marche', () => {
    const st = home({ pc: pc({ ip: '192.168.2.10' }) });
    const r = net.simulate(st, 'pc', REF);
    assert.equal(r.stop, 'pc');
    assert.equal(r.msg, net.configProblem(st.pc, BOX));
    assert.deepEqual(net.simulate(st, 'laptop', REF), { ok: true });
  });
  it('masque trop étroit : arrêt au PC', () => {
    assert.equal(net.simulate(home({ pc: pc({ mask: '255.255.255.252' }) }), 'pc', REF).stop, 'pc');
  });
  it('mauvaise passerelle : « Qui a 192.168.1.254 ? » sans réponse, arrêt au switch', () => {
    const r = net.simulate(home({ pc: pc({ gw: '192.168.1.254' }) }), 'pc', REF);
    assert.equal(r.stop, 'sw');
    assert.equal(r.arp, '192.168.1.254');
    assert.match(r.msg, /Qui a 192\.168\.1\.254 \?/);
  });
  it('panne physique et panne de configuration ensemble : la couche 1 passe en premier', () => {
    const r = net.simulate(home({ pcCable: false, pc: pc({ ip: '192.168.2.10' }) }), 'pc', REF);
    assert.match(r.msg, /câble réseau débranché/);
  });
});

// Réseau de référence complet : ce que donne le DHCP de la box, appareils du LAN, DNS du FAI, carte du PC
const HOME = {
  ...REF,
  lease: { ip: '192.168.1.10', mask: '255.255.255.0', gw: BOX, dns: BOX },
  devices: { '192.168.1.11': 'le portable', '192.168.1.12': 'la console' },
  dnsServers: ['198.51.100.53'],
  pcMac: '3c:52:82:4f:a1:7e',
};
const DHCP_PC = { mode: 'dhcp', lease: true, ...PC_OK };                     // le PC comme à la maison : en DHCP, avec un bail
const dhcpHome = change => Object.assign(net.freshState(DHCP_PC), change);
const manual = change => dhcpHome({ pc: { ...DHCP_PC, mode: 'manuel', ...change } });

describe('Adressage DHCP et adresse de secours (APIPA)', () => {
  it('l\'adresse APIPA est en 169.254, tirée de la carte réseau', () => {
    assert.equal(net.apipaFor('3c:52:82:4f:a1:7e'), '169.254.161.126');
    assert.equal(net.apipaFor('3C-52-82-4F-A1-7E'), '169.254.161.126');
  });
  it('PC en DHCP avec un bail : il utilise l\'adresse donnée par la box, le test passe', () => {
    assert.equal(net.pcConfig(dhcpHome({}), HOME).ip, '192.168.1.10');
    assert.deepEqual(net.simulate(dhcpHome({}), 'pc', HOME), { ok: true });
  });
  it('serveur DHCP coupé, PC sans bail : adresse 169.254 sans passerelle, arrêt au PC ; le portable garde son bail', () => {
    const st = dhcpHome({ boxDhcp: false, pc: { ...DHCP_PC, lease: false } });
    const c = net.pcConfig(st, HOME);
    assert.deepEqual([c.ip, c.mask, c.gw, c.apipa], ['169.254.161.126', '255.255.0.0', '', true]);
    const r = net.simulate(st, 'pc', HOME);
    assert.equal(r.stop, 'pc');
    assert.match(r.msg, /serveur DHCP n'a pas répondu.*169\.254\.161\.126.*APIPA/);
    assert.deepEqual(net.simulate(st, 'laptop', HOME), { ok: true });
  });
  it('serveur DHCP réparé mais adresse pas encore redemandée : toujours en 169.254', () => {
    const r = net.simulate(dhcpHome({ pc: { ...DHCP_PC, lease: false } }), 'pc', HOME);
    assert.match(r.msg, /toujours en 169\.254\.161\.126 : il n'a pas encore redemandé d'adresse/);
  });
  it('une seule panne : la box (DHCP coupé), ou le PC (bail à redemander)', () => {
    assert.equal(net.faultsOf(dhcpHome({ boxDhcp: false, pc: { ...DHCP_PC, lease: false } }), PC_OK), 1);
    assert.equal(net.faultsOf(dhcpHome({ pc: { ...DHCP_PC, lease: false } }), PC_OK), 1);
  });
});

describe('DNS : l\'adresse IP répond, mais le nom ne se traduit plus', () => {
  it('DNS vers une adresse du réseau qui n\'existe pas : « Qui a 192.168.1.254 ? », arrêt au switch', () => {
    const r = net.simulate(manual({ dns: '192.168.1.254' }), 'pc', HOME);
    assert.deepEqual([r.stop, r.arp, r.dns], ['sw', '192.168.1.254', true]);
  });
  it('DNS vers un serveur d\'Internet qui ne répond pas : la question se perd sur Internet ; le portable marche', () => {
    const st = manual({ dns: '203.0.113.53' });
    const r = net.simulate(st, 'pc', HOME);
    assert.deepEqual([r.stop, r.dns], ['r2', true]);
    assert.match(r.msg, /serveur DNS 203\.0\.113\.53.*aucune réponse/);
    assert.deepEqual(net.simulate(st, 'laptop', HOME), { ok: true });
  });
  it('relais DNS de la box en panne : arrêt à la box, pour le PC comme pour le portable', () => {
    const st = dhcpHome({ boxDns: false });
    assert.deepEqual([net.simulate(st, 'pc', HOME).stop, net.simulate(st, 'laptop', HOME).stop], ['box', 'box']);
    assert.equal(net.faultsOf(st, PC_OK), 1);
  });
  it('le DNS du FAI, mis à la main, fonctionne', () => {
    assert.deepEqual(net.simulate(manual({ dns: '198.51.100.53' }), 'pc', HOME), { ok: true });
  });
  it('un appareil du réseau n\'est pas un serveur DNS', () => {
    assert.match(net.simulate(manual({ dns: '192.168.1.11' }), 'pc', HOME).msg, /192\.168\.1\.11 est le portable, pas un serveur DNS/);
  });
  it('sans serveur DNS du tout : arrêt au PC', () => {
    assert.equal(net.simulate(manual({ dns: '' }), 'pc', HOME).stop, 'pc');
  });
});

describe('Conflit d\'adresses avec un autre appareil du réseau', () => {
  it('configProblem repère l\'appareil qui a déjà l\'adresse', () => {
    assert.equal(net.configProblem(pc({ ip: '192.168.1.12' }), BOX, HOME.devices), 'Conflit d\'adresses : 192.168.1.12 est déjà utilisée par la console.');
  });
  it('le PC qui prend l\'adresse de la console est arrêté ; le portable marche', () => {
    const st = manual({ ip: '192.168.1.12' });
    const r = net.simulate(st, 'pc', HOME);
    assert.equal(r.stop, 'pc');
    assert.match(r.msg, /déjà utilisée par la console/);
    assert.deepEqual(net.simulate(st, 'laptop', HOME), { ok: true });
  });
  it('une adresse fixe libre et correcte n\'est pas une panne', () => {
    assert.deepEqual(net.simulate(manual({}), 'pc', HOME), { ok: true });
    assert.equal(net.faultsOf(manual({}), PC_OK), 0);
  });
});

describe('faultsOf : nombre de pannes', () => {
  it('0 sans panne, 2 avec deux pannes', () => {
    assert.equal(net.faultsOf(home({}), PC_OK), 0);
    assert.equal(net.faultsOf(home({ fiberOk: false, pc: pc({ gw: '192.168.1.254' }) }), PC_OK), 2);
  });
});
