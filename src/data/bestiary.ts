import type { IntroId, NpcKind, RoomEventKind, TrapKind } from '../types';

export interface IntroDef {
  id: IntroId;
  level: number; // niveau de première apparition
  category: 'Mécanique' | 'Client' | 'Piège de cloche' | 'Événement de salle';
  title: string;
  text: string;
  tip: string;
}

/**
 * Calendrier des nouveautés : une tous les 5 niveaux environ jusqu'au niveau 89.
 * Les niveaux 1 à 10 servent de tutoriel (prise de plat, livraison, Dash, premiers obstacles).
 */
export const INTROS: IntroDef[] = [
  {
    id: 'dash',
    level: 2,
    category: 'Mécanique',
    title: 'Le Pas Chassé',
    text: 'Un glissé élégant et fulgurant. Pendant le Pas Chassé, rien ne peut vous toucher.',
    tip: 'Espace (ou Maj) pour Dasher dans la direction du mouvement.',
  },
  {
    id: 'waiter',
    level: 4,
    category: 'Client',
    title: 'Le Serveur Débordé',
    text: 'Il traverse la salle en glissant tout droit, plateau en avant, sans regarder devant lui.',
    tip: 'Repérez son couloir et passez au bon moment, ou Dashez à travers lui.',
  },
  {
    id: 'cloches',
    level: 6,
    category: 'Mécanique',
    title: 'Les Cloches en Argent',
    text: "Sur les guéridons apparaissent des cloches : plat doré (sert n'importe quelle table, score ×2), équipement… ou piège !",
    tip: 'Ouvrez une cloche avec E. Si une zone rose apparaît au sol : Dashez hors de la zone !',
  },
  {
    id: 'chantilly',
    level: 6,
    category: 'Piège de cloche',
    title: 'Le Siphon à Chantilly',
    text: 'La cloche cachait un siphon sous pression : une explosion circulaire de mousse va jaillir.',
    tip: "Sortez du cercle avant qu'il ne soit plein.",
  },
  {
    id: 'chatty',
    level: 9,
    category: 'Client',
    title: 'Le Client Bavard',
    text: "Pris dans sa conversation, il recule brusquement sa chaise dans l'allée.",
    tip: 'Une chaise qui frémit va reculer : ne restez pas derrière.',
  },
  {
    id: 'radar',
    level: 11,
    category: 'Mécanique',
    title: "Vue d'Ensemble",
    text: 'Les salons s’agrandissent : une carte du salon montre tables, commandes et comptoirs.',
    tip: 'Tab : agrandir la carte au centre de l’écran.',
  },
  {
    id: 'vip',
    level: 12,
    category: 'Client',
    title: "L'Estrade VIP",
    text: 'Les tables VIP, sur leur estrade, sont plus pressées… mais bien plus généreuses (×1,5).',
    tip: 'Servez les VIP en priorité quand leur couronne brille.',
  },
  {
    id: 'cart',
    level: 14,
    category: 'Client',
    title: 'Le Chariot à Pâtisseries',
    text: "Lourdement chargé, il roule d'un bout à l'autre de la salle. Large et imperturbable.",
    tip: 'Il ne s’arrête pas : contournez-le ou Dashez au travers.',
  },
  {
    id: 'poodle',
    level: 19,
    category: 'Client',
    title: 'Le Caniche Royal',
    text: 'Il flaire le sucré : si vous portez Croffle, Brioche, Pancakes ou Tiramisu, il bondit vers vous !',
    tip: 'Il se ramasse avant de bondir : Dashez de côté à ce moment-là.',
  },
  {
    id: 'champagne',
    level: 24,
    category: 'Piège de cloche',
    title: 'Le Bouchon de Champagne',
    text: 'Un bouchon part en ligne droite à travers toute la salle, plus vite que l’éclair.',
    tip: 'Quittez la ligne dorée avant la détonation.',
  },
  {
    id: 'influencer',
    level: 29,
    category: 'Client',
    title: "L'Influenceur",
    text: 'Il s’arrête net, cadre… et déclenche un flash qui éblouit dans un cône devant lui.',
    tip: 'Sortez du cône lumineux ou Dashez pendant le flash.',
  },
  {
    id: 'syrup',
    level: 34,
    category: 'Piège de cloche',
    title: "La Flaque de Sirop d'Érable",
    text: 'Le sirop se répand : la zone devient glissante et vous emporte dans votre élan.',
    tip: 'Dans le sirop, on glisse : Dashez pour en sortir.',
  },
  {
    id: 'hungry_group',
    level: 39,
    category: 'Piège de cloche',
    title: "L'Arrivée d'un Groupe Affamé",
    text: 'Une tablée entière surgit autour de vous en cherchant sa place.',
    tip: 'Ne vous laissez pas encercler : Dashez dans un trou.',
  },
  {
    id: 'trapdoor',
    level: 44,
    category: 'Piège de cloche',
    title: 'La Trappe de Cave',
    text: 'Le plancher s’ouvre sur la cave ! Qui tombe perd son plateau et remonte par l’escalier.',
    tip: 'Le carré doré annonce l’ouverture : écartez-vous.',
  },
  {
    id: 'revolving',
    level: 49,
    category: 'Piège de cloche',
    title: 'Le Passe-Plat Tournant',
    text: 'La porte tambour vous happe et vous dépose… devant un comptoir au hasard.',
    tip: 'Parfois une aubaine : prenez un plat tant que vous y êtes !',
  },
  {
    id: 'child',
    level: 54,
    category: 'Client',
    title: 'Le Petit Marquis',
    text: 'Un enfant gourmand qui sprinte en zigzag entre les tables.',
    tip: 'Ses changements de direction sont brusques : gardez vos distances.',
  },
  {
    id: 'percolator',
    level: 59,
    category: 'Piège de cloche',
    title: 'Le Percolateur sous Pression',
    text: 'Des jets de vapeur brûlants fusent en croix autour du guéridon.',
    tip: 'Placez-vous en diagonale du guéridon.',
  },
  {
    id: 'polisher',
    level: 64,
    category: 'Client',
    title: 'Le Robot Cireur',
    text: 'Il rebondit d’un mur à l’autre en laissant une traînée de cire glissante.',
    tip: 'Évitez sa traînée brillante : on y glisse comme sur du sirop.',
  },
  {
    id: 'bride',
    level: 69,
    category: 'Client',
    title: 'Le Cortège de la Mariée',
    text: 'Une farandole joyeuse serpente dans le salon en boucle.',
    tip: 'La farandole suit toujours le même tracé : traversez entre deux danseurs.',
  },
  {
    id: 'chandelier',
    level: 74,
    category: 'Événement de salle',
    title: 'Le Lustre Frémissant',
    text: 'Les lustres tremblent et laissent tomber des pampilles de cristal.',
    tip: 'Les ombres rondes au sol annoncent où tombent les cristaux.',
  },
  {
    id: 'critic',
    level: 79,
    category: 'Client',
    title: 'Le Critique Gastronomique',
    text: 'Il vous suit pas à pas, carnet en main. Près de lui, les tables s’impatientent deux fois plus vite.',
    tip: 'Semez-le d’un Dash et servez loin de lui.',
  },
  {
    id: 'flambe',
    level: 84,
    category: 'Événement de salle',
    title: 'La Flambée du Chef',
    text: 'En cuisine, le chef flambe : une langue de feu jaillit d’un comptoir vers la salle.',
    tip: 'La ligne orangée devant un comptoir annonce la flamme.',
  },
  {
    id: 'waltz',
    level: 89,
    category: 'Client',
    title: 'La Valse des Serveurs',
    text: 'Des couples de serveurs tournoient en grands cercles au rythme de la valse.',
    tip: 'Lisez leur cercle et passez derrière eux.',
  },
];

export const INTRO_BY_ID = Object.fromEntries(INTROS.map((i) => [i.id, i])) as Record<IntroId, IntroDef>;

export const NPC_KINDS: NpcKind[] = [
  'waiter',
  'chatty',
  'cart',
  'poodle',
  'influencer',
  'hungry',
  'child',
  'polisher',
  'bride',
  'critic',
  'waltz',
];
export const TRAP_KINDS: TrapKind[] = ['chantilly', 'champagne', 'syrup', 'trapdoor', 'hungry_group', 'revolving', 'percolator'];
export const EVENT_KINDS: RoomEventKind[] = ['chandelier', 'flambe'];

/** Niveau d'apparition d'un élément (Infinity s'il n'est jamais introduit, ex. 'hungry' qui vient du piège). */
export function introLevel(id: IntroId): number {
  return INTRO_BY_ID[id]?.level ?? Infinity;
}
