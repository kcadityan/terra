import type { Material, Tool } from '../../../engine/shared/game-types';

export type SolidMaterial = Exclude<Material, 'air'>;

export const SOLID_MATERIALS = [
  'grass',
  'dirt',
  'rock',
  'wood',
  'coal',
  'copper',
  'silver',
  'gold',
  'diamond',
] as const satisfies SolidMaterial[];

export const MATERIAL_COLOR: Record<Material, number> = {
  air: 0x000000,
  grass: 0x4caf50,
  dirt: 0x8d6e63,
  rock: 0x6d7c8b,
  wood: 0x8b5a2b,
  coal: 0x1b1b1b,
  copper: 0xb87333,
  silver: 0xf5f5f5,
  gold: 0xffd54f,
  diamond: 0x4fc3f7,
};

export const MATERIAL_WEIGHT: Record<SolidMaterial, number> = {
  grass: 1,
  dirt: 1,
  rock: 4,
  wood: 2,
  coal: 2,
  copper: 3,
  silver: 3,
  gold: 4,
  diamond: 5,
};

export const MATERIAL_STICKINESS: Record<SolidMaterial, number> = {
  grass: 0,
  dirt: 0,
  rock: 14,
  wood: 5,
  coal: 8,
  copper: 10,
  silver: 11,
  gold: 9,
  diamond: 16,
};

const MATERIAL_HARDNESS: Record<SolidMaterial, number> = {
  grass: 1,
  dirt: 1,
  rock: 3,
  wood: 2,
  coal: 2,
  copper: 3,
  silver: 3,
  gold: 3,
  diamond: 4,
};

function isCorrectTool(tool: Tool, mat: Material): boolean {
  if (mat === 'air') return true;
  if (tool === 'shovel') return mat === 'grass' || mat === 'dirt';
  if (tool === 'pickaxe') {
    return mat !== 'grass' && mat !== 'dirt';
  }
  return false;
}

export function strikesFor(tool: Tool, mat: Material): number {
  if (mat === 'air') return 0;
  const hardness = MATERIAL_HARDNESS[mat] ?? 2;
  return isCorrectTool(tool, mat) ? hardness : hardness * 2;
}

export const MATERIAL_REGISTRY_IDS: Record<SolidMaterial, string> = {
  grass: 'core.terra.material.grass',
  dirt: 'core.terra.material.dirt',
  rock: 'core.terra.material.rock',
  wood: 'core.terra.material.wood',
  coal: 'core.terra.material.coal',
  copper: 'core.terra.material.copper',
  silver: 'core.terra.material.silver',
  gold: 'core.terra.material.gold',
  diamond: 'core.terra.material.diamond',
};

const MATERIAL_ID_LOOKUP = Object.fromEntries(
  Object.entries(MATERIAL_REGISTRY_IDS).map(([mat, id]) => [id, mat]),
) as Record<string, SolidMaterial>;

export const toMaterialId = (mat: SolidMaterial): string => MATERIAL_REGISTRY_IDS[mat];

export const fromMaterialId = (id: string): SolidMaterial | null => MATERIAL_ID_LOOKUP[id] ?? null;
