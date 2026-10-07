/* Le Voyage du Paquet : logique réseau pure, sans affichage.
   Calculs d'adresses IPv4, configuration réellement utilisée par le PC (DHCP ou manuelle),
   diagnostic d'une configuration IP, simulation d'un test de connexion.
   Chargé par le navigateur (VDP.net) et par Node pour les tests (module.exports, en fin de fichier).
   Copyright (c) 2026 anotherj4ck. Code sous licence MIT : voir LICENSE.
   Les textes pédagogiques qu'il contient relèvent de LICENSE-CONTENU (tous droits réservés). */
var VDP = (typeof window !== 'undefined' && window.VDP) || {};

VDP.net = (function () {
'use strict';

const FIELDS = ['ip', 'mask', 'gw', 'dns']; // les champs d'une configuration IP manuelle

const ipInt = a => a.split('.').reduce((n, x) => ((n << 8) + Number(x)) >>> 0, 0);
const intIp = n => [24, 16, 8, 0].map(b => (n >>> b) & 255).join('.');
const isIp = s => /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(String(s));
const sameNet = (a, b, mask) => ((ipInt(a) & ipInt(mask)) >>> 0) === ((ipInt(b) & ipInt(mask)) >>> 0);
function netRange(c) {
  const m = ipInt(c.mask), net = (ipInt(c.ip) & m) >>> 0, bc = (net | (~m >>> 0)) >>> 0;
  return [intIp(net), intIp(bc)];
}
function rangeText(c) {
  const [a, b] = netRange(c), pa = a.split('.'), pb = b.split('.');
  return pa.slice(0, 3).join('.') === pb.slice(0, 3).join('.') ? `${a} à .${pb[3]}` : `${a} à ${b}`;
}
// Adresses utilisables : toutes sauf la première (adresse du réseau) et la dernière (diffusion)
function usableText(c) {
  const [a, b] = netRange(c).map(ipInt);
  if (b - a < 2) return 'aucune';
  const f = intIp(a + 1), l = intIp(b - 1), pf = f.split('.'), pl = l.split('.');
  return pf.slice(0, 3).join('.') === pl.slice(0, 3).join('.') ? `.${pf[3]} à .${pl[3]}` : `${f} à ${l}`;
}
const netText = c => `${rangeText(c)} (utilisables : ${usableText(c)})`;

// Adresse de secours (APIPA) qu'un PC se donne quand aucun serveur DHCP ne répond :
// 169.254.x.y, tirée ici des deux derniers octets de sa carte réseau
function apipaFor(mac) {
  const b = String(mac).split(/[:-]/).map(h => parseInt(h, 16));
  return `169.254.${Math.min(254, Math.max(1, b[4]))}.${b[5]}`;
}

// Configuration réellement utilisée par le PC, selon son mode d'adressage.
// st.pc : { mode: 'dhcp' ou 'manuel', lease (bail DHCP en cours ?), ip, mask, gw, dns }
// home : le réseau de référence (data.js) : lease (ce que donne le DHCP de la box), pcMac…
function pcConfig(st, home) {
  const p = st.pc;
  if (p.mode === 'dhcp') {
    if (p.lease) return { ...home.lease, dhcp: true };
    return { ip: apipaFor(home.pcMac), mask: '255.255.0.0', gw: '', dns: '', dhcp: true, apipa: true };
  }
  return { ip: p.ip, mask: p.mask, gw: p.gw, dns: p.dns, dhcp: false };
}

// Ce qui empêche une configuration de sortir du réseau (null si elle est correcte).
// boxIp : adresse de la box sur le LAN ; devices : les appareils du LAN { adresse: 'la console', … }
function configProblem(c, boxIp, devices = {}) {
  const owner = c.ip === boxIp ? 'la box' : devices[c.ip];
  if (owner) return `Conflit d'adresses : ${c.ip} est déjà utilisée par ${owner}.`;
  if (c.gw === c.ip) return `La passerelle indiquée (${c.gw}) est l'adresse du PC lui-même.`;
  if (!sameNet(c.ip, c.gw, c.mask)) {
    return `La passerelle ${c.gw} n'est pas dans le réseau du PC (${rangeText(c)}, utilisables : ${usableText(c)}) : il ne sait pas comment la joindre, le paquet ne part pas.`;
  }
  return null;
}

// État de la maison quand tout marche ; pcCfg : la configuration du PC (en DHCP, avec un bail)
const freshState = pcCfg => ({ pcCable: true, switchOn: true, fiberOk: true, boxDhcp: true, boxDns: true, pc: { ...pcCfg } });
// Nombre de pannes d'un état. Un PC en adresse fixe n'est pas en panne si ses valeurs sont les bonnes (pcCfg) ;
// un PC en DHCP sans bail n'est en panne que si le serveur DHCP marche (sinon c'est la box qui est en panne).
const faultsOf = (st, pcCfg) => (st.pcCable ? 0 : 1) + (st.switchOn ? 0 : 1) + (st.fiberOk ? 0 : 1)
  + (st.boxDhcp === false ? 1 : 0) + (st.boxDns === false ? 1 : 0)
  + (st.pc.mode === 'dhcp' ? (st.boxDhcp !== false && !st.pc.lease ? 1 : 0) : FIELDS.filter(k => st.pc[k] !== pcCfg[k]).length);

// Le PC (ou le portable) demande l'adresse de exemple.fr à son serveur DNS : null si la réponse arrive
function dnsProblem(st, cfg, home, from) {
  const who = from === 'pc' ? 'le PC' : 'le portable', d = cfg.dns;
  const ask = `Pour traduire exemple.fr en adresse IP, ${who} interroge le serveur DNS ${d}.`;
  if (!d) return { stop: from, dns: true, msg: `${who === 'le PC' ? 'Le PC' : 'Le portable'} n'a aucun serveur DNS : impossible de traduire exemple.fr en adresse IP.` };
  if (d === home.boxIp) return st.boxDns ? null : { stop: 'box', dns: true, msg: `${ask} La box reçoit la question, mais son relais DNS ne répond plus.` };
  if ((home.dnsServers || []).includes(d)) return null;
  if (sameNet(d, cfg.ip, cfg.mask)) {
    const owner = (home.devices || {})[d];
    return owner
      ? { stop: 'sw', dns: true, msg: `${ask} Mais ${d} est ${owner}, pas un serveur DNS : la question reste sans réponse.` }
      : { stop: 'sw', arp: d, dns: true, msg: `${ask} Il demande à tout le réseau « Qui a ${d} ? » : personne ne répond, cette adresse n'existe pas.` };
  }
  return { stop: 'r2', dns: true, msg: `${ask} La question part sur Internet, mais aucune réponse ne revient : ce serveur ne répond pas.` };
}

// Où s'arrête le test « ouvrir exemple.fr » ? Le nom est d'abord traduit en adresse (DNS), puis un paquet part.
// st : état de la maison ; from : 'pc' ou 'laptop' ; home : le réseau de référence (data.js)
function simulate(st, from, home) {
  // Sans lien physique (câble débranché, ou switch éteint en face), la carte voit « média déconnecté » : rien ne part
  if ((from === 'pc' && !st.pcCable) || !st.switchOn) {
    return { stop: from, msg: `Le paquet ne quitte même pas ${from === 'pc' ? 'le PC' : 'le portable'} : la carte réseau signale « câble réseau débranché » (média déconnecté).` };
  }
  const cfg = from === 'pc' ? pcConfig(st, home) : home.laptop;
  // Pas de réponse du DHCP : le PC s'est donné une adresse de secours, qui ne permet pas de sortir
  if (cfg.apipa) {
    return { stop: from, msg: st.boxDhcp
      ? `Le serveur DHCP répond de nouveau, mais le PC est toujours en ${cfg.ip} : il n'a pas encore redemandé d'adresse.`
      : `Le PC n'a pas d'adresse utilisable : le serveur DHCP n'a pas répondu, alors il s'est donné ${cfg.ip}, une adresse de secours (APIPA) qui ne permet pas de sortir.` };
  }
  const pb = from === 'pc' ? configProblem(cfg, home.boxIp, home.devices) : null;
  if (pb) return { stop: 'pc', msg: pb };
  if (cfg.gw !== home.boxIp) return { stop: 'sw', arp: cfg.gw, msg: `Pour sortir, le PC cherche sa passerelle et demande à tout le réseau « Qui a ${cfg.gw} ? ». Personne ne répond : aucun appareil n'a cette adresse.` };
  if (!st.fiberOk) return { stop: 'box', msg: "La box reçoit le paquet mais ne peut pas l'envoyer sur Internet : la fibre ne reçoit aucun signal." };
  return dnsProblem(st, cfg, home, from) || { ok: true };
}

return { FIELDS, ipInt, intIp, isIp, sameNet, netRange, rangeText, usableText, netText, apipaFor, pcConfig, configProblem, freshState, faultsOf, simulate };
}());

if (typeof module !== 'undefined') module.exports = VDP.net;
