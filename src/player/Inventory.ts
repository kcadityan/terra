import type { Material } from '../shared/game-types';
import type { InventoryCounts } from '../shared/protocol';
import {
  MATERIAL_WEIGHT,
  SOLID_MATERIALS,
  type SolidMaterial,
} from '../world/Materials';

function emptyCounts(): Record<SolidMaterial, number> {
  const counts = {} as Record<SolidMaterial, number>;
  for (const mat of SOLID_MATERIALS) counts[mat] = 0;
  return counts;
}

export class Inventory {
  // Per-material counts
  counts: Record<SolidMaterial, number> = emptyCounts();

  add(mat: Material, n = 1) {
    if (mat === 'air') return;
    this.counts[mat] += n;
  }

  remove(mat: SolidMaterial, n = 1) {
    this.counts[mat] = Math.max(0, this.counts[mat] - n);
  }

  setAll(counts: InventoryCounts) {
    for (const mat of SOLID_MATERIALS) {
      this.counts[mat] = counts[mat] ?? 0;
    }
  }

  totalWeight(): number {
    let total = 0;
    for (const mat of SOLID_MATERIALS) {
      total += this.counts[mat] * (MATERIAL_WEIGHT[mat] ?? 1);
    }
    return total;
  }

  toDisplayList(): Array<{ mat: SolidMaterial; count: number }> {
    return SOLID_MATERIALS
      .map((mat) => ({ mat, count: this.counts[mat] }))
      .filter((entry) => entry.count > 0);
  }
}
