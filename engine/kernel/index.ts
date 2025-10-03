import { left, right } from '../shared/fp';
import type { Either } from '../shared/fp';
import type { MaterialSpec, KindSpec, StrikeRule } from '../shared/specs';
import type { KernelError } from './errors';
import { addKind, addMaterial, addStrikeRule, emptyRegistry, type KernelRegistry } from './registry';
import { isSuccess, type Validation } from '../shared/fp';
import { validateKindSpec, validateMaterialSpec, validateStrikeRule } from './validators';
import { createWorldLog, type WorldLog, type WorldLogOptions } from './world-log';

export interface KernelOptions extends WorldLogOptions {
  readonly stream?: string;
}

export interface Kernel {
  readonly worldLog: WorldLog;
  readonly getRegistry: () => KernelRegistry;
  readonly registerMaterial: (spec: MaterialSpec) => Either<KernelError, MaterialSpec>;
  readonly registerKind: (spec: KindSpec) => Either<KernelError, KindSpec>;
  readonly registerStrikeRule: (rule: StrikeRule) => Either<KernelError, StrikeRule>;
}

const asError = <T extends { id?: string }>(
  validation: Validation<string, T>,
  toError: (reasons: ReadonlyArray<string>) => KernelError,
): KernelError | null => (isSuccess(validation) ? null : toError(validation.errors));

export const createKernel = (options?: KernelOptions): Kernel => {
  let registry = emptyRegistry();
  const worldLog = createWorldLog(options?.stream ?? 'terra', options);

  const registerMaterial = (spec: MaterialSpec): Either<KernelError, MaterialSpec> => {
    if (registry.materials.has(spec.id)) {
      return left({ kind: 'material/already-registered', id: spec.id });
    }
    const validation = validateMaterialSpec(spec);
    const err = asError(validation, (reasons) => ({ kind: 'material/invalid', id: spec.id, reasons }));
    if (err) return left(err);
    registry = addMaterial(registry, spec);
    return right(spec);
  };

  const registerKind = (spec: KindSpec): Either<KernelError, KindSpec> => {
    if (registry.kinds.has(spec.id)) {
      return left({ kind: 'kind/already-registered', id: spec.id });
    }
    const validation = validateKindSpec(spec);
    const err = asError(validation, (reasons) => ({ kind: 'kind/invalid', id: spec.id, reasons }));
    if (err) return left(err);
    registry = addKind(registry, spec);
    return right(spec);
  };

  const registerStrikeRule = (rule: StrikeRule): Either<KernelError, StrikeRule> => {
    if (!registry.materials.has(rule.material)) {
      return left({ kind: 'strike-rule/invalid', reasons: ['material/missing'] });
    }
    const toolRules = registry.strikeRules.get(rule.tool);
    if (toolRules?.has(rule.material)) {
      return left({ kind: 'strike-rule/already-registered', tool: rule.tool, material: rule.material });
    }
    const validation = validateStrikeRule(rule);
    if (!isSuccess(validation)) {
      return left({ kind: 'strike-rule/invalid', reasons: validation.errors });
    }
    registry = addStrikeRule(registry, rule);
    return right(rule);
  };

  return {
    worldLog,
    getRegistry: () => registry,
    registerMaterial,
    registerKind,
    registerStrikeRule,
  };
};
