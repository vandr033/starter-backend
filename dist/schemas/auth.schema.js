"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerUserSchema = exports.logoutAllSchema = exports.logoutSchema = exports.checkRefreshSchema = exports.refreshSchema = exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
exports.registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    name: zod_1.z.string().min(1).optional()
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1)
});
exports.refreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(1),
    userId: zod_1.z.number()
});
exports.checkRefreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(1),
});
exports.logoutSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(1),
    userId: zod_1.z.number()
});
exports.logoutAllSchema = zod_1.z.object({
    userId: zod_1.z.number()
});
exports.registerUserSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    firstName: zod_1.z.string().min(1),
    lastName: zod_1.z.string().min(1).optional(),
    phone: zod_1.z.string().min(1).optional(),
    phonePrefix: zod_1.z.string().min(1).optional(),
    companyId: zod_1.z.number().optional(),
});
