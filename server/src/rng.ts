import { DeterministicRng } from './types.js';

export function createRng(seedString: string): DeterministicRng {
  let seed = 0;
  for (let i = 0; i < seedString.length; i += 1) {
    seed = (seed * 31 + seedString.charCodeAt(i)) >>> 0;
  }
  const rng: DeterministicRng = {
    seed,
    next: () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 0xffffffff;
    }
  };
  return rng;
}
