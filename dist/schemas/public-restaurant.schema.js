"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelPublicRestaurantReservationSchema = exports.createPublicRestaurantReservationSchema = exports.publicRestaurantAvailabilitySchema = exports.publicRestaurantCodeSchema = exports.publicRestaurantSlugSchema = void 0;
const zod_1 = require("zod");
const date = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá el formato AAAA-MM-DD.');
const time = zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usá el formato HH:mm.');
exports.publicRestaurantSlugSchema = zod_1.z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/i, 'Restaurante inválido.');
exports.publicRestaurantCodeSchema = zod_1.z.string().trim().min(20).max(48).regex(/^[A-Za-z0-9_-]+$/, 'Código de reserva inválido.');
exports.publicRestaurantAvailabilitySchema = zod_1.z.object({
    date,
    partySize: zod_1.z.coerce.number().int().min(1).max(100),
});
exports.createPublicRestaurantReservationSchema = zod_1.z.object({
    date,
    time,
    partySize: zod_1.z.number().int().min(1).max(100),
    customer: zod_1.z.object({
        name: zod_1.z.string().trim().min(1, 'El nombre es obligatorio.').max(160),
        phone: zod_1.z.string().trim().max(32).optional().nullable(),
        phonePrefix: zod_1.z.string().trim().regex(/^\d{1,5}$/, 'Prefijo telefónico inválido.').optional().nullable(),
        countryCode: zod_1.z.string().trim().regex(/^[A-Za-z]{2}$/, 'País inválido.').optional().nullable(),
        email: zod_1.z.string().trim().email('Ingresá un correo válido.').max(255).optional().nullable(),
    }),
    guests: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string().trim().min(1, 'El nombre del acompañante es obligatorio.').max(160),
        phone: zod_1.z.string().trim().min(6, 'Ingresá un WhatsApp válido.').max(32),
        phonePrefix: zod_1.z.string().trim().regex(/^\d{1,5}$/, 'Prefijo telefónico inválido.').optional().nullable(),
        countryCode: zod_1.z.string().trim().regex(/^[A-Za-z]{2}$/, 'País inválido.').optional().nullable(),
    })).max(99).optional().default([]),
    depositProofImageUrl: zod_1.z.string().trim().max(512).optional().nullable(),
    notes: zod_1.z.string().trim().max(2000).optional().nullable(),
}).strict().superRefine((input, ctx) => {
    if (input.guests.length > input.partySize - 1) {
        ctx.addIssue({ code: 'custom', path: ['guests'], message: 'La cantidad de acompañantes supera el tamaño del grupo.' });
    }
    const phones = input.guests.map((guest) => guest.phone.replace(/\D/g, '')).filter(Boolean);
    if (new Set(phones).size !== phones.length) {
        ctx.addIssue({ code: 'custom', path: ['guests'], message: 'No repitas el mismo WhatsApp entre acompañantes.' });
    }
});
exports.cancelPublicRestaurantReservationSchema = zod_1.z.object({
    reason: zod_1.z.string().trim().min(1).max(500).optional(),
}).strict();
