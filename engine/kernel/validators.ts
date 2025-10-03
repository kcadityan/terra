import { failure, success, type Validation } from '../shared/fp';
import type { KindSpec, MaterialSpec, StrikeRule } from '../shared/specs';

const MATERIAL_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/i;

export const validateMaterialSpec = (spec: MaterialSpec): Validation<string, MaterialSpec> => {
  const issues: string[] = [];
  if (!spec.id || typeof spec.id !== 'string') issues.push('id/empty');
  if (spec.id && !MATERIAL_ID.test(spec.id)) issues.push('id/invalid-format');
  if (!spec.displayName) issues.push('displayName/empty');
  if (spec.hardness <= 0) issues.push('hardness/non-positive');
  if (spec.drop) {
    if (spec.drop.amount <= 0) issues.push('drop/amount');
    if (!spec.drop.id) issues.push('drop/id');
  }
  return issues.length === 0 ? success(spec) : failure(...issues);
};

export const validateKindSpec = (spec: KindSpec): Validation<string, KindSpec> => {
  const issues: string[] = [];
  if (!spec.id) issues.push('id/empty');
  if (!spec.server) issues.push('server/missing');
  if (spec.server && !spec.server.components) issues.push('server/components');
  return issues.length === 0 ? success(spec) : failure(...issues);
};

export const validateStrikeRule = (rule: StrikeRule): Validation<string, StrikeRule> => {
  const issues: string[] = [];
  if (!rule.tool) issues.push('tool/empty');
  if (!rule.material) issues.push('material/empty');
  if (rule.outcome.kind === 'Removed' && rule.outcome.drops.length === 0) issues.push('drops/empty');
  return issues.length === 0 ? success(rule) : failure(...issues);
};
