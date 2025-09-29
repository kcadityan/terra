import type { EventBase } from '@terra/event-log';
import type { Tool } from '../../src/shared/game-types';
import type { InventoryCounts, SolidMaterial } from '../../src/shared/protocol';

export type DomainEvent =
  | (EventBase & {
      type: 'player.mined';
      playerId: string;
      tileX: number;
      tileY: number;
      material: SolidMaterial;
    })
  | (EventBase & {
      type: 'player.placed';
      playerId: string;
      tileX: number;
      tileY: number;
      material: SolidMaterial;
    })
  | (EventBase & {
      type: 'player.changedTool';
      playerId: string;
      tool: Tool;
    })
  | (EventBase & {
      type: 'player.inventoryUpdated';
      playerId: string;
      inventory: InventoryCounts;
    })
  | (EventBase & {
      type: 'player.shot';
      shooterId: string;
      originX: number;
      originY: number;
      dirX: number;
      dirY: number;
      hitId: string | null;
    })
  | (EventBase & {
      type: 'player.respawned';
      playerId: string;
      x: number;
      y: number;
      hp: number;
      energy: number;
    });
