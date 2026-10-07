/* Le Voyage du Paquet : contenus pédagogiques. Adresses de la scène, fiches des équipements,
   textes des 10 étapes de la visite, tickets du jeu « Trouve la panne ».
   Chargé par le navigateur (VDP.data) et par Node pour les tests (module.exports, en fin de fichier).
   Copyright (c) 2026 anotherj4ck. Textes et scénarios : tous droits réservés, voir LICENSE-CONTENU. */
var VDP = (typeof window !== 'undefined' && window.VDP) || { net: require('./net.js') };

VDP.data = (function () {
'use strict';
const { netRange, usableText, apipaFor } = VDP.net;

/* =====================================================================
   Adresses de la scène (plages RFC 5737 pour Internet, RFC 1918 pour le LAN)
   et fiches des équipements (clic sur une étiquette)
   ===================================================================== */
const IP = {
  srv: '203.0.113.10', boxW: '198.51.100.42', boxL: '192.168.1.1',
  pc: '192.168.1.10', laptop: '192.168.1.11', console: '192.168.1.12',
  fai: '198.51.100.1', r2: '192.0.2.10', r1: '192.0.2.20', dnsFai: '198.51.100.53', // routeurs FAI, Paris, Amsterdam ; DNS du FAI
};
const MAC = {
  srv: '00:50:56:a1:0c:21',
  r1a: '00:25:90:aa:01:01', r1b: '00:25:90:aa:01:02',
  r2a: '00:1c:73:5b:02:01', r2b: '00:1c:73:5b:02:02',
  faiA: '00:1b:21:3a:7c:01', faiB: '00:1b:21:3a:7c:40',
  boxW: '9c:24:72:5e:10:01', boxL: '9c:24:72:5e:10:02',
  pc: '3c:52:82:4f:a1:7e', laptop: 'f4:5c:89:b2:33:0c', console: '7c:bb:8a:12:9d:e4',
};
const INFO = {
  srv: { name: 'Serveur web', lay: 'Couches 1 à 7', role: "Héberge le site exemple.fr dans un datacenter. Il reçoit ta requête HTTPS sur le port 443 et renvoie la page, découpée en paquets.", addr: [['IP', IP.srv], ['Port', '443 (HTTPS)'], ['MAC', MAC.srv]] },
  r1: { name: 'Routeur Amsterdam', lay: 'Couche 3 · Réseau', role: "Routeur d'un opérateur de transit. Il lit l'IP de destination, choisit la sortie dans sa table de routage, baisse le TTL et refait l'en-tête Ethernet.", addr: [['MAC côté serveur', MAC.r1a], ['MAC côté Paris', MAC.r1b]] },
  r2: { name: 'Routeur Paris', lay: 'Couche 3 · Réseau', role: "Routeur d'un opérateur présent sur un point d'échange (IXP) à Paris. Un point d'échange est une infrastructure de commutation où se raccordent les routeurs de plusieurs opérateurs pour échanger leur trafic. Même travail : IP de destination, table de routage, TTL − 1, nouvelle trame.", addr: [['MAC côté Amsterdam', MAC.r2a], ['MAC côté FAI', MAC.r2b]] },
  r3: { name: 'Routeur Francfort', lay: 'Couche 3 · Réseau', role: "Un autre chemin possible. Si le lien Amsterdam → Paris tombe, les protocoles de routage (BGP entre opérateurs) font passer le trafic par ici.", addr: [] },
  r4: { name: 'Routeur Londres', lay: 'Couche 3 · Réseau', role: "Encore un chemin de secours. Internet est un maillage : il existe presque toujours plusieurs routes vers une destination.", addr: [] },
  fai: { name: 'Routeur du FAI', lay: 'Couche 3 · Réseau', role: "Le dernier routeur avant chez toi, chez ton fournisseur d'accès. Il sait que 198.51.100.42 se trouve au bout de ta fibre.", addr: [['MAC côté Internet', MAC.faiA], ['MAC côté abonné', MAC.faiB]] },
  fiber: { name: 'Fibre optique', lay: 'Couche 1 · Physique', role: "Le lien WAN entre le FAI et ta box. Les bits y voyagent sous forme d'impulsions de lumière dans un fil de verre, sur plusieurs kilomètres.", addr: [['Débit', '1 à plusieurs Gbit/s selon l\'offre'], ['Côté FAI', 'réseau du fournisseur'], ['Côté maison', 'port WAN de la box']] },
  box: { name: 'Box internet', lay: 'Couches 1 à 4, et plus', role: "La frontière entre le WAN et ton LAN. Elle fait routeur, NAT, pare-feu, serveur DHCP, switch et point d'accès Wi-Fi dans un seul boîtier.", addr: [['IP WAN (publique)', IP.boxW], ['IP LAN (privée)', IP.boxL + '/24'], ['MAC WAN', MAC.boxW], ['MAC LAN', MAC.boxL]] },
  sw: { name: 'Switch', lay: 'Couche 2 · Liaison', role: "Relie les appareils du LAN. Il apprend quelle adresse MAC se trouve derrière chaque port et n'envoie la trame que sur le bon port.", addr: [['IP', 'aucune (switch non administrable)'], ['Ports', '8 × 1 Gbit/s']] },
  pc: { name: 'PC fixe', lay: 'Couches 1 à 7', role: "Ton poste. Sa carte réseau reçoit la trame, puis le système remonte les couches jusqu'au navigateur.", addr: [['IP', IP.pc + '/24'], ['MAC', MAC.pc], ['Passerelle', IP.boxL], ['Navigateur', 'port 52344']] },
  laptop: { name: 'Portable', lay: 'Couches 1 à 7', role: "Un autre appareil du LAN, occupé à regarder une vidéo. Il partage la même IP publique que le PC grâce au NAT.", addr: [['IP', IP.laptop + '/24'], ['MAC', MAC.laptop]] },
  console: { name: 'Console', lay: 'Couches 1 à 7', role: "Elle joue en ligne. Son trafic passe lui aussi par la box et sa table NAT.", addr: [['IP', IP.console + '/24'], ['MAC', MAC.console]] },
};

/* =====================================================================
   Visite guidée : les textes des 10 étapes
   id : relie le texte à ce que fait l'étape (dans le code de la visite) ;
   chip : [numéro de couche pour la couleur, libellé]
   ===================================================================== */
const STEPS = [
  {
    id: 'accueil', title: 'Bienvenue à bord', chip: [0, "Vue d'ensemble"],
    body: `<p>Tu cliques sur un lien. Moins d'une seconde plus tard, la page s'affiche. Entre les deux, des paquets de données ont traversé des routeurs dans plusieurs pays, une fibre optique, ta box et un switch.</p>
<p>On va en suivre un, pas à pas, depuis le serveur web jusqu'à ton écran.</p>
<div class="keyline">Fais glisser la scène pour tourner autour, zoome avec la molette ou en pinçant. Clique sur une étiquette pour ouvrir la fiche de l'équipement.</div>
<div class="keyline">Pour expliquer à ton rythme : <strong>Pause</strong> (ou la touche Espace) fige l'animation, et les flèches ← → changent d'étape.</div>`,
  },
  {
    id: 'aller', title: "L'aller : ta requête sort", chip: [4, 'Couches 3 et 4'],
    body: `<p>Avant toute réponse, ton PC a envoyé une requête au serveur : « donne-moi la page d'accueil ». Elle part de <code>192.168.1.10</code>, port <code>52344</code>, vers <code>203.0.113.10</code>, port <code>443</code> (HTTPS).</p>
<p>Juste avant, le DNS a traduit <code>exemple.fr</code> en <code>203.0.113.10</code>, puis TCP (la poignée de main en 3 temps) et TLS ont ouvert une connexion chiffrée avec le serveur.</p>
<p>En sortant, la box remplace ton adresse privée par son adresse publique <code>198.51.100.42</code> et prend un port à elle, <code>40001</code>. Elle note la correspondance dans sa <strong>table NAT</strong>.</p>
<div class="keyline">Retiens la ligne 40001 : c'est elle qui permettra à la réponse de retrouver ton PC.</div>`,
  },
  {
    id: 'emballage', title: 'Le serveur emballe sa réponse', chip: [7, 'Couches 7 → 1'],
    body: `<p>Le serveur prépare la page. Avant de l'envoyer, chaque couche du modèle TCP/IP ajoute son <strong>en-tête</strong> devant les données, comme des enveloppes glissées les unes dans les autres : c'est l'<strong>encapsulation</strong>.</p>
<ul><li><strong>Données</strong> : la page HTML, chiffrée par TLS (le cadenas).</li>
<li><strong>+ en-tête TCP</strong> = un <strong>segment</strong> : ports 443 → 40001.</li>
<li><strong>+ en-tête IP</strong> = un <strong>paquet</strong> : 203.0.113.10 → 198.51.100.42.</li>
<li><strong>+ en-tête Ethernet</strong> = une <strong>trame</strong> : les MAC du prochain saut, et le FCS à la fin pour détecter les erreurs.</li></ul>
<div class="keyline">Le serveur répond à l'adresse qu'il a vue passer : 198.51.100.42, port 40001. Il ne connaît pas ton PC, seulement ta box.</div>`,
  },
  {
    id: 'routeurs', title: 'Internet, de routeur en routeur', chip: [3, 'Couche 3 · Réseau'],
    body: `<p>Chaque routeur fait le même travail : il lit l'<strong>IP de destination</strong>, cherche la meilleure route dans sa <strong>table de routage</strong>, puis passe le paquet au routeur suivant.</p>
<p>À chaque saut, il jette l'ancien en-tête Ethernet et en met un neuf, avec de nouvelles adresses MAC. Il baisse aussi le <strong>TTL</strong> de 1 : à zéro, le paquet serait détruit.</p>
<div class="keyline">Les adresses IP restent les mêmes tout au long d'Internet ; seul le NAT de la box traduira l'adresse de destination. Les adresses MAC source et destination de la trame, elles, sont réécrites par chaque routeur.</div>`,
  },
  {
    id: 'wan', title: 'Le FAI et la fibre : le WAN', chip: [3, 'Couches 1 à 3'],
    body: `<p>Le paquet arrive chez ton fournisseur d'accès. Son routeur sait que <code>198.51.100.42</code> est au bout de ta fibre : il refait la trame et l'envoie dans ce lien. Dans la fibre, les bits voyagent sous forme d'impulsions de lumière.</p>
<p>Tout ce qui est hors de chez toi forme le <strong>WAN</strong>, le réseau étendu. Ta box a un pied de chaque côté : une adresse <strong>publique</strong> côté WAN, une adresse <strong>privée</strong> côté LAN.</p>`,
  },
  {
    id: 'nat', title: "La box traduit l'adresse (NAT)", chip: [4, 'Couches 3 et 4'],
    body: `<p>La box reçoit un paquet pour <code>198.51.100.42</code>, port <code>40001</code>. C'est bien son adresse, mais le paquet n'est pas pour elle.</p>
<p>Elle cherche le port 40001 dans sa <strong>table NAT</strong>, retrouve la ligne créée à l'aller et réécrit la destination : <code>192.168.1.10</code>, port <code>52344</code>. Comme tout routeur, elle baisse aussi le TTL.</p>
<div class="keyline">Un paquet qui arrive sans ligne correspondante dans la table NAT est jeté : par effet de bord, cela protège le LAN. Mais le NAT n'est pas un pare-feu : la box en a un vrai en plus, un pare-feu à état.</div>`,
  },
  {
    id: 'trame', title: 'Une trame neuve pour le LAN', chip: [2, 'Couche 2 · Liaison'],
    body: `<p>Pour livrer le paquet sur le réseau local, la box a besoin de l'adresse MAC de <code>192.168.1.10</code>. Elle la trouve dans sa <strong>table ARP</strong>.</p>
<p>Sans cette ligne, elle demanderait à tout le LAN « Qui a 192.168.1.10 ? » et seul le PC répondrait, avec sa MAC.</p>
<p>Elle emballe alors le paquet dans une trame neuve : de <code>9c:24:72:5e:10:02</code>, sa MAC côté LAN, vers <code>3c:52:82:4f:a1:7e</code>, celle du PC.</p>`,
  },
  {
    id: 'switch', title: 'Le switch aiguille la trame', chip: [2, 'Couche 2 · Liaison'],
    body: `<p>La trame entre par le port 1 du switch. Pour l'aiguiller, il lit la <strong>MAC de destination</strong> et consulte sa <strong>table MAC</strong> : <code>3c:52:82:4f:a1:7e</code> se trouve derrière le port 2. Cette table, il la remplit tout seul en notant la MAC source de chaque trame qui arrive.</p>
<p>Il envoie la trame sur ce port uniquement, sans rien y changer. Face à une MAC inconnue, il l'enverrait sur tous les autres ports (inondation, ou <em>flooding</em>).</p>
<div class="keyline">Le switch n'a pas besoin d'adresse IP pour travailler : il reste en couche 2.</div>`,
  },
  {
    id: 'deballage', title: 'Le PC déballe le paquet', chip: [7, 'Couches 1 → 7'],
    body: `<p>La carte réseau reçoit la trame, puis le système remonte les couches en retirant un en-tête à chaque étage : c'est la <strong>désencapsulation</strong>.</p>
<ul><li>FCS correct, MAC de destination = la mienne : on retire l'en-tête Ethernet.</li>
<li>IP de destination = la mienne : on retire l'en-tête IP.</li>
<li>Port 52344 : c'est le navigateur. On retire l'en-tête TCP.</li>
<li>TLS déchiffre les données, le navigateur affiche la page.</li></ul>`,
  },
  {
    id: 'recap', title: 'Une page, des centaines de paquets', chip: [0, 'Récapitulatif'],
    body: `<p>Tu viens de suivre un seul paquet. Une page web en demande souvent des centaines, qui font tous ce trajet en quelques dizaines de millisecondes.</p>
<ul><li><strong>Encapsulation</strong> au départ, <strong>désencapsulation</strong> à l'arrivée.</li>
<li>Les <strong>routeurs</strong> lisent l'IP et refont la trame : les MAC de la trame changent à chaque saut, le TTL baisse.</li>
<li>La <strong>box</strong> traduit l'adresse publique en adresse privée grâce à sa table NAT.</li>
<li>Le <strong>switch</strong> ne lit que les adresses MAC : la destination pour aiguiller, la source pour apprendre.</li></ul>
<div class="keyline">Les couleurs suivent les couches : bleu pour la couche 3 (les routeurs, l'en-tête IP), orange pour la couche 2 (le switch, la trame).</div>
<p><button class="btn primary" id="go-game" type="button">Passer au jeu : trouve la panne →</button></p>`,
  },
];

/* =====================================================================
   Jeu : configurations de référence et valeurs proposées dans l'éditeur
   ===================================================================== */
// Le PC est en DHCP, comme dans une vraie maison : la box lui donne 192.168.1.10. Ses valeurs manuelles
// (ip, mask, gw, dns) ne servent que s'il passe en adresse fixe ; les bonnes valeurs sont les mêmes.
const OK_CFG = { mode: 'dhcp', lease: true, ip: '192.168.1.10', mask: '255.255.255.0', gw: '192.168.1.1', dns: '192.168.1.1' };
const LAPTOP_CFG = { mode: 'dhcp', ip: '192.168.1.11', mask: '255.255.255.0', gw: '192.168.1.1', dns: '192.168.1.1' };
const CONSOLE_CFG = { mode: 'dhcp', ip: '192.168.1.12', mask: '255.255.255.0', gw: '192.168.1.1', dns: '192.168.1.1' };
const FIELD_LABEL = { mode: 'Adressage', ip: 'Adresse IP', mask: 'Masque', gw: 'Passerelle', dns: 'Serveur DNS' };
const MODE_LABEL = { dhcp: 'Automatique (DHCP)', manuel: 'Manuel (adresse fixe)' };
// valeurs proposées dans l'éditeur : la bonne, la valeur actuelle, et des pièges qui ne marchent pas
const CHOICES = {
  ip: ['192.168.1.10', '192.168.2.10', '192.168.0.10', '192.168.1.1', '192.168.1.12'],
  mask: ['255.255.255.0', '255.255.255.248', '255.255.255.252'],
  gw: ['192.168.1.1', '192.168.1.254', '192.168.1.100', '192.168.1.10'],
  dns: ['192.168.1.1', '198.51.100.53', '203.0.113.53', '192.168.1.254'],
};

// Le réseau tel que la simulation le voit : test du jeu et invite de commandes
const HOME = {
  boxIp: IP.boxL, boxWan: IP.boxW,
  lease: { ip: IP.pc, mask: '255.255.255.0', gw: IP.boxL, dns: IP.boxL }, // ce que le DHCP de la box donne au PC
  laptop: LAPTOP_CFG,
  devices: { [IP.laptop]: 'le portable', [IP.console]: 'la console' },  // les autres appareils du LAN
  ttl: { [IP.boxL]: 64, [IP.laptop]: 128, [IP.console]: 64 },           // TTL de leurs réponses au ping
  dnsServers: [IP.dnsFai],                                              // le DNS du FAI, joignable par Internet
  names: { 'exemple.fr': IP.srv },                                      // le seul nom de cet Internet simulé
  hops: [{ ip: IP.fai, ms: 5, ttl: 254 }, { ip: IP.r2, ms: 11, ttl: 253 }, { ip: IP.r1, ms: 13, ttl: 252 }], // routeurs traversés
  srv: { ip: IP.srv, ms: 14, ttl: 60 },                                 // 64 au départ du serveur, moins 4 routeurs (voir la visite)
  pcMac: MAC.pc, pcName: 'PC-FIXE',
};

/* =====================================================================
   Jeu : les tickets. Ajouter un ticket = ajouter un bloc dans TICKETS :
     id        identifiant de la panne (et clé de VARIANTS pour la panne au hasard)
     from      prénom de la personne qui écrit
     text      son message, en langage courant
     apply     (état, variante) => crée la panne dans l'état de la maison
     explain   (état de départ) => explication affichée une fois le ticket résolu
     reflex    le réflexe de dépannage à retenir
     tutorial  true pour le ticket guidé pas à pas (voir COACH)
   Une panne d'un genre nouveau demande aussi sa règle dans net.js (simulate)
   et sa réparation dans le code du jeu.
   ===================================================================== */
const TICKETS = [
  {
    id: 'cable', from: 'Léa', tutorial: true,
    text: "Bonjour, depuis ce matin le PC fixe n'a plus Internet. Le portable marche bien. J'ai passé l'aspirateur sous le bureau hier, je ne sais pas si ça a un rapport.",
    apply: st => { st.pcCable = false; },
    explain: () => "Le câble réseau du PC était débranché (merci l'aspirateur). Sans lien physique, rien ne sort : le paquet ne quittait même pas le PC.",
    reflex: 'Vérifie les câbles et les voyants avant de toucher à la configuration : on commence par la couche 1.',
  },
  {
    id: 'switch', from: 'Karim',
    text: "Plus rien ne marche à la maison : ni le PC, ni le portable, ni la console. Pourtant la box a l'air allumée.",
    apply: st => { st.switchOn = false; },
    explain: () => 'Le switch était éteint. Sans signal en face, chaque appareil branché dessus affichait « câble réseau débranché », alors que les câbles étaient bien en place.',
    reflex: "Quand tous les appareils sont touchés, cherche l'équipement qu'ils partagent : switch, box ou ligne.",
  },
  {
    id: 'fiber', from: 'Mme Duval',
    text: "Aucun appareil n'a Internet depuis 10 h. On a déjà tout redémarré, rien à faire.",
    apply: st => { st.fiberOk = false; },
    explain: () => "La fibre ne recevait plus de lumière : le voyant de la box était rouge. La coupure venait du fournisseur d'accès, impossible à réparer depuis la maison.",
    reflex: 'Voyant fibre rouge : problème de ligne. Redémarrer la box ne sert à rien, on appelle le FAI.',
  },
  {
    id: 'ip', from: 'Sophie',
    text: "Mon fils a modifié les réglages réseau du PC pour un jeu. Depuis, plus d'Internet sur le PC. Le portable va bien.",
    apply: (st, v) => { Object.assign(st.pc, { mode: 'manuel', ip: v || '192.168.2.10' }); },
    explain: st0 => `Le PC était en ${st0.pc.ip} : il n'était plus dans le même réseau que la box (192.168.1.x). Il ne pouvait donc pas joindre sa passerelle.`,
    reflex: 'Compare avec un appareil qui marche : la ligne qui diffère montre la panne.',
  },
  {
    id: 'mask', from: 'Paul',
    text: "Un ami a configuré le PC fixe à la main. Depuis, il n'a jamais eu Internet. Le portable, lui, marche.",
    apply: (st, v) => { Object.assign(st.pc, { mode: 'manuel', mask: v || '255.255.255.248' }); },
    explain: st0 => { const [a, b] = netRange(st0.pc); return `Avec le masque ${st0.pc.mask}, le PC croyait que son réseau allait de ${a} à ${b} (utilisables : ${usableText(st0.pc)}). La box (192.168.1.1) était donc « hors réseau » pour lui.`; },
    reflex: 'Le masque dit qui sont les voisins directs. Avec 255.255.255.0, tout 192.168.1.x est dans le même réseau.',
  },
  {
    id: 'gw', from: 'Nadia',
    text: "On a changé de box le mois dernier. Le portable marche, mais le PC fixe, réglé en adresse fixe, n'a plus Internet.",
    apply: (st, v) => { Object.assign(st.pc, { mode: 'manuel', gw: v || '192.168.1.254' }); },
    explain: st0 => `La passerelle pointait vers ${st0.pc.gw}${st0.pc.gw === '192.168.1.254' ? ", l'adresse de l'ancienne box" : ''}. Le PC demandait « Qui a ${st0.pc.gw} ? » et personne ne répondait.`,
    reflex: "La passerelle doit être l'adresse de la box sur le réseau local : ici 192.168.1.1.",
  },
  {
    id: 'dhcp', from: 'Julien',
    text: "Ce matin, le PC fixe n'a plus Internet. Hier soir, j'ai fouillé dans les réglages de la box pour la « sécuriser » et j'ai décoché des options. Le portable, resté allumé depuis hier, marche encore.",
    apply: st => { st.boxDhcp = false; st.pc.lease = false; },
    explain: () => `Le serveur DHCP de la box avait été désactivé. Au démarrage, le PC a demandé une adresse et personne n'a répondu : il s'est donné ${apipaFor(MAC.pc)}, une adresse de secours (APIPA) qui ne permet pas de sortir. Le portable gardait l'adresse obtenue la veille : son bail courait encore.`,
    reflex: "Une adresse en 169.254, c'est que le DHCP n'a pas répondu. On répare le serveur DHCP, puis on redemande une adresse (ipconfig /renew).",
  },
  {
    id: 'dns', from: 'Inès',
    text: "Plus aucun site ne s'ouvre sur le PC fixe : le navigateur dit qu'il ne trouve pas l'adresse du site. Pourtant Discord marche, je parle avec mes amis en ce moment ! Mon frère a changé un réglage pour « accélérer Internet ».",
    apply: (st, v) => { if (v === 'box') st.boxDns = false; else Object.assign(st.pc, { mode: 'manuel', dns: v || '203.0.113.53' }); },
    explain: st0 => (st0.boxDns === false
      ? "Le relais DNS de la box était planté : plus aucun appareil ne pouvait traduire un nom (exemple.fr) en adresse IP. Les applications déjà connectées marchaient encore, car elles n'avaient pas besoin de redemander d'adresse. Redémarrer la box l'a relancé."
      : `Le PC interrogeait le serveur DNS ${st0.pc.dns}, qui ne répond pas : il ne pouvait plus traduire les noms (exemple.fr) en adresses IP. Discord marchait encore, car sa connexion était déjà ouverte : il n'avait pas besoin de redemander d'adresse.`),
    reflex: "Si l'adresse IP répond mais pas le nom (ping 203.0.113.10 marche, ping exemple.fr échoue), c'est le DNS.",
  },
];
const VARIANTS = { ip: ['192.168.2.10', '192.168.0.10'], mask: ['255.255.255.248', '255.255.255.252'], gw: ['192.168.1.254', '192.168.1.100'] };
const RANDOM_TEXT = "Le PC fixe n'a plus Internet depuis qu'on a touché à ses réglages réseau. Le portable, lui, marche.";
const COACH = [
  { text: '<b>Étape 1 sur 4.</b> On commence toujours par tester. Clique sur « Tester depuis le PC ».', target: '#g-test-pc', next: 'test:pc:ko' },
  { text: "<b>Étape 2 sur 4.</b> Le paquet n'a même pas quitté le PC. Inspecte-le : clique sur « PC fixe », ici ou sur son étiquette dans la scène.", target: '.chip[data-eq="pc"]', tag: 'pc', next: 'inspect:pc' },
  { text: '<b>Étape 3 sur 4.</b> Regarde la ligne « Câble réseau », puis clique sur « Rebrancher le câble ».', target: '[data-act="cable"]', next: 'fixed' },
  { text: '<b>Étape 4 sur 4.</b> Après une intervention, on vérifie toujours : refais un test depuis le PC.', target: '#g-test-pc', next: 'solved' },
];

return { IP, MAC, INFO, STEPS, OK_CFG, LAPTOP_CFG, CONSOLE_CFG, FIELD_LABEL, MODE_LABEL, CHOICES, HOME, TICKETS, VARIANTS, RANDOM_TEXT, COACH };
}());

if (typeof module !== 'undefined') module.exports = VDP.data;
