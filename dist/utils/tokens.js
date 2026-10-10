"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = exports.signRefresh = exports.signAccess = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const secret = env_1.env.jwtSecret;
const signAccess = (payload, exp = '15m') => jsonwebtoken_1.default.sign(payload, secret, { expiresIn: exp });
exports.signAccess = signAccess;
const signRefresh = (payload, exp = '7d') => jsonwebtoken_1.default.sign(payload, secret, { expiresIn: exp });
exports.signRefresh = signRefresh;
const verifyToken = (t) => jsonwebtoken_1.default.verify(t, secret);
exports.verifyToken = verifyToken;
