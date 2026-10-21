import { describe, expect, it } from 'vitest';
import { Box3, Mesh } from 'three';
import { buildDuchessFigure } from '../src/render/models/duchess';
import { compactFigure, resetPose, walkCycle } from '../src/render/models/figure';

describe('Duchess animation model', () => {
  it('retains facial expressions and cloth pivots after geometry batching', () => {
    const { fig, tails } = buildDuchessFigure();
    expect(fig.root.userData.generator).toMatch(/^Blender 5/);
    compactFigure(fig);
    const open = fig.head.getObjectByName('Duchess / open eyes')!;
    const closed = fig.head.getObjectByName('Duchess / closed eyes')!;
    const mouth = fig.head.getObjectByName('Duchess / surprised mouth')!;
    fig.setExpr('calm');
    expect(closed.visible).toBe(true);
    expect(open.visible).toBe(false);
    fig.setExpr('worried');
    expect(open.visible).toBe(true);
    expect(mouth.visible).toBe(true);
    fig.setExpr('smile');
    expect(mouth.visible).toBe(false);
    for (const tail of tails) expect(tail.parent).toBe(fig.hips);
    resetPose(fig);
    walkCycle(fig, Math.PI / 2, 1);
    expect(fig.armL.rotation.x).not.toBe(0);
    expect(fig.skirt!.parent).toBe(fig.hips);
    const second = buildDuchessFigure().fig;
    expect(second.skirt!.geometry).toBe(fig.skirt!.geometry);
    const bounds = new Box3().setFromObject(fig.root);
    expect(bounds.max.y).toBeGreaterThan(1.5);
    expect(bounds.max.y).toBeLessThan(1.7);
  });

  it('keeps detailed geometry finite and within the gameplay rendering budget', () => {
    const { fig } = buildDuchessFigure();
    compactFigure(fig);
    let triangles = 0, meshes = 0;
    fig.root.traverse(o => {
      if (!(o instanceof Mesh)) return;
      meshes++;
      const p = o.geometry.getAttribute('position');
      expect(Array.from(p.array).every(Number.isFinite)).toBe(true);
      triangles += (o.geometry.index?.count ?? p.count) / 3;
    });
    expect(meshes).toBeLessThan(55);
    expect(triangles).toBeLessThan(180_000);
  });
});
