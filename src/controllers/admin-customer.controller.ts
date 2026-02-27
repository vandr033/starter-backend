import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as CustomerService from '../services/customer.service';

export async function listCustomers(req: AuthenticatedRequest, res: Response) {
    try {
        const companyId = (req as any).companyID;
        const search = req.query.search as string | undefined;

        const customers = await CustomerService.listCustomers(companyId, search || undefined);

        return res.json({ data: customers });
    } catch (error: any) {
        console.error('Error listing customers:', error);
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
