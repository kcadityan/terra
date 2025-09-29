import { randomUUID } from 'node:crypto';
import type { DomainEvent } from '../events';
import type { WorldState } from '../state';
import type { SolidMaterial } from '../../src/shared/protocol';
import type { Tool } from '../../src/shared/game-types';

type ValidationOk = { ok: true; event: DomainEvent };
type ValidationErr<T extends string> = { ok: false; error: { type: T; message: string } };

export interface MineCommand {
  type: 'player.mine.cmd';
  playerId: string;
  tileX: number;
  tileY: number;
  material: SolidMaterial;
}

export type MineResult =
  | ValidationOk
  | ValidationErr<'mine/player-missing'>
  | ValidationErr<'mine/invalid-material'>;

export interface PlaceCommand {
  type: 'player.place.cmd';
  playerId: string;
  tileX: number;
  tileY: number;
  material: SolidMaterial;
}

export type PlaceResult =
  | ValidationOk
  | ValidationErr<'place/player-missing'>
  | ValidationErr<'place/insufficient-inventory'>;

export interface ChangeToolCommand {
  type: 'player.changeTool.cmd';
  playerId: string;
  tool: Tool;
}

export type ChangeToolResult = ValidationOk | ValidationErr<'tool/player-missing'>;

function baseEvent<T extends DomainEvent['type']>(type: T) {
  return {
    id: randomUUID(),
    ts: Date.now(),
    type,
  } as const;
}

export function validateMine(state: WorldState, command: MineCommand): MineResult {
  const player = state.players[command.playerId];
  if (!player) {
    return { ok: false, error: { type: 'mine/player-missing', message: 'player not found' } };
  }
  if (command.material === 'air') {
    return { ok: false, error: { type: 'mine/invalid-material', message: 'cannot mine air' } };
  }

  return {
    ok: true,
    event: {
      ...baseEvent('player.mined'),
      playerId: command.playerId,
      tileX: command.tileX,
      tileY: command.tileY,
      material: command.material,
    },
  };
}

export function validatePlace(state: WorldState, command: PlaceCommand): PlaceResult {
  const player = state.players[command.playerId];
  if (!player) {
    return { ok: false, error: { type: 'place/player-missing', message: 'player not found' } };
  }
  const available = player.inventory[command.material] ?? 0;
  if (available <= 0) {
    return {
      ok: false,
      error: { type: 'place/insufficient-inventory', message: `no ${command.material} available` },
    };
  }

  return {
    ok: true,
    event: {
      ...baseEvent('player.placed'),
      playerId: command.playerId,
      tileX: command.tileX,
      tileY: command.tileY,
      material: command.material,
    },
  };
}

export function validateChangeTool(state: WorldState, command: ChangeToolCommand): ChangeToolResult {
  const player = state.players[command.playerId];
  if (!player) {
    return { ok: false, error: { type: 'tool/player-missing', message: 'player not found' } };
  }

  return {
    ok: true,
    event: {
      ...baseEvent('player.changedTool'),
      playerId: command.playerId,
      tool: command.tool,
    },
  };
}
