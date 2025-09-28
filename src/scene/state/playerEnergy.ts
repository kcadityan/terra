export interface EnergyState {
  readonly energy: number;
  readonly hp: number;
  readonly accumMoveMs: number;
  readonly accumIdleMs: number;
}

export interface EnergyInputs {
  readonly moving: boolean;
  readonly mining: boolean;
  readonly deltaMs: number;
  readonly drainFactor: number;
}

export interface EnergyUpdateResult {
  readonly energy: number;
  readonly hp: number;
  readonly accumMoveMs: number;
  readonly accumIdleMs: number;
  readonly energyDelta: number;
  readonly hpDelta: number;
}

const MAX_VALUE = 100;
const MIN_VALUE = 0;

function clamp(value: number): number {
  return Math.max(MIN_VALUE, Math.min(MAX_VALUE, value));
}

export function advanceEnergy(state: EnergyState, inputs: EnergyInputs): EnergyUpdateResult {
  let energy = state.energy;
  let hp = state.hp;
  let moveMs = state.accumMoveMs;
  let idleMs = state.accumIdleMs;
  let energyDelta = 0;
  let hpDelta = 0;

  if (inputs.moving) {
    moveMs += inputs.deltaMs;
    while (moveMs >= 1000) {
      const drain = 0.2 * inputs.drainFactor;
      energy -= drain;
      energyDelta -= drain;
      moveMs -= 1000;
    }
    idleMs = 0;
  } else if (!inputs.mining) {
    idleMs += inputs.deltaMs;
    while (idleMs >= 1000) {
      energy += 10;
      energyDelta += 10;
      idleMs -= 1000;
    }
  }

  energy = clamp(energy);

  if (energy <= 0) {
    const damage = 5 * (inputs.deltaMs / 1000);
    hp -= damage;
    hpDelta -= damage;
    hp = clamp(hp);
  }

  return {
    energy,
    hp,
    accumMoveMs: moveMs,
    accumIdleMs: idleMs,
    energyDelta,
    hpDelta,
  };
}
