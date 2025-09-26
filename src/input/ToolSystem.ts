import type { Tool, Material } from '../shared/game-types';
import { strikesFor } from '../world/Materials';

export class ToolSystem {
  current: Tool = 'shovel';
  targetTile: { x: number; y: number } | null = null;
  targetStrikesLeft = 0;
  targetMat: Material | null = null;

  toggle() {
    this.current = this.current === 'shovel' ? 'pickaxe' : 'shovel';
    this.clearTarget();
  }

  set(tool: Tool) {
    if (this.current === tool) return;
    this.current = tool;
    this.clearTarget();
  }

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
