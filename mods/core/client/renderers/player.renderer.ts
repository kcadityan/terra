import type { ClientRenderer } from '../../../../engine/shared/api';

export const playerRenderer: ClientRenderer = {
  async mount(eid, scene) {
    const handle = scene.createSprite(0, 0, 'player');
    scene.bindEntity(eid, handle);
    scene.playAnim(handle, 'idle');
  },
  update(eid, scene, interp) {
    const handle = scene.getBound(eid);
    if (!handle) return;
    const x = typeof interp.x === 'number' ? interp.x : 0;
    const y = typeof interp.y === 'number' ? interp.y : 0;
    scene.setPosition(handle, x, y);
    if (typeof interp.facing === 'number' && scene.setRotation) {
      scene.setRotation(handle, interp.facing === -1 ? Math.PI : 0);
    }
    const speed = typeof interp.speed === 'number' ? interp.speed : 0;
    scene.playAnim(handle, speed > 0.1 ? 'run' : 'idle');
  },
  unmount(eid, scene) {
    const handle = scene.getBound(eid);
    if (!handle) return;
    scene.remove(handle);
    scene.unbindEntity(eid);
  },
};
