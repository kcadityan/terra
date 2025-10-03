import type { ClientAPI } from '../../../engine/shared/api';

export const coreClientModule = {
  meta: { id: 'core.terra', version: '1.0.0' },
  async initClient(api: ClientAPI) {
    api.registerRenderer('core.terra.player', async () =>
      (await import('./renderers/player.renderer')).playerRenderer,
    );
  },
};

export type CoreClientModule = typeof coreClientModule;

export default coreClientModule;
