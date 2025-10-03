import type { ServerAPI } from '../../../engine/shared/api';
import type { MaterialSpec, StrikeRule } from '../../../engine/shared/specs';
import { toMaterialId, type SolidMaterial } from '../shared/materials';

const MATERIAL_DEFS: Array<{ mat: SolidMaterial; displayName: string; hardness: number }> = [
  { mat: 'grass', displayName: 'Grass', hardness: 1 },
  { mat: 'dirt', displayName: 'Dirt', hardness: 1 },
  { mat: 'rock', displayName: 'Stone', hardness: 3 },
  { mat: 'wood', displayName: 'Wood', hardness: 2 },
  { mat: 'coal', displayName: 'Coal', hardness: 2 },
  { mat: 'copper', displayName: 'Copper', hardness: 3 },
  { mat: 'silver', displayName: 'Silver', hardness: 3 },
  { mat: 'gold', displayName: 'Gold', hardness: 3 },
  { mat: 'diamond', displayName: 'Diamond', hardness: 4 },
];

const MATERIAL_SPECS: MaterialSpec[] = MATERIAL_DEFS.map(({ mat, displayName, hardness }) => ({
  id: toMaterialId(mat),
  displayName,
  category: 'solid',
  hardness,
  drop: { kind: 'material', id: toMaterialId(mat), amount: 1 },
}));

const STRIKE_RULES: StrikeRule[] = [
  { tool: 'shovel', material: toMaterialId('grass'), outcome: { kind: 'Removed', drops: [{ id: toMaterialId('grass'), qty: 1 }] } },
  { tool: 'shovel', material: toMaterialId('dirt'), outcome: { kind: 'Removed', drops: [{ id: toMaterialId('dirt'), qty: 1 }] } },
  { tool: 'pickaxe', material: toMaterialId('rock'), outcome: { kind: 'Removed', drops: [{ id: toMaterialId('rock'), qty: 1 }] } },
  { tool: 'pickaxe', material: toMaterialId('wood'), outcome: { kind: 'Removed', drops: [{ id: toMaterialId('wood'), qty: 1 }] } },
  { tool: 'pickaxe', material: toMaterialId('coal'), outcome: { kind: 'Removed', drops: [{ id: toMaterialId('coal'), qty: 1 }] } },
  { tool: 'pickaxe', material: toMaterialId('copper'), outcome: { kind: 'Removed', drops: [{ id: toMaterialId('copper'), qty: 1 }] } },
  { tool: 'pickaxe', material: toMaterialId('silver'), outcome: { kind: 'Removed', drops: [{ id: toMaterialId('silver'), qty: 1 }] } },
  { tool: 'pickaxe', material: toMaterialId('gold'), outcome: { kind: 'Removed', drops: [{ id: toMaterialId('gold'), qty: 1 }] } },
  { tool: 'pickaxe', material: toMaterialId('diamond'), outcome: { kind: 'Removed', drops: [{ id: toMaterialId('diamond'), qty: 1 }] } },
];

export const coreServerModule = {
  meta: { id: 'core.terra', version: '1.0.0' },
  async init(api: ServerAPI) {
    for (const mat of MATERIAL_SPECS) api.registerMaterial(mat);
    for (const rule of STRIKE_RULES) api.registerStrikeRule(rule);
    api.registerKind({
      id: 'core.terra.player',
      server: {
        components: {
          Transform: { x: 0, y: 0, rot: 0 },
          Stats: { hp: 100, energy: 100 },
        },
      },
      client: {
        loadRenderer: async () => await import('../client/renderers/player.renderer').then((m) => m.playerRenderer),
      },
    });
  },
};

export type CoreServerModule = typeof coreServerModule;

export default coreServerModule;
