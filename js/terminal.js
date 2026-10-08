/* Le Voyage du Paquet : invite de commandes simulée du PC fixe (ipconfig, ping, nslookup, tracert…).
   Logique pure, sans affichage : chaque commande renvoie des lignes de texte brut, au format d'un
   Windows en français, cohérentes avec l'état simulé de la maison. Le jeu les affiche avec textContent.
   Chargé par le navigateur (VDP.term) et par Node pour les tests (module.exports, en fin de fichier).
   Copyright (c) 2026 anotherj4ck. Code sous licence MIT : voir LICENSE.
   Les textes pédagogiques qu'il contient relèvent de LICENSE-CONTENU (tous droits réservés). */
var VDP = (typeof window !== 'undefined' && window.VDP) || { net: require('./net.js') };

VDP.term = (function () {
'use strict';
const { isIp, sameNet, pcConfig } = VDP.net;

/* D'où viennent les messages de Windows reproduits ici
   1. Relevés sur un vrai Windows 11 en français, recopiés tels quels (coupures de ligne, lignes vides, apostrophes ’) :
      - ipconfig /renew, média déconnecté : « Aucune opération ne peut être effectuée sur Ethernet lorsque
        / son média est déconnecté. » (seul le nom de la carte change : celle du jeu s'appelle Ethernet) ;
      - tracert vers une adresse IP sans réseau utilisable : « Détermination de l’itinéraire vers … avec un maximum
        de 30 sauts. », puis « 1  Erreur de transmission : code 1231 », puis « Itinéraire déterminé. ».
   2. Confirmés par des sorties réelles publiées sur des forums d'entraide (espaces et apostrophes non garantis) :
      - ping qui répond : envoi, réponses, statistiques ; « Délai d'attente de la demande dépassé. » ;
      - nslookup : « Serveur :   … », « Address:  … », « Réponse ne faisant pas autorité : », « Nom :    … »,
        « DNS request timed out. », « timeout was 2 seconds. », « *** Le délai de la requête sur … est dépassé. » ;
      - tracert qui aboutit : lignes des sauts, « Itinéraire déterminé. » ;
      - ipconfig /all : libellés de l'en-tête et de la carte (Statut du média, Description, Adresse physique…).
   3. Reconstitués : formulation plausible, jamais comparée mot pour mot à une sortie réelle :
      - ipconfig /renew quand le serveur DHCP ne répond pas, et ipconfig /renew avec une adresse fixe ;
      - ipconfig : « Adresse IPv4 d'autoconfiguration », « (préféré) », « (Dupliqué) », dates du bail ;
      - ping : « PING : échec de la transmission. Défaillance générale. », « Impossible de joindre l'hôte de destination. »,
        « La requête Ping n'a pas pu trouver l'hôte … » ;
      - nslookup : sans serveur DNS joignable, « Server failed », « Non-existent domain » ;
      - tracert : en-tête vers un nom (format des forums, apostrophe ’ alignée sur le relevé), « Impossible de résoudre
        le nom du système cible … », « … rapports : Impossible de joindre l'hôte de destination. » ;
      - tracert, par déduction depuis le relevé : l'en-tête sur une ligne vers une adresse IP quand le réseau marche
        (l'Internet simulé n'a pas de noms inverses), et le code 1231 quand le PC a une adresse APIPA, une adresse
        en double ou pas de passerelle utilisable.
   Le message d'une carte désactivée n'est pas utilisé : aucun ticket ne désactive la carte. */
const NIC = 'Ethernet'; // nom de la carte réseau du PC, comme dans Windows

const PROMPT = 'C:\\Users\\Utilisateur>';
const HELP = [
  'Commandes de cette invite simulée :',
  '  ipconfig           configuration IP du PC',
  '  ipconfig /all      configuration détaillée : carte réseau, DHCP, DNS',
  '  ipconfig /renew    redemander une adresse au serveur DHCP',
  '  ping <cible>       envoyer 4 paquets de test (adresse IP ou nom)',
  "  nslookup <nom>     demander l'adresse d'un nom au serveur DNS",
  "  tracert <cible>    afficher les routeurs traversés jusqu'à la cible",
  "  cls ou clear       effacer l'écran",
  '  help               cette aide',
  '',
  'Exemples : ping 192.168.1.1   ping exemple.fr   nslookup exemple.fr   tracert 203.0.113.10',
  'Sur cet Internet simulé, un seul nom existe : exemple.fr. Les lignes IPv6 sont omises.',
  'Flèches ↑ et ↓ : commandes précédentes.',
];

// Découpe une ligne : nom de la commande (en minuscules, sans .exe) et arguments
function parse(line) {
  const words = String(line).trim().split(/\s+/).filter(Boolean);
  return { cmd: (words[0] || '').toLowerCase().replace(/\.exe$/, ''), name: words[0] || '', args: words.slice(1) };
}
// La cible d'une commande, en sautant les options (-n 4, /w 100, -t…)
function targetOf(args) {
  for (let i = 0; i < args.length; i++) {
    if (/^[-/][nlwih]$/i.test(args[i])) { i++; continue; }
    if (!/^[-/]/.test(args[i])) return args[i];
  }
  return '';
}

/* ---------- ce que voit le PC ---------- */
// Lien, configuration réellement utilisée, adresse en double, adresse utilisable ?
function self(w) {
  const { st, home } = w, c = pcConfig(st, home);
  const link = st.pcCable && st.switchOn;
  const dup = (!c.dhcp && (c.ip === home.boxIp ? 'la box' : (home.devices || {})[c.ip])) || '';
  return { link, c, dup, usable: link && !c.apipa && !dup };
}
const isPrivate = ip => /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);

// Que devient un paquet envoyé à l'adresse ip ? { ok, ms, ttl } ou { fail: 'general' | 'unreachable' | 'timeout' }
function reach(ip, w) {
  const { st, home } = w, me = self(w), c = me.c, ttl = home.ttl || {};
  if (/^127\./.test(ip)) return { ok: true, ms: 0, ttl: 128 };
  if (!me.usable) return { fail: 'general' };
  if (ip === c.ip) return { ok: true, ms: 0, ttl: 128 };
  if (sameNet(ip, c.ip, c.mask)) return ttl[ip] ? { ok: true, ms: 0, ttl: ttl[ip] } : { fail: 'unreachable' }; // voisin direct (ARP)
  if (!c.gw || c.gw === c.ip || !sameNet(c.gw, c.ip, c.mask)) return { fail: 'general' };                    // pas de passerelle utilisable
  if (c.gw !== home.boxIp) return ttl[c.gw] ? { fail: 'timeout' } : { fail: 'unreachable' };                // « passerelle » qui n'en est pas une
  if (ip === home.boxWan) return { ok: true, ms: 0, ttl: 64 };
  if (isPrivate(ip) || !st.fiberOk) return { fail: 'timeout' };
  const known = home.hops.find(h => h.ip === ip) || (ip === home.srv.ip ? home.srv : null);
  return known ? { ok: true, ms: known.ms, ttl: known.ttl } : { ok: true, ms: 18, ttl: 56 };                  // un autre hôte d'Internet
}

// Question au serveur DNS du PC : { ip } ou { fail: 'none' | 'timeout' | 'servfail' | 'nxdomain' }
function askDns(name, w) {
  const { st, home } = w, me = self(w), d = me.c.dns;
  if (!d || !me.usable) return { fail: 'none' };
  let answer = 'timeout';
  if (d === home.boxIp) { if (reach(d, w).ok) answer = !st.boxDns ? 'servfail' : st.fiberOk ? 'ok' : 'timeout'; }
  else if ((home.dnsServers || []).includes(d) && reach(d, w).ok) answer = 'ok';
  if (answer !== 'ok') return { fail: answer };
  const ip = home.names[String(name).toLowerCase().replace(/\.$/, '')];
  return ip ? { ip } : { fail: 'nxdomain' };
}
// Adresse à joindre pour ping et tracert : une adresse IP s'utilise telle quelle, un nom passe par le DNS
function resolve(target, w) {
  if (isIp(target)) return { ip: target };
  if (target.toLowerCase() === 'localhost') return { ip: '127.0.0.1' };
  return askDns(target, w);
}

/* ---------- ipconfig ---------- */
const kv = (label, value) => (label + (value || '')).trimEnd();
const LBL = {
  media: '   Statut du média. . . . . . . . . . . . : ',
  suffix: '   Suffixe DNS propre à la connexion. . . : ',
  desc: '   Description. . . . . . . . . . . . . . : ',
  mac: '   Adresse physique . . . . . . . . . . . : ',
  dhcp: '   DHCP activé. . . . . . . . . . . . . . : ',
  auto: '   Configuration automatique activée. . . : ',
  ipv4: '   Adresse IPv4. . . . . . . . . . . . . .: ',
  apipa: "   Adresse IPv4 d'autoconfiguration . . . : ",
  mask: '   Masque de sous-réseau. . . . . . . . . : ',
  got: '   Bail obtenu. . . . . . . . . . . . . . : ',
  end: '   Bail expirant. . . . . . . . . . . . . : ',
  gw: '   Passerelle par défaut. . . . . . . . . : ',
  dhcpSrv: '   Serveur DHCP . . . . . . . . . . . . . : ',
  dnsSrv: '   Serveurs DNS. . .  . . . . . . . . . . : ',
  netbios: '   NetBIOS sur Tcpip. . . . . . . . . . . : ',
};
const CARD = 'Realtek PCIe GbE Family Controller';
const frDate = d => `${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} ${d.toLocaleTimeString('fr-FR')}`;
const header = () => ['', 'Configuration IP de Windows', ''];

function ipconfigBasic(w) {
  const me = self(w), c = me.c, out = [...header(), '', `Carte Ethernet ${NIC} :`, ''];
  if (!me.link) return [...out, kv(LBL.media, 'Média déconnecté'), kv(LBL.suffix, '')];
  out.push(kv(LBL.suffix, c.dhcp && !c.apipa ? 'home' : ''));
  if (c.apipa) out.push(kv(LBL.apipa, c.ip), kv(LBL.mask, c.mask), kv(LBL.gw, ''));
  else out.push(kv(LBL.ipv4, c.ip + (me.dup ? '(Dupliqué)' : '')), kv(LBL.mask, c.mask), kv(LBL.gw, c.gw));
  return out;
}
function ipconfigAll(w) {
  const { home } = w, me = self(w), c = me.c, mac = String(home.pcMac).toUpperCase().replace(/:/g, '-');
  const leased = me.link && c.dhcp && !c.apipa;
  const out = [...header(),
    kv("   Nom de l'hôte . . . . . . . . . . : ", home.pcName),
    kv('   Suffixe DNS principal . . . . . . : ', ''),
    kv('   Type de noeud. . . . . . . . . . : ', 'Hybride'),
    kv('   Routage IP activé . . . . . . . . : ', 'Non'),
    kv('   Proxy WINS activé . . . . . . . . : ', 'Non')];
  if (leased) out.push(kv('   Liste de recherche du suffixe DNS.: ', 'home'));
  out.push('', `Carte Ethernet ${NIC} :`, '');
  if (!me.link) out.push(kv(LBL.media, 'Média déconnecté'));
  const card = [kv(LBL.desc, CARD), kv(LBL.mac, mac), kv(LBL.dhcp, c.dhcp ? 'Oui' : 'Non'), kv(LBL.auto, 'Oui')];
  out.push(kv(LBL.suffix, leased ? 'home' : ''), ...card);
  if (!me.link) return out;
  if (c.apipa) out.push(kv(LBL.apipa, c.ip + '(préféré)'), kv(LBL.mask, c.mask), kv(LBL.gw, ''));
  else {
    out.push(kv(LBL.ipv4, c.ip + (me.dup ? '(Dupliqué)' : '(préféré)')), kv(LBL.mask, c.mask));
    if (c.dhcp) { const got = new Date(w.now - 2 * 3600e3); out.push(kv(LBL.got, frDate(got)), kv(LBL.end, frDate(new Date(+got + 24 * 3600e3)))); }
    out.push(kv(LBL.gw, c.gw));
    if (c.dhcp) out.push(kv(LBL.dhcpSrv, home.boxIp));
    out.push(kv(LBL.dnsSrv, c.dns));
  }
  out.push(kv(LBL.netbios, 'Activé'));
  return out;
}
// ipconfig /renew : en DHCP, le PC redemande une adresse ; renew: true indique au jeu qu'il l'a obtenue
function renew(w) {
  const { st } = w, me = self(w);
  if (!me.link) return { lines: [...header(), `Aucune opération ne peut être effectuée sur ${NIC} lorsque`, 'son média est déconnecté.'] };
  if (st.pc.mode !== 'dhcp') return { lines: [...header(), "L'opération a échoué, car aucune carte n'est dans un état permettant cette opération."] };
  if (!st.boxDhcp) return { lines: [...header(), `Une erreur s'est produite lors du renouvellement de l'interface ${NIC} : impossible de contacter votre serveur DHCP. Le délai d'attente de la demande est dépassé.`] };
  return { lines: ipconfigBasic({ ...w, st: { ...st, pc: { ...st.pc, lease: true } } }), renew: true };
}
function ipconfig(args, w) {
  const opt = (args[0] || '').toLowerCase();
  if (!opt) return { lines: ipconfigBasic(w) };
  if (opt === '/all') return { lines: ipconfigAll(w) };
  if (opt === '/renew') return renew(w);
  return { lines: ['', `Erreur : option non reconnue : ${args[0]}`, 'Options simulées : ipconfig, ipconfig /all, ipconfig /renew'] };
}

/* ---------- ping, nslookup, tracert ---------- */
function ping(args, w) {
  const t = targetOf(args);
  if (!t) return { lines: ['', 'Utilisation : ping <adresse IP ou nom>'] };
  const r = resolve(t, w);
  if (!r.ip) return { lines: ['', `La requête Ping n'a pas pu trouver l'hôte ${t}. Vérifiez le nom et essayez à nouveau.`] };
  const ip = r.ip, res = reach(ip, w), times = [];
  const lines = ['', isIp(t) ? `Envoi d’une requête 'Ping'  ${ip} avec 32 octets de données :` : `Envoi d’une requête 'ping' sur ${t} [${ip}] avec 32 octets de données :`];
  let got = 0;
  for (let i = 0; i < 4; i++) {
    if (res.ok) {
      const ms = res.ms ? res.ms + [0, 1, 0, 2][i] : 0;
      times.push(ms); got++;
      lines.push(`Réponse de ${ip} : octets=32 ${ms ? `temps=${ms} ms` : 'temps<1ms'} TTL=${res.ttl}`);
    } else if (res.fail === 'unreachable') { got++; lines.push(`Réponse de ${self(w).c.ip} : Impossible de joindre l'hôte de destination.`); }
    else if (res.fail === 'general') lines.push('PING : échec de la transmission. Défaillance générale.');
    else lines.push("Délai d'attente de la demande dépassé.");
  }
  lines.push('', `Statistiques Ping pour ${ip}:`, `    Paquets : envoyés = 4, reçus = ${got}, perdus = ${4 - got} (perte ${(4 - got) * 25}%),`);
  if (times.length) {
    const avg = Math.floor(times.reduce((a, b) => a + b, 0) / times.length); // Windows tronque la moyenne
    lines.push('Durée approximative des boucles en millisecondes :', `    Minimum = ${Math.min(...times)}ms, Maximum = ${Math.max(...times)}ms, Moyenne = ${avg}ms`);
  }
  return { lines };
}

function nslookup(args, w) {
  const name = args.find(a => !a.startsWith('-'));
  if (!name) return { lines: ['', "Utilisation : nslookup <nom>  (le mode interactif n'est pas simulé)"] };
  const me = self(w), d = me.c.dns;
  if (!d || !me.usable) return { lines: ['*** Les serveurs par défaut ne sont pas disponibles', 'Serveur :   UnKnown', 'Address:  127.0.0.1', '', `*** UnKnown ne parvient pas à trouver ${name} : No response from server`] };
  const head = ['Serveur :   UnKnown', `Address:  ${d}`, ''], late = ['DNS request timed out.', '    timeout was 2 seconds.'];
  const r = isIp(name) ? { fail: 'nxdomain' } : askDns(name, w);
  if (r.ip) return { lines: [...head, 'Réponse ne faisant pas autorité :', `Nom :    ${name}`, `Address:  ${r.ip}`] };
  if (r.fail === 'timeout') return { lines: [...late, ...head, ...late, ...late, '*** Le délai de la requête sur UnKnown est dépassé.'] };
  if (r.fail === 'servfail') return { lines: [...head, `*** UnKnown ne parvient pas à trouver ${name} : Server failed`] };
  return { lines: [...head, `*** UnKnown ne parvient pas à trouver ${name} : Non-existent domain`] };
}

// Une ligne de tracert : numéro du saut, trois mesures (ou « * »), puis l'hôte ou le message
function hopLine(n, ms, host) {
  const col = i => (ms == null ? '     *   ' : (ms < 1 ? '<1 ms' : `${ms + [0, 1, 0][i]} ms`).padStart(9));
  return `${String(n).padStart(3)}${col(0)}${col(1)}${col(2)}  ${host}`;
}
function tracert(args, w) {
  const t = targetOf(args);
  if (!t) return { lines: ['', 'Utilisation : tracert <adresse IP ou nom>'] };
  const r = resolve(t, w);
  if (!r.ip) return { lines: ['', `Impossible de résoudre le nom du système cible ${t}.`] };
  const { home } = w, ip = r.ip, me = self(w), c = me.c, res = reach(ip, w);
  const head = isIp(t) ? [`Détermination de l’itinéraire vers ${ip} avec un maximum de 30 sauts.`]
    : [`Détermination de l’itinéraire vers ${t} [${ip}]`, 'avec un maximum de 30 sauts :'];
  const lines = ['', ...head, ''];
  const done = () => ({ lines: [...lines, '', 'Itinéraire déterminé.'] });
  const lost = from => { for (let n = from; n <= 30; n++) lines.push(hopLine(n, null, "Délai d'attente de la demande dépassé.")); return done(); };
  if (/^127\./.test(ip) || (me.usable && ip === c.ip)) { lines.push(hopLine(1, 0, `${home.pcName} [${ip}]`)); return done(); }
  if (res.fail === 'general') { lines.push('  1  Erreur de transmission : code 1231'); return done(); } // pas de réseau utilisable
  const unreachable = () => { lines.push(`  1  ${home.pcName} [${c.ip}]  rapports : Impossible de joindre l'hôte de destination.`); return done(); };
  if (sameNet(ip, c.ip, c.mask)) { if (!res.ok) return unreachable(); lines.push(hopLine(1, 0, ip)); return done(); }
  if (c.gw !== home.boxIp) return res.fail === 'unreachable' ? unreachable() : lost(1);
  lines.push(hopLine(1, 0, ip === home.boxWan ? home.boxWan : home.boxIp));
  if (ip === home.boxWan) return done();
  if (!res.ok) return lost(2);
  const k = home.hops.findIndex(h => h.ip === ip);
  const route = k >= 0 ? home.hops.slice(0, k + 1) : ip === home.srv.ip ? [...home.hops, home.srv] : [...home.hops.slice(0, 2), { ip, ms: 18 }];
  route.forEach((h, i) => lines.push(hopLine(i + 2, h.ms, h.ip)));
  return done();
}

// Exécute une ligne de commande sur le PC simulé. w : { st (état de la maison), home (réseau de référence), now }
function run(line, w) {
  const { cmd, name, args } = parse(line);
  w = { now: new Date(), ...w };
  switch (cmd) {
    case '': return { lines: [] };
    case 'help': case 'aide': case '/?': return { lines: HELP };
    case 'cls': case 'clear': return { lines: [], clear: true };
    case 'ipconfig': return ipconfig(args, w);
    case 'ping': return ping(args, w);
    case 'nslookup': return nslookup(args, w);
    case 'tracert': return tracert(args, w);
    default: return { lines: [`'${name}' n'est pas reconnu en tant que commande interne`, 'ou externe, un programme exécutable ou un fichier de commandes.'] };
  }
}

return { PROMPT, HELP, parse, run };
}());

if (typeof module !== 'undefined') module.exports = VDP.term;
