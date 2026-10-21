# Les 1001 Services de La Duchesse

Jeu d'adresse, de vitesse et de service en diorama 3D (Three.js), inspiré du restaurant brunch
**La Duchesse** à Toulouse. Vous incarnez le Maître d'Hôtel : prenez les spécialités aux comptoirs,
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

| Action | Clavier | Manette |
| --- | --- | --- |
| Se déplacer | ZQSD / WASD / flèches | stick gauche |
| Prendre / servir / ouvrir une cloche / sonner | E (ou Entrée) | A |
| Pas Chassé (Dash) | Espace ou Maj | B / RB |
| Vue d'ensemble du salon | Tab | Y |
| Anneaux Royaux | 1 2 3 4 | croix directionnelle |
| Pause | Échap / P | Start |

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
