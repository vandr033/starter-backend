"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkInFreeEventByCodeSchema = exports.checkInByTicketSchema = exports.publicSessionAttendanceSubmitSchema = exports.publicSessionAttendanceVerifySchema = exports.publicSessionAttendanceResendSchema = exports.publicSessionAttendanceStartSchema = exports.updateSessionPublicAttendanceSchema = exports.setClassSessionAttendanceStatusSchema = exports.checkInClassSessionSchema = exports.checkInEventSchema = exports.companyScopedActionSchema = exports.createClassEnrollmentSchema = exports.createEventBookingSchema = exports.updateGroupClassSchema = exports.createGroupClassSchema = exports.setGroupItemStatusSchema = exports.updateGroupEventSchema = exports.createGroupEventSchema = exports.staffAssignmentSchema = void 0;
const zod_1 = require("zod");
const isoDateTime = zod_1.z.string().datetime();
const dayString = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');
const timeString = zod_1.z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM');
function isAbsoluteHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    }
    catch {
        return false;
    }
}
function isUrlOrAbsolutePath(value) {
    return value.startsWith('/') || isAbsoluteHttpUrl(value);
}
const imageUrlOrPathSchema = zod_1.z
    .string()
    .trim()
    .max(512)
    .refine(isUrlOrAbsolutePath, 'Must be a valid URL or absolute path');
exports.staffAssignmentSchema = zod_1.z.object({
    staff_profile_id: zod_1.z.number().int().positive().nullable().optional(),
    display_name: zod_1.z.string().trim().min(1).max(255).nullable().optional(),
    display_phone: zod_1.z.string().trim().min(1).max(64).nullable().optional(),
    role: zod_1.z.enum(['INSTRUCTOR', 'ASSISTANT']).optional(),
});
exports.createGroupEventSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(1).max(255),
    category_id: zod_1.z.number().int().positive(),
    slug: zod_1.z.string().trim().min(1).max(255).optional(),
    description: zod_1.z.string().max(10000).nullable().optional(),
    no_availability_message: zod_1.z.string().max(5000).nullable().optional(),
    cover_image_url: imageUrlOrPathSchema.nullable().optional(),
    thumbnail_url: imageUrlOrPathSchema.nullable().optional(),
    is_private: zod_1.z.boolean().optional(),
    is_free: zod_1.z.boolean(),
    price_cents: zod_1.z.number().int().min(0),
    max_capacity: zod_1.z.number().int().positive(),
    capacity_visible: zod_1.z.boolean().optional(),
    registration_question_text: zod_1.z.string().trim().max(500).nullable().optional(),
    registration_question_required: zod_1.z.boolean().optional(),
    start_at: isoDateTime,
    end_at: isoDateTime,
    location_text: zod_1.z.string().max(500).nullable().optional(),
    staff_assignments: zod_1.z.array(exports.staffAssignmentSchema).max(20).optional(),
});
exports.updateGroupEventSchema = exports.createGroupEventSchema.partial();
exports.setGroupItemStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
});
exports.createGroupClassSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(1).max(255),
    category_id: zod_1.z.number().int().positive(),
    slug: zod_1.z.string().trim().min(1).max(255).optional(),
    description: zod_1.z.string().max(10000).nullable().optional(),
    cover_image_url: imageUrlOrPathSchema.nullable().optional(),
    thumbnail_url: imageUrlOrPathSchema.nullable().optional(),
    pricing_mode: zod_1.z.enum(['PER_SESSION', 'WEEKLY_PASS', 'MONTHLY_PASS', 'FULL_COURSE']),
    price_cents: zod_1.z.number().int().min(0),
    monthly_price_cents: zod_1.z.number().int().positive().nullable().optional(),
    billing_day: zod_1.z.number().int().min(1).max(28).nullable().optional(),
    max_capacity_per_session: zod_1.z.number().int().positive(),
    capacity_visible: zod_1.z.boolean().optional(),
    session_duration_minutes: zod_1.z.number().int().min(5),
    recurrence_type: zod_1.z.enum(['WEEKLY', 'MONTHLY', 'CUSTOM']),
    recurrence_config: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    recurrence_start_date: dayString,
    recurrence_end_date: dayString.nullable().optional(),
    start_time: timeString,
    location_text: zod_1.z.string().max(500).nullable().optional(),
    staff_assignments: zod_1.z.array(exports.staffAssignmentSchema).max(20).optional(),
});
exports.updateGroupClassSchema = exports.createGroupClassSchema.partial();
exports.createEventBookingSchema = zod_1.z.object({
    company_id: zod_1.z.number().int().positive(),
    group_event_id: zod_1.z.number().int().positive(),
    booked_spots: zod_1.z.number().int().positive().optional(),
    payment_method: zod_1.z.enum(['NONE', 'CASH', 'QR']),
    qr_proof_image_url: imageUrlOrPathSchema.nullable().optional(),
    upload_intent: zod_1.z.string().trim().min(1).max(4096).nullable().optional(),
    registration_question_answer: zod_1.z.string().trim().max(5000).nullable().optional(),
    notes: zod_1.z.string().max(10000).nullable().optional(),
    extra_attendees: zod_1.z.array(zod_1.z.object({
        full_name: zod_1.z.string().trim().min(1).max(255),
        email: zod_1.z.string().trim().email().max(191).nullable().optional(),
        phone: zod_1.z.string().trim().min(1).max(64).nullable().optional(),
    }).refine((value) => Boolean((value.email ?? '').trim() || (value.phone ?? '').trim()), {
        message: 'email or phone is required',
        path: ['email'],
    })).max(100).optional(),
}).refine((value) => {
    const spots = value.booked_spots ?? 1;
    const extraCount = value.extra_attendees?.length ?? 0;
    return spots <= 1 ? extraCount === 0 : extraCount === spots - 1;
}, {
    message: 'extra_attendees must match booked_spots - 1',
    path: ['extra_attendees'],
});
exports.createClassEnrollmentSchema = zod_1.z.object({
    company_id: zod_1.z.number().int().positive(),
    group_class_id: zod_1.z.number().int().positive(),
    group_class_session_id: zod_1.z.number().int().positive().optional(),
    payment_method: zod_1.z.enum(['NONE', 'CASH', 'QR']),
    qr_proof_image_url: imageUrlOrPathSchema.nullable().optional(),
    upload_intent: zod_1.z.string().trim().min(1).max(4096).nullable().optional(),
});
exports.companyScopedActionSchema = zod_1.z.object({
    company_id: zod_1.z.number().int().positive(),
});
exports.checkInEventSchema = zod_1.z.object({
    user_id: zod_1.z.string().trim().min(1),
    method: zod_1.z.enum(['QR_SCAN', 'MANUAL']).optional(),
});
exports.checkInClassSessionSchema = zod_1.z.object({
    user_id: zod_1.z.string().trim().min(1),
    method: zod_1.z.enum(['QR_SCAN', 'MANUAL']).optional(),
});
exports.setClassSessionAttendanceStatusSchema = zod_1.z.object({
    user_id: zod_1.z.string().trim().min(1),
    status: zod_1.z.enum(['SHOW', 'NO_SHOW']),
    method: zod_1.z.enum(['QR_SCAN', 'MANUAL']).optional(),
});
exports.updateSessionPublicAttendanceSchema = zod_1.z.object({
    public_attendance_enabled: zod_1.z.boolean().optional(),
    attendance_access_code_enabled: zod_1.z.boolean(),
    attendance_access_code: zod_1.z.string().trim().max(64).optional().nullable(),
});
exports.publicSessionAttendanceStartSchema = zod_1.z.object({
    full_name: zod_1.z.string().trim().min(1).max(191),
    email: zod_1.z.string().trim().email().max(254),
    countryCode: zod_1.z.string().trim().length(2).optional(),
    phonePrefix: zod_1.z.string().trim().min(1).max(8),
    phoneNumber: zod_1.z.string().trim().min(1).max(32),
});
exports.publicSessionAttendanceResendSchema = zod_1.z.object({
    checkout_session_id: zod_1.z.string().trim().min(1),
});
exports.publicSessionAttendanceVerifySchema = zod_1.z.object({
    checkout_session_id: zod_1.z.string().trim().min(1),
    code: zod_1.z.string().trim().min(1).max(16),
});
exports.publicSessionAttendanceSubmitSchema = zod_1.z.object({
    checkout_session_id: zod_1.z.string().trim().min(1).optional(),
    access_code: zod_1.z.string().trim().max(64).optional().nullable(),
    full_name: zod_1.z.string().trim().min(1).max(191).optional(),
    email: zod_1.z.string().trim().email().max(254).optional(),
    countryCode: zod_1.z.string().trim().length(2).optional(),
    phonePrefix: zod_1.z.string().trim().min(1).max(8).optional(),
    phoneNumber: zod_1.z.string().trim().min(1).max(32).optional(),
});
exports.checkInByTicketSchema = zod_1.z.object({
    ticket_code: zod_1.z.string().trim().min(1).max(2048).optional(),
    qr_token: zod_1.z.string().trim().min(1).max(4096).optional(),
    method: zod_1.z.enum(['QR_SCAN', 'MANUAL']).optional(),
    class_session_id: zod_1.z.number().int().positive().optional(),
    event_id: zod_1.z.number().int().positive().optional(),
}).refine((value) => Boolean(value.ticket_code || value.qr_token), {
    message: 'ticket_code or qr_token is required',
    path: ['ticket_code'],
});
exports.checkInFreeEventByCodeSchema = zod_1.z.object({
    reservation_code: zod_1.z.string().trim().min(1).max(64),
    method: zod_1.z.enum(['QR_SCAN', 'MANUAL']).optional(),
});
