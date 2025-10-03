export function hash01(x: number, seed = 1337): number {
  let h = Math.imul(x ^ seed, 0x27d4eb2d);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h ^= 0xc2b2ae35;
  return ((h >>> 0) % 100000) / 100000;
}

export function valueNoise1D(x: number, seed = 1337, freq = 0.05): number {
  const xf = x * freq;
  const x0 = Math.floor(xf), x1 = x0 + 1;
  const t = xf - x0;
  const v0 = hash01(x0, seed);
  const v1 = hash01(x1, seed);
  const tt = t * t * (3 - 2 * t); // smoothstep
  return v0 * (1 - tt) + v1 * tt; // [0,1]
}
