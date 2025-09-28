import { describe, expect, it, vi } from 'vitest';
import { TerraEventBus } from '../bus';

const fakeClient = { sessionId: 'test' } as any;

describe('TerraEventBus', () => {
  it('registers and emits listeners', () => {
    const bus = new TerraEventBus();
    const listener = vi.fn();
    bus.on('action-denied', listener);

    bus.emit('action-denied', { client: fakeClient, reason: 'test' });

    expect(listener).toHaveBeenCalledWith({ client: fakeClient, reason: 'test' });
  });

  it('supports unsubscribe', () => {
    const bus = new TerraEventBus();
    const listener = vi.fn();
    const off = bus.on('player-shot', listener);
    off();
    bus.emit('player-shot', {
      payload: { type: 'player-shot', shooterId: 'a', originX: 0, originY: 0, dirX: 1, dirY: 0, hitId: null },
    });
    expect(listener).not.toHaveBeenCalled();
  });
});
