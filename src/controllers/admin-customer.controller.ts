import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as CustomerService from '../services/customer.service';
import { companyHasCapability } from '../services/company-entitlements.service';

function requiresAdvancedCustomerFilters(segment?: string): boolean {
    return Boolean(segment && segment !== 'ALL');
}

export async function listCustomers(req: AuthenticatedRequest, res: Response) {
    try {
        const companyId = (req as any).companyID;
        const search = req.query.search as string | undefined;
        const segment = CustomerService.normalizeCustomerSegment(req.query.segment as string | undefined);

        if (requiresAdvancedCustomerFilters(segment)) {
            const hasCrmPro = await companyHasCapability(companyId, 'CRM_PRO');
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

        const customers = await CustomerService.listCustomers(
            companyId,
            search || undefined,
            segment,
        );

        return res.json({ data: customers });
    } catch (error: any) {
        console.error('Error listing customers:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

export async function listInterestCaptureLeads(req: AuthenticatedRequest, res: Response) {
    try {
        const companyId = (req as any).companyID;
        const leads = await CustomerService.listInterestCaptureLeads(companyId);

        return res.json({ data: leads });
    } catch (error: any) {
        console.error('Error listing interest capture leads:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

export async function getCustomerHistory(req: AuthenticatedRequest, res: Response) {
    try {
        const companyId = (req as any).companyID;
        const customerKey = (req.query.customer_key as string | undefined) || '';
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);

        const result = await CustomerService.getCustomersHistory(companyId, {
            customerKey,
            page,
            limit,
        });

        return res.status(result.code).json(result);
    } catch (error: any) {
        console.error('Error getting customer history:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

export async function getCustomerGroupPayments(req: AuthenticatedRequest, res: Response) {
    try {
        const companyId = (req as any).companyID;
        const customerKey = (req.query.customer_key as string | undefined) || '';
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 25);

        const result = await CustomerService.getCustomerGroupPayments(companyId, {
            customerKey,
            page,
            limit,
        });

        return res.status(result.code).json(result);
    } catch (error: any) {
        console.error('Error getting customer group payments:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

export async function getCustomerByKey(req: AuthenticatedRequest, res: Response) {
    try {
        const companyId = (req as any).companyID;
        const customerKey = decodeURIComponent((req.params.customerKey as string | undefined) || '');

        const result = await CustomerService.getCustomerByKey(companyId, customerKey);
        return res.status(result.code).json(result);
    } catch (error: any) {
        console.error('Error getting customer profile:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

export async function updateCustomerByKey(req: AuthenticatedRequest, res: Response) {
    try {
        const companyId = (req as any).companyID;
        const customerKey = decodeURIComponent((req.params.customerKey as string | undefined) || '');
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
    } catch (error: any) {
        console.error('Error updating customer profile:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

export async function exportCustomers(req: AuthenticatedRequest, res: Response) {
    try {
        const companyId = (req as any).companyID;
        const search = req.query.search as string | undefined;
        const segment = CustomerService.normalizeCustomerSegment(req.query.segment as string | undefined);
        const requestedByUserId = req.authUser?.id;

        const result = await CustomerService.exportCustomers(companyId, {
            search: search || undefined,
            segment,
            requestedByUserId,
        });

        if (result.error || !result.data) {
            return res.status(result.code).json(result);
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${result.data.fileName}"`);
        res.setHeader('X-Customer-Export-Webhook', result.data.webhookTriggered ? 'triggered' : 'skipped');
        return res.status(200).send(result.data.csv);
    } catch (error: any) {
        console.error('Error exporting customers:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

export async function importCustomers(req: AuthenticatedRequest, res: Response) {
    try {
        const companyId = (req as any).companyID;
        const file = (req as any).file as Express.Multer.File | undefined;

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
    } catch (error: any) {
        console.error('Error importing customers:', error);
        return res.status(500).json({ code: 500, error: true, message: error.message || 'Internal server error' });
    }
}

export async function downloadImportTemplate(req: AuthenticatedRequest, res: Response) {
    try {
        const buffer = CustomerService.buildCustomerImportTemplate();
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="customers-import-template.xlsx"',
        );
        return res.send(buffer);
    } catch (error: any) {
        console.error('Error downloading customer import template:', error);
        return res.status(500).json({ code: 500, error: true, message: error.message || 'Internal server error' });
    }
}

export async function sendMassMessage(req: AuthenticatedRequest, res: Response) {
    try {
        const companyId = (req as any).companyID;
        const { message, search, segment, idempotency_key } = req.body as {
            message?: string;
            search?: string;
            segment?: string;
            idempotency_key?: string;
        };

        if (!companyId) {
            return res.status(400).json({
                code: 400,
                error: true,
                message: 'Company context not found',
            });
        }

        const result = await CustomerService.sendMassCustomerMessage(companyId, {
            message: message || '',
            search: search || '',
            segment: CustomerService.normalizeCustomerSegment(segment),
            idempotencyKey: idempotency_key,
        });

        return res.status(result.code).json(result);
    } catch (error: any) {
        console.error('Error sending mass customer message:', error);
        return res.status(500).json({ code: 500, error: true, message: error.message || 'Internal server error' });
    }
}
