/** Normalize Next.js `searchParams` entry to a single string. */
export function pickSearchParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  const s = Array.isArray(v) ? v[0] : v;
  return s === '' ? undefined : s;
}
