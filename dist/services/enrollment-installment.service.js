"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeInstallmentDueDates = computeInstallmentDueDates;
exports.generateInstallmentsForEnrollment = generateInstallmentsForEnrollment;
exports.getCurrentMonthInstallment = getCurrentMonthInstallment;
exports.listInstallments = listInstallments;
exports.updateInstallments = updateInstallments;
exports.markInstallmentPaid = markInstallmentPaid;
exports.confirmInstallmentQrPayment = confirmInstallmentQrPayment;
exports.submitInstallmentQrProof = submitInstallmentQrProof;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const group_payments_service_1 = require("./group-payments.service");
const group_ticket_service_1 = require("./group-ticket.service");
const logger_1 = require("../config/logger");
const upload_intent_service_1 = require("./upload-intent.service");
const upload_errors_1 = require("../utils/upload-errors");
const storage_service_1 = require("./storage.service");
async function unlockEnrollmentAccessFromFirstInstallment(params) {
    const installment = await client_2.prisma.enrollmentInstallment.findFirst({
        where: { id: params.installmentId },
        include: {
            enrollment: {
                select: {
                    id: true,
                    company_id: true,
                },
            },
        },
    });
    if (!installment || installment.enrollment.company_id !== params.companyId || installment.installment_number !== 1) {
        return;
    }
    await client_2.prisma.groupClassEnrollment.update({
        where: { id: installment.enrollment.id },
        data: {
            payment_method: params.paymentMethod,
            payment_status: client_1.PaymentStatus.PAID,
            qr_proof_image_url: params.paymentMethod === client_1.PaymentMethod.QR ? (params.qrProofImageUrl ?? installment.qr_proof_image_url ?? null) : null,
        },
    });
    try {
        await (0, group_ticket_service_1.issueClassTicketForEnrollment)(params.companyId, installment.enrollment.id);
    }
    catch (error) {
        logger_1.logger.error({ companyId: params.companyId, enrollmentId: installment.enrollment.id, installmentId: params.installmentId, error }, 'Failed to issue class ticket after first installment payment');
    }
}
/**
 * Given an enrollment date and the class end date, compute how many
 * installments to generate and their due dates based on billing_day.
 *
 * Rules:
 * - One installment per remaining month (including the enrollment month).
 * - Due date = billing_day of each month. Capped to 28 to avoid invalid dates.
 * - If billing_day already passed in the enrollment month, the first due date
 *   is still in the enrollment month (admin can adjust manually if needed).
 */
function computeInstallmentDueDates(params) {
    const { enrollmentDate, classEndDate, billingDay } = params;
    const dueDates = [];
    // Start from the enrollment month
    const cursor = new Date(Date.UTC(enrollmentDate.getUTCFullYear(), enrollmentDate.getUTCMonth(), 1));
    // End month (inclusive)
    const endMonth = new Date(Date.UTC(classEndDate.getUTCFullYear(), classEndDate.getUTCMonth(), 1));
    while (cursor <= endMonth) {
        const year = cursor.getUTCFullYear();
        const month = cursor.getUTCMonth();
        // Clamp day to last day of month (max 28 keeps it safe)
        const day = Math.min(billingDay, 28);
        dueDates.push(new Date(Date.UTC(year, month, day)));
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return dueDates;
}
function parseDateOnlyToUtc(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match)
        return null;
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return null;
    }
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day) {
        return null;
    }
    return parsed;
}
function isEditablePaymentStatus(value) {
    return value === 'UNPAID' || value === 'PENDING_CONFIRMATION' || value === 'PAID' || value === 'REJECTED';
}
function isEditablePaymentMethod(value) {
    return value === 'NONE' || value === 'CASH' || value === 'QR';
}
/**
 * Generate installments for a FULL_COURSE enrollment.
 * Called inside the enrollment transaction after the enrollment record is created.
 */
async function generateInstallmentsForEnrollment(tx, params) {
    const dueDates = computeInstallmentDueDates({
        enrollmentDate: params.enrollmentDate,
        classEndDate: params.classEndDate,
        billingDay: params.billingDay,
    });
    await tx.enrollmentInstallment.createMany({
        data: dueDates.map((dueDate, idx) => ({
            enrollment_id: params.enrollmentId,
            installment_number: idx + 1,
            due_date: dueDate,
            amount_cents: params.amountCents,
            payment_status: client_1.PaymentStatus.UNPAID,
            payment_method: client_1.PaymentMethod.NONE,
        })),
    });
}
/**
 * Get the installment that covers the current month for an enrollment.
 * Returns null if the enrollment is not FULL_COURSE or no installment found.
 */
async function getCurrentMonthInstallment(enrollmentId) {
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const startOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return client_2.prisma.enrollmentInstallment.findFirst({
        where: {
            enrollment_id: enrollmentId,
            due_date: {
                gte: startOfMonth,
                lt: startOfNextMonth,
            },
        },
        select: {
            id: true,
            payment_status: true,
            amount_cents: true,
            due_date: true,
        },
    });
}
/**
 * Admin: list all installments for an enrollment.
 */
async function listInstallments(companyId, enrollmentId) {
    return (0, group_payments_service_1.getEnrollmentInstallmentPlan)(companyId, enrollmentId);
}
async function updateInstallments(companyId, enrollmentId, adminUserId, installments) {
    const enrollment = await client_2.prisma.groupClassEnrollment.findFirst({
        where: { id: enrollmentId, company_id: companyId },
        include: {
            installments: {
                orderBy: { installment_number: 'asc' },
            },
        },
    });
    if (!enrollment) {
        return { code: 404, error: true, message: 'Enrollment not found' };
    }
    if (enrollment.pricing_mode !== 'FULL_COURSE') {
        return { code: 400, error: true, message: 'This enrollment does not have installments' };
    }
    if (!Array.isArray(installments) || installments.length === 0) {
        return { code: 400, error: true, message: 'At least one installment is required' };
    }
    const existingById = new Map(enrollment.installments.map((installment) => [installment.id, installment]));
    const seenIds = new Set();
    const normalizedRows = [];
    for (const [index, rawInstallment] of installments.entries()) {
        const rowNumber = index + 1;
        const installmentId = rawInstallment?.id;
        if (installmentId !== undefined) {
            if (!Number.isInteger(installmentId) || installmentId <= 0 || !existingById.has(installmentId)) {
                return { code: 400, error: true, message: `Installment ${rowNumber} has an invalid id` };
            }
            if (seenIds.has(installmentId)) {
                return { code: 400, error: true, message: `Installment ${rowNumber} is duplicated` };
            }
            seenIds.add(installmentId);
        }
        const dueDate = parseDateOnlyToUtc(rawInstallment?.due_date);
        if (!dueDate) {
            return { code: 400, error: true, message: `Installment ${rowNumber} must include a valid due_date` };
        }
        if (!Number.isInteger(rawInstallment?.amount_cents) || rawInstallment.amount_cents < 0) {
            return { code: 400, error: true, message: `Installment ${rowNumber} must include a valid amount_cents` };
        }
        if (!isEditablePaymentStatus(rawInstallment?.payment_status)) {
            return { code: 400, error: true, message: `Installment ${rowNumber} has an invalid payment_status` };
        }
        if (!isEditablePaymentMethod(rawInstallment?.payment_method)) {
            return { code: 400, error: true, message: `Installment ${rowNumber} has an invalid payment_method` };
        }
        if ((rawInstallment.payment_status === 'PENDING_CONFIRMATION' || rawInstallment.payment_status === 'REJECTED')
            && rawInstallment.payment_method !== 'QR') {
            return {
                code: 400,
                error: true,
                message: `Installment ${rowNumber} must use QR when pending confirmation or rejected`,
            };
        }
        if (rawInstallment.payment_status === 'PAID'
            && rawInstallment.amount_cents > 0
            && rawInstallment.payment_method === 'NONE') {
            return {
                code: 400,
                error: true,
                message: `Installment ${rowNumber} needs a payment method when marked as paid`,
            };
        }
        normalizedRows.push({
            id: installmentId,
            dueDate,
            amountCents: rawInstallment.amount_cents,
            paymentStatus: rawInstallment.payment_status,
            paymentMethod: rawInstallment.payment_method,
        });
    }
    const idsToDelete = enrollment.installments
        .filter((installment) => !seenIds.has(installment.id))
        .map((installment) => installment.id);
    const paidInstallmentDeleted = enrollment.installments.some((installment) => idsToDelete.includes(installment.id) && installment.payment_status === client_1.PaymentStatus.PAID);
    if (paidInstallmentDeleted) {
        return { code: 400, error: true, message: 'Paid installments cannot be removed' };
    }
    const now = new Date();
    const syncResult = await client_2.prisma.$transaction(async (tx) => {
        if (idsToDelete.length > 0) {
            await tx.enrollmentInstallment.deleteMany({
                where: {
                    enrollment_id: enrollmentId,
                    id: { in: idsToDelete },
                },
            });
        }
        for (const [index, installment] of normalizedRows.entries()) {
            const installmentNumber = index + 1;
            const current = installment.id ? existingById.get(installment.id) ?? null : null;
            const qrProofImageUrl = installment.paymentMethod === client_1.PaymentMethod.QR
                ? current?.qr_proof_image_url ?? null
                : null;
            const paidAt = installment.paymentStatus === client_1.PaymentStatus.PAID
                ? current?.paid_at ?? now
                : null;
            const markedPaidByAdminId = installment.paymentStatus === client_1.PaymentStatus.PAID
                ? current?.marked_paid_by_admin_id ?? adminUserId
                : null;
            if (installment.id) {
                await tx.enrollmentInstallment.update({
                    where: { id: installment.id },
                    data: {
                        installment_number: installmentNumber,
                        due_date: installment.dueDate,
                        amount_cents: installment.amountCents,
                        payment_status: installment.paymentStatus,
                        payment_method: installment.paymentMethod,
                        qr_proof_image_url: qrProofImageUrl,
                        paid_at: paidAt,
                        marked_paid_by_admin_id: markedPaidByAdminId,
                    },
                });
            }
            else {
                await tx.enrollmentInstallment.create({
                    data: {
                        enrollment_id: enrollmentId,
                        installment_number: installmentNumber,
                        due_date: installment.dueDate,
                        amount_cents: installment.amountCents,
                        payment_status: installment.paymentStatus,
                        payment_method: installment.paymentMethod,
                        qr_proof_image_url: qrProofImageUrl,
                        paid_at: paidAt,
                        marked_paid_by_admin_id: markedPaidByAdminId,
                    },
                });
            }
        }
        const firstInstallment = await tx.enrollmentInstallment.findFirst({
            where: { enrollment_id: enrollmentId },
            orderBy: { installment_number: 'asc' },
        });
        if (!firstInstallment) {
            throw new Error('Enrollment must keep at least one installment');
        }
        await tx.groupClassEnrollment.update({
            where: { id: enrollmentId },
            data: {
                payment_status: firstInstallment.payment_status,
                payment_method: firstInstallment.payment_status === client_1.PaymentStatus.PENDING_CONFIRMATION
                    ? client_1.PaymentMethod.QR
                    : firstInstallment.payment_method,
                qr_proof_image_url: firstInstallment.payment_method === client_1.PaymentMethod.QR
                    ? firstInstallment.qr_proof_image_url ?? null
                    : null,
            },
        });
        return {
            firstInstallmentStatus: firstInstallment.payment_status,
        };
    });
    if (syncResult.firstInstallmentStatus === client_1.PaymentStatus.PAID) {
        try {
            await (0, group_ticket_service_1.issueClassTicketForEnrollment)(companyId, enrollmentId);
        }
        catch (error) {
            logger_1.logger.error({ companyId, enrollmentId, error }, 'Failed to issue class ticket after installment plan update');
        }
    }
    else {
        await (0, group_ticket_service_1.cancelTicketsForClassEnrollment)(companyId, enrollmentId);
    }
    return (0, group_payments_service_1.getEnrollmentInstallmentPlan)(companyId, enrollmentId);
}
/**
 * Admin: mark an installment as paid.
 */
async function markInstallmentPaid(companyId, installmentId, adminUserId, paymentMethod) {
    const installment = await client_2.prisma.enrollmentInstallment.findFirst({
        where: { id: installmentId },
        include: {
            enrollment: {
                select: { id: true, company_id: true, pricing_mode: true },
            },
        },
    });
    if (!installment || installment.enrollment.company_id !== companyId) {
        return { code: 404, error: true, message: 'Installment not found' };
    }
    if (installment.payment_status === client_1.PaymentStatus.PAID) {
        return { code: 400, error: true, message: 'Installment is already paid' };
    }
    const updated = await client_2.prisma.enrollmentInstallment.update({
        where: { id: installmentId },
        data: {
            payment_status: client_1.PaymentStatus.PAID,
            payment_method: paymentMethod,
            paid_at: new Date(),
            marked_paid_by_admin_id: adminUserId,
        },
    });
    await unlockEnrollmentAccessFromFirstInstallment({
        companyId,
        installmentId,
        paymentMethod: paymentMethod,
    });
    return { code: 200, error: false, message: 'Installment marked as paid', data: updated };
}
/**
 * Admin: confirm a pending QR payment proof uploaded by the student.
 */
async function confirmInstallmentQrPayment(companyId, installmentId, adminUserId) {
    const installment = await client_2.prisma.enrollmentInstallment.findFirst({
        where: { id: installmentId },
        include: {
            enrollment: { select: { company_id: true } },
        },
    });
    if (!installment || installment.enrollment.company_id !== companyId) {
        return { code: 404, error: true, message: 'Installment not found' };
    }
    if (installment.payment_status !== client_1.PaymentStatus.PENDING_CONFIRMATION) {
        return { code: 400, error: true, message: `Cannot confirm: installment status is ${installment.payment_status}` };
    }
    const updated = await client_2.prisma.enrollmentInstallment.update({
        where: { id: installmentId },
        data: {
            payment_status: client_1.PaymentStatus.PAID,
            paid_at: new Date(),
            marked_paid_by_admin_id: adminUserId,
        },
    });
    await unlockEnrollmentAccessFromFirstInstallment({
        companyId,
        installmentId,
        paymentMethod: updated.payment_method,
        qrProofImageUrl: updated.qr_proof_image_url,
    });
    return { code: 200, error: false, message: 'QR payment confirmed', data: updated };
}
/**
 * Student: upload QR proof for a specific installment.
 */
async function submitInstallmentQrProof(companyId, enrollmentId, installmentId, userId, qrProofImageUrl) {
    const installment = await client_2.prisma.enrollmentInstallment.findFirst({
        where: { id: installmentId, enrollment_id: enrollmentId },
        include: {
            enrollment: {
                select: { company_id: true, user_id: true },
            },
        },
    });
    if (!installment
        || installment.enrollment.company_id !== companyId
        || installment.enrollment.user_id !== userId) {
        return { code: 404, error: true, message: 'Installment not found' };
    }
    if (installment.payment_status === client_1.PaymentStatus.PAID) {
        return { code: 400, error: true, message: 'Installment is already paid' };
    }
    let storedProofPath;
    try {
        const stored = await (0, upload_intent_service_1.assertStoredUpload)({
            rawPathOrUrl: qrProofImageUrl,
            companyId,
            purpose: upload_intent_service_1.UPLOAD_PURPOSES.GROUP_PAYMENT_PROOF,
            contextId: `INSTALLMENT:${enrollmentId}:${installmentId}`,
        });
        if (!(await storage_service_1.StorageService.fileExists(stored.relativePath))) {
            throw new upload_errors_1.UploadSecurityError('UPLOAD_INTENT_INVALID', 403);
        }
        storedProofPath = stored.relativePath;
    }
    catch (error) {
        if (error instanceof upload_errors_1.UploadSecurityError) {
            return {
                code: error.statusCode,
                error: true,
                message: error.message,
                errorCode: error.errorCode,
                reason: error.errorCode,
            };
        }
        return { code: 403, error: true, message: 'No puedes adjuntar un comprobante que no te pertenece.' };
    }
    const updated = await client_2.prisma.enrollmentInstallment.update({
        where: { id: installmentId },
        data: {
            payment_status: client_1.PaymentStatus.PENDING_CONFIRMATION,
            payment_method: client_1.PaymentMethod.QR,
            qr_proof_image_url: storedProofPath,
        },
    });
    return { code: 200, error: false, message: 'QR proof submitted, pending confirmation', data: updated };
}
