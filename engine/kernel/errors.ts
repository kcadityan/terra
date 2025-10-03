export type KernelError =
  | { readonly kind: 'material/already-registered'; readonly id: string }
  | { readonly kind: 'material/invalid'; readonly id: string; readonly reasons: ReadonlyArray<string> }
  | { readonly kind: 'kind/already-registered'; readonly id: string }
  | { readonly kind: 'kind/invalid'; readonly id: string; readonly reasons: ReadonlyArray<string> }
  | { readonly kind: 'strike-rule/invalid'; readonly reasons: ReadonlyArray<string> }
  | { readonly kind: 'strike-rule/already-registered'; readonly tool: string; readonly material: string };
