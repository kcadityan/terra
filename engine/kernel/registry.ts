import type { MaterialSpec, KindSpec, StrikeRule } from '../shared/specs';

export interface KernelRegistry {
  readonly materials: ReadonlyMap<string, MaterialSpec>;
  readonly kinds: ReadonlyMap<string, KindSpec>;
  readonly strikeRules: ReadonlyMap<string, ReadonlyMap<string, StrikeRule>>;
}

export const emptyRegistry = (): KernelRegistry => ({
  materials: new Map(),
  kinds: new Map(),
  strikeRules: new Map(),
});

export const addMaterial = (registry: KernelRegistry, spec: MaterialSpec): KernelRegistry => ({
  ...registry,
  materials: (() => {
    const materials = new Map(registry.materials);
    materials.set(spec.id, spec);
    return materials;
  })(),
});

export const addKind = (registry: KernelRegistry, spec: KindSpec): KernelRegistry => ({
  ...registry,
  kinds: (() => {
    const kinds = new Map(registry.kinds);
    kinds.set(spec.id, spec);
    return kinds;
  })(),
});

export const addStrikeRule = (registry: KernelRegistry, rule: StrikeRule): KernelRegistry => {
  const nextRules = new Map(registry.strikeRules);
  const materialRules = new Map(nextRules.get(rule.tool) ?? new Map());
  materialRules.set(rule.material, rule);
  nextRules.set(rule.tool, materialRules);
  return { ...registry, strikeRules: nextRules };
};
