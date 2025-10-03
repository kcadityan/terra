import type { StrikeRule, KindSpec, MaterialSpec } from './specs';

export type RendererLoader = () => Promise<ClientRenderer>;

export interface SceneAPI {
  loadImage(key: string, url: string): Promise<void>;
  loadGLB?(url: string): Promise<unknown>;
  createSprite(x: number, y: number, key: string): unknown;
  createModel?(url: string): Promise<unknown>;
  bindEntity(eid: string, handle: unknown): void;
  unbindEntity(eid: string): void;
  getBound(eid: string): unknown | undefined;
  remove(handle: unknown): void;
  setPosition(handle: unknown, x: number, y: number): void;
  setRotation?(handle: unknown, rotation: number): void;
  playAnim(handle: unknown, name: string): void;
}

export interface ClientRenderer {
  mount(eid: string, scene: SceneAPI): Promise<void>;
  update(eid: string, scene: SceneAPI, interp: Record<string, unknown>): void;
  unmount(eid: string, scene: SceneAPI): void;
}

export interface ClientAPI {
  registerRenderer(kindId: string, loader: RendererLoader): void;
}

export interface ServerAPI {
  registerMaterial(spec: MaterialSpec): void;
  registerKind(spec: KindSpec): void;
  registerStrikeRule(rule: StrikeRule): void;
}

export interface ServerModuleMeta {
  readonly id: string;
  readonly version: string;
}

export interface ServerModule {
  readonly meta: ServerModuleMeta;
  init(api: ServerAPI): Promise<void> | void;
}

export interface ClientModule {
  readonly meta: { readonly id: string; readonly version: string };
  initClient(api: ClientAPI): Promise<void> | void;
}
