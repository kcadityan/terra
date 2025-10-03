import { strikesFor } from '../../../mods/core/shared/materials';
import type { Material, Tool } from '../../../engine/shared/game-types';
import type { SolidMaterial } from '../../../engine/shared/protocol';

export type MiningTool = Exclude<Tool, 'rifle'>;

export interface MineTarget {
  readonly tileX: number;
  readonly tileY: number;
  readonly material: Material;
  readonly strikesLeft: number;
}

export interface MineState {
  readonly tool: Tool;
  readonly lastMiningTool: MiningTool;
  readonly target: MineTarget | null;
}

export interface MineAction {
  readonly tileX: number;
  readonly tileY: number;
  readonly material: Material;
}

export interface MineResult {
  readonly state: MineState;
  readonly request: { tileX: number; tileY: number } | null;
  readonly strikesConsumed: number;
}

const MINING_TOOLS: readonly MiningTool[] = ['shovel', 'pickaxe'] as const;

function isMiningTool(tool: Tool): tool is MiningTool {
  return (MINING_TOOLS as readonly Tool[]).includes(tool);
}

function createTarget(tileX: number, tileY: number, material: Material, tool: Tool): MineTarget {
  const totalStrikes = Math.max(1, strikesFor(tool, material));
  return { tileX, tileY, material, strikesLeft: totalStrikes };
}

export function applyMineAction(state: MineState, action: MineAction): MineResult {
  if (state.tool === 'rifle') {
    return { state, request: null, strikesConsumed: 0 };
  }

  const sameTarget =
    state.target &&
    state.target.tileX === action.tileX &&
    state.target.tileY === action.tileY &&
    state.target.material === action.material;

  const initialTarget = sameTarget
    ? state.target
    : createTarget(action.tileX, action.tileY, action.material, state.tool);

  const updatedStrikesLeft = Math.max(0, initialTarget.strikesLeft - 1);
  const shouldComplete = updatedStrikesLeft <= 0;

  const nextTarget = shouldComplete
    ? null
    : {
        tileX: initialTarget.tileX,
        tileY: initialTarget.tileY,
        material: initialTarget.material,
        strikesLeft: updatedStrikesLeft,
      };

  const nextLastTool = isMiningTool(state.tool) ? state.tool : state.lastMiningTool;

  return {
    state: {
      tool: state.tool,
      lastMiningTool: nextLastTool,
      target: nextTarget,
    },
    request: shouldComplete ? { tileX: action.tileX, tileY: action.tileY } : null,
    strikesConsumed: 1,
  };
}

export interface PlacementState {
  readonly selectedMat: SolidMaterial | null;
  readonly inventory: Record<SolidMaterial, number>;
}

export interface PlacementResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly request?: { tileX: number; tileY: number; material: SolidMaterial };
}

export function evaluatePlacementAction(
  state: PlacementState,
  tileX: number,
  tileY: number,
): PlacementResult {
  const mat = state.selectedMat;
  if (!mat) {
    return { ok: false, reason: 'place-block/no-selection' };
  }
  const available = state.inventory[mat] ?? 0;
  if (available <= 0) {
    return { ok: false, reason: 'place-block/empty' };
  }
  return {
    ok: true,
    request: { tileX, tileY, material: mat },
  };
}
