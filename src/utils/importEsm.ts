/**
 * Keep native dynamic import in CommonJS transpilation.
 * TS can rewrite import() to require() when module=commonjs, which breaks ESM-only packages.
 */
export function importEsm<T = any>(specifier: string): Promise<T> {
  const dynamicImport = new Function("s", "return import(s)") as (s: string) => Promise<T>;
  return dynamicImport(specifier);
}
