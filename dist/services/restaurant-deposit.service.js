"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureReservationDeposit = ensureReservationDeposit;
exports.publicDepositStatus = publicDepositStatus;
exports.uploadPublicReservationProof = uploadPublicReservationProof;
exports.listDeposits = listDeposits;
exports.getDeposit = getDeposit;
exports.privateProofPath = privateProofPath;
exports.reviewDeposit = reviewDeposit;
exports.sendDeadlineReminder = sendDeadlineReminder;
exports.expireDueDeposits = expireDueDeposits;
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const company_availability_1 = require("../utils/company-availability");
const plan_enforcement_service_1 = require("./plan-enforcement.service");
const storage_service_1 = require("./storage.service");
const restaurant_notification_service_1 = require("./restaurant-notification.service");
const timezone_1 = require("../utils/timezone");
const upload_intent_service_1 = require("./upload-intent.service");
const upload_errors_1 = require("../utils/upload-errors");
const upload_validation_1 = require("../utils/upload-validation");
const ok = (data, message = 'Operación realizada correctamente.', code = 200) => ({ code, error: false, message, data });
const fail = (code, message) => ({ code, error: true, message });
const hasReservationStatus = (value, allowed) => allowed.includes(value);
const hasDepositStatus = (value, allowed) => allowed.includes(value);
function normalizeOriginalName(value) { return value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 255) || 'proof'; }
function amountFor(mode, amount, partySize) { return mode === client_1.RestaurantDepositMode.PER_PERSON ? amount * partySize : amount; }
function deadlineFor(startAt) { return new Date(startAt.getTime() - 24 * 60 * 60 * 1000); }
function safeDeposit(deposit) {
    if (!deposit)
        return null;
    return {
        id: deposit.id,
        status: deposit.status,
        requiredAmountCents: deposit.required_amount_cents,
        currency: deposit.currency,
        mode: deposit.mode,
        paymentMethod: deposit.payment_method,
        paymentDeadline: deposit.payment_deadline,
        proofSubmittedAt: deposit.proof_submitted_at,
        reviewedAt: deposit.reviewed_at,
        rejectionReason: deposit.rejection_reason,
        approvedAt: deposit.approved_at,
        refundedAmountCents: deposit.refunded_amount_cents,
        refundedAt: deposit.refunded_at,
        refundReason: deposit.refund_reason,
        hasProof: Boolean(deposit.proof_path),
    };
}
async function ensureReservationDeposit(tx, companyId, reservationId, partySize, startAt) {
    const company = await tx.company.findFirst({ where: { id: companyId }, select: { currency: true, restaurant_settings: true } });
    const settings = company?.restaurant_settings;
    const reservation = await tx.restaurantReservation.findFirst({ where: { id: reservationId, company_id: companyId }, select: { id: true, status: true, deposit_amount_cents: true, deposit_mode: true } });
    if (!reservation)
        throw Object.assign(new Error('La reserva no pertenece a la empresa activa.'), { status: 404 });
    if (!company || !settings || !settings.deposit_enabled || settings.deposit_amount_cents <= 0) {
        await tx.restaurantReservation.updateMany({ where: { id: reservationId, company_id: companyId }, data: { deposit_amount_cents: 0, deposit_mode: null, deposit_proof_image_url: null } });
        return null;
    }
    const required = amountFor(settings.deposit_mode, settings.deposit_amount_cents, partySize);
    const existing = await tx.restaurantReservationDeposit.findUnique({ where: { reservation_id: reservationId }, select: { id: true, company_id: true, status: true, required_amount_cents: true, mode: true, currency: true } });
    if (existing && existing.company_id !== companyId)
        throw Object.assign(new Error('El depósito no pertenece a la empresa activa.'), { status: 409 });
    const financialChanged = existing && (existing.required_amount_cents !== required || existing.mode !== settings.deposit_mode || existing.currency !== company.currency);
    if (financialChanged && !hasDepositStatus(existing.status, [client_1.RestaurantDepositStatus.REQUIRED, client_1.RestaurantDepositStatus.PENDING, client_1.RestaurantDepositStatus.REJECTED]))
        throw Object.assign(new Error('No se puede cambiar el importe del depósito después de presentar o resolver un comprobante.'), { status: 409 });
    const deposit = existing ? await tx.restaurantReservationDeposit.update({
        where: { id: existing.id },
        data: {
            ...(financialChanged ? { required_amount_cents: required, currency: company.currency, mode: settings.deposit_mode, payment_deadline: deadlineFor(startAt) } : {}),
        },
    }) : await tx.restaurantReservationDeposit.create({
        data: {
            company_id: companyId,
            reservation_id: reservationId,
            required_amount_cents: required,
            currency: company.currency,
            mode: settings.deposit_mode,
            status: client_1.RestaurantDepositStatus.PENDING,
            payment_deadline: deadlineFor(startAt),
        },
    });
    await tx.restaurantReservation.updateMany({ where: { id: reservationId, company_id: companyId }, data: { deposit_amount_cents: required, deposit_mode: settings.deposit_mode, deposit_proof_image_url: null } });
    if (!existing || financialChanged)
        await tx.restaurantAuditLog.create({ data: { company_id: companyId, reservation_id: reservationId, event: 'DEPOSIT_REQUIRED', target_type: 'RESTAURANT_RESERVATION_DEPOSIT', target_id: String(deposit.id), previous_values: existing ? { required_amount_cents: existing.required_amount_cents, mode: existing.mode, currency: existing.currency } : client_1.Prisma.JsonNull, new_values: { required_amount_cents: deposit.required_amount_cents, mode: deposit.mode, currency: deposit.currency, status: deposit.status } } });
    return deposit;
}
async function publicCompany(slug) {
    const company = await client_2.prisma.company.findUnique({ where: { slug }, select: { id: true, slug: true, name: true, is_active: true, deleted_at: true, availableUntil: true, restaurant_enabled: true, restaurant_settings: true } });
    if (!company || !(0, company_availability_1.isCompanyAvailableNow)(company) || !company.restaurant_enabled || !company.restaurant_settings)
        return null;
    if (!await (0, plan_enforcement_service_1.isFeatureEnabledForCompany)(company.id, 'RESTAURANT_MODULE'))
        return null;
    return company;
}
async function publicDepositStatus(companyId, reservationId) {
    const deposit = await client_2.prisma.restaurantReservationDeposit.findFirst({ where: { company_id: companyId, reservation_id: reservationId } });
    return safeDeposit(deposit);
}
async function uploadPublicReservationProof(slug, reservationCode, file, uploadIntent) {
    const context = await publicCompany(slug);
    if (!context)
        return fail(404, 'No encontramos la reserva o el restaurante solicitado.');
    let validated;
    try {
        validated = (0, upload_validation_1.validateUploadFile)(file, { maxBytes: upload_validation_1.PUBLIC_UPLOAD_MAX_BYTES, allowedMimeTypes: upload_validation_1.PUBLIC_UPLOAD_MIME_TYPES });
    }
    catch (error) {
        if (error instanceof upload_errors_1.UploadSecurityError)
            return { code: error.statusCode, error: true, errorCode: error.errorCode, reason: error.errorCode, message: error.message };
        return fail(400, 'No pudimos validar el comprobante.');
    }
    if (!file)
        return { code: 400, error: true, errorCode: upload_errors_1.UPLOAD_ERROR_CODES.FILE_REQUIRED, reason: upload_errors_1.UPLOAD_ERROR_CODES.FILE_REQUIRED, message: 'Debes seleccionar un archivo.' };
    if (!uploadIntent)
        return { code: 400, error: true, errorCode: upload_errors_1.UPLOAD_ERROR_CODES.INTENT_INVALID, reason: upload_errors_1.UPLOAD_ERROR_CODES.INTENT_INVALID, message: 'La autorización de carga no es válida.' };
    const reservationForIntent = await client_2.prisma.restaurantReservation.findFirst({ where: { company_id: context.id, reservation_code: reservationCode }, select: { id: true } });
    if (!reservationForIntent)
        return { code: 404, error: true, errorCode: upload_errors_1.UPLOAD_ERROR_CODES.INTENT_INVALID, reason: upload_errors_1.UPLOAD_ERROR_CODES.INTENT_INVALID, message: 'No encontramos la reserva o el restaurante solicitado.' };
    let intent;
    try {
        intent = await (0, upload_intent_service_1.consumeUploadIntent)(uploadIntent, { expectedPurpose: upload_intent_service_1.UPLOAD_PURPOSES.RESTAURANT_DEPOSIT_PROOF, companyId: context.id, contextId: `RESERVATION:${reservationForIntent.id}` });
    }
    catch (error) {
        if (error instanceof upload_errors_1.UploadSecurityError)
            return { code: error.statusCode, error: true, errorCode: error.errorCode, reason: error.errorCode, message: error.message };
        return fail(400, 'La autorización de carga no es válida.');
    }
    let relativePath = null;
    let oldPath = null;
    let uploadRecorded = false;
    try {
        const result = await client_2.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM restaurant_reservation WHERE company_id = ${context.id} AND reservation_code = ${reservationCode} FOR UPDATE`;
            const reservation = await tx.restaurantReservation.findFirst({ where: { company_id: context.id, reservation_code: reservationCode }, select: { id: true, status: true, party_size: true, start_time: true } });
            if (!reservation)
                throw Object.assign(new Error('No encontramos la reserva o el restaurante solicitado.'), { status: 404 });
            if (hasReservationStatus(reservation.status, [client_1.RestaurantReservationStatus.CANCELLED, client_1.RestaurantReservationStatus.NO_SHOW, client_1.RestaurantReservationStatus.COMPLETED]))
                throw Object.assign(new Error('Esta reserva ya no admite comprobantes.'), { status: 409 });
            const deposit = await tx.restaurantReservationDeposit.findFirst({ where: { company_id: context.id, reservation_id: reservation.id } });
            if (!deposit)
                throw Object.assign(new Error('Esta reserva no requiere depósito.'), { status: 409 });
            if (hasDepositStatus(deposit.status, [client_1.RestaurantDepositStatus.APPROVED, client_1.RestaurantDepositStatus.WAIVED, client_1.RestaurantDepositStatus.REFUNDED, client_1.RestaurantDepositStatus.EXPIRED]))
                throw Object.assign(new Error('El depósito de esta reserva ya fue resuelto o venció.'), { status: 409 });
            oldPath = deposit.proof_path;
            relativePath = await storage_service_1.StorageService.saveFile(context.id, 'restaurant-deposit-proofs', `proof-${(0, crypto_1.randomBytes)(20).toString('hex')}.${validated.extension}`, file.buffer);
            await (0, upload_intent_service_1.recordStoredUpload)(intent, relativePath);
            uploadRecorded = true;
            const updated = await tx.restaurantReservationDeposit.update({
                where: { id: deposit.id },
                data: {
                    status: client_1.RestaurantDepositStatus.PROOF_SUBMITTED,
                    proof_path: relativePath,
                    proof_original_name: normalizeOriginalName(file.originalname),
                    proof_mime_type: validated.mimeType,
                    proof_size_bytes: validated.size,
                    proof_sha256: (0, crypto_1.createHash)('sha256').update(file.buffer).digest('hex'),
                    proof_submitted_at: new Date(),
                    public_submission_id: (0, crypto_1.randomBytes)(18).toString('base64url'),
                    rejection_reason: null,
                    reviewed_at: null,
                    reviewed_by_user_id: null,
                },
            });
            await tx.restaurantReservation.update({ where: { id: reservation.id }, data: { deposit_proof_image_url: null } });
            await tx.restaurantAuditLog.create({ data: { company_id: context.id, reservation_id: reservation.id, event: 'DEPOSIT_PROOF_SUBMITTED', target_type: 'RESTAURANT_RESERVATION_DEPOSIT', target_id: String(deposit.id), previous_values: { status: deposit.status, has_proof: Boolean(deposit.proof_path) }, new_values: { status: updated.status, has_proof: true }, metadata: { proof_sha256: updated.proof_sha256 } } });
            return { reservationId: reservation.id, deposit: safeDeposit(updated) };
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
        try {
            await (0, restaurant_notification_service_1.notifyRestaurantReservation)({ companyId: context.id, reservationId: result.reservationId, event: client_1.RestaurantNotificationEvent.DEPOSIT_PROOF_SUBMITTED });
        }
        catch { /* Persistence is independent of delivery. */ }
        if (oldPath && oldPath !== relativePath)
            await storage_service_1.StorageService.deleteFile(oldPath).catch(() => undefined);
        return ok(result.deposit, 'Comprobante enviado para revisión.', 201);
    }
    catch (error) {
        if (relativePath)
            await storage_service_1.StorageService.deleteFile(relativePath).catch(() => undefined);
        if (uploadRecorded)
            await client_2.prisma.uploadIntent.updateMany({ where: { id: intent.databaseId, stored_path: relativePath }, data: { stored_path: null } }).catch(() => undefined);
        if (error instanceof upload_errors_1.UploadSecurityError)
            return { code: error.statusCode, error: true, errorCode: error.errorCode, reason: error.errorCode, message: error.message };
        return fail(error?.status || 500, error?.message || 'No pudimos enviar el comprobante.');
    }
}
function nextDate(value) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); }
function depositWhere(companyId, query, timezone) {
    const reservationFilters = [];
    if (query.dateFrom || query.dateTo) {
        reservationFilters.push({
            start_time: {
                ...(query.dateFrom ? { gte: (0, timezone_1.parseDateTimeInTimeZone)(`${query.dateFrom}T00:00:00`, timezone) } : {}),
                ...(query.dateTo ? { lt: (0, timezone_1.parseDateTimeInTimeZone)(`${nextDate(query.dateTo)}T00:00:00`, timezone) } : {}),
            },
        });
    }
    if (query.search) {
        reservationFilters.push({
            OR: [
                { reservation_code: { contains: query.search } },
                { customer_name: { contains: query.search } },
                { customer_phone: { contains: query.search } },
            ],
        });
    }
    return {
        company_id: companyId,
        ...(query.status ? { status: query.status } : {}),
        ...(reservationFilters.length ? { reservation: { AND: reservationFilters } } : {}),
    };
}
async function listDeposits(companyId, query) {
    const company = await client_2.prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
    if (!company)
        return fail(404, 'No encontramos la empresa.');
    const where = depositWhere(companyId, query, company.timezone);
    const [total, items] = await client_2.prisma.$transaction([
        client_2.prisma.restaurantReservationDeposit.count({ where }),
        client_2.prisma.restaurantReservationDeposit.findMany({ where, include: { reservation: { select: { id: true, reservation_code: true, reservation_date: true, start_time: true, party_size: true, customer_name: true, customer_phone: true, status: true } } }, orderBy: { updated_at: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    ]);
    return ok({ items: items.map((item) => ({ ...safeDeposit(item), reservation: item.reservation })), pagination: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } });
}
async function getDeposit(companyId, id) {
    const deposit = await client_2.prisma.restaurantReservationDeposit.findFirst({ where: { id, company_id: companyId }, include: { reservation: { select: { id: true, reservation_code: true, reservation_date: true, start_time: true, party_size: true, customer_name: true, customer_phone: true, customer_email: true, status: true } } } });
    return deposit ? ok({ ...safeDeposit(deposit), reservation: deposit.reservation }) : fail(404, 'No encontramos el depósito.');
}
async function privateProofPath(companyId, id) {
    const deposit = await client_2.prisma.restaurantReservationDeposit.findFirst({ where: { id, company_id: companyId }, select: { proof_path: true, proof_mime_type: true, proof_original_name: true } });
    if (!deposit?.proof_path || !storage_service_1.StorageService.isPrivateRelativePath(deposit.proof_path))
        return null;
    return { path: deposit.proof_path, mimeType: deposit.proof_mime_type || 'application/octet-stream', originalName: deposit.proof_original_name || 'proof' };
}
async function reviewDeposit(companyId, id, actorUserId, input) {
    try {
        const result = await client_2.prisma.$transaction(async (tx) => {
            const actor = await tx.companyUser.findFirst({ where: { company_id: companyId, user_id: actorUserId, deleted_at: null }, select: { id: true } });
            if (!actor)
                throw Object.assign(new Error('El usuario no pertenece a esta empresa.'), { status: 403 });
            const pointer = await tx.restaurantReservationDeposit.findFirst({ where: { company_id: companyId, id }, select: { reservation_id: true } });
            if (!pointer)
                throw Object.assign(new Error('No encontramos el depósito.'), { status: 404 });
            await tx.$queryRaw `SELECT id FROM restaurant_reservation WHERE company_id = ${companyId} AND id = ${pointer.reservation_id} FOR UPDATE`;
            await tx.$queryRaw `SELECT id FROM restaurant_reservation_deposit WHERE company_id = ${companyId} AND id = ${id} FOR UPDATE`;
            const deposit = await tx.restaurantReservationDeposit.findFirst({ where: { company_id: companyId, id }, include: { reservation: { select: { id: true, status: true, customer_name: true } } } });
            if (!deposit)
                throw Object.assign(new Error('No encontramos el depósito.'), { status: 404 });
            if ([client_1.RestaurantReservationStatus.CANCELLED, client_1.RestaurantReservationStatus.NO_SHOW].includes(deposit.reservation.status) && input.action !== 'REFUND')
                throw Object.assign(new Error('No se puede revisar un depósito de una reserva cancelada o ausente.'), { status: 409 });
            const now = new Date();
            const previous = { status: deposit.status, refunded_amount_cents: deposit.refunded_amount_cents, rejection_reason: deposit.rejection_reason };
            const data = { reviewed_by: { connect: { id: actorUserId } }, reviewed_at: now };
            if (input.action === 'APPROVE') {
                if (!deposit.proof_path)
                    throw Object.assign(new Error('No se puede aprobar un depósito sin comprobante.'), { status: 409 });
                if (!hasDepositStatus(deposit.status, [client_1.RestaurantDepositStatus.PROOF_SUBMITTED, client_1.RestaurantDepositStatus.REJECTED, client_1.RestaurantDepositStatus.PENDING]))
                    throw Object.assign(new Error('El depósito no puede aprobarse desde su estado actual.'), { status: 409 });
                data.status = client_1.RestaurantDepositStatus.APPROVED;
                data.approved_at = now;
                data.rejection_reason = null;
                if (input.paymentMethod)
                    data.payment_method = input.paymentMethod;
            }
            else if (input.action === 'REJECT') {
                if (!hasDepositStatus(deposit.status, [client_1.RestaurantDepositStatus.PROOF_SUBMITTED, client_1.RestaurantDepositStatus.PENDING, client_1.RestaurantDepositStatus.REJECTED]))
                    throw Object.assign(new Error('El depósito no puede rechazarse desde su estado actual.'), { status: 409 });
                if (!input.reason?.trim())
                    throw Object.assign(new Error('Indicá el motivo del rechazo.'), { status: 400 });
                data.status = client_1.RestaurantDepositStatus.REJECTED;
                data.rejection_reason = input.reason.trim().slice(0, 500);
                data.approved_at = null;
            }
            else if (input.action === 'WAIVE') {
                if (!input.reason?.trim())
                    throw Object.assign(new Error('Indicá el motivo de la exención.'), { status: 400 });
                if (!hasDepositStatus(deposit.status, [client_1.RestaurantDepositStatus.REQUIRED, client_1.RestaurantDepositStatus.PENDING, client_1.RestaurantDepositStatus.PROOF_SUBMITTED, client_1.RestaurantDepositStatus.REJECTED]))
                    throw Object.assign(new Error('El depósito no puede eximirse desde su estado actual.'), { status: 409 });
                data.status = client_1.RestaurantDepositStatus.WAIVED;
                data.rejection_reason = null;
            }
            else {
                if (!hasDepositStatus(deposit.status, [client_1.RestaurantDepositStatus.APPROVED, client_1.RestaurantDepositStatus.PARTIALLY_REFUNDED]))
                    throw Object.assign(new Error('Solo se puede reembolsar un depósito aprobado.'), { status: 409 });
                const requested = input.amountCents ?? deposit.required_amount_cents - deposit.refunded_amount_cents;
                if (!Number.isInteger(requested) || requested <= 0 || requested > deposit.required_amount_cents - deposit.refunded_amount_cents)
                    throw Object.assign(new Error('El monto de reembolso no es válido.'), { status: 400 });
                const totalRefunded = deposit.refunded_amount_cents + requested;
                data.status = totalRefunded >= deposit.required_amount_cents ? client_1.RestaurantDepositStatus.REFUNDED : client_1.RestaurantDepositStatus.PARTIALLY_REFUNDED;
                data.refunded_amount_cents = totalRefunded;
                data.refunded_at = now;
                data.refunded_by = { connect: { id: actorUserId } };
                data.refund_reason = input.reason?.trim()?.slice(0, 500) || null;
            }
            const updated = await tx.restaurantReservationDeposit.update({ where: { id: deposit.id }, data });
            let reservationConfirmed = false;
            if (input.action === 'APPROVE' && deposit.reservation.status === client_1.RestaurantReservationStatus.PENDING) {
                const settings = await tx.restaurantSettings.findUnique({ where: { company_id: companyId }, select: { auto_confirm_reservations: true } });
                if (settings?.auto_confirm_reservations)
                    reservationConfirmed = Boolean((await tx.restaurantReservation.updateMany({ where: { id: deposit.reservation.id, company_id: companyId, status: client_1.RestaurantReservationStatus.PENDING }, data: { status: client_1.RestaurantReservationStatus.CONFIRMED } })).count);
            }
            await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, reservation_id: deposit.reservation.id, event: `DEPOSIT_${input.action}`, target_type: 'RESTAURANT_RESERVATION_DEPOSIT', target_id: String(id), previous_values: previous, new_values: { status: updated.status, refunded_amount_cents: updated.refunded_amount_cents, rejection_reason: updated.rejection_reason }, metadata: { reason: input.reason || null } } });
            return { reservationId: deposit.reservation.id, status: updated.status, deposit: safeDeposit(updated), reservationConfirmed };
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
        const event = input.action === 'APPROVE' ? client_1.RestaurantNotificationEvent.DEPOSIT_APPROVED : input.action === 'REJECT' ? client_1.RestaurantNotificationEvent.DEPOSIT_REJECTED : input.action === 'REFUND' ? client_1.RestaurantNotificationEvent.DEPOSIT_REFUNDED : null;
        if (event)
            try {
                await (0, restaurant_notification_service_1.notifyRestaurantReservation)({ companyId, reservationId: result.reservationId, event });
            }
            catch { /* Delivery is isolated from the financial state transition. */ }
        if (result.reservationConfirmed)
            try {
                await (0, restaurant_notification_service_1.notifyRestaurantReservation)({ companyId, reservationId: result.reservationId, event: client_1.RestaurantNotificationEvent.RESTAURANT_RESERVATION_CONFIRMED });
            }
            catch { /* Delivery is isolated from the financial state transition. */ }
        return ok(result.deposit, input.action === 'APPROVE' ? 'Depósito aprobado.' : input.action === 'REJECT' ? 'Depósito rechazado.' : input.action === 'WAIVE' ? 'Depósito eximido.' : 'Reembolso registrado.');
    }
    catch (error) {
        return fail(error?.status || (error?.code === 'P2034' ? 409 : 500), error?.message || 'No pudimos actualizar el depósito.');
    }
}
async function sendDeadlineReminder(companyId, id, actorUserId) {
    const deposit = await client_2.prisma.restaurantReservationDeposit.findFirst({
        where: { id, company_id: companyId },
        select: { id: true, status: true, payment_deadline: true, reservation: { select: { id: true, status: true } } },
    });
    if (!deposit)
        return fail(404, 'No encontramos el depósito.');
    if (!hasDepositStatus(deposit.status, [client_1.RestaurantDepositStatus.REQUIRED, client_1.RestaurantDepositStatus.PENDING, client_1.RestaurantDepositStatus.REJECTED]))
        return fail(409, 'Este depósito ya no admite recordatorios manuales.');
    await client_2.prisma.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, reservation_id: deposit.reservation.id, event: 'DEPOSIT_DEADLINE_REMINDER_SENT', target_type: 'RESTAURANT_RESERVATION_DEPOSIT', target_id: String(id), metadata: { payment_deadline: deposit.payment_deadline } } });
    const results = await (0, restaurant_notification_service_1.notifyRestaurantReservation)({ companyId, reservationId: deposit.reservation.id, event: client_1.RestaurantNotificationEvent.DEPOSIT_DEADLINE_REMINDER, trigger: 'MANUAL' });
    return ok({ reservationId: deposit.reservation.id, results }, 'Recordatorio de depósito enviado.');
}
async function expireDueDeposits(companyId) {
    const where = { status: { in: [client_1.RestaurantDepositStatus.REQUIRED, client_1.RestaurantDepositStatus.PENDING] }, payment_deadline: { lt: new Date() }, reservation: { status: { in: [client_1.RestaurantReservationStatus.PENDING, client_1.RestaurantReservationStatus.CONFIRMED] } }, ...(companyId ? { company_id: companyId } : {}) };
    const due = await client_2.prisma.restaurantReservationDeposit.findMany({ where, select: { id: true, company_id: true, reservation_id: true } });
    if (!due.length)
        return 0;
    const expiredItems = await client_2.prisma.$transaction(async (tx) => {
        const changedItems = [];
        for (const item of due) {
            const changed = await tx.restaurantReservationDeposit.updateMany({ where: { id: item.id, company_id: item.company_id, status: { in: [client_1.RestaurantDepositStatus.REQUIRED, client_1.RestaurantDepositStatus.PENDING] } }, data: { status: client_1.RestaurantDepositStatus.EXPIRED, reviewed_at: new Date() } });
            if (!changed.count)
                continue;
            changedItems.push({ company_id: item.company_id, reservation_id: item.reservation_id });
            await tx.restaurantAuditLog.create({ data: { company_id: item.company_id, reservation_id: item.reservation_id, event: 'DEPOSIT_EXPIRED', target_type: 'RESTAURANT_RESERVATION_DEPOSIT', target_id: String(item.id), new_values: { status: client_1.RestaurantDepositStatus.EXPIRED } } });
        }
        return changedItems;
    }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
    for (const item of expiredItems) {
        try {
            await (0, restaurant_notification_service_1.notifyRestaurantReservation)({ companyId: item.company_id, reservationId: item.reservation_id, event: client_1.RestaurantNotificationEvent.DEPOSIT_EXPIRED });
        }
        catch { /* Expiry persistence is independent of delivery. */ }
    }
    return expiredItems.length;
}
