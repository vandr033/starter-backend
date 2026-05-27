import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { MensajeApi } from '../types/MensajeApi';
import { getEnrollmentInstallmentPlan } from './group-payments.service';
import { cancelTicketsForClassEnrollment, issueClassTicketForEnrollment } from './group-ticket.service';
import { logger } from '../config/logger';

type ServiceResult = MensajeApi & { data?: unknown };
type EditablePaymentStatus = 'UNPAID' | 'PENDING_CONFIRMATION' | 'PAID' | 'REJECTED';
type EditablePaymentMethod = 'NONE' | 'CASH' | 'QR';

export interface UpdateEnrollmentInstallmentInput {
    id?: number;
    due_date: string;
    amount_cents: number;
    payment_status: EditablePaymentStatus;
    payment_method: EditablePaymentMethod;
}

async function unlockEnrollmentAccessFromFirstInstallment(params: {
    companyId: number;
    installmentId: number;
    paymentMethod: PaymentMethod;
    qrProofImageUrl?: string | null;
}) {
    const installment = await prisma.enrollmentInstallment.findFirst({
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

    await prisma.groupClassEnrollment.update({
        where: { id: installment.enrollment.id },
        data: {
            payment_method: params.paymentMethod,
            payment_status: PaymentStatus.PAID,
            qr_proof_image_url: params.paymentMethod === PaymentMethod.QR ? (params.qrProofImageUrl ?? installment.qr_proof_image_url ?? null) : null,
        },
    });

    try {
        await issueClassTicketForEnrollment(params.companyId, installment.enrollment.id);
    } catch (error) {
        logger.error(
            { companyId: params.companyId, enrollmentId: installment.enrollment.id, installmentId: params.installmentId, error },
            'Failed to issue class ticket after first installment payment',
        );
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
export function computeInstallmentDueDates(params: {
    enrollmentDate: Date;
    classEndDate: Date;
    billingDay: number;
}): Date[] {
    const { enrollmentDate, classEndDate, billingDay } = params;

    const dueDates: Date[] = [];

    // Start from the enrollment month
    const cursor = new Date(Date.UTC(
        enrollmentDate.getUTCFullYear(),
        enrollmentDate.getUTCMonth(),
        1,
    ));

    // End month (inclusive)
    const endMonth = new Date(Date.UTC(
        classEndDate.getUTCFullYear(),
        classEndDate.getUTCMonth(),
        1,
    ));

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

function parseDateOnlyToUtc(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;

    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return null;
    }

    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
        parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day
    ) {
        return null;
    }

    return parsed;
}

function isEditablePaymentStatus(value: unknown): value is EditablePaymentStatus {
    return value === 'UNPAID' || value === 'PENDING_CONFIRMATION' || value === 'PAID' || value === 'REJECTED';
}

function isEditablePaymentMethod(value: unknown): value is EditablePaymentMethod {
    return value === 'NONE' || value === 'CASH' || value === 'QR';
}

/**
 * Generate installments for a FULL_COURSE enrollment.
 * Called inside the enrollment transaction after the enrollment record is created.
 */
export async function generateInstallmentsForEnrollment(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    params: {
        enrollmentId: number;
        enrollmentDate: Date;
        classEndDate: Date;
        billingDay: number;
        amountCents: number;
    },
): Promise<void> {
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
            payment_status: PaymentStatus.UNPAID,
            payment_method: PaymentMethod.NONE,
        })),
    });
}

/**
 * Get the installment that covers the current month for an enrollment.
 * Returns null if the enrollment is not FULL_COURSE or no installment found.
 */
export async function getCurrentMonthInstallment(enrollmentId: number): Promise<{
    id: number;
    payment_status: PaymentStatus;
    amount_cents: number;
    due_date: Date;
} | null> {
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const startOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    return prisma.enrollmentInstallment.findFirst({
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
export async function listInstallments(companyId: number, enrollmentId: number): Promise<ServiceResult> {
    return getEnrollmentInstallmentPlan(companyId, enrollmentId);
}

export async function updateInstallments(
    companyId: number,
    enrollmentId: number,
    adminUserId: string,
    installments: UpdateEnrollmentInstallmentInput[],
): Promise<ServiceResult> {
    const enrollment = await prisma.groupClassEnrollment.findFirst({
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
    const seenIds = new Set<number>();
    const normalizedRows: Array<{
        id?: number;
        dueDate: Date;
        amountCents: number;
        paymentStatus: PaymentStatus;
        paymentMethod: PaymentMethod;
    }> = [];

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

        if (
            (rawInstallment.payment_status === 'PENDING_CONFIRMATION' || rawInstallment.payment_status === 'REJECTED')
            && rawInstallment.payment_method !== 'QR'
        ) {
            return {
                code: 400,
                error: true,
                message: `Installment ${rowNumber} must use QR when pending confirmation or rejected`,
            };
        }

        if (
            rawInstallment.payment_status === 'PAID'
            && rawInstallment.amount_cents > 0
            && rawInstallment.payment_method === 'NONE'
        ) {
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
            paymentStatus: rawInstallment.payment_status as PaymentStatus,
            paymentMethod: rawInstallment.payment_method as PaymentMethod,
        });
    }

    const idsToDelete = enrollment.installments
        .filter((installment) => !seenIds.has(installment.id))
        .map((installment) => installment.id);

    const paidInstallmentDeleted = enrollment.installments.some(
        (installment) => idsToDelete.includes(installment.id) && installment.payment_status === PaymentStatus.PAID,
    );
    if (paidInstallmentDeleted) {
        return { code: 400, error: true, message: 'Paid installments cannot be removed' };
    }

    const now = new Date();
    const syncResult = await prisma.$transaction(async (tx) => {
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
            const qrProofImageUrl = installment.paymentMethod === PaymentMethod.QR
                ? current?.qr_proof_image_url ?? null
                : null;
            const paidAt = installment.paymentStatus === PaymentStatus.PAID
                ? current?.paid_at ?? now
                : null;
            const markedPaidByAdminId = installment.paymentStatus === PaymentStatus.PAID
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
            } else {
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
                payment_method: firstInstallment.payment_status === PaymentStatus.PENDING_CONFIRMATION
                    ? PaymentMethod.QR
                    : firstInstallment.payment_method,
                qr_proof_image_url: firstInstallment.payment_method === PaymentMethod.QR
                    ? firstInstallment.qr_proof_image_url ?? null
                    : null,
            },
        });

        return {
            firstInstallmentStatus: firstInstallment.payment_status,
        };
    });

    if (syncResult.firstInstallmentStatus === PaymentStatus.PAID) {
        try {
            await issueClassTicketForEnrollment(companyId, enrollmentId);
        } catch (error) {
            logger.error({ companyId, enrollmentId, error }, 'Failed to issue class ticket after installment plan update');
        }
    } else {
        await cancelTicketsForClassEnrollment(companyId, enrollmentId);
    }

    return getEnrollmentInstallmentPlan(companyId, enrollmentId);
}

/**
 * Admin: mark an installment as paid.
 */
export async function markInstallmentPaid(
    companyId: number,
    installmentId: number,
    adminUserId: string,
    paymentMethod: 'CASH' | 'QR',
): Promise<ServiceResult> {
    const installment = await prisma.enrollmentInstallment.findFirst({
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

    if (installment.payment_status === PaymentStatus.PAID) {
        return { code: 400, error: true, message: 'Installment is already paid' };
    }

    const updated = await prisma.enrollmentInstallment.update({
        where: { id: installmentId },
        data: {
            payment_status: PaymentStatus.PAID,
            payment_method: paymentMethod as PaymentMethod,
            paid_at: new Date(),
            marked_paid_by_admin_id: adminUserId,
        },
    });

    await unlockEnrollmentAccessFromFirstInstallment({
        companyId,
        installmentId,
        paymentMethod: paymentMethod as PaymentMethod,
    });

    return { code: 200, error: false, message: 'Installment marked as paid', data: updated };
}

/**
 * Admin: confirm a pending QR payment proof uploaded by the student.
 */
export async function confirmInstallmentQrPayment(
    companyId: number,
    installmentId: number,
    adminUserId: string,
): Promise<ServiceResult> {
    const installment = await prisma.enrollmentInstallment.findFirst({
        where: { id: installmentId },
        include: {
            enrollment: { select: { company_id: true } },
        },
    });

    if (!installment || installment.enrollment.company_id !== companyId) {
        return { code: 404, error: true, message: 'Installment not found' };
    }

    if (installment.payment_status !== PaymentStatus.PENDING_CONFIRMATION) {
        return { code: 400, error: true, message: `Cannot confirm: installment status is ${installment.payment_status}` };
    }

    const updated = await prisma.enrollmentInstallment.update({
        where: { id: installmentId },
        data: {
            payment_status: PaymentStatus.PAID,
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
export async function submitInstallmentQrProof(
    companyId: number,
    enrollmentId: number,
    installmentId: number,
    userId: string,
    qrProofImageUrl: string,
): Promise<ServiceResult> {
    const installment = await prisma.enrollmentInstallment.findFirst({
        where: { id: installmentId, enrollment_id: enrollmentId },
        include: {
            enrollment: {
                select: { company_id: true, user_id: true },
            },
        },
    });

    if (
        !installment
        || installment.enrollment.company_id !== companyId
        || installment.enrollment.user_id !== userId
    ) {
        return { code: 404, error: true, message: 'Installment not found' };
    }

    if (installment.payment_status === PaymentStatus.PAID) {
        return { code: 400, error: true, message: 'Installment is already paid' };
    }

    const updated = await prisma.enrollmentInstallment.update({
        where: { id: installmentId },
        data: {
            payment_status: PaymentStatus.PENDING_CONFIRMATION,
            payment_method: PaymentMethod.QR,
            qr_proof_image_url: qrProofImageUrl,
        },
    });

    return { code: 200, error: false, message: 'QR proof submitted, pending confirmation', data: updated };
}
