/**
 * THE design tokens (docs/05-visual-design-system.md). Single source for both
 * apps: tailwind-preset.cjs turns these into CSS variables for apps/web
 * (Tailwind v4, OKLCH as-is) and apps/mobile (NativeWind, sRGB channels).
 * Never redeclare a color in an app — change it here.
 *
 * Values: shadcn init preset b5vnpT7GS (zinc + violet) with the 05 §1
 * corrections from docs/frontend/build-log.md 2026-09-27 "Web theme". All Tailwind v4 palette
 * OKLCH. Names follow shadcn's variable names so shadcn components work
 * unchanged on web.
 */

const zinc950 = 'oklch(0.141 0.005 285.823)';
const white = 'oklch(1 0 0)';

const light = {
  background: white,
  foreground: zinc950,
  card: white,
  'card-foreground': zinc950,
  popover: white,
  'popover-foreground': zinc950,
  primary: 'oklch(0.541 0.281 293.009)', // violet-600
  'primary-foreground': white,
  'primary-hover': 'oklch(0.491 0.27 292.581)', // violet-700
  'primary-subtle': 'oklch(0.943 0.029 294.588)', // violet-100
  'primary-subtle-foreground': 'oklch(0.491 0.27 292.581)',
  secondary: 'oklch(0.967 0.001 286.375)',
  'secondary-foreground': 'oklch(0.21 0.006 285.885)',
  muted: 'oklch(0.967 0.001 286.375)',
  'muted-foreground': 'oklch(0.552 0.016 285.938)',
  accent: 'oklch(0.967 0.001 286.375)',
  'accent-foreground': 'oklch(0.21 0.006 285.885)',
  destructive: 'oklch(0.577 0.245 27.325)',
  border: 'oklch(0.92 0.004 286.32)',
  input: 'oklch(0.92 0.004 286.32)',
  ring: 'oklch(0.541 0.281 293.009)',
  success: 'oklch(0.596 0.145 163.225)', // emerald-600
  'success-foreground': white,
  warning: 'oklch(0.769 0.188 70.08)', // amber-500
  'warning-foreground': 'oklch(0.279 0.077 45.635)',
  info: 'oklch(0.5 0.134 242.749)', // sky-700, muted blue — never purple
  'info-foreground': white,
  'chart-1': 'oklch(0.811 0.111 293.571)',
  'chart-2': 'oklch(0.606 0.25 292.717)',
  'chart-3': 'oklch(0.541 0.281 293.009)',
  'chart-4': 'oklch(0.491 0.27 292.581)',
  'chart-5': 'oklch(0.432 0.232 292.759)',
  sidebar: 'oklch(0.985 0 0)',
  'sidebar-foreground': zinc950,
  'sidebar-primary': 'oklch(0.541 0.281 293.009)',
  'sidebar-primary-foreground': white,
  'sidebar-accent': 'oklch(0.967 0.001 286.375)',
  'sidebar-accent-foreground': 'oklch(0.21 0.006 285.885)',
  'sidebar-border': 'oklch(0.92 0.004 286.32)',
  'sidebar-ring': 'oklch(0.541 0.281 293.009)',
};

const dark = {
  background: zinc950,
  foreground: 'oklch(0.985 0 0)',
  card: 'oklch(0.21 0.006 285.885)',
  'card-foreground': 'oklch(0.985 0 0)',
  popover: 'oklch(0.21 0.006 285.885)',
  'popover-foreground': 'oklch(0.985 0 0)',
  primary: 'oklch(0.702 0.183 293.541)', // violet-400 — lighter than light mode on purpose (05 §1)
  'primary-foreground': zinc950,
  'primary-hover': 'oklch(0.811 0.111 293.571)', // violet-300
  'primary-subtle': 'oklch(0.283 0.141 291.089 / 55%)', // violet-950, low opacity
  'primary-subtle-foreground': 'oklch(0.811 0.111 293.571)',
  secondary: 'oklch(0.274 0.006 286.033)',
  'secondary-foreground': 'oklch(0.985 0 0)',
  muted: 'oklch(0.274 0.006 286.033)',
  'muted-foreground': 'oklch(0.705 0.015 286.067)',
  accent: 'oklch(0.274 0.006 286.033)',
  'accent-foreground': 'oklch(0.985 0 0)',
  destructive: 'oklch(0.704 0.191 22.216)',
  border: 'oklch(1 0 0 / 10%)',
  input: 'oklch(1 0 0 / 15%)',
  ring: 'oklch(0.702 0.183 293.541)',
  success: 'oklch(0.696 0.17 162.48)', // emerald-500
  'success-foreground': 'oklch(0.262 0.051 172.552)',
  warning: 'oklch(0.828 0.189 84.429)', // amber-400
  'warning-foreground': 'oklch(0.279 0.077 45.635)',
  info: 'oklch(0.746 0.16 232.661)', // sky-400
  'info-foreground': zinc950,
  'chart-1': 'oklch(0.811 0.111 293.571)',
  'chart-2': 'oklch(0.606 0.25 292.717)',
  'chart-3': 'oklch(0.541 0.281 293.009)',
  'chart-4': 'oklch(0.491 0.27 292.581)',
  'chart-5': 'oklch(0.432 0.232 292.759)',
  sidebar: 'oklch(0.21 0.006 285.885)',
  'sidebar-foreground': 'oklch(0.985 0 0)',
  'sidebar-primary': 'oklch(0.702 0.183 293.541)',
  'sidebar-primary-foreground': zinc950,
  'sidebar-accent': 'oklch(0.274 0.006 286.033)',
  'sidebar-accent-foreground': 'oklch(0.985 0 0)',
  'sidebar-border': 'oklch(1 0 0 / 10%)',
  'sidebar-ring': 'oklch(0.702 0.183 293.541)',
};

module.exports = {
  colors: { light, dark },
  /** 05 §3: shadcn "radius: 0.625rem". Web derives sm…4xl from it in globals.css. */
  radius: '0.625rem',
};
