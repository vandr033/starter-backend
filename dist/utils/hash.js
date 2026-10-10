"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashCode = hashCode;
exports.verifyCode = verifyCode;
// src/utils/hash.ts
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const ROUNDS = 10;
async function hashCode(code) {
    return bcryptjs_1.default.hash(code, ROUNDS);
}
async function verifyCode(code, hash) {
    return bcryptjs_1.default.compare(code, hash);
}
