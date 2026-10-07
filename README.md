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
- l'**inspecteur de paquet**, façon Wireshark, affiche les en-têtes et fait clignoter chaque champ qui change : adresses MAC, TTL, adresses IP, ports ;
- un clic sur l'étiquette d'un équipement ouvre sa fiche : rôle, couche, adresses.

Pour arriver directement sur le jeu, il suffit d'ajouter `#jeu` à l'adresse :
<https://anotherj4ck.github.io/le-voyage-du-paquet/#jeu>

### Aux apprenants, en autonomie

Les 10 étapes se suivent à son rythme, en tournant librement autour de la scène. Le jeu « Trouve la panne » permet ensuite de vérifier qu'on sait se servir de ce qu'on a vu.

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

### Le jeu « Trouve la panne »

Des utilisateurs envoient des tickets au support : quelque chose ne marche plus chez eux. La démarche est celle d'un technicien :

1. **tester** : un ping part du PC ou du portable et s'arrête là où ça bloque ;
2. **inspecter** les équipements : PC, portable, switch, box, fibre ;
3. **réparer**, puis **tester à nouveau** pour vérifier.

Tester et inspecter ne coûtent rien. Chaque ticket vaut 3 étoiles, et chaque réparation inutile en fait perdre une, sans descendre sous une étoile. Le premier ticket est guidé pas à pas. Chaque ticket résolu se termine par un **réflexe** de dépannage à retenir. Une fois les 6 tickets terminés, le mode « Panne au hasard » permet de continuer à s'entraîner.

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
- **IPv6 n'est pas traité** : toute la scène est en IPv4. La plupart des fournisseurs d'accès français fournissent aussi IPv6, qui se passe de NAT.
- **Les adresses** viennent des plages réservées à la documentation (RFC 5737) pour Internet et de la plage privée 192.168.1.0/24 pour la maison. Les adresses MAC sont inventées : aucune adresse réelle n'apparaît.

## Choix techniques

- **three.js** (version r128) pour la 3D, avec WebGL.
- **Ni framework ni compilation** : du HTML, du CSS et du JavaScript écrits directement, dans un seul fichier `index.html`. Ce fichier s'ouvre en double-cliquant dessus et il est publié tel quel sur GitHub Pages.
- **Hors ligne, en partie seulement** : la page n'a besoin d'aucun serveur, mais three.js et les polices sont encore chargés depuis Internet (cdnjs et Google Fonts). Sans connexion, la page passe en mode sans 3D et utilise les polices du système.
- **Mode sans 3D** : si WebGL n'est pas disponible, le récit, l'inspecteur de paquet et le jeu restent utilisables.
- **Accessibilité** : police Atkinson Hyperlegible, conçue pour être lisible par les personnes malvoyantes ; navigation au clavier ; thème sombre automatique ; animations réduites si le système le demande.
- **Couleurs des couches** : ce sont celles des quatre paires d'un câble Ethernet à paires torsadées. Orange pour Ethernet, bleu pour IP, vert pour TCP, marron pour les données.

## Lancer les tests

Des tests automatiques vérifient la logique réseau du jeu : plages d'adresses, diagnostic d'une configuration IP, simulation de chaque panne. Ils vérifient aussi les tickets : chacun doit créer une vraie panne, que la simulation détecte. Les tests utilisent le lanceur intégré de Node.js, sans aucune dépendance à installer. Ils tournent aussi sur GitHub à chaque push et à chaque pull request : c'est le badge en haut de cette page.

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

- [three.js](https://github.com/mrdoob/three.js), version r128 : licence MIT.
- Polices, toutes sous [SIL Open Font License 1.1](https://openfontlicense.org/) :
  - [Big Shoulders Display](https://github.com/xotypeco/big_shoulders) pour les titres ;
  - [Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont/), du Braille Institute, pour le texte ;
  - [IBM Plex Mono](https://github.com/IBM/plex), d'IBM, pour les adresses et les en-têtes.

## Licence

| Quoi | Conditions | Fichier |
|------|------------|---------|
| Le code : HTML, CSS, JavaScript | Licence MIT | [LICENSE](LICENSE) |
| Les contenus pédagogiques : textes des étapes, fiches, glossaire, scénarios et tickets du jeu | Tous droits réservés, autorisation gratuite sur demande | [LICENSE-CONTENU](LICENSE-CONTENU) |

Pour l'instant, code et contenus sont dans le même fichier `index.html` : c'est la nature de chaque partie qui fixe sa licence, pas le fichier.

**Vous voulez utiliser le Voyage du Paquet avec vos apprenants ?** C'est gratuit, il suffit de demander [en ouvrant une issue intitulée « Demande d'utilisation »](https://github.com/anotherj4ck/le-voyage-du-paquet/issues/new?title=Demande%20d%27utilisation) (il faut un compte GitHub, gratuit lui aussi). La demande concerne l'utilisation des contenus comme support de cours (projection, séance construite autour du site), ainsi que toute copie, adaptation ou rediffusion.

Partager le lien du site, à des apprenants ou à qui que ce soit, est libre. Et pour apprendre en autonomie sur le site en ligne, rien à demander non plus.
