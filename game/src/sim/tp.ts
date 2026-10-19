// Turbo Pascal 7 runtime pieces the game logic relies on.
// The simulation must be deterministic on every JS engine, so it uses no Math.sin/cos/random:
// only +, -, *, / on doubles, which IEEE 754 defines exactly.

/** TP7 System.Random: RandSeed := RandSeed * $08088405 + 1; Random(n) = high 32 bits of RandSeed * n. */
export class TpRandom {
  constructor(public seed = 0) {}

  /** Random(n): 0 <= result < n (0 when n <= 0, like TP). */
  next(n: number): number {
    this.seed = (Math.imul(this.seed, 0x08088405) + 1) >>> 0;
    if (n <= 0) return 0;
    // (seed * n) >> 32 without losing precision: split the seed into 16-bit halves
    const hi = (this.seed >>> 16) * n;
    const lo = (this.seed & 0xffff) * n;
    return Math.floor((hi + Math.floor(lo / 65536)) / 65536);
  }
}

/** TP Round: to the nearest integer, halves away from zero (software Real, RTL 30ea:12B8). */
export function round(x: number): number {
  return x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5);
}

/** Pascal `div` (truncates toward zero) and `mod` (sign of the dividend). */
export function div(a: number, b: number): number {
  return Math.trunc(a / b);
}
export function mod(a: number, b: number): number {
  return a - Math.trunc(a / b) * b;
}

const PI = 3.141592653589793;

/** sin(x) for |x| <= pi/2 by its Taylor series (error < 1e-15 there). */
function sinSeries(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let k = 1; k <= 9; k++) {
    term = (-term * x2) / ((2 * k) * (2 * k + 1));
    sum += term;
  }
  return sum;
}

/** Sine of an angle in degrees. */
export function sinDeg(deg: number): number {
  let a = deg - Math.floor(deg / 360) * 360; // 0 <= a < 360
  let sign = 1;
  if (a >= 180) {
    a -= 180;
    sign = -1;
  }
  if (a > 90) a = 180 - a;
  return sign * sinSeries((a * PI) / 180);
}

/** Cosine of an angle in degrees. */
export function cosDeg(deg: number): number {
  return sinDeg(deg + 90);
}
