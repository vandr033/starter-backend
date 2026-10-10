"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importEsm = importEsm;
/**
 * Keep native dynamic import in CommonJS transpilation.
 * TS can rewrite import() to require() when module=commonjs, which breaks ESM-only packages.
 */
function importEsm(specifier) {
    const dynamicImport = new Function("s", "return import(s)");
    return dynamicImport(specifier);
}
