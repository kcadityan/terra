import { describe, expect, it, vi } from 'vitest';
import { createWorldLog } from '../engine';
import type { DomainEvent } from '../events';

const streamId = 'test-stream';

describe('world log engine', () => {
  it('replays empty state', async () => {
    const log = createWorldLog(streamId);
    const state = await log.replay();
    expect(state.blocks).toHaveLength(0);
  });

  it('appends events and updates state', async () => {
    const log = createWorldLog(`${streamId}-append`);
    await log.replay();

    await log.append([
      {
        id: 'evt-1',
        ts: 0,
        type: 'player.mined',
        playerId: 'p1',
        tileX: 1,
        tileY: 2,
        material: 'rock',
      },
      {
        id: 'evt-2',
        ts: 1,
        type: 'player.placed',
        playerId: 'p1',
        tileX: 3,
        tileY: 4,
        material: 'wood',
      },
    ]);

    const state = log.getState();
    expect(state.blocks).toEqual([
      { tileX: 1, tileY: 2, material: 'air' },
      { tileX: 3, tileY: 4, material: 'wood' },
    ]);
  });

  it('notifies observers on append', async () => {
    const observer = vi.fn();
    const log = createWorldLog('observer-stream', { observers: [observer] });

    const event: DomainEvent = {
      id: 'evt-x',
      ts: 0,
      type: 'player.mined',
      playerId: 'p',
      tileX: 0,
      tileY: 0,
      material: 'rock',
    };

    await log.append([event]);

    expect(observer).toHaveBeenCalledWith([event]);
  });
});
