import type { Material, Tool } from '../types';

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
  return false;
}

// Fixed strike counts per your request:
// - Dirt/Rock/Grass/Gold: 3 strikes with the correct tool
// - Wrong tool: 6 strikes
export function strikesFor(tool: Tool, mat: Material): number {
  if (mat === 'air') return 0;
  const base = 3;
  return isCorrectTool(tool, mat) ? base : base * 2;
}
