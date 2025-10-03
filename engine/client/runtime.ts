import type { ClientAPI, ClientModule, RendererLoader, SceneAPI } from '../shared/api';
import type { ClientRenderer } from '../shared/api';

export interface ClientRuntime {
  readonly api: ClientAPI;
  readonly loadModule: (module: ClientModule) => Promise<void>;
  readonly mount: (kindId: string, eid: string) => Promise<void>;
  readonly update: (eid: string, interp: Record<string, unknown>) => void;
  readonly unmount: (eid: string) => void;
  readonly hasEntity: (eid: string) => boolean;
}

export const createClientRuntime = (scene: SceneAPI): ClientRuntime => {
  const loaders = new Map<string, RendererLoader>();
  const renderers = new Map<string, ClientRenderer>();
  const entities = new Map<string, { kindId: string; renderer: ClientRenderer }>();

  const ensureRenderer = async (kindId: string): Promise<ClientRenderer> => {
    if (renderers.has(kindId)) return renderers.get(kindId)!;
    const loader = loaders.get(kindId);
    if (!loader) {
      throw new Error(`[client-runtime] no renderer registered for kind ${kindId}`);
    }
    const renderer = await loader();
    renderers.set(kindId, renderer);
    return renderer;
  };

  const api: ClientAPI = {
    registerRenderer(kindId, loader) {
      loaders.set(kindId, loader);
    },
  };

  const loadModule = async (module: ClientModule): Promise<void> => {
    await module.initClient(api);
  };

  const mount = async (kindId: string, eid: string): Promise<void> => {
    const renderer = await ensureRenderer(kindId);
    await renderer.mount(eid, scene);
    entities.set(eid, { kindId, renderer });
  };

  const update = (eid: string, interp: Record<string, unknown>): void => {
    const entry = entities.get(eid);
    if (!entry) return;
    entry.renderer.update(eid, scene, interp);
  };

  const unmount = (eid: string): void => {
    const entry = entities.get(eid);
    if (!entry) return;
    entry.renderer.unmount(eid, scene);
    entities.delete(eid);
  };

  return {
    api,
    loadModule,
    mount,
    update,
    unmount,
    hasEntity: (eid) => entities.has(eid),
  };
};
