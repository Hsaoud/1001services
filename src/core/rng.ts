/** Générateur pseudo-aléatoire déterministe (mulberry32) : mêmes graines → mêmes salons. */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }

  /** Flottant dans [0, 1[. */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Flottant dans [a, b[. */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** Entier dans [a, b] (bornes incluses). */
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Tirage pondéré : `weights[i]` ≥ 0. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Sous-générateur indépendant (pour isoler les tirages d'un sous-système). */
  fork(salt: number): Rng {
    return new Rng(hash2(Math.floor(this.next() * 4294967296), salt));
  }
}

/** Hachage entier rapide de deux entiers. */
export function hash2(a: number, b: number): number {
  let h = Math.imul(a ^ 0x85ebca6b, 0xc2b2ae35) ^ Math.imul(b + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

/** Graine stable d'un niveau (chaque niveau a toujours le même salon). */
export function levelSeed(level: number, variant = 0): number {
  return hash2(level * 7919 + 1001, variant + 31);
}
