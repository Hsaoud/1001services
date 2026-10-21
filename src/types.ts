/**
 * Contrats partagés de « Les 1001 Services de La Duchesse ».
 *
 * Repère monde : sol = plan XZ, Y vers le haut, 1 unité = 1 mètre ≈ 1 case de grille.
 * La case (i, j) couvre [i, i+1] × [j, j+1] ; son centre est (i + 0.5, j + 0.5).
 * Caméra isométrique : elle regarde depuis le coin (+X, +Z) vers (−X, −Z). Les murs « du fond »
 * sont donc ceux de bord x = 0 et z = 0 ; ceux de bord x = width et z = depth sont « devant » (coupés bas, diorama).
 *
 * Ce fichier ne contient que des types et des constantes : aucune dépendance (ni three, ni DOM).
 */

// ─────────────────────────────────────────── Base

export interface Vec2 {
  x: number;
  z: number;
}

/** Salon de Thé (histoire, pas de minuteur global) / Coup de Feu (challenge minuté + marée de mousse). */
export type GameMode = 'salon' | 'coupdefeu';

/** Rotation par quarts de tour autour de Y : 0 = face +Z (vers la caméra), 1 = face +X, 2 = face −Z, 3 = face −X. */
export type Quarter = 0 | 1 | 2 | 3;

// ─────────────────────────────────────────── Carte de La Duchesse

export type DishId =
  | 'croffle' // gaufre-croissant dorée, chantilly et éclats
  | 'brioche' // brioche perdue dorée
  | 'pancakes' // pile de pancakes au sirop
  | 'tiramisu' // coupelle bicolore cacao / mascarpone
  | 'avotoast' // toast avocat, œuf poché, graines
  | 'mocktail' // verre givré coloré
  | 'latte' // tasse de latte art
  | 'golden'; // plat doré bonus (cloche mystère) : sert n'importe quelle table, score ×2

/** Poste de préparation d'un comptoir / passe-plat. */
export type StationKind = 'croffle' | 'brioche' | 'tiramisu' | 'sale' | 'bar';

export interface DishDef {
  id: DishId;
  name: string; // « Croffle chantilly »
  short: string; // « Croffle »
  station: StationKind | null; // null pour 'golden'
  sweet: boolean; // attire les caniches
  value: number; // score de base
  prepTime: number; // secondes de préparation au comptoir
  unlockLevel: number;
  color: string; // couleur d'accent UI (#rrggbb)
}

// ─────────────────────────────────────────── Ambiances (biomes)

export type BiomeId = 'boudoir' | 'jardin' | 'terrasse' | 'galerie';

export type ZoneKind =
  | 'salon' // salle principale
  | 'boudoir' // petit salon cosy
  | 'jardin' // jardin d'hiver (verrière)
  | 'terrasse' // extérieur, balustrades basses
  | 'galerie' // grande galerie marbre
  | 'vip'; // estrade VIP surélevée

export type FloorStyle =
  | 'parquet' // chevrons miel
  | 'tiles_rose' // carreaux de ciment poudrés
  | 'carpet' // moquette / tapis bordeaux
  | 'marble' // marbre blanc veiné
  | 'stone' // pierre claire de terrasse
  | 'terracotta' // tomettes
  | 'checker' // damier crème / vert sauge
  | 'stage'; // plancher d'estrade

/** Contenu d'une case de la grille du salon. */
export const CELL = {
  VOID: 0, // hors salon
  FLOOR: 1, // sol praticable
  WALL: 2, // mur plein
  RAIL: 3, // balustrade / muret bas (bloque, mais laisse voir)
  GLASS: 4, // verrière (bloque)
} as const;
export type CellKind = (typeof CELL)[keyof typeof CELL];

export interface Rect {
  x: number; // case de départ (incluse)
  z: number;
  w: number; // en cases
  d: number;
}

export interface ZoneSpec {
  id: number;
  kind: ZoneKind;
  rect: Rect; // rectangle englobant (la zone peut être la seule propriétaire de ces cases)
  floor: FloorStyle;
  raised: number; // surélévation visuelle (0, ou ~0.18 pour une estrade) — le joueur marche dessus normalement
  name: string; // « Le Petit Salon », « La Terrasse des Glycines »…
}

// ─────────────────────────────────────────── Mobilier & décor (sortie du générateur)

export type TableShape = 'round' | 'square' | 'rect';

export interface SeatSpec {
  x: number;
  z: number;
  /** Angle (radians, autour de Y) vers lequel le client assis regarde = vers le centre de la table. 0 = regarde +Z. */
  angle: number;
}

export interface TableSpec {
  id: number;
  x: number; // centre
  z: number;
  shape: TableShape;
  w: number; // emprise du plateau (pour 'round' : w = d = diamètre)
  d: number;
  rot: Quarter;
  seats: SeatSpec[];
  vip: boolean;
  zone: number;
  /** Points praticables autour de la table d'où le joueur peut servir (E). */
  serviceSpots: Vec2[];
}

export interface CounterSpec {
  id: number;
  x: number; // centre
  z: number;
  w: number; // emprise (après rotation, alignée sur les axes)
  d: number;
  rot: Quarter; // direction de la façade de service (le côté où se tient le joueur)
  station: StationKind;
  dishes: DishId[]; // plats que ce comptoir sait préparer (sous-ensemble débloqué)
  front: Vec2; // point d'interaction praticable devant la façade
  island: boolean; // îlot central (source de la marée de mousse)
}

/** Guéridon où apparaissent cloches en argent et sonnettes. */
export interface PedestalSpec {
  id: number;
  x: number;
  z: number;
}

export type DecorKind =
  | 'plant' // plante en pot
  | 'bigplant' // grand palmier / monstera
  | 'flowers' // massif / vase de fleurs
  | 'olive' // olivier en pot de terre cuite
  | 'parasol' // parasol chic (non bloquant sauf le pied)
  | 'fountain' // fontaine centrale
  | 'arch' // arche végétale / florale posée sur une ouverture
  | 'column' // colonne
  | 'chandelier' // lustre (plafond, non bloquant, visuel uniquement)
  | 'rug' // tapis (non bloquant)
  | 'banquette' // banquette velours murale
  | 'piano' // piano à queue
  | 'mirror' // miroir mural doré
  | 'painting' // tableau mural
  | 'lamp' // lampadaire / applique
  | 'cake_display' // vitrine à gâteaux
  | 'bookshelf' // bibliothèque murale
  | 'trellis' // treillage fleuri
  | 'lantern' // lanterne de terrasse
  | 'statue' // buste / statue
  | 'stage_steps' // marches d'estrade
  | 'door'; // porte d'entrée (sur le mur)

export interface DecorSpec {
  kind: DecorKind;
  x: number;
  z: number;
  rot: number; // radians
  w?: number; // emprise optionnelle (tapis, banquettes, estrades…)
  d?: number;
  scale?: number;
  /** Accroché au mur (miroir, tableau, applique) : placé sur une case de mur, rot = direction vers la salle. */
  wall?: boolean;
  /** Variante esthétique libre (0..n) choisie par le générateur. */
  variant?: number;
}

export type SolidKind = 'wall' | 'furniture';

export type Collider =
  | { shape: 'box'; minX: number; minZ: number; maxX: number; maxZ: number; solid: SolidKind; ref?: string }
  | { shape: 'circle'; x: number; z: number; r: number; solid: SolidKind; ref?: string };

/** Couloir rectiligne dégagé (aucun mobilier) pour serveurs débordés, chariots, cortèges. */
export interface Lane {
  a: Vec2;
  b: Vec2;
  width: number; // largeur libre garantie
}

export interface SalonLayout {
  level: number;
  seed: number;
  biome: BiomeId;
  width: number; // en cases (axe X)
  depth: number; // en cases (axe Z)
  cells: Uint8Array; // CellKind, index = z * width + x
  zoneOf: Int16Array; // id de zone par case (−1 hors zone)
  zones: ZoneSpec[];
  tables: TableSpec[];
  counters: CounterSpec[];
  pedestals: PedestalSpec[];
  decor: DecorSpec[];
  /** Collisions du mobilier (tables, comptoirs, guéridons, décor bloquant). Les murs sont dans `cells`. */
  colliders: Collider[];
  /** Cloche Royale (validation du service) près de l'entrée. */
  royalBell: { x: number; z: number; front: Vec2 };
  entrance: { x: number; z: number; rot: Quarter }; // porte (sur un mur)
  playerStart: Vec2;
  /** Origine de la marée de mousse (comptoir central / îlot, ou comptoir principal). */
  tideOrigin: Vec2;
  lanes: Lane[];
  /** Points de sol libres et dégagés pour faire apparaître des PNJ. */
  spawnPoints: Vec2[];
  /** 1 = praticable pour un agent de rayon ~0.35 (mobilier compris), index = z * width + x. */
  walk: Uint8Array;
}

// ─────────────────────────────────────────── Progression (100 niveaux)

/** PNJ perturbateurs (« monstres ») : tous esquivables au Dash. */
export type NpcKind =
  | 'waiter' // serveur débordé : glisse en ligne droite sur un couloir
  | 'chatty' // client bavard : recule brusquement sa chaise
  | 'cart' // chariot à pâtisseries : roule d'un bout à l'autre
  | 'poodle' // caniche royal : bondit vers le joueur s'il porte du sucré
  | 'influencer' // influenceur : s'arrête, flash photo en cône télégraphié (étourdit)
  | 'hungry' // client affamé (groupe) : piétine autour du joueur puis rejoint une table
  | 'child' // petit marquis : sprint en zigzag
  | 'polisher' // robot cireur : rebondit et laisse une traînée glissante
  | 'bride' // cortège de la mariée : farandole en boucle
  | 'critic' // critique gastronomique : suit lentement le joueur, aura qui presse les tables
  | 'waltz'; // valse des serveurs : couple qui tournoie en cercles

/** Pièges des cloches en argent (télégraphe au sol, puis effet). */
export type TrapKind =
  | 'chantilly' // siphon à chantilly : explosion circulaire de mousse
  | 'champagne' // bouchon de champagne : tir rectiligne rapide (laser)
  | 'syrup' // flaque de sirop d'érable : zone glissante
  | 'trapdoor' // trappe de cave : ouverture au sol, chute
  | 'hungry_group' // arrivée d'un groupe affamé : clients autour du joueur
  | 'revolving' // passe-plat tournant / porte tambour : téléporte vers un comptoir
  | 'percolator'; // percolateur sous pression : jets de vapeur en croix

/** Événements de salle (sans cloche). */
export type RoomEventKind = 'chandelier' | 'flambe';

export type IntroId = NpcKind | TrapKind | RoomEventKind | 'cloches' | 'vip' | 'dash' | 'radar';

export interface LevelPlan {
  level: number; // 1..100
  biome: BiomeId;
  /** Taille cible du salon en cases (le générateur peut ajuster de ±2). */
  width: number;
  depth: number;
  /** Nombre de zones (1 = un seul salon). */
  zoneCount: number;
  zoneKinds: ZoneKind[]; // zones souhaitées en plus du salon principal
  tables: number;
  vipTables: number;
  counters: number;
  centralIsland: boolean;
  fountain: boolean;
  stations: StationKind[]; // postes présents (un comptoir par poste au minimum, l'ordre = priorité)
  dishes: DishId[]; // plats débloqués à ce niveau
  /** Durée de référence (s) : minuteur du mode Coup de Feu, et calibrage du quota. */
  duration: number;
  /** Score de Service requis. */
  quota: number;
  /** Patience de base d'une commande (s). */
  patience: number;
  /** Intervalle moyen entre deux commandes d'une même table (s). */
  orderGap: number;
  npcs: { kind: NpcKind; count: number }[];
  traps: TrapKind[]; // pièges possibles dans les cloches
  events: RoomEventKind[];
  clocheInterval: number; // secondes entre deux apparitions de cloche (Infinity = jamais)
  trapChance: number; // 0..1, probabilité qu'une cloche soit piégée
  hazardScale: number; // multiplicateur de dégâts / vitesse des obstacles
  intro: IntroId | null; // nouveauté présentée au début du niveau
  tips: string[]; // conseils de tutoriel affichés pendant le service
  pedestals: number;
}

// ─────────────────────────────────────────── Équipement

export type RingId = 'tournee' | 'temps' | 'brigade' | 'grace';

export type ItemType =
  | 'boots' // Mocassins en Velours : vitesse
  | 'vest' // Veste de Maître d'Hôtel : équilibre (PV du plateau)
  | 'tray' // Plateau Royal en Argent : bonus de pourboire (+ capacité par paliers)
  | 'grinder' // Moulin à Espresso : recharge du Dash
  | 'latte' // Tasse de Latte Glacé : charges de Dash
  | 'passkey' // Passe-Partout de la Duchesse : traverser le mobilier en Dash
  | 'ring_tournee' // Anneau de la Tournée Générale
  | 'ring_temps' // Anneau de l'Heure du Thé (temps suspendu)
  | 'ring_brigade' // Anneau de la Brigade (cuisine instantanée + capacité)
  | 'ring_grace'; // Anneau de la Grâce Ducale (invulnérable, dash illimité)

export interface Item {
  uid: string;
  type: ItemType;
  level: number; // 1..100
}

export type Equipment = Partial<Record<ItemType, Item>>;

/** Statistiques effectives du joueur, calculées depuis l'équipement (data/items.ts). */
export interface PlayerStats {
  speed: number; // unités / s
  balanceMax: number; // points d'équilibre
  tipBonus: number; // +x (0.25 = +25 %)
  capacity: number; // plats portables
  dashCooldown: number; // s par charge
  dashCharges: number;
  passkeyCooldown: number | null; // s, null = pas de Passe-Partout
  rings: Record<RingId, number | null>; // recharge (s) de chaque anneau, null = non équipé
}

// ─────────────────────────────────────────── Télégraphes & effets

export type TelegraphShape =
  | { type: 'circle'; x: number; z: number; r: number }
  | { type: 'ring'; x: number; z: number; r0: number; r1: number }
  | { type: 'line'; ax: number; az: number; bx: number; bz: number; width: number }
  | { type: 'cone'; x: number; z: number; angle: number; spread: number; length: number } // angle : direction (rad, 0 = +Z), spread : demi-ouverture
  | { type: 'cross'; x: number; z: number; length: number; width: number };

export type TelegraphTone = 'pink' | 'gold' | 'cream' | 'blue';

export interface Telegraph {
  id: number;
  shape: TelegraphShape;
  tone: TelegraphTone;
  /** 0 → 1 : remplissage de l'avertissement ; à 1 l'effet se déclenche. */
  progress: number;
  /** Phase « effet en cours » (zone active : glissante, mousse…) après le déclenchement. */
  active: boolean;
  /** Persistant (ex. flaque de sirop) : affiché tant qu'il existe, sans remplissage. */
  persistent?: boolean;
}

export type FxKind =
  | 'serve' // étincelles dorées + pétales à la livraison
  | 'coins' // pièces / pourboire
  | 'pickup' // petit « ding » visuel au comptoir
  | 'foam' // explosion de chantilly / mousse
  | 'champagne' // pop + bulles
  | 'syrup' // éclaboussure de sirop
  | 'dust' // poussière de pas / freinage
  | 'crash' // plateau renversé : vaisselle qui vole
  | 'flash' // flash photo blanc
  | 'teleport' // tourbillon doré
  | 'dash' // traînée de dash
  | 'petals' // pluie de pétales (fin de service, anneaux)
  | 'steam' // jets de vapeur
  | 'confetti' // célébration
  | 'stun' // étoiles tournoyantes
  | 'ring' // onde de pouvoir d'anneau
  | 'cloche' // ouverture de cloche (éclat argenté)
  | 'golden' // aura du plat doré
  | 'splash'; // chute dans la trappe / éclaboussure

export interface FxOptions {
  y?: number;
  color?: string;
  scale?: number;
  dirX?: number;
  dirZ?: number;
  count?: number;
}

export type SfxId =
  | 'step'
  | 'dash'
  | 'dash_empty'
  | 'pickup'
  | 'serve'
  | 'tip'
  | 'wrong'
  | 'hit'
  | 'tray_wobble'
  | 'tray_crash'
  | 'cloche_open'
  | 'cloche_bonus'
  | 'trap_warn'
  | 'foam_burst'
  | 'champagne_pop'
  | 'slip'
  | 'fall'
  | 'teleport'
  | 'camera_flash'
  | 'poodle_yap'
  | 'chair_scrape'
  | 'cart_roll'
  | 'order_new'
  | 'order_expire'
  | 'quota_reached'
  | 'royal_bell'
  | 'ring_power'
  | 'tide_rumble'
  | 'ui_hover'
  | 'ui_click'
  | 'ui_open'
  | 'loot_reveal'
  | 'wheel_tick'
  | 'wheel_win'
  | 'countdown'
  | 'level_fail';

export type MusicTrack = 'title' | 'service' | 'rush' | 'results' | null;

// ─────────────────────────────────────────── États de vue (simulation → rendu)

/** État du joueur transmis à la vue (animations procédurales : squash & stretch, plateau qui penche). */
export interface PlayerViewState {
  x: number;
  z: number;
  heading: number; // rad, 0 = regarde +Z
  speed01: number; // 0..1 (vitesse / vitesse max)
  vx: number;
  vz: number;
  turnRate: number; // rad/s signé (inclinaison du plateau dans les virages)
  dashing: boolean;
  dashT: number; // 0..1 progression du dash en cours
  phasing: boolean; // Passe-Partout actif (traverse le mobilier) → rendu translucide
  tray: DishId[]; // plats sur le plateau (ordre d'empilement)
  capacity: number;
  balance01: number; // 1 = stable, 0 = sur le point de tomber (vacillement du plateau)
  hitT: number; // 0..1 décroissant après un choc (flash + recul)
  stunned: boolean; // étourdi (flash) : étoiles
  slipping: boolean; // glisse (sirop, cire)
  fall01: number; // 0 = debout, → 1 tombe dans une trappe (disparaît vers le bas)
  invulnerable: boolean; // clignotement doux
  grace: boolean; // Anneau de Grâce actif : aura dorée
  bellRing: number; // 0..1 animation « actionne la cloche »
}

export type NpcAction =
  | 'idle'
  | 'walk'
  | 'slide' // serveur qui glisse
  | 'roll' // chariot
  | 'sit'
  | 'push' // chaise reculée
  | 'aim' // influenceur qui vise (télégraphe)
  | 'flash' // déclenche le flash
  | 'crouch' // caniche prêt à bondir
  | 'leap' // bond
  | 'stunned'
  | 'dance' // cortège / valse
  | 'leave' // s'en va (disparition élégante)
  | 'calmed'; // Tournée Générale : sourit, verre à la main, s'efface

export interface NpcViewState {
  x: number;
  z: number;
  heading: number;
  speed01: number;
  action: NpcAction;
  actionT: number; // 0..1 dans l'action courante
  fade: number; // 1 = visible, 0 = disparu (apparition / départ)
  /** Paramètre libre : longueur de chaise reculée (chatty), index dans la farandole (bride)… */
  aux?: number;
}

export type TableMood = 'empty' | 'seated' | 'waiting' | 'eating' | 'happy' | 'angry';

export interface TableViewState {
  mood: TableMood;
  clients: number; // clients assis (≤ seats.length)
  served: DishId[]; // assiettes posées sur la table
  /** Recul de chaise par siège (0..1), pour les clients bavards. */
  chairPush: number[];
  highlight: number; // 0..1 : table ciblée par le guidage / à portée de service
  vip: boolean;
}

export interface CounterViewState {
  ready: DishId[]; // plats posés sur le passe (≤ 4)
  cooking: number; // 0..1 progression de la préparation en cours (0 si rien)
  cookingDish: DishId | null;
  glow: number; // 0..1 lueur chaude « prêt à servir »
  highlight: number; // 0..1 : à portée d'interaction
}

export type ClocheState = 'hidden' | 'appearing' | 'idle' | 'opening' | 'gone';

export interface ClocheViewState {
  state: ClocheState;
  t: number; // 0..1 dans l'état
  golden: boolean; // sonnette dorée (bonus garanti) vs cloche en argent (mystère)
  highlight: number;
}

export interface BellViewState {
  lit: boolean; // quota atteint
  ring: number; // 0..1 animation de sonnerie
  highlight: number;
}

export interface TideViewState {
  active: boolean;
  origin: Vec2;
  radius: number; // rayon atteint par la mousse
  t: number; // temps depuis le début (s), pour l'animation
}

// ─────────────────────────────────────────── HUD & UI (simulation → UI)

export interface HudState {
  mode: GameMode;
  level: number;
  biome: BiomeId;
  salonName: string;
  score: number;
  quota: number;
  quotaReached: boolean;
  timeLeft: number | null; // s, null en Salon de Thé
  rush: boolean; // marée de mousse en cours
  tray: DishId[];
  capacity: number;
  balance: number;
  balanceMax: number;
  dashCharges: number;
  dashChargesMax: number;
  dashRecharge01: number; // progression de la charge suivante
  passkey01: number | null; // null = pas de Passe-Partout ; 1 = prêt
  rings: { id: RingId; equipped: boolean; ready01: number; remaining: number; active: boolean }[];
  combo: number; // livraisons rapides consécutives
  served: number;
}

/** Bulle de commande au-dessus d'une table (positions écran calculées par l'app). */
export interface BubbleState {
  key: string; // stable (id de table)
  sx: number; // px écran
  sy: number;
  visible: boolean;
  dish: DishId;
  patience01: number; // 1 → 0
  vip: boolean;
  urgent: boolean; // patience < 30 %
  inRange: boolean; // le joueur peut servir maintenant
  matching: boolean; // le joueur porte le bon plat
}

export interface MinimapState {
  width: number;
  depth: number;
  cells: Uint8Array;
  zoneOf: Int16Array;
  player: Vec2 & { heading: number };
  tables: { x: number; z: number; dish: DishId | null; urgent: boolean; vip: boolean }[];
  counters: { x: number; z: number; station: StationKind; ready: number }[];
  cloches: Vec2[];
  npcs: Vec2[];
  bell: Vec2 & { lit: boolean };
  tide: { origin: Vec2; radius: number } | null;
}

export interface PopupSpec {
  text: string;
  sx: number;
  sy: number;
  tone: 'gold' | 'rose' | 'cream' | 'bad';
  big?: boolean;
}

export interface ServiceResult {
  mode: GameMode;
  level: number;
  success: boolean;
  score: number;
  quota: number;
  served: number;
  tips: number; // total des pourboires (part bonus)
  bestCombo: number;
  expired: number; // commandes perdues
  crashes: number; // plateaux renversés
  time: number; // durée du service (s)
}

// ─────────────────────────────────────────── Sauvegarde

export interface ModeSave {
  unlocked: number; // plus haut niveau débloqué
  current: number; // niveau sélectionné / à jouer
  equipment: Equipment;
  ringCooldowns: Partial<Record<RingId, number>>; // secondes restantes (persistant entre niveaux)
  best: Record<number, number>; // meilleur score par niveau
  totalServed: number;
}

export interface Settings {
  master: number; // 0..1
  music: number;
  sfx: number;
  quality: 'low' | 'medium' | 'high';
  shake: boolean;
}

export interface SaveData {
  version: 1;
  modes: Record<GameMode, ModeSave>;
  settings: Settings;
  seenIntros: string[];
}
