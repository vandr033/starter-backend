"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBatch = getBatch;
exports.retryBatch = retryBatch;
exports.cancelBatch = cancelBatch;
exports.retryJob = retryJob;
exports.cancelJob = cancelJob;
const outbound_message_service_1 = require("../services/outbound-message.service");
function companyIdOf(req, res) {
    const companyId = Number(req.companyID);
    if (!Number.isInteger(companyId) || companyId <= 0) {
        res.status(400).json({ code: 400, error: true, message: 'Company context not found' });
        return null;
    }
    return companyId;
}
function batchIdOf(req, res) {
    const batchId = String(req.params.batchId || '').trim();
    if (!batchId || batchId.length > 30) {
        res.status(400).json({ code: 400, error: true, message: 'Invalid batchId' });
        return null;
    }
    return batchId;
}
function jobIdOf(req, res) {
    const jobId = Number.parseInt(String(req.params.jobId || ''), 10);
    if (!Number.isInteger(jobId) || jobId <= 0) {
        res.status(400).json({ code: 400, error: true, message: 'Invalid jobId' });
        return null;
    }
    return jobId;
}
async function getBatch(req, res) {
    const companyId = companyIdOf(req, res);
    if (!companyId)
        return;
    const batchId = batchIdOf(req, res);
    if (!batchId)
        return;
    const progress = await (0, outbound_message_service_1.getWhatsappBatchProgress)(batchId, companyId);
    if (!progress)
        return res.status(404).json({ code: 404, error: true, message: 'Outbound batch not found' });
    return res.json({ code: 200, error: false, data: progress });
}
async function retryBatch(req, res) {
    const companyId = companyIdOf(req, res);
    if (!companyId)
        return;
    const batchId = batchIdOf(req, res);
    if (!batchId)
        return;
    const progress = await (0, outbound_message_service_1.getWhatsappBatchProgress)(batchId, companyId);
    if (!progress)
        return res.status(404).json({ code: 404, error: true, message: 'Outbound batch not found' });
    const retried = await (0, outbound_message_service_1.retryWhatsappBatch)(batchId, companyId);
    return res.json({ code: 200, error: false, data: { batch_id: batchId, retried } });
}
async function cancelBatch(req, res) {
    const companyId = companyIdOf(req, res);
    if (!companyId)
        return;
    const batchId = batchIdOf(req, res);
    if (!batchId)
        return;
    const progress = await (0, outbound_message_service_1.getWhatsappBatchProgress)(batchId, companyId);
    if (!progress)
        return res.status(404).json({ code: 404, error: true, message: 'Outbound batch not found' });
    const cancelled = await (0, outbound_message_service_1.cancelWhatsappBatch)(batchId, companyId);
    return res.json({ code: 200, error: false, data: { batch_id: batchId, cancelled } });
}
async function retryJob(req, res) {
    const companyId = companyIdOf(req, res);
    if (!companyId)
        return;
    const jobId = jobIdOf(req, res);
    if (!jobId)
        return;
    const existing = await (0, outbound_message_service_1.getWhatsappJob)(jobId, companyId);
    if (!existing)
        return res.status(404).json({ code: 404, error: true, message: 'Outbound job not found' });
    const job = await (0, outbound_message_service_1.retryWhatsappJob)(jobId, companyId);
    if (!job)
        return res.status(409).json({ code: 409, error: true, message: 'Job is not eligible for retry' });
    return res.json({ code: 200, error: false, data: { job_id: job.id, status: job.status } });
}
async function cancelJob(req, res) {
    const companyId = companyIdOf(req, res);
    if (!companyId)
        return;
    const jobId = jobIdOf(req, res);
    if (!jobId)
        return;
    const existing = await (0, outbound_message_service_1.getWhatsappJob)(jobId, companyId);
    if (!existing)
        return res.status(404).json({ code: 404, error: true, message: 'Outbound job not found' });
    const cancelled = await (0, outbound_message_service_1.cancelWhatsappJob)(jobId, companyId);
    if (!cancelled)
        return res.status(409).json({ code: 409, error: true, message: 'Job is not pending' });
    return res.json({ code: 200, error: false, data: { job_id: jobId, cancelled: true } });
}
