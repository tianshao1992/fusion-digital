/**
 * Display palette for normalized poloidal flux (psiN), from magnetic axis to
 * LCFS. It is deliberately named for psiN so it cannot be mistaken for a
 * measured temperature, density, pressure or emissivity field.
 */
export const PSI_N_COLORS = Object.freeze([
  '#ff313d',
  '#ff6a38',
  '#ffb62f',
  '#f4e946',
  '#8ee34f',
  '#37d58d',
  '#20c9c3',
  '#25a6df',
  '#3977df',
  '#6651d7',
  '#ad45c7',
]);

export function colorForPsiN(value: number): string {
  const normalized = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return PSI_N_COLORS[Math.round(normalized * (PSI_N_COLORS.length - 1))];
}
