import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá el formato AAAA-MM-DD.');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usá el formato HH:mm.');

export const publicRestaurantSlugSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/i, 'Restaurante inválido.');
export const publicRestaurantCodeSchema = z.string().trim().min(20).max(48).regex(/^[A-Za-z0-9_-]+$/, 'Código de reserva inválido.');
export const publicRestaurantAvailabilitySchema = z.object({
  date,
  partySize: z.coerce.number().int().min(1).max(100),
});
export const createPublicRestaurantReservationSchema = z.object({
  date,
  time,
  partySize: z.number().int().min(1).max(100),
  customer: z.object({
    name: z.string().trim().min(1, 'El nombre es obligatorio.').max(160),
    phone: z.string().trim().max(32).optional().nullable(),
    phonePrefix: z.string().trim().regex(/^\d{1,5}$/, 'Prefijo telefónico inválido.').optional().nullable(),
    countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/, 'País inválido.').optional().nullable(),
    email: z.string().trim().email('Ingresá un correo válido.').max(255).optional().nullable(),
  }),
  guests: z.array(z.object({
    name: z.string().trim().min(1, 'El nombre del acompañante es obligatorio.').max(160),
    phone: z.string().trim().min(6, 'Ingresá un WhatsApp válido.').max(32),
    phonePrefix: z.string().trim().regex(/^\d{1,5}$/, 'Prefijo telefónico inválido.').optional().nullable(),
    countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/, 'País inválido.').optional().nullable(),
  })).max(99).optional().default([]),
  depositProofImageUrl: z.string().trim().max(512).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
}).strict().superRefine((input, ctx) => {
  if (input.guests.length > input.partySize - 1) {
    ctx.addIssue({ code: 'custom', path: ['guests'], message: 'La cantidad de acompañantes supera el tamaño del grupo.' });
  }
  const phones = input.guests.map((guest) => guest.phone.replace(/\D/g, '')).filter(Boolean);
  if (new Set(phones).size !== phones.length) {
    ctx.addIssue({ code: 'custom', path: ['guests'], message: 'No repitas el mismo WhatsApp entre acompañantes.' });
  }
});
export const cancelPublicRestaurantReservationSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
}).strict();
