import type { EventBase } from '@terra/event-log';
import type { Tool } from '../../src/shared/game-types';
import type { SolidMaterial } from '../../src/shared/protocol';

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
    });
