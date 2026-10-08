# Le Voyage du Paquet

[![Tests](https://github.com/anotherj4ck/le-voyage-du-paquet/actions/workflows/tests.yml/badge.svg)](https://github.com/anotherj4ck/le-voyage-du-paquet/actions/workflows/tests.yml)

Une visite guidée en 3D du trajet d'un paquet réseau, du serveur web jusqu'au PC de la maison, suivie d'un jeu de dépannage.

**[▶ Ouvrir la démo](https://anotherj4ck.github.io/le-voyage-du-paquet/)** : rien à installer, tout se passe dans le navigateur.

<!--
  Capture d'écran à ajouter : docs/capture.png
  Conseil : toute la scène avec l'inspecteur de paquet visible (par exemple l'étape 6, la NAT),
  environ 1600 × 900 pixels, au format PNG.
-->
![La scène 3D : le serveur web, les routeurs d'Internet, le fournisseur d'accès et la maison, avec l'inspecteur de paquet à droite](docs/capture.png)

## À qui ça sert

### Aux formateurs, pour projeter en cours

La visite se déroule en 10 étapes courtes, chacune avec son animation. Tout est prévu pour commenter en direct :

- **Pause** (bouton ou barre d'espace) fige l'animation le temps d'expliquer, **Rejouer** relance l'étape ;
- **vitesse** réglable : 0,5×, 1× ou 2× ;
- **flèches ← →** pour changer d'étape ; les touches Page précédente et Page suivante marchent aussi, comme sur la plupart des télécommandes de présentation ;
- à l'écran, seul **l'essentiel** de chaque étape s'affiche ; le bloc **« Pour aller plus loin »** reste fermé tant qu'on ne l'ouvre pas, par exemple pour répondre à une question ;
- l'**inspecteur de paquet**, façon Wireshark, affiche les en-têtes et fait clignoter chaque champ qui change : adresses MAC, TTL, adresses IP, ports ;
- un clic sur l'étiquette d'un équipement ouvre sa fiche : rôle, couche, adresses.

Pour arriver directement sur le jeu, ou sur un ticket précis, il suffit d'ajouter la fin voulue à l'adresse :

- `#jeu` ouvre l'accueil du jeu : <https://anotherj4ck.github.io/le-voyage-du-paquet/#jeu> ;
- `#ticket-1` à `#ticket-9` ouvrent directement le ticket voulu, par exemple <https://anotherj4ck.github.io/le-voyage-du-paquet/#ticket-4>. Les numéros sont ceux du tableau des pannes, plus bas.

On peut aussi changer la fin de l'adresse pendant la séance : la page passe au ticket demandé sans se recharger. Retaper exactement la même adresse ne rouvre pas le ticket : il faut alors recharger la page (F5).

Projeter le site en cours, c'est utiliser ses contenus comme support de cours : c'est gratuit, mais il faut d'abord en faire la demande (voir [Licence](#licence)).

### Aux apprenants, en autonomie

Les 10 étapes se suivent à son rythme, en tournant librement autour de la scène. L'essentiel de chaque étape suffit pour comprendre l'animation ; « Pour aller plus loin » détaille les en-têtes, les tables et les commandes à essayer, pour qui veut creuser. Le jeu « Trouve la panne » permet ensuite de vérifier qu'on sait se servir de ce qu'on a vu.

Public visé : titre professionnel TAI, Bac pro CIEL, BTS SIO.

### L'étape avant Packet Tracer

Le Voyage du Paquet ne remplace pas un simulateur comme Cisco Packet Tracer : il vient avant. Ici, on ne configure rien. On **regarde** ce que fait chaque équipement, couche par couche : qui lit quelle adresse, qui la modifie, et pourquoi. On arrive ensuite devant le simulateur en sachant ce qu'on cherche.

<!--
  Animation à ajouter : docs/demo.gif
  Conseil : 10 à 15 secondes d'une étape animée (par exemple l'étape 4, de routeur en routeur),
  environ 960 pixels de large, moins de 10 Mo.
-->
![Animation : le paquet passe de routeur en routeur, le TTL baisse et la trame est refaite à chaque saut](docs/demo.gif)

## Contenu

### La visite guidée en 10 étapes

On suit la réponse d'un serveur web, `exemple.fr`, jusqu'au navigateur du PC.

| # | Étape | Couches | Ce qu'on y voit |
|---|-------|---------|-----------------|
| 1 | Bienvenue à bord | Vue d'ensemble | Le décor : Internet (WAN), le fournisseur d'accès, la maison (LAN) |
| 2 | L'aller : ta requête sort | 3 et 4 | La requête HTTPS du PC et la traduction d'adresse (NAT) à la sortie de la box |
| 3 | Le serveur emballe sa réponse | 7 → 1 | L'encapsulation : données, segment, paquet, trame |
| 4 | Internet, de routeur en routeur | 3 | La table de routage, le TTL qui baisse, la trame refaite à chaque saut |
| 5 | Le FAI et la fibre : le WAN | 1 à 3 | Le dernier routeur avant la maison, la lumière dans la fibre, IP publique et IP privée |
| 6 | La box traduit l'adresse (NAT) | 3 et 4 | La table NAT renvoie la réponse vers le bon appareil |
| 7 | Une trame neuve pour le LAN | 2 | La table ARP et la nouvelle trame côté maison |
| 8 | Le switch aiguille la trame | 2 | La table MAC du switch et le choix du port |
| 9 | Le PC déballe le paquet | 1 → 7 | La désencapsulation, jusqu'à l'affichage de la page |
| 10 | Une page, des centaines de paquets | Récapitulatif | Ce qu'il faut retenir, puis le passage au jeu |

Chaque étape se lit à deux niveaux :

- **l'essentiel**, toujours affiché : deux ou trois phrases à retenir. Tout ce que montre l'animation s'y explique ;
- **« Pour aller plus loin »** (étapes 2 à 9), un bloc fermé par défaut : contenu des en-têtes, ports, TTL, fonctionnement des tables, commandes à essayer dans le jeu.

### Le jeu « Trouve la panne »

Des utilisateurs envoient des tickets au support : quelque chose ne marche plus chez eux. La démarche est celle d'un technicien :

1. **tester** depuis le PC ou le portable : le test traduit d'abord le nom du site en adresse IP (DNS), puis envoie un ping, qui s'arrête là où ça bloque ;
2. **inspecter** les équipements : PC, portable, switch, box, fibre ;
3. **réparer**, puis **tester à nouveau** pour vérifier.

Une **invite de commandes** simulée sur le PC fixe permet aussi de diagnostiquer comme sur un vrai poste Windows : `ipconfig`, `ipconfig /all`, `ipconfig /renew`, `ping`, `nslookup` et `tracert`. Ses réponses tiennent compte de la panne en cours.

Tester, inspecter et taper des commandes ne coûte rien. Chaque ticket vaut 3 étoiles, et chaque réparation inutile en fait perdre une, sans descendre sous une étoile. Le premier ticket est guidé pas à pas. Chaque ticket résolu se termine par un **réflexe** de dépannage à retenir. Une fois les 9 tickets terminés, le mode « Panne au hasard » permet de continuer à s'entraîner.

<details>
<summary>Les pannes couvertes (attention, ça dévoile les solutions)</summary>

| Ticket | Panne | Réflexe travaillé |
|--------|-------|-------------------|
| 1 (guidé) | Câble réseau du PC débranché | Vérifier câbles et voyants avant la configuration |
| 2 | Switch éteint | Tous les appareils touchés : chercher l'équipement qu'ils partagent |
| 3 | Coupure de la fibre | Voyant fibre rouge : c'est la ligne, on appelle le fournisseur d'accès |
| 4 | Adresse IP hors du réseau de la box | Comparer avec un appareil qui marche |
| 5 | Masque de sous-réseau trop étroit | Le masque dit qui sont les voisins directs |
| 6 | Mauvaise passerelle par défaut | La passerelle, c'est l'adresse de la box sur le réseau local |
| 7 | Serveur DHCP de la box arrêté : le PC se donne une adresse en 169.254 | Une adresse en 169.254, c'est que le DHCP n'a pas répondu |
| 8 | Serveur DNS du PC qui ne répond pas : plus aucun nom ne se traduit | Si l'adresse IP répond mais pas le nom, c'est le DNS |
| 9 | Conflit d'adresses : le PC a pris l'adresse de la console | Chaque appareil doit avoir une adresse unique |

</details>

### Les fiches mémo

Sous la scène, trois fiches à relire :

- **Qui regarde quoi ?** : ce que lisent et modifient le switch, le routeur, la box et le PC, et la table de chacun ;
- **L'encapsulation en un coup d'œil** : données, segment, paquet, trame ;
- **Glossaire express** : WAN, LAN, adresses IP et MAC, port, NAT, masque, passerelle, ARP, ping, TTL, FCS, table de routage…

## Simplifications assumées

Pour rester lisible, la scène simplifie quelques points :

- **Entre le fournisseur d'accès et la box**, la fibre transporte en réalité du GPON, souvent avec PPPoE ou un VLAN, plutôt qu'une trame Ethernet classique. La scène garde une trame Ethernet pour ne pas introduire un format de plus.
- **Le switch** est dessiné à part pour montrer son rôle. Dans la plupart des maisons, il est intégré à la box.
- **Les routeurs d'Internet** affichent une route par défaut (`0.0.0.0/0`) pour rester lisibles. Au cœur d'Internet, les grands routeurs n'en ont souvent pas : ils connaissent une route pour chaque réseau, apprise par BGP.
- **IPv6 n'est pas traité** : toute la scène est en IPv4. La plupart des fournisseurs d'accès français fournissent aussi IPv6, qui se passe de NAT.
- **Un seul nom existe** sur cet Internet simulé : `exemple.fr`. La box relaie les questions DNS du PC.
- **L'invite de commandes** imite un Windows 11 en français, sans les lignes IPv6. Ses messages viennent de relevés faits sur un vrai poste ou de sorties réelles publiées ; quelques messages rares restent reconstitués. La liste détaillée est en tête de `js/terminal.js`.
- **Les adresses** viennent des plages réservées à la documentation (RFC 5737) pour Internet et de la plage privée 192.168.1.0/24 pour la maison. Les adresses MAC sont inventées : aucune adresse réelle n'apparaît.

## Choix techniques

- **three.js** (version r128) pour la 3D, avec WebGL. La version est figée exprès : les versions récentes ne sont plus livrées que sous forme de modules ES, que les navigateurs refusent de charger depuis un fichier ouvert en double-cliquant.
- **Ni framework ni compilation** : du HTML, du CSS et du JavaScript écrits directement, publiés tels quels sur GitHub Pages. Le site s'ouvre aussi en double-cliquant sur `index.html`.
- **Des scripts classiques, chargés dans l'ordre** : chaque fichier de `js/` est chargé par une balise `<script defer>`, sans module ES ni `fetch()` de fichier local, deux choses que les navigateurs bloquent quand la page est ouverte comme un fichier. Les fichiers partagent un seul objet global, `VDP`, et chacun y range sa partie (`VDP.net`, `VDP.data`, `VDP.game`…).
- **Entièrement hors ligne** : three.js et les polices sont copiés dans le dépôt (`vendor/`, `fonts/`). La page ne charge rien depuis Internet et marche sans connexion.
- **Mode sans 3D** : si WebGL n'est pas disponible, le récit, l'inspecteur de paquet et le jeu restent utilisables.
- **Accessibilité** :
  - police Atkinson Hyperlegible, conçue pour être lisible par les personnes malvoyantes ;
  - visite, jeu et invite de commandes s'utilisent au clavier, y compris pour ouvrir « Pour aller plus loin », un élément `<details>` natif ;
  - thème clair ou sombre, qui suit celui du système ; un bouton permet de basculer, et le choix est mémorisé ;
  - animations réduites si le système le demande.
- **Sécurité** : ce qu'on tape dans l'invite de commandes est affiché comme du texte brut (`textContent`, jamais `innerHTML`). Une balise HTML tapée s'affiche telle quelle, sans être exécutée.
- **Couleurs des couches** : ce sont celles des quatre paires d'un câble Ethernet à paires torsadées. Orange pour Ethernet, bleu pour IP, vert pour TCP, marron pour les données.

## Organisation des fichiers

```text
index.html             la page : structure, fiches mémo ; charge les scripts dans l'ordre
css/style.css          toute la mise en forme, thèmes clair et sombre
js/net.js              logique réseau pure : adresses, DHCP, DNS, simulation d'un test de connexion
js/data.js             les contenus : textes des étapes, fiches des équipements, tickets du jeu
js/terminal.js         l'invite de commandes simulée
js/route.js            lecture de l'adresse de la page : #jeu, #ticket-1 à #ticket-9
js/scene.js            la scène 3D : rendu, caméra, étiquettes et fiches des équipements
js/tour.js             la visite guidée : animations des 10 étapes, inspecteur de paquet
js/game.js             le jeu « Trouve la panne »
js/main.js             démarrage, thème, raccourcis clavier ; chargé en dernier
vendor/three.min.js    three.js r128, copie locale (licence dans vendor/three.LICENSE)
fonts/                 les polices (woff2) et leurs licences
tests/                 les tests automatiques, lancés avec Node.js
.github/workflows/     les tests sur GitHub, à chaque push et à chaque pull request
```

Les fichiers `net.js`, `data.js`, `terminal.js` et `route.js` ne touchent pas à la page : Node.js peut donc les charger et les tester sans navigateur.

## Lancer les tests

Des tests automatiques vérifient :

- la logique réseau du jeu : plages d'adresses, DHCP, DNS, diagnostic d'une configuration IP, simulation de chaque panne ;
- les tickets : chacun doit créer une vraie panne, que la simulation détecte ;
- l'invite de commandes : chaque commande, panne par panne ; les sorties relevées sur un vrai Windows sont vérifiées ligne par ligne ;
- les textes de la visite : aucune adresse ni aucun port de l'essentiel n'arrive sans avoir été présenté, et les commandes citées existent dans le jeu ;
- l'accès direct aux tickets par l'adresse de la page.

Les tests utilisent le lanceur intégré de Node.js, sans aucune dépendance à installer. Ils tournent aussi sur GitHub à chaque push et à chaque pull request : c'est le badge en haut de cette page.

Il faut Node.js 22 ou plus récent (`node --version` pour vérifier). Depuis le dossier du projet :

**Fedora**

```sh
sudo dnf install nodejs
npm test
```

**Windows** (PowerShell)

```powershell
winget install OpenJS.NodeJS.LTS
# fermer puis rouvrir le terminal, pour qu'il trouve node et npm
npm test
```

`npm test` lance `node --test "tests/**/*.test.js"`. Les tests sont dans le dossier `tests/`.

## Crédits

- [three.js](https://github.com/mrdoob/three.js), version r128 : licence MIT ([vendor/three.LICENSE](vendor/three.LICENSE)).
- Polices, toutes sous [SIL Open Font License 1.1](https://openfontlicense.org/) (licences dans [fonts/](fonts/)) :
  - [Big Shoulders Display](https://github.com/xotypeco/big_shoulders) pour les titres ;
  - [Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont/), du Braille Institute, pour le texte ;
  - [IBM Plex Mono](https://github.com/IBM/plex), d'IBM, pour les adresses et les en-têtes.

## Licence

| Quoi | Conditions | Fichier |
|------|------------|---------|
| Le code : HTML, CSS, JavaScript | Licence MIT | [LICENSE](LICENSE) |
| Les contenus pédagogiques : textes des étapes, fiches, glossaire, scénarios et tickets du jeu | Tous droits réservés, autorisation gratuite sur demande | [LICENSE-CONTENU](LICENSE-CONTENU) |

Les contenus sont pour l'essentiel dans `js/data.js` ; les fiches mémo et le glossaire sont dans `index.html`. Le commentaire en tête de chaque fichier de code précise ce qui relève de chaque licence : c'est la nature de chaque partie qui fixe sa licence, pas le fichier.

**Vous voulez utiliser le Voyage du Paquet avec vos apprenants ?** C'est gratuit, il suffit de demander [en ouvrant une issue intitulée « Demande d'utilisation »](https://github.com/anotherj4ck/le-voyage-du-paquet/issues/new?title=Demande%20d%27utilisation) (il faut un compte GitHub, gratuit lui aussi). La demande concerne l'utilisation des contenus comme support de cours (projection, séance construite autour du site), ainsi que toute copie, adaptation ou rediffusion.

Partager le lien du site, à des apprenants ou à qui que ce soit, est libre. Et pour apprendre en autonomie sur le site en ligne, rien à demander non plus.
