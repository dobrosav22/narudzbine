export type TokenName =
  | 'background' | 'foreground' | 'card' | 'card-foreground' | 'popover' | 'popover-foreground'
  | 'primary' | 'primary-foreground' | 'primary-hover' | 'primary-subtle' | 'primary-subtle-foreground'
  | 'secondary' | 'secondary-foreground' | 'muted' | 'muted-foreground' | 'accent' | 'accent-foreground'
  | 'destructive' | 'border' | 'input' | 'ring'
  | 'success' | 'success-foreground' | 'warning' | 'warning-foreground' | 'info' | 'info-foreground'
  | 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4' | 'chart-5'
  | 'sidebar' | 'sidebar-foreground' | 'sidebar-primary' | 'sidebar-primary-foreground'
  | 'sidebar-accent' | 'sidebar-accent-foreground' | 'sidebar-border' | 'sidebar-ring';

/** Hex values derived from tokens.cjs, for native APIs that need a raw colour. */
export declare const nativeColors: Record<'light' | 'dark', Record<TokenName, string>>;
