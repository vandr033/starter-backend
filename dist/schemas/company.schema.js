"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCompanyContentSchema = exports.updateCompanySchema = void 0;
const zod_1 = require("zod");
const nullableStringField = zod_1.z.union([zod_1.z.string(), zod_1.z.null()]).optional();
exports.updateCompanySchema = zod_1.z
    .object({
    currency: zod_1.z.string().trim().min(1).max(3).optional(),
})
    .passthrough();
exports.updateCompanyContentSchema = zod_1.z
    .object({
    about_us_text: nullableStringField,
    our_story_text: nullableStringField,
    about_us_hero_text: nullableStringField,
    logo_url: nullableStringField,
    home_hero_image_url: nullableStringField,
    about_hero_image_url: nullableStringField,
    about_image_1_url: nullableStringField,
    about_image_2_url: nullableStringField,
    about_image_3_url: nullableStringField,
})
    .passthrough();
