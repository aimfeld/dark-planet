import { describe, expect, it } from 'vitest';
import { cosDeg, round, sinDeg, TpRandom } from '../src/sim/tp';

describe('Turbo Pascal helpers', () => {
  it('Random(n) stays in range and repeats for the same seed', () => {
    const a = new TpRandom(1234), b = new TpRandom(1234);
    for (let i = 0; i < 10000; i++) {
      const v = a.next(100);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(100);
      expect(b.next(100)).toBe(v);
    }
  });

  it('Random(n) is roughly uniform', () => {
    const r = new TpRandom(42);
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 100000; i++) counts[r.next(10)]++;
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(500);
  });

  it('Round rounds halves away from zero', () => {
    expect(round(2.5)).toBe(3);
    expect(round(-2.5)).toBe(-3);
    expect(round(2.49)).toBe(2);
    expect(round(-0.4)).toBe(-0);
  });

  it('sinDeg/cosDeg match Math.sin/cos', () => {
    for (let d = -720; d <= 720; d += 0.37) {
      expect(sinDeg(d)).toBeCloseTo(Math.sin((d * Math.PI) / 180), 12);
      expect(cosDeg(d)).toBeCloseTo(Math.cos((d * Math.PI) / 180), 12);
    }
  });
});
