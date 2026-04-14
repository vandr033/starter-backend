import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './requireAuth';
import {
    buildCompanyModuleDisabledMessage,
    getCompanyModules,
    isCompanyModuleEnabled,
    type CompanyModuleKey,
} from '../services/company-modules.service';

export function requireCompanyModule(module: CompanyModuleKey) {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            const companyId = (req as any).companyID as number | undefined;
            if (!companyId) {
                return res.status(400).json({
                    code: 400,
                    error: true,
                    message: 'Company context not found',
                });
            }

            const modules = await getCompanyModules(companyId);
            if (!isCompanyModuleEnabled(modules, module)) {
                return res.status(403).json({
                    code: 403,
                    error: true,
                    message: buildCompanyModuleDisabledMessage(module),
                    data: { modules },
                });
            }

            (req as any).companyModules = modules;
            return next();
        } catch (error) {
            console.error('Error validating company module access:', error);
            return res.status(500).json({
                code: 500,
                error: true,
                message: 'Error validating company module access',
            });
        }
    };
}
