import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { MensajeApi } from '../types/MensajeApi';
import { getEnrollmentInstallmentPlan } from './group-payments.service';

type ServiceResult = MensajeApi & { data?: unknown };

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
