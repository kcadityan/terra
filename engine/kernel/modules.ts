import { fold } from '../shared/fp';
import type { Either } from '../shared/fp';
import type { Kernel } from './index';
import type { ServerAPI, ServerModule, ServerModuleMeta } from '../shared/api';
import type { KernelError } from './errors';

const handleResult = (result: Either<KernelError, unknown>): void => {
  fold(result, (err) => {
    throw new Error(`[kernel] syscall failed: ${JSON.stringify(err)}`);
  }, () => undefined);
};

const createServerAPI = (kernel: Kernel): ServerAPI => ({
  registerMaterial(spec) {
    handleResult(kernel.registerMaterial(spec));
  },
  registerKind(spec) {
    handleResult(kernel.registerKind(spec));
  },
  registerStrikeRule(rule) {
    handleResult(kernel.registerStrikeRule(rule));
  },
});

export interface ModuleHost {
  readonly load: (module: ServerModule) => Promise<void>;
  readonly list: () => ReadonlyArray<ServerModuleMeta>;
}

export const createModuleHost = (kernel: Kernel): ModuleHost => {
  const loaded = new Map<string, ServerModuleMeta>();
  const api = createServerAPI(kernel);

  const load = async (module: ServerModule): Promise<void> => {
    if (loaded.has(module.meta.id)) {
      throw new Error(`[kernel] module already loaded: ${module.meta.id}`);
    }
    await module.init(api);
    loaded.set(module.meta.id, module.meta);
  };

  return {
    load,
    list: () => Array.from(loaded.values()),
  };
};
