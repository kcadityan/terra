import type { EventBase } from '@terra/event-log';
import type { Tool } from '../../engine/shared/game-types';
import type { InventoryCounts, SolidMaterial } from '../../engine/shared/protocol';

export type DomainEvent =
  | (EventBase & {
      readonly type: 'player.mined';
      readonly playerId: string;
      readonly tileX: number;
      readonly tileY: number;
      readonly material: SolidMaterial;
    })
  | (EventBase & {
      readonly type: 'player.placed';
      readonly playerId: string;
      readonly tileX: number;
      readonly tileY: number;
      readonly material: SolidMaterial;
    })
  | (EventBase & {
      readonly type: 'player.changedTool';
      readonly playerId: string;
      readonly tool: Tool;
    })
  | (EventBase & {
      readonly type: 'player.inventoryUpdated';
      readonly playerId: string;
      readonly inventory: InventoryCounts;
    })
  | (EventBase & {
      readonly type: 'player.shot';
      readonly shooterId: string;
      readonly originX: number;
      readonly originY: number;
      readonly dirX: number;
      readonly dirY: number;
      readonly hitId: string | null;
    })
  | (EventBase & {
      readonly type: 'player.respawned';
      readonly playerId: string;
      readonly x: number;
      readonly y: number;
      readonly hp: number;
      readonly energy: number;
    });
