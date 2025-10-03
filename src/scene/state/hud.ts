import type { SolidMaterial } from '../../../engine/shared/protocol';

export interface HudInputs {
  hp: number;
  energy: number;
  activeLabel: string;
  selectedMaterial: SolidMaterial | string | null;
  weight: number;
  speedFactor: number;
}

export interface HudState {
  text: string;
  hpFraction: number;
  energyFraction: number;
}

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function formatSelected(selected: SolidMaterial | string | null): string {
  if (selected === null) return '—';
  return String(selected);
}

export function deriveHudState(inputs: HudInputs): HudState {
  const hpFraction = clampFraction(inputs.hp / 100);
  const energyFraction = clampFraction(inputs.energy / 100);
  const speedPercent = Math.max(0, Math.round(inputs.speedFactor * 100));
  const selectedLabel = formatSelected(inputs.selectedMaterial);

  const text =
    `HP: ${inputs.hp}  Energy: ${inputs.energy}  Active: ${inputs.activeLabel}` +
    `  Block: ${selectedLabel}\n` +
    `Weight: ${inputs.weight}  Speed: ${speedPercent}%`;

  return { text, hpFraction, energyFraction };
}
