export const clamp = (value: number, low = 0, high = 1) =>
  Math.max(low, Math.min(high, value));

export const finiteClamp = (
  value: number,
  low: number,
  high: number,
  fallback: number,
) => clamp(Number.isFinite(value) ? value : fallback, low, high);

export const approach = (
  current: number,
  target: number,
  dt: number,
  timeConstant: number,
) => target + (current - target) * Math.exp(-dt / timeConstant);

export const smoothstep = (value: number) => {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
};

export const mod = (value: number, base: number) =>
  ((value % base) + base) % base;

export const validateUnit = (name: string, value: number) => {
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new Error(`${name} must be a finite value from 0 to 1`);
};

export const validateNonNegative = (name: string, value: number) => {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${name} must be a non-negative finite value`);
};
