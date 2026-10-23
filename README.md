# Les 1001 Services de La Duchesse

Jeu d'adresse, de vitesse et de service en diorama 3D (Three.js), créé par [Hichem Saoud](https://www.instagram.com/hichem.saoud.75/?hl=fr) et inspiré du restaurant brunch [**La Duchesse** (@laduchesse.31)](https://www.instagram.com/laduchesse.31/?hl=fr) à Toulouse. Vous incarnez le Maître d'Hôtel : prenez les spécialités aux comptoirs,
servez les bonnes tables avant que leur patience dorée ne s'épuise, esquivez l'agitation du salon
d'un Pas Chassé… puis sonnez la Cloche Royale.

## Lancer le jeu

```bash
npm install
npm run dev        # http://127.0.0.1:5180/
npm run build      # build de production (dist/)
npm run build:standalone   # un seul index.html jouable hors ligne (dist-standalone/)
npm test           # tests (générateur, obstacles, progression, service simulé)
```

Pages de laboratoire (en dev) : `render-lab.html` (salons & effets), `models-lab.html` (personnages & plats),
`ui-lab.html` (interface), `audio-lab.html` (sons & musiques), `gen-lab.html` (plans des salons).

## Commandes

| Action | Clavier | Manette | Mobile / Tactile |
| --- | --- | --- | --- |
| Se déplacer | ZQSD / WASD / flèches | stick gauche | Joystick flottant (pouce gauche) |
| Prendre / servir / ouvrir une cloche / sonner | E (ou Entrée) | A | Bouton d'action contextuel doré |
| Pas Chassé (Dash) | Espace ou Maj | B / RB | Bouton Dash (pips & recharge) |
| Vue d'ensemble du salon | Tab | Y | Bouton Vue / toucher la mini-carte |
| Anneaux Royaux | 1 2 3 4 | croix directionnelle | Toucher directement les anneaux du HUD |
| Pause | Échap / P | Start | Bouton Pause (barre supérieure) |
| Plein écran | F11 | — | Bouton Plein écran (barre supérieure) |

## Structure

- `src/types.ts` — contrats partagés (salon, plats, états de vue, HUD, sauvegarde…)
- `src/data/` — la carte (plats), l'équipement, les nouveautés et la progression des 100 services
- `src/gen/` — génération procédurale des salons (ouverts, sans labyrinthe)
- `src/game/` — simulation : joueur, service en salle, cuisine, cloches, monde ; `hazards/` obstacles, pièges, événements
- `src/render/` — rendu diorama Three.js (biomes, post-process, effets) ; `models/` personnages, clients, plats
- `src/ui/` — interface « carte de menu gastronomique »
- `src/audio/` — sons et musiques 100 % synthétisés (WebAudio)

Console de développement : `duchesse.debug.play(25)`, `duchesse.debug.quota()`, `duchesse.debug.item('ring_tournee', 60)`,
`duchesse.debug.unlockAll()`.
