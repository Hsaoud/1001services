import { describe, expect, it } from 'vitest';
import { World, type FrameInput } from '../src/game/world';
import type { Service } from '../src/game/service';
import { levelPlan } from '../src/data/progression';
import { levelSeed } from '../src/core/rng';
import { generateSalon } from '../src/gen';
import { makeItem } from '../src/data/items';
import type { GameMode, ModeSave } from '../src/types';
import { freshModeSave, mockAudio, mockRenderer, mockUi } from './sim';

const idle: FrameInput = { move: { x: 0, y: 0 }, interact: false, dash: false, radar: false, rings: [false, false, false, false] };

function makeWorld(level: number, mode: GameMode = 'salon', save: ModeSave = freshModeSave()) {
  const plan = levelPlan(level);
  const layout = generateSalon(plan, levelSeed(level));
  const log: string[] = [];
  const world = new World(plan, layout, mode, {
    renderer: mockRenderer(),
    ui: mockUi(log),
    audio: mockAudio,
    settings: { master: 0, music: 0, sfx: 0, quality: 'low', shake: false },
    save,
    persist() {},
  });
  const svc = (world as unknown as { service: Service }).service;
  return { world, svc, plan, layout, log, save };
}

function step(world: World, seconds: number, input: Partial<FrameInput> = {}) {
  const dt = 1 / 30;
  for (let t = 0; t < seconds; t += dt) {
    world.update(dt, { ...idle, ...input });
    input = input.move ? { move: input.move } : {};
  }
}

describe('World', () => {
  it('prendre au comptoir puis servir rapporte des points', () => {
    const { world, svc } = makeWorld(1);
    step(world, 8);
    const t = svc.tables.find((x) => x.phase === 'waiting')!;
    expect(t).toBeTruthy();
    const c = svc.counters.find((x) => x.ready.includes(t.order!))!;
    expect(c).toBeTruthy();
    world.player.teleport(c.spec.front.x, c.spec.front.z);
    step(world, 0.05, { interact: true });
    expect(world.player.tray).toContain(t.order);
    const spot = t.spec.serviceSpots[0];
    world.player.teleport(spot.x, spot.z);
    step(world, 0.05, { interact: true });
    expect(world.score).toBeGreaterThan(100);
    expect(t.phase).toBe('eating');
  });

  it('le plat doré sert n’importe quelle table avec score doublé', () => {
    const { world, svc } = makeWorld(1);
    step(world, 8);
    const t = svc.tables.find((x) => x.phase === 'waiting')!;
    world.player.tray.length = 0;
    world.player.tray.push('golden');
    const spot = t.spec.serviceSpots[0];
    world.player.teleport(spot.x, spot.z);
    const before = world.score;
    step(world, 0.05, { interact: true });
    expect(world.score - before).toBeGreaterThanOrEqual(2 * 80);
    expect(world.player.tray).not.toContain('golden');
  });

  it('à zéro d’équilibre, le plateau se renverse', () => {
    const { world } = makeWorld(1);
    world.player.tray.push('croffle', 'latte');
    step(world, 0.5);
    for (let i = 0; i < 8; i++) {
      world.hitPlayer({ damage: 30, fromX: world.player.x + 1, fromZ: world.player.z, source: `test${i}` });
      step(world, 1.6);
    }
    expect(world.player.tray.length).toBe(0);
    expect(world.result().crashes).toBe(1);
  });

  it('le Dash rend invulnérable', () => {
    const { world } = makeWorld(1);
    step(world, 0.2);
    world.update(1 / 60, { ...idle, dash: true });
    expect(world.player.dashing).toBe(true);
    expect(world.hitPlayer({ damage: 30, fromX: 0, fromZ: 0, source: 'x' })).toBe(false);
  });

  it('Coup de Feu : sans quota à la fin du minuteur, la marée engloutit le joueur', () => {
    const { world, plan } = makeWorld(1, 'coupdefeu');
    step(world, plan.duration + 40);
    expect(world.status).toBe('failed');
  });

  it('Salon de Thé : pas de minuteur', () => {
    const { world, plan } = makeWorld(1, 'salon');
    step(world, plan.duration + 30);
    expect(world.status).toBe('playing');
  });

  it('la Cloche Royale ne valide qu’une fois le quota atteint', () => {
    const { world, layout, plan } = makeWorld(1);
    step(world, 0.2);
    world.player.teleport(layout.royalBell.front.x, layout.royalBell.front.z);
    step(world, 0.05, { interact: true });
    step(world, 3);
    expect(world.status).toBe('playing');
    world.score = plan.quota;
    step(world, 0.1);
    step(world, 0.05, { interact: true });
    step(world, 2);
    expect(world.status).toBe('won');
  });

  it('les anneaux ont une recharge persistante', () => {
    const save = freshModeSave();
    save.equipment.ring_tournee = makeItem('ring_tournee', 100);
    const { world } = makeWorld(1, 'salon', save);
    step(world, 0.2);
    step(world, 0.05, { rings: [true, false, false, false] });
    expect(save.ringCooldowns.tournee).toBeGreaterThan(170);
    expect(save.ringCooldowns.tournee).toBeLessThanOrEqual(180);
  });
});
