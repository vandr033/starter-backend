import { z } from 'zod';

const nullableStringField = z.union([z.string(), z.null()]).optional();

export const updateCompanySchema = z
  .object({
    currency: z.string().trim().min(1).max(3).optional(),
  })
  .passthrough();

export const updateCompanyContentSchema = z
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
