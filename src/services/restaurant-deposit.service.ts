import { createHash, randomBytes } from 'crypto';
import {
  Prisma,
  RestaurantDepositMode,
  RestaurantDepositPaymentMethod,
  RestaurantDepositStatus,
  RestaurantNotificationEvent,
  RestaurantReservationStatus,
} from '@prisma/client';
import { prisma } from '../prisma/client';
import { isCompanyAvailableNow } from '../utils/company-availability';
import { isFeatureEnabledForCompany } from './plan-enforcement.service';
import { StorageService } from './storage.service';
import { notifyRestaurantReservation } from './restaurant-notification.service';
import { parseDateTimeInTimeZone } from '../utils/timezone';
import { consumeUploadIntent, recordStoredUpload, UPLOAD_PURPOSES } from './upload-intent.service';
import { UploadSecurityError, UPLOAD_ERROR_CODES } from '../utils/upload-errors';
import { validateUploadFile, PUBLIC_UPLOAD_MAX_BYTES, PUBLIC_UPLOAD_MIME_TYPES } from '../utils/upload-validation';

type Result = { code: number; error: boolean; message: string; data?: unknown; errorCode?: string; reason?: string };
const ok = (data: unknown, message = 'Operación realizada correctamente.', code = 200): Result => ({ code, error: false, message, data });
const fail = (code: number, message: string): Result => ({ code, error: true, message });

const hasReservationStatus = (value: RestaurantReservationStatus, allowed: RestaurantReservationStatus[]) => allowed.includes(value);
const hasDepositStatus = (value: RestaurantDepositStatus, allowed: RestaurantDepositStatus[]) => allowed.includes(value);

function normalizeOriginalName(value: string) { return value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 255) || 'proof'; }
function amountFor(mode: RestaurantDepositMode, amount: number, partySize: number) { return mode === RestaurantDepositMode.PER_PERSON ? amount * partySize : amount; }
function deadlineFor(startAt: Date) { return new Date(startAt.getTime() - 24 * 60 * 60 * 1000); }
function safeDeposit(deposit: any) {
  if (!deposit) return null;
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

export async function ensureReservationDeposit(
  tx: Prisma.TransactionClient,
  companyId: number,
  reservationId: number,
  partySize: number,
  startAt: Date,
) {
  const company = await tx.company.findFirst({ where: { id: companyId }, select: { currency: true, restaurant_settings: true } });
  const settings = company?.restaurant_settings;
  const reservation = await tx.restaurantReservation.findFirst({ where: { id: reservationId, company_id: companyId }, select: { id: true, status: true, deposit_amount_cents: true, deposit_mode: true } });
  if (!reservation) throw Object.assign(new Error('La reserva no pertenece a la empresa activa.'), { status: 404 });
  if (!company || !settings || !settings.deposit_enabled || settings.deposit_amount_cents <= 0) {
    await tx.restaurantReservation.updateMany({ where: { id: reservationId, company_id: companyId }, data: { deposit_amount_cents: 0, deposit_mode: null, deposit_proof_image_url: null } });
    return null;
  }
  const required = amountFor(settings.deposit_mode, settings.deposit_amount_cents, partySize);
  const existing = await tx.restaurantReservationDeposit.findUnique({ where: { reservation_id: reservationId }, select: { id: true, company_id: true, status: true, required_amount_cents: true, mode: true, currency: true } });
  if (existing && existing.company_id !== companyId) throw Object.assign(new Error('El depósito no pertenece a la empresa activa.'), { status: 409 });
  const financialChanged = existing && (existing.required_amount_cents !== required || existing.mode !== settings.deposit_mode || existing.currency !== company.currency);
  if (financialChanged && !hasDepositStatus(existing.status, [RestaurantDepositStatus.REQUIRED, RestaurantDepositStatus.PENDING, RestaurantDepositStatus.REJECTED])) throw Object.assign(new Error('No se puede cambiar el importe del depósito después de presentar o resolver un comprobante.'), { status: 409 });
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
      status: RestaurantDepositStatus.PENDING,
      payment_deadline: deadlineFor(startAt),
    },
  });
  await tx.restaurantReservation.updateMany({ where: { id: reservationId, company_id: companyId }, data: { deposit_amount_cents: required, deposit_mode: settings.deposit_mode, deposit_proof_image_url: null } });
  if (!existing || financialChanged) await tx.restaurantAuditLog.create({ data: { company_id: companyId, reservation_id: reservationId, event: 'DEPOSIT_REQUIRED', target_type: 'RESTAURANT_RESERVATION_DEPOSIT', target_id: String(deposit.id), previous_values: existing ? { required_amount_cents: existing.required_amount_cents, mode: existing.mode, currency: existing.currency } : Prisma.JsonNull, new_values: { required_amount_cents: deposit.required_amount_cents, mode: deposit.mode, currency: deposit.currency, status: deposit.status } } });
  return deposit;
}

async function publicCompany(slug: string) {
  const company = await prisma.company.findUnique({ where: { slug }, select: { id: true, slug: true, name: true, is_active: true, deleted_at: true, availableUntil: true, restaurant_enabled: true, restaurant_settings: true } });
  if (!company || !isCompanyAvailableNow(company) || !company.restaurant_enabled || !company.restaurant_settings) return null;
  if (!await isFeatureEnabledForCompany(company.id, 'RESTAURANT_MODULE')) return null;
  return company;
}

export async function publicDepositStatus(companyId: number, reservationId: number) {
  const deposit = await prisma.restaurantReservationDeposit.findFirst({ where: { company_id: companyId, reservation_id: reservationId } });
  return safeDeposit(deposit);
}

export async function uploadPublicReservationProof(slug: string, reservationCode: string, file: { buffer: Buffer; mimetype: string; originalname: string } | undefined, uploadIntent: string | null): Promise<Result> {
  const context = await publicCompany(slug);
  if (!context) return fail(404, 'No encontramos la reserva o el restaurante solicitado.');
  let validated: { mimeType: string; extension: string; size: number };
  try {
    validated = validateUploadFile(file, { maxBytes: PUBLIC_UPLOAD_MAX_BYTES, allowedMimeTypes: PUBLIC_UPLOAD_MIME_TYPES });
  } catch (error) {
    if (error instanceof UploadSecurityError) return { code: error.statusCode, error: true, errorCode: error.errorCode, reason: error.errorCode, message: error.message };
    return fail(400, 'No pudimos validar el comprobante.');
  }
  if (!file) return { code: 400, error: true, errorCode: UPLOAD_ERROR_CODES.FILE_REQUIRED, reason: UPLOAD_ERROR_CODES.FILE_REQUIRED, message: 'Debes seleccionar un archivo.' };
  if (!uploadIntent) return { code: 400, error: true, errorCode: UPLOAD_ERROR_CODES.INTENT_INVALID, reason: UPLOAD_ERROR_CODES.INTENT_INVALID, message: 'La autorización de carga no es válida.' };

  const reservationForIntent = await prisma.restaurantReservation.findFirst({ where: { company_id: context.id, reservation_code: reservationCode }, select: { id: true } });
  if (!reservationForIntent) return { code: 404, error: true, errorCode: UPLOAD_ERROR_CODES.INTENT_INVALID, reason: UPLOAD_ERROR_CODES.INTENT_INVALID, message: 'No encontramos la reserva o el restaurante solicitado.' };

  let intent;
  try {
    intent = await consumeUploadIntent(uploadIntent, { expectedPurpose: UPLOAD_PURPOSES.RESTAURANT_DEPOSIT_PROOF, companyId: context.id, contextId: `RESERVATION:${reservationForIntent.id}` });
  } catch (error) {
    if (error instanceof UploadSecurityError) return { code: error.statusCode, error: true, errorCode: error.errorCode, reason: error.errorCode, message: error.message };
    return fail(400, 'La autorización de carga no es válida.');
  }
  let relativePath: string | null = null;
  let oldPath: string | null = null;
  let uploadRecorded = false;
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM restaurant_reservation WHERE company_id = ${context.id} AND reservation_code = ${reservationCode} FOR UPDATE`;
      const reservation = await tx.restaurantReservation.findFirst({ where: { company_id: context.id, reservation_code: reservationCode }, select: { id: true, status: true, party_size: true, start_time: true } });
      if (!reservation) throw Object.assign(new Error('No encontramos la reserva o el restaurante solicitado.'), { status: 404 });
      if (hasReservationStatus(reservation.status, [RestaurantReservationStatus.CANCELLED, RestaurantReservationStatus.NO_SHOW, RestaurantReservationStatus.COMPLETED])) throw Object.assign(new Error('Esta reserva ya no admite comprobantes.'), { status: 409 });
      const deposit = await tx.restaurantReservationDeposit.findFirst({ where: { company_id: context.id, reservation_id: reservation.id } });
      if (!deposit) throw Object.assign(new Error('Esta reserva no requiere depósito.'), { status: 409 });
      if (hasDepositStatus(deposit.status, [RestaurantDepositStatus.APPROVED, RestaurantDepositStatus.WAIVED, RestaurantDepositStatus.REFUNDED, RestaurantDepositStatus.EXPIRED])) throw Object.assign(new Error('El depósito de esta reserva ya fue resuelto o venció.'), { status: 409 });
      oldPath = deposit.proof_path;
      relativePath = await StorageService.saveFile(context.id, 'restaurant-deposit-proofs', `proof-${randomBytes(20).toString('hex')}.${validated.extension}`, file.buffer);
      await recordStoredUpload(intent, relativePath);
      uploadRecorded = true;
      const updated = await tx.restaurantReservationDeposit.update({
        where: { id: deposit.id },
        data: {
          status: RestaurantDepositStatus.PROOF_SUBMITTED,
          proof_path: relativePath,
          proof_original_name: normalizeOriginalName(file.originalname),
          proof_mime_type: validated.mimeType,
          proof_size_bytes: validated.size,
          proof_sha256: createHash('sha256').update(file.buffer).digest('hex'),
          proof_submitted_at: new Date(),
          public_submission_id: randomBytes(18).toString('base64url'),
          rejection_reason: null,
          reviewed_at: null,
          reviewed_by_user_id: null,
        },
      });
      await tx.restaurantReservation.update({ where: { id: reservation.id }, data: { deposit_proof_image_url: null } });
      await tx.restaurantAuditLog.create({ data: { company_id: context.id, reservation_id: reservation.id, event: 'DEPOSIT_PROOF_SUBMITTED', target_type: 'RESTAURANT_RESERVATION_DEPOSIT', target_id: String(deposit.id), previous_values: { status: deposit.status, has_proof: Boolean(deposit.proof_path) }, new_values: { status: updated.status, has_proof: true }, metadata: { proof_sha256: updated.proof_sha256 } } });
      return { reservationId: reservation.id, deposit: safeDeposit(updated) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    try { await notifyRestaurantReservation({ companyId: context.id, reservationId: result.reservationId, event: RestaurantNotificationEvent.DEPOSIT_PROOF_SUBMITTED }); } catch { /* Persistence is independent of delivery. */ }
    if (oldPath && oldPath !== relativePath) await StorageService.deleteFile(oldPath).catch(() => undefined);
    return ok(result.deposit, 'Comprobante enviado para revisión.', 201);
  } catch (error: any) {
    if (relativePath) await StorageService.deleteFile(relativePath).catch(() => undefined);
    if (uploadRecorded) await prisma.uploadIntent.updateMany({ where: { id: intent.databaseId, stored_path: relativePath }, data: { stored_path: null } }).catch(() => undefined);
    if (error instanceof UploadSecurityError) return { code: error.statusCode, error: true, errorCode: error.errorCode, reason: error.errorCode, message: error.message };
    return fail(error?.status || 500, error?.message || 'No pudimos enviar el comprobante.');
  }
}

function nextDate(value: string) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); }
function depositWhere(companyId: number, query: any, timezone: string): Prisma.RestaurantReservationDepositWhereInput {
  const reservationFilters: Prisma.RestaurantReservationWhereInput[] = [];
  if (query.dateFrom || query.dateTo) {
    reservationFilters.push({
      start_time: {
        ...(query.dateFrom ? { gte: parseDateTimeInTimeZone(`${query.dateFrom}T00:00:00`, timezone) } : {}),
        ...(query.dateTo ? { lt: parseDateTimeInTimeZone(`${nextDate(query.dateTo)}T00:00:00`, timezone) } : {}),
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

export async function listDeposits(companyId: number, query: any): Promise<Result> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
  if (!company) return fail(404, 'No encontramos la empresa.');
  const where = depositWhere(companyId, query, company.timezone);
  const [total, items] = await prisma.$transaction([
    prisma.restaurantReservationDeposit.count({ where }),
    prisma.restaurantReservationDeposit.findMany({ where, include: { reservation: { select: { id: true, reservation_code: true, reservation_date: true, start_time: true, party_size: true, customer_name: true, customer_phone: true, status: true } } }, orderBy: { updated_at: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
  ]);
  return ok({ items: items.map((item) => ({ ...safeDeposit(item), reservation: item.reservation })), pagination: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } });
}

export async function getDeposit(companyId: number, id: number): Promise<Result> {
  const deposit = await prisma.restaurantReservationDeposit.findFirst({ where: { id, company_id: companyId }, include: { reservation: { select: { id: true, reservation_code: true, reservation_date: true, start_time: true, party_size: true, customer_name: true, customer_phone: true, customer_email: true, status: true } } } });
  return deposit ? ok({ ...safeDeposit(deposit), reservation: deposit.reservation }) : fail(404, 'No encontramos el depósito.');
}

export async function privateProofPath(companyId: number, id: number) {
  const deposit = await prisma.restaurantReservationDeposit.findFirst({ where: { id, company_id: companyId }, select: { proof_path: true, proof_mime_type: true, proof_original_name: true } });
  if (!deposit?.proof_path || !StorageService.isPrivateRelativePath(deposit.proof_path)) return null;
  return { path: deposit.proof_path, mimeType: deposit.proof_mime_type || 'application/octet-stream', originalName: deposit.proof_original_name || 'proof' };
}

export async function reviewDeposit(companyId: number, id: number, actorUserId: string, input: { action: 'APPROVE' | 'REJECT' | 'WAIVE' | 'REFUND'; reason?: string | null; amountCents?: number; paymentMethod?: RestaurantDepositPaymentMethod | null }): Promise<Result> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const actor = await tx.companyUser.findFirst({ where: { company_id: companyId, user_id: actorUserId, deleted_at: null }, select: { id: true } });
      if (!actor) throw Object.assign(new Error('El usuario no pertenece a esta empresa.'), { status: 403 });
      const pointer = await tx.restaurantReservationDeposit.findFirst({ where: { company_id: companyId, id }, select: { reservation_id: true } });
      if (!pointer) throw Object.assign(new Error('No encontramos el depósito.'), { status: 404 });
      await tx.$queryRaw`SELECT id FROM restaurant_reservation WHERE company_id = ${companyId} AND id = ${pointer.reservation_id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM restaurant_reservation_deposit WHERE company_id = ${companyId} AND id = ${id} FOR UPDATE`;
      const deposit = await tx.restaurantReservationDeposit.findFirst({ where: { company_id: companyId, id }, include: { reservation: { select: { id: true, status: true, customer_name: true } } } });
      if (!deposit) throw Object.assign(new Error('No encontramos el depósito.'), { status: 404 });
      if (([RestaurantReservationStatus.CANCELLED, RestaurantReservationStatus.NO_SHOW] as RestaurantReservationStatus[]).includes(deposit.reservation.status) && input.action !== 'REFUND') throw Object.assign(new Error('No se puede revisar un depósito de una reserva cancelada o ausente.'), { status: 409 });
      const now = new Date();
      const previous = { status: deposit.status, refunded_amount_cents: deposit.refunded_amount_cents, rejection_reason: deposit.rejection_reason };
      const data: Prisma.RestaurantReservationDepositUpdateInput = { reviewed_by: { connect: { id: actorUserId } }, reviewed_at: now };
      if (input.action === 'APPROVE') {
        if (!deposit.proof_path) throw Object.assign(new Error('No se puede aprobar un depósito sin comprobante.'), { status: 409 });
        if (!hasDepositStatus(deposit.status, [RestaurantDepositStatus.PROOF_SUBMITTED, RestaurantDepositStatus.REJECTED, RestaurantDepositStatus.PENDING])) throw Object.assign(new Error('El depósito no puede aprobarse desde su estado actual.'), { status: 409 });
        data.status = RestaurantDepositStatus.APPROVED; data.approved_at = now; data.rejection_reason = null; if (input.paymentMethod) data.payment_method = input.paymentMethod;
      } else if (input.action === 'REJECT') {
        if (!hasDepositStatus(deposit.status, [RestaurantDepositStatus.PROOF_SUBMITTED, RestaurantDepositStatus.PENDING, RestaurantDepositStatus.REJECTED])) throw Object.assign(new Error('El depósito no puede rechazarse desde su estado actual.'), { status: 409 });
        if (!input.reason?.trim()) throw Object.assign(new Error('Indicá el motivo del rechazo.'), { status: 400 });
        data.status = RestaurantDepositStatus.REJECTED; data.rejection_reason = input.reason.trim().slice(0, 500); data.approved_at = null;
      } else if (input.action === 'WAIVE') {
        if (!input.reason?.trim()) throw Object.assign(new Error('Indicá el motivo de la exención.'), { status: 400 });
        if (!hasDepositStatus(deposit.status, [RestaurantDepositStatus.REQUIRED, RestaurantDepositStatus.PENDING, RestaurantDepositStatus.PROOF_SUBMITTED, RestaurantDepositStatus.REJECTED])) throw Object.assign(new Error('El depósito no puede eximirse desde su estado actual.'), { status: 409 });
        data.status = RestaurantDepositStatus.WAIVED; data.rejection_reason = null;
      } else {
        if (!hasDepositStatus(deposit.status, [RestaurantDepositStatus.APPROVED, RestaurantDepositStatus.PARTIALLY_REFUNDED])) throw Object.assign(new Error('Solo se puede reembolsar un depósito aprobado.'), { status: 409 });
        const requested = input.amountCents ?? deposit.required_amount_cents - deposit.refunded_amount_cents;
        if (!Number.isInteger(requested) || requested <= 0 || requested > deposit.required_amount_cents - deposit.refunded_amount_cents) throw Object.assign(new Error('El monto de reembolso no es válido.'), { status: 400 });
        const totalRefunded = deposit.refunded_amount_cents + requested;
        data.status = totalRefunded >= deposit.required_amount_cents ? RestaurantDepositStatus.REFUNDED : RestaurantDepositStatus.PARTIALLY_REFUNDED;
        data.refunded_amount_cents = totalRefunded; data.refunded_at = now; data.refunded_by = { connect: { id: actorUserId } }; data.refund_reason = input.reason?.trim()?.slice(0, 500) || null;
      }
      const updated = await tx.restaurantReservationDeposit.update({ where: { id: deposit.id }, data });
      let reservationConfirmed = false;
      if (input.action === 'APPROVE' && deposit.reservation.status === RestaurantReservationStatus.PENDING) {
        const settings = await tx.restaurantSettings.findUnique({ where: { company_id: companyId }, select: { auto_confirm_reservations: true } });
        if (settings?.auto_confirm_reservations) reservationConfirmed = Boolean((await tx.restaurantReservation.updateMany({ where: { id: deposit.reservation.id, company_id: companyId, status: RestaurantReservationStatus.PENDING }, data: { status: RestaurantReservationStatus.CONFIRMED } })).count);
      }
      await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, reservation_id: deposit.reservation.id, event: `DEPOSIT_${input.action}`, target_type: 'RESTAURANT_RESERVATION_DEPOSIT', target_id: String(id), previous_values: previous, new_values: { status: updated.status, refunded_amount_cents: updated.refunded_amount_cents, rejection_reason: updated.rejection_reason }, metadata: { reason: input.reason || null } } });
      return { reservationId: deposit.reservation.id, status: updated.status, deposit: safeDeposit(updated), reservationConfirmed };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const event = input.action === 'APPROVE' ? RestaurantNotificationEvent.DEPOSIT_APPROVED : input.action === 'REJECT' ? RestaurantNotificationEvent.DEPOSIT_REJECTED : input.action === 'REFUND' ? RestaurantNotificationEvent.DEPOSIT_REFUNDED : null;
    if (event) try { await notifyRestaurantReservation({ companyId, reservationId: result.reservationId, event }); } catch { /* Delivery is isolated from the financial state transition. */ }
    if (result.reservationConfirmed) try { await notifyRestaurantReservation({ companyId, reservationId: result.reservationId, event: RestaurantNotificationEvent.RESTAURANT_RESERVATION_CONFIRMED }); } catch { /* Delivery is isolated from the financial state transition. */ }
    return ok(result.deposit, input.action === 'APPROVE' ? 'Depósito aprobado.' : input.action === 'REJECT' ? 'Depósito rechazado.' : input.action === 'WAIVE' ? 'Depósito eximido.' : 'Reembolso registrado.');
  } catch (error: any) { return fail(error?.status || (error?.code === 'P2034' ? 409 : 500), error?.message || 'No pudimos actualizar el depósito.'); }
}

export async function sendDeadlineReminder(companyId: number, id: number, actorUserId: string): Promise<Result> {
  const deposit = await prisma.restaurantReservationDeposit.findFirst({
    where: { id, company_id: companyId },
    select: { id: true, status: true, payment_deadline: true, reservation: { select: { id: true, status: true } } },
  });
  if (!deposit) return fail(404, 'No encontramos el depósito.');
  if (!hasDepositStatus(deposit.status, [RestaurantDepositStatus.REQUIRED, RestaurantDepositStatus.PENDING, RestaurantDepositStatus.REJECTED])) return fail(409, 'Este depósito ya no admite recordatorios manuales.');
  await prisma.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, reservation_id: deposit.reservation.id, event: 'DEPOSIT_DEADLINE_REMINDER_SENT', target_type: 'RESTAURANT_RESERVATION_DEPOSIT', target_id: String(id), metadata: { payment_deadline: deposit.payment_deadline } } });
  const results = await notifyRestaurantReservation({ companyId, reservationId: deposit.reservation.id, event: RestaurantNotificationEvent.DEPOSIT_DEADLINE_REMINDER, trigger: 'MANUAL' });
  return ok({ reservationId: deposit.reservation.id, results }, 'Recordatorio de depósito enviado.');
}

export async function expireDueDeposits(companyId?: number) {
  const where: Prisma.RestaurantReservationDepositWhereInput = { status: { in: [RestaurantDepositStatus.REQUIRED, RestaurantDepositStatus.PENDING] }, payment_deadline: { lt: new Date() }, reservation: { status: { in: [RestaurantReservationStatus.PENDING, RestaurantReservationStatus.CONFIRMED] } }, ...(companyId ? { company_id: companyId } : {}) };
  const due = await prisma.restaurantReservationDeposit.findMany({ where, select: { id: true, company_id: true, reservation_id: true } });
  if (!due.length) return 0;
  const expiredItems = await prisma.$transaction(async (tx) => {
    const changedItems: Array<{ company_id: number; reservation_id: number }> = [];
    for (const item of due) {
      const changed = await tx.restaurantReservationDeposit.updateMany({ where: { id: item.id, company_id: item.company_id, status: { in: [RestaurantDepositStatus.REQUIRED, RestaurantDepositStatus.PENDING] } }, data: { status: RestaurantDepositStatus.EXPIRED, reviewed_at: new Date() } });
      if (!changed.count) continue;
      changedItems.push({ company_id: item.company_id, reservation_id: item.reservation_id });
      await tx.restaurantAuditLog.create({ data: { company_id: item.company_id, reservation_id: item.reservation_id, event: 'DEPOSIT_EXPIRED', target_type: 'RESTAURANT_RESERVATION_DEPOSIT', target_id: String(item.id), new_values: { status: RestaurantDepositStatus.EXPIRED } } });
    }
    return changedItems;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  for (const item of expiredItems) {
    try { await notifyRestaurantReservation({ companyId: item.company_id, reservationId: item.reservation_id, event: RestaurantNotificationEvent.DEPOSIT_EXPIRED }); } catch { /* Expiry persistence is independent of delivery. */ }
  }
  return expiredItems.length;
}
