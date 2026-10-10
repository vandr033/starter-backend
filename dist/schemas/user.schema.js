"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserSchema = exports.getUserByEmailSchema = exports.getUserByIdSchema = void 0;
const zod_1 = require("zod");
exports.getUserByIdSchema = zod_1.z.object({
    id: zod_1.z.number()
});
exports.getUserByEmailSchema = zod_1.z.object({
    email: zod_1.z.string().email()
});
exports.updateUserSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    name: zod_1.z.string().min(1),
    id: zod_1.z.number()
});
