"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.listWaitlist = listWaitlist;
exports.addWaitlist = addWaitlist;
exports.updateWaitlist = updateWaitlist;
exports.waitlistRecommendations = waitlistRecommendations;
exports.seatWaitlist = seatWaitlist;
exports.listVisits = listVisits;
exports.saveVisit = saveVisit;
exports.saveStaffVisit = saveStaffVisit;
exports.getVisit = getVisit;
exports.reopenVisit = reopenVisit;
exports.financialMetrics = financialMetrics;
exports.listDeposits = listDeposits;
exports.getDeposit = getDeposit;
exports.depositProof = depositProof;
exports.reviewDeposit = reviewDeposit;
exports.remindDeposit = remindDeposit;
exports.listCrm = listCrm;
exports.getCrm = getCrm;
exports.updateCrm = updateCrm;
exports.recalculateCrm = recalculateCrm;
exports.listCloseouts = listCloseouts;
exports.previewCloseout = previewCloseout;
exports.closeCloseout = closeCloseout;
exports.finalizeCloseout = finalizeCloseout;
exports.reopenCloseout = reopenCloseout;
exports.adjustCloseout = adjustCloseout;
exports.getCloseout = getCloseout;
exports.exportCloseout = exportCloseout;
const Waitlist = __importStar(require("../services/restaurant-waitlist.service"));
const Visits = __importStar(require("../services/restaurant-visit.service"));
const Deposits = __importStar(require("../services/restaurant-deposit.service"));
const Crm = __importStar(require("../services/restaurant-crm.service"));
const Closeouts = __importStar(require("../services/restaurant-closeout.service"));
const storage_service_1 = require("../services/storage.service");
function companyId(req, res) { const value = req.companyID; if (!value) {
    res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    return null;
} return value; }
function actor(req, res) { const value = req.authUser?.id; if (!value) {
    res.status(401).json({ code: 401, error: true, message: 'Sesión no válida.' });
    return null;
} return value; }
function id(value) { const parsed = Number(Array.isArray(value) ? value[0] : value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; }
async function respond(res, work) { const result = await work; return res.status(result.code).json(result); }
async function listWaitlist(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, Waitlist.list(cid, req.validatedQuery)); }
async function addWaitlist(req, res) { const cid = companyId(req, res), uid = actor(req, res); if (cid && uid)
    return respond(res, Waitlist.add(cid, uid, req.validated)); }
async function updateWaitlist(req, res) { const cid = companyId(req, res), uid = actor(req, res), recordId = id(req.params.id); if (!cid || !uid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de lista de espera inválido.' }); return respond(res, Waitlist.update(cid, uid, recordId, req.validated)); }
async function waitlistRecommendations(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, Waitlist.recommendations(cid, req.validatedQuery)); }
async function seatWaitlist(req, res) { const cid = companyId(req, res), uid = actor(req, res), recordId = id(req.params.id); if (!cid || !uid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de lista de espera inválido.' }); return respond(res, Waitlist.seat(cid, uid, recordId, req.validated)); }
async function listVisits(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, Visits.listVisits(cid, req.validatedQuery)); }
async function saveVisit(req, res) { const cid = companyId(req, res), uid = actor(req, res); if (cid && uid)
    return respond(res, Visits.saveVisit(cid, uid, req.validated)); }
async function saveStaffVisit(req, res) { const cid = companyId(req, res), uid = actor(req, res); if (cid && uid)
    return respond(res, Visits.saveVisit(cid, uid, req.validated, true)); }
async function getVisit(req, res) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de visita inválido.' }); return respond(res, Visits.getVisit(cid, recordId)); }
async function reopenVisit(req, res) { const cid = companyId(req, res), uid = actor(req, res), recordId = id(req.params.id); if (!cid || !uid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de visita inválido.' }); return respond(res, Visits.reopenVisit(cid, recordId, uid, req.validated.reason)); }
async function financialMetrics(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, Visits.financialMetrics(cid, req.validatedQuery)); }
async function listDeposits(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, Deposits.listDeposits(cid, req.validatedQuery)); }
async function getDeposit(req, res) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de depósito inválido.' }); return respond(res, Deposits.getDeposit(cid, recordId)); }
async function depositProof(req, res) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de depósito inválido.' }); const proof = await Deposits.privateProofPath(cid, recordId); if (!proof)
    return res.status(404).json({ code: 404, error: true, message: 'No encontramos el comprobante.' }); try {
    const fullPath = await storage_service_1.StorageService.getFilePath(proof.path);
    res.set({ 'Content-Type': proof.mimeType, 'Content-Disposition': `inline; filename="${proof.originalName.replace(/[^A-Za-z0-9._-]/g, '_')}"`, 'Cache-Control': 'private, no-store' });
    return res.sendFile(fullPath);
}
catch {
    return res.status(404).json({ code: 404, error: true, message: 'No encontramos el comprobante.' });
} }
async function reviewDeposit(req, res) { const cid = companyId(req, res), uid = actor(req, res), recordId = id(req.params.id); if (!cid || !uid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de depósito inválido.' }); return respond(res, Deposits.reviewDeposit(cid, recordId, uid, req.validated)); }
async function remindDeposit(req, res) { const cid = companyId(req, res), uid = actor(req, res), recordId = id(req.params.id); if (!cid || !uid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de depósito inválido.' }); return respond(res, Deposits.sendDeadlineReminder(cid, recordId, uid)); }
async function listCrm(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, Crm.list(cid, req.validatedQuery)); }
async function getCrm(req, res) { const cid = companyId(req, res), recordId = id(req.params.customerProfileId); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de cliente inválido.' }); return respond(res, Crm.get(cid, recordId)); }
async function updateCrm(req, res) { const cid = companyId(req, res), uid = actor(req, res), recordId = id(req.params.customerProfileId); if (!cid || !uid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de cliente inválido.' }); return respond(res, Crm.update(cid, uid, recordId, req.validated)); }
async function recalculateCrm(req, res) { const cid = companyId(req, res), recordId = id(req.params.customerProfileId); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de cliente inválido.' }); return respond(res, Crm.recalculate(cid, recordId)); }
async function listCloseouts(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, Closeouts.list(cid, req.validatedQuery)); }
async function previewCloseout(req, res) { const cid = companyId(req, res), shiftId = id(req.params.shiftId); if (!cid)
    return; if (!shiftId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, Closeouts.preview(cid, shiftId)); }
async function closeCloseout(req, res) { const cid = companyId(req, res), uid = actor(req, res), shiftId = id(req.params.shiftId); if (!cid || !uid)
    return; if (!shiftId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, Closeouts.close(cid, shiftId, uid, req.validated)); }
async function finalizeCloseout(req, res) { const cid = companyId(req, res), uid = actor(req, res), shiftId = id(req.params.shiftId); if (!cid || !uid)
    return; if (!shiftId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, Closeouts.finalize(cid, shiftId, uid)); }
async function reopenCloseout(req, res) { const cid = companyId(req, res), uid = actor(req, res), shiftId = id(req.params.shiftId); if (!cid || !uid)
    return; if (!shiftId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, Closeouts.reopen(cid, shiftId, uid, req.validated.reason)); }
async function adjustCloseout(req, res) { const cid = companyId(req, res), uid = actor(req, res), shiftId = id(req.params.shiftId); if (!cid || !uid)
    return; if (!shiftId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, Closeouts.adjust(cid, shiftId, uid, req.validated)); }
async function getCloseout(req, res) { const cid = companyId(req, res), shiftId = id(req.params.shiftId); if (!cid)
    return; if (!shiftId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, Closeouts.get(cid, shiftId)); }
async function exportCloseout(req, res) { const cid = companyId(req, res), shiftId = id(req.params.shiftId); if (!cid)
    return; if (!shiftId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); const result = await Closeouts.get(cid, shiftId); if (result.error)
    return res.status(result.code).json(result); const closeout = result.data; const rows = [['section', 'value'], ['shift', closeout.shift?.name || ''], ['status', closeout.status], ['total_paid_amount_cents', closeout.revenue_summary?.total_paid_amount_cents ?? 0], ['tip_amount_cents', closeout.tip_summary?.tip_amount_cents ?? 0], ['discount_amount_cents', closeout.discount_summary?.discount_amount_cents ?? 0], ['missing_data_warnings', JSON.stringify(closeout.missing_data_warnings || [])]]; for (const waiter of closeout.waiter_performance_snapshots || [])
    rows.push([`waiter:${waiter.user_id}`, JSON.stringify(waiter)]); const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n'); res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="restaurant-closeout-${shiftId}.csv"` }); return res.status(200).send(csv); }
