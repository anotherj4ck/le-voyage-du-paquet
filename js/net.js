/* Le Voyage du Paquet : logique réseau pure, sans affichage.
   Calculs d'adresses IPv4, diagnostic d'une configuration IP, simulation d'un test de connexion.
   Chargé par le navigateur (VDP.net) et par Node pour les tests (module.exports, en fin de fichier).
   Copyright (c) 2026 anotherj4ck. Code sous licence MIT : voir LICENSE.
   Les textes pédagogiques qu'il contient relèvent de LICENSE-CONTENU (tous droits réservés). */
var VDP = (typeof window !== 'undefined' && window.VDP) || {};

VDP.net = (function () {
'use strict';

const FIELDS = ['ip', 'mask', 'gw']; // les champs d'une configuration IP

const ipInt = a => a.split('.').reduce((n, x) => ((n << 8) + Number(x)) >>> 0, 0);
const intIp = n => [24, 16, 8, 0].map(b => (n >>> b) & 255).join('.');
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

// Ce qui empêche une configuration de sortir du réseau (null si elle est correcte) ; boxIp : adresse de la box sur le LAN
function configProblem(c, boxIp) {
  if (c.ip === boxIp) return `Conflit d'adresses : ${boxIp} est déjà utilisée par la box.`;
  if (c.gw === c.ip) return `La passerelle indiquée (${c.gw}) est l'adresse du PC lui-même.`;
  const m = ipInt(c.mask);
  if (((ipInt(c.ip) & m) >>> 0) !== ((ipInt(c.gw) & m) >>> 0)) {
    return `La passerelle ${c.gw} n'est pas dans le réseau du PC (${rangeText(c)}, utilisables : ${usableText(c)}) : il ne sait pas comment la joindre, le paquet ne part pas.`;
  }
  return null;
}

// État de la maison quand tout marche ; pcCfg : la bonne configuration du PC
const freshState = pcCfg => ({ pcCable: true, switchOn: true, fiberOk: true, pc: { ...pcCfg } });
// Nombre de pannes d'un état, par rapport à la bonne configuration du PC
const faultsOf = (st, pcCfg) => (st.pcCable ? 0 : 1) + (st.switchOn ? 0 : 1) + (st.fiberOk ? 0 : 1) + FIELDS.filter(k => st.pc[k] !== pcCfg[k]).length;

// Où s'arrête un paquet de test envoyé vers Internet ?
// st : état de la maison ; from : 'pc' ou 'laptop' ; ref : { boxIp, laptop } (adresse de la box, configuration du portable)
function simulate(st, from, ref) {
  const cfg = from === 'pc' ? st.pc : ref.laptop;
  // Sans lien physique (câble débranché, ou switch éteint en face), la carte voit « média déconnecté » : rien ne part
  if ((from === 'pc' && !st.pcCable) || !st.switchOn) {
    return { stop: from, msg: `Le paquet ne quitte même pas ${from === 'pc' ? 'le PC' : 'le portable'} : la carte réseau signale « câble réseau débranché » (média déconnecté).` };
  }
  const pb = from === 'pc' ? configProblem(cfg, ref.boxIp) : null;
  if (pb) return { stop: 'pc', msg: pb };
  if (cfg.gw !== ref.boxIp) return { stop: 'sw', arp: cfg.gw, msg: `Pour sortir, le PC cherche sa passerelle et demande à tout le réseau « Qui a ${cfg.gw} ? ». Personne ne répond : aucun appareil n'a cette adresse.` };
  if (!st.fiberOk) return { stop: 'box', msg: "La box reçoit le paquet mais ne peut pas l'envoyer sur Internet : la fibre ne reçoit aucun signal." };
  return { ok: true };
}

return { FIELDS, ipInt, intIp, netRange, rangeText, usableText, netText, configProblem, freshState, faultsOf, simulate };
}());

if (typeof module !== 'undefined') module.exports = VDP.net;
