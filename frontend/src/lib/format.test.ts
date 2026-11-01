import { describe, expect, it } from 'vitest';
import { formatCountdown, parseBRL } from './format';

describe('parseBRL', () => {
  it.each([
    ['1.234,56', 123456],
    ['1234,5', 123450],
    ['R$ 1.000', 100000],
    ['1000', 100000],
    ['1234.56', 123456],
    ['0,99', 99],
  ])('%s → %i centavos', (input, cents) => expect(parseBRL(input)).toBe(cents));

  it.each(['', 'abc', '1,234,5', '12,345'])('rejeita "%s"', (input) => expect(parseBRL(input)).toBeNull());
});

describe('formatCountdown', () => {
  it('formata horas e dias', () => {
    expect(formatCountdown(3_661_000)).toBe('01:01:01');
    expect(formatCountdown(2 * 86_400_000 + 3_600_000)).toBe('2d 01h 00m');
    expect(formatCountdown(-5)).toBe('00:00:00');
  });
});
