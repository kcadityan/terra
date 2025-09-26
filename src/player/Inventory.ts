import type { Material } from '../shared/game-types';
import type { InventoryCounts } from '../shared/protocol';

// Simple weights (affect speed/energy): tweak to taste
const MAT_WEIGHT: Record<Exclude<Material, 'air'>, number> = {
  grass: 1,
  dirt: 1,
  rock: 2,
  gold: 3,
};

export class Inventory {
  // Per-material counts
  counts: Record<Exclude<Material, 'air'>, number> = {
    grass: 0,
    dirt: 0,
    rock: 0,
    gold: 0,
  };

  add(mat: Material, n = 1) {
    if (mat === 'air') return;
    this.counts[mat] += n;
  }

  remove(mat: Exclude<Material, 'air'>, n = 1) {
    this.counts[mat] = Math.max(0, this.counts[mat] - n);
  }

  setAll(counts: InventoryCounts) {
    this.counts.grass = counts.grass ?? 0;
    this.counts.dirt = counts.dirt ?? 0;
    this.counts.rock = counts.rock ?? 0;
    this.counts.gold = counts.gold ?? 0;
  }

  totalWeight(): number {
    let w = 0;
    for (const k of Object.keys(this.counts) as (keyof typeof this.counts)[]) {
      w += this.counts[k] * MAT_WEIGHT[k];
    }
    return w;
  }

  toDisplayList(): Array<{ mat: Exclude<Material, 'air'>; count: number }> {
    return (Object.keys(this.counts) as (keyof typeof this.counts)[])
      .map((m) => ({ mat: m, count: this.counts[m] }))
      .filter((e) => e.count > 0);
  }
}
