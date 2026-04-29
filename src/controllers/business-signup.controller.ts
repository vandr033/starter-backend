import type { Request, Response } from 'express';
import {
    getBusinessSignupOptions,
    signUpBusiness,
} from '../services/business-signup.service';
import { businessSignupSchema } from '../schemas/business-signup.schema';
import { setActiveCompanyCookie } from '../utils/active-shop-cookie';

function getErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim().length > 0) {
            return message;
        }
    }

    return 'No pudimos crear tu cuenta en este momento.';
}

function getErrorCode(error: unknown): number {
    if (error && typeof error === 'object' && 'code' in error) {
        const code = Number((error as { code?: unknown }).code);
        if (Number.isInteger(code) && code >= 400 && code < 600) {
            return code;
        }
    }

    return 500;
}

export async function listBusinessSignupOptions(_req: Request, res: Response) {
    try {
        const result = await getBusinessSignupOptions();
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error listing business signup options:', error);
        return res.status(500).json({
            success: false,
            message: 'No pudimos cargar las opciones de registro.',
        });
    }
}

export async function createBusinessSignup(req: Request, res: Response) {
    const parsed = businessSignupSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: 'Revisá los datos del formulario.',
            errors: parsed.error.flatten(),
        });
    }

    try {
        const result = await signUpBusiness(parsed.data, req.headers as Record<string, unknown>);

        if (result.cookies && result.cookies.length > 0) {
            res.setHeader('Set-Cookie', result.cookies);
        }

        if (typeof result.activeCompanyId === 'number' && result.activeCompanyId > 0) {
            setActiveCompanyCookie(res, result.activeCompanyId);
        }

        return res.status(201).json({
            success: true,
            companyId: result.companyId,
            slug: result.slug,
            trialEndsAt: result.trialEndsAt,
            redirectTo: result.redirectTo,
        });
    } catch (error) {
        console.error('Error creating business signup:', error);
        return res.status(getErrorCode(error)).json({
            success: false,
            message: getErrorMessage(error),
        });
    }
}
