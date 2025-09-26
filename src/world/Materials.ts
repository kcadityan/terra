import type { Material, Tool } from '../shared/game-types';

export const MATERIAL_COLOR: Record<Material, number> = {
  air: 0x000000,
  grass: 0x4caf50,
  dirt: 0x8d6e63,
  rock: 0x607d8b,
  gold: 0xffd54f,
};

function isCorrectTool(tool: Tool, mat: Material): boolean {
  if (mat === 'air') return true;
  if (tool === 'shovel') return mat === 'grass' || mat === 'dirt';
  if (tool === 'pickaxe') return mat === 'rock' || mat === 'gold';
  if (tool === 'rifle') return false;
  return false;
}

// Strike counts per your request:
// - Dirt/Rock/Grass/Gold: 2 swings with the correct tool
// - Wrong tool: 4 swings
export function strikesFor(tool: Tool, mat: Material): number {
  if (mat === 'air') return 0;
  const base = 2;
  return isCorrectTool(tool, mat) ? base : base * 2;
}
