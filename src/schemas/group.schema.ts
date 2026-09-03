import { z } from 'zod';

const isoDateTime = z.string().datetime();
const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');
const timeString = z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM');

function isAbsoluteHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function isUrlOrAbsolutePath(value: string): boolean {
    return value.startsWith('/') || isAbsoluteHttpUrl(value);
}

const imageUrlOrPathSchema = z
    .string()
    .trim()
    .max(512)
    .refine(isUrlOrAbsolutePath, 'Must be a valid URL or absolute path');

export const staffAssignmentSchema = z.object({
    staff_profile_id: z.number().int().positive().nullable().optional(),
    display_name: z.string().trim().min(1).max(255).nullable().optional(),
    display_phone: z.string().trim().min(1).max(64).nullable().optional(),
    role: z.enum(['INSTRUCTOR', 'ASSISTANT']).optional(),
});

export const createGroupEventSchema = z.object({
    title: z.string().trim().min(1).max(255),
    slug: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(10000).nullable().optional(),
    no_availability_message: z.string().max(5000).nullable().optional(),
    cover_image_url: imageUrlOrPathSchema.nullable().optional(),
    thumbnail_url: imageUrlOrPathSchema.nullable().optional(),
    is_private: z.boolean().optional(),
    is_free: z.boolean(),
    price_cents: z.number().int().min(0),
    max_capacity: z.number().int().positive(),
    capacity_visible: z.boolean().optional(),
    registration_question_text: z.string().trim().max(500).nullable().optional(),
    registration_question_required: z.boolean().optional(),
    start_at: isoDateTime,
    end_at: isoDateTime,
    location_text: z.string().max(500).nullable().optional(),
    staff_assignments: z.array(staffAssignmentSchema).max(20).optional(),
});

export const updateGroupEventSchema = createGroupEventSchema.partial();

export const setGroupItemStatusSchema = z.object({
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
});

export const createGroupClassSchema = z.object({
    title: z.string().trim().min(1).max(255),
    slug: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(10000).nullable().optional(),
    cover_image_url: imageUrlOrPathSchema.nullable().optional(),
    thumbnail_url: imageUrlOrPathSchema.nullable().optional(),
    pricing_mode: z.enum(['PER_SESSION', 'WEEKLY_PASS', 'MONTHLY_PASS', 'FULL_COURSE']),
    price_cents: z.number().int().min(0),
    monthly_price_cents: z.number().int().positive().nullable().optional(),
    billing_day: z.number().int().min(1).max(28).nullable().optional(),
    max_capacity_per_session: z.number().int().positive(),
    capacity_visible: z.boolean().optional(),
    session_duration_minutes: z.number().int().min(5),
    recurrence_type: z.enum(['WEEKLY', 'MONTHLY', 'CUSTOM']),
    recurrence_config: z.record(z.string(), z.unknown()),
    recurrence_start_date: dayString,
    recurrence_end_date: dayString.nullable().optional(),
    start_time: timeString,
    location_text: z.string().max(500).nullable().optional(),
    staff_assignments: z.array(staffAssignmentSchema).max(20).optional(),
});

export const updateGroupClassSchema = createGroupClassSchema.partial();

export const createEventBookingSchema = z.object({
    company_id: z.number().int().positive(),
    group_event_id: z.number().int().positive(),
    booked_spots: z.number().int().positive().optional(),
    payment_method: z.enum(['NONE', 'CASH', 'QR']),
    qr_proof_image_url: imageUrlOrPathSchema.nullable().optional(),
    registration_question_answer: z.string().trim().max(5000).nullable().optional(),
    notes: z.string().max(10000).nullable().optional(),
    extra_attendees: z.array(
        z.object({
            full_name: z.string().trim().min(1).max(255),
            email: z.string().trim().email().max(191).nullable().optional(),
            phone: z.string().trim().min(1).max(64).nullable().optional(),
        }).refine((value) => Boolean((value.email ?? '').trim() || (value.phone ?? '').trim()), {
            message: 'email or phone is required',
            path: ['email'],
        }),
    ).max(100).optional(),
}).refine((value) => {
    const spots = value.booked_spots ?? 1;
    const extraCount = value.extra_attendees?.length ?? 0;
    return spots <= 1 ? extraCount === 0 : extraCount === spots - 1;
}, {
    message: 'extra_attendees must match booked_spots - 1',
    path: ['extra_attendees'],
});

export const createClassEnrollmentSchema = z.object({
    company_id: z.number().int().positive(),
    group_class_id: z.number().int().positive(),
    group_class_session_id: z.number().int().positive().optional(),
    payment_method: z.enum(['NONE', 'CASH', 'QR']),
    qr_proof_image_url: imageUrlOrPathSchema.nullable().optional(),
});

export const companyScopedActionSchema = z.object({
    company_id: z.number().int().positive(),
});

export const checkInEventSchema = z.object({
    user_id: z.string().trim().min(1),
    method: z.enum(['QR_SCAN', 'MANUAL']).optional(),
});

export const checkInClassSessionSchema = z.object({
    user_id: z.string().trim().min(1),
    method: z.enum(['QR_SCAN', 'MANUAL']).optional(),
});

export const setClassSessionAttendanceStatusSchema = z.object({
    user_id: z.string().trim().min(1),
    status: z.enum(['SHOW', 'NO_SHOW']),
    method: z.enum(['QR_SCAN', 'MANUAL']).optional(),
});

export const updateSessionPublicAttendanceSchema = z.object({
    public_attendance_enabled: z.boolean().optional(),
    attendance_access_code_enabled: z.boolean(),
    attendance_access_code: z.string().trim().max(64).optional().nullable(),
});

export const publicSessionAttendanceStartSchema = z.object({
    full_name: z.string().trim().min(1).max(191),
    email: z.string().trim().email().max(254),
    countryCode: z.string().trim().length(2).optional(),
    phonePrefix: z.string().trim().min(1).max(8),
    phoneNumber: z.string().trim().min(1).max(32),
});

export const publicSessionAttendanceResendSchema = z.object({
    checkout_session_id: z.string().trim().min(1),
});

export const publicSessionAttendanceVerifySchema = z.object({
    checkout_session_id: z.string().trim().min(1),
    code: z.string().trim().min(1).max(16),
});

export const publicSessionAttendanceSubmitSchema = z.object({
    checkout_session_id: z.string().trim().min(1).optional(),
    access_code: z.string().trim().max(64).optional().nullable(),
    full_name: z.string().trim().min(1).max(191).optional(),
    email: z.string().trim().email().max(254).optional(),
    countryCode: z.string().trim().length(2).optional(),
    phonePrefix: z.string().trim().min(1).max(8).optional(),
    phoneNumber: z.string().trim().min(1).max(32).optional(),
});

export const checkInByTicketSchema = z.object({
    ticket_code: z.string().trim().min(1).max(2048).optional(),
    qr_token: z.string().trim().min(1).max(4096).optional(),
    method: z.enum(['QR_SCAN', 'MANUAL']).optional(),
    class_session_id: z.number().int().positive().optional(),
    event_id: z.number().int().positive().optional(),
}).refine((value) => Boolean(value.ticket_code || value.qr_token), {
    message: 'ticket_code or qr_token is required',
    path: ['ticket_code'],
});

export const checkInFreeEventByCodeSchema = z.object({
    reservation_code: z.string().trim().min(1).max(64),
    method: z.enum(['QR_SCAN', 'MANUAL']).optional(),
});

export type CreateGroupEventDTO = z.infer<typeof createGroupEventSchema>;
export type UpdateGroupEventDTO = z.infer<typeof updateGroupEventSchema>;
export type CreateGroupClassDTO = z.infer<typeof createGroupClassSchema>;
export type UpdateGroupClassDTO = z.infer<typeof updateGroupClassSchema>;
export type CreateEventBookingDTO = z.infer<typeof createEventBookingSchema>;
export type CreateClassEnrollmentDTO = z.infer<typeof createClassEnrollmentSchema>;
export type UpdateSessionPublicAttendanceDTO = z.infer<typeof updateSessionPublicAttendanceSchema>;
