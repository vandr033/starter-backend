"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compare = exports.hash = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const hash = (s) => bcryptjs_1.default.hash(s, 10);
exports.hash = hash;
const compare = (s, h) => bcryptjs_1.default.compare(s, h);
exports.compare = compare;
