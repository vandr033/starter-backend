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
exports.listCustomers = listCustomers;
exports.listInterestCaptureLeads = listInterestCaptureLeads;
exports.getCustomerHistory = getCustomerHistory;
exports.getCustomerGroupPayments = getCustomerGroupPayments;
exports.getCustomerByKey = getCustomerByKey;
exports.updateCustomerByKey = updateCustomerByKey;
exports.exportCustomers = exportCustomers;
exports.importCustomers = importCustomers;
exports.downloadImportTemplate = downloadImportTemplate;
exports.sendMassMessage = sendMassMessage;
const CustomerService = __importStar(require("../services/customer.service"));
const company_entitlements_service_1 = require("../services/company-entitlements.service");
function parseCategoryId(value) {
    if (value === undefined || value === null || value === '')
        return undefined;
    if (typeof value !== 'string' && typeof value !== 'number')
        return null;
    const categoryId = Number(value);
    return Number.isSafeInteger(categoryId) && categoryId > 0 ? categoryId : null;
}
function requiresAdvancedCustomerFilters(segment, categoryId) {
    return Boolean((segment && segment !== 'ALL') || categoryId);
}
async function listCustomers(req, res) {
    try {
        const companyId = req.companyID;
        const search = req.query.search;
        const segment = CustomerService.normalizeCustomerSegment(req.query.segment);
        const categoryId = parseCategoryId(req.query.category_id);
        if (categoryId === null) {
            return res.status(400).json({ code: 400, error: true, message: 'Invalid category ID' });
        }
        if (requiresAdvancedCustomerFilters(segment, categoryId)) {
            const hasCrmPro = await (0, company_entitlements_service_1.companyHasCapability)(companyId, 'CRM_PRO');
            if (!hasCrmPro) {
                return res.status(403).json({
                    code: 403,
                    error: true,
                    reason: 'PRODUCT_NOT_ACTIVE',
                    message: 'CRM Pro is required for advanced customer filters',
                    data: {
                        capability: 'CRM_PRO',
                    },
                });
            }
        }
        if (categoryId && !(await CustomerService.companyHasCustomerCategory(companyId, categoryId))) {
            return res.status(400).json({ code: 400, error: true, message: 'Category not found for this company' });
        }
        const customers = await CustomerService.listCustomers(companyId, search || undefined, segment, categoryId);
        return res.json({ data: customers });
    }
    catch (error) {
        console.error('Error listing customers:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
async function listInterestCaptureLeads(req, res) {
    try {
        const companyId = req.companyID;
        const leads = await CustomerService.listInterestCaptureLeads(companyId);
        return res.json({ data: leads });
    }
    catch (error) {
        console.error('Error listing interest capture leads:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
async function getCustomerHistory(req, res) {
    try {
        const companyId = req.companyID;
        const customerKey = req.query.customer_key || '';
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        const result = await CustomerService.getCustomersHistory(companyId, {
            customerKey,
            page,
            limit,
        });
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error getting customer history:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
async function getCustomerGroupPayments(req, res) {
    try {
        const companyId = req.companyID;
        const customerKey = req.query.customer_key || '';
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 25);
        const result = await CustomerService.getCustomerGroupPayments(companyId, {
            customerKey,
            page,
            limit,
        });
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error getting customer group payments:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
async function getCustomerByKey(req, res) {
    try {
        const companyId = req.companyID;
        const customerKey = decodeURIComponent(req.params.customerKey || '');
        const result = await CustomerService.getCustomerByKey(companyId, customerKey);
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error getting customer profile:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
async function updateCustomerByKey(req, res) {
    try {
        const companyId = req.companyID;
        const customerKey = decodeURIComponent(req.params.customerKey || '');
        const payload = req.body || {};
        const result = await CustomerService.updateCustomerByKey(companyId, customerKey, {
            name: typeof payload.name === 'string' ? payload.name : undefined,
            email: typeof payload.email === 'string' ? payload.email : null,
            phone: typeof payload.phone === 'string' ? payload.phone : null,
            phone_prefix: typeof payload.phone_prefix === 'string' ? payload.phone_prefix : null,
            country_code: typeof payload.country_code === 'string' ? payload.country_code : null,
            notes: typeof payload.notes === 'string' ? payload.notes : null,
        });
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error updating customer profile:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
async function exportCustomers(req, res) {
    try {
        const companyId = req.companyID;
        const search = req.query.search;
        const segment = CustomerService.normalizeCustomerSegment(req.query.segment);
        const categoryId = parseCategoryId(req.query.category_id);
        const requestedByUserId = req.authUser?.id;
        if (categoryId === null) {
            return res.status(400).json({ code: 400, error: true, message: 'Invalid category ID' });
        }
        if (categoryId && !(await CustomerService.companyHasCustomerCategory(companyId, categoryId))) {
            return res.status(400).json({ code: 400, error: true, message: 'Category not found for this company' });
        }
        const result = await CustomerService.exportCustomers(companyId, {
            search: search || undefined,
            segment,
            categoryId,
            requestedByUserId,
        });
        if (result.error || !result.data) {
            return res.status(result.code).json(result);
        }
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${result.data.fileName}"`);
        res.setHeader('X-Customer-Export-Webhook', result.data.webhookTriggered ? 'triggered' : 'skipped');
        return res.status(200).send(result.data.csv);
    }
    catch (error) {
        console.error('Error exporting customers:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
async function importCustomers(req, res) {
    try {
        const companyId = req.companyID;
        const file = req.file;
        if (!file || !file.buffer) {
            return res.status(400).json({
                code: 400,
                error: true,
                message: 'Missing file. Upload an Excel or CSV file in "file".',
            });
        }
        const result = await CustomerService.importCustomersFromFile(companyId, file.buffer);
        return res.status(200).json({
            code: 200,
            error: false,
            message: 'Customer import completed',
            data: result,
        });
    }
    catch (error) {
        console.error('Error importing customers:', error);
        return res.status(500).json({ code: 500, error: true, message: error.message || 'Internal server error' });
    }
}
async function downloadImportTemplate(req, res) {
    try {
        const buffer = CustomerService.buildCustomerImportTemplate();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="customers-import-template.xlsx"');
        return res.send(buffer);
    }
    catch (error) {
        console.error('Error downloading customer import template:', error);
        return res.status(500).json({ code: 500, error: true, message: error.message || 'Internal server error' });
    }
}
async function sendMassMessage(req, res) {
    try {
        const companyId = req.companyID;
        const { message, search, segment, idempotency_key, category_id } = req.body;
        const categoryId = parseCategoryId(category_id);
        if (!companyId) {
            return res.status(400).json({
                code: 400,
                error: true,
                message: 'Company context not found',
            });
        }
        if (categoryId === null) {
            return res.status(400).json({ code: 400, error: true, message: 'Invalid category ID' });
        }
        const result = await CustomerService.sendMassCustomerMessage(companyId, {
            message: message || '',
            search: search || '',
            segment: CustomerService.normalizeCustomerSegment(segment),
            categoryId,
            idempotencyKey: idempotency_key,
        });
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error sending mass customer message:', error);
        return res.status(500).json({ code: 500, error: true, message: error.message || 'Internal server error' });
    }
}
