import type { Tool } from '../../engine/shared/game-types';

export type MaterialCategory = 'solid' | 'liquid' | 'gas';

export interface DropSpec {
  readonly kind: 'item' | 'material';
  readonly id: string;
  readonly amount: number;
}

export interface MaterialSpec {
  readonly id: string;
  readonly displayName: string;
  readonly category: MaterialCategory;
  readonly hardness: number;
  readonly drop?: DropSpec;
}

export interface KindSpec {
  readonly id: string;
  readonly server: {
    readonly components: Record<string, unknown>;
    readonly hooks?: Record<string, unknown>;
  };
  readonly client?: {
    readonly loadRenderer?: () => Promise<unknown>;
  };
}

export type StrikeOutcome =
  | { readonly kind: 'NoOp' }
  | { readonly kind: 'Error'; readonly code: string }
  | { readonly kind: 'Removed'; readonly drops: ReadonlyArray<{ readonly id: string; readonly qty: number }>; };

export interface StrikeRule {
  readonly tool: Tool;
  readonly material: string;
  readonly outcome: StrikeOutcome;
}
