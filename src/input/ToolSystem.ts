import type { Tool, Material } from '../types';
import { strikesFor } from '../world/Materials';

export class ToolSystem {
  current: Tool = 'shovel';
  targetTile: { x: number; y: number } | null = null;
  targetStrikesLeft = 0;
  targetMat: Material | null = null;

  toggle() { this.current = this.current === 'shovel' ? 'pickaxe' : 'shovel'; }

  beginTarget(tileX: number, tileY: number, mat: Material) {
    this.targetTile = { x: tileX, y: tileY };
    this.targetMat = mat;
    this.targetStrikesLeft = strikesFor(this.current, mat);
  }

  clearTarget() {
    this.targetTile = null;
    this.targetMat = null;
    this.targetStrikesLeft = 0;
  }
}
