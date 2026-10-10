"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listBusinessSignupOptions = listBusinessSignupOptions;
exports.createBusinessSignup = createBusinessSignup;
const business_signup_service_1 = require("../services/business-signup.service");
const business_signup_schema_1 = require("../schemas/business-signup.schema");
const active_shop_cookie_1 = require("../utils/active-shop-cookie");
function getErrorMessage(error) {
    if (error && typeof error === 'object' && 'message' in error) {
        const message = error.message;
        if (typeof message === 'string' && message.trim().length > 0) {
            return message;
        }
    }
    return 'No pudimos crear tu cuenta en este momento.';
}
function getErrorCode(error) {
    if (error && typeof error === 'object' && 'code' in error) {
        const code = Number(error.code);
        if (Number.isInteger(code) && code >= 400 && code < 600) {
            return code;
        }
    }
    return 500;
}
async function listBusinessSignupOptions(_req, res) {
    try {
        const result = await (0, business_signup_service_1.getBusinessSignupOptions)();
        return res.status(200).json(result);
    }
    catch (error) {
        console.error('Error listing business signup options:', error);
        return res.status(500).json({
            success: false,
            message: 'No pudimos cargar las opciones de registro.',
        });
    }
}
async function createBusinessSignup(req, res) {
    const parsed = business_signup_schema_1.businessSignupSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: 'Revisá los datos del formulario.',
            errors: parsed.error.flatten(),
        });
    }
    try {
        const result = await (0, business_signup_service_1.signUpBusiness)(parsed.data, req.headers);
        if (result.cookies && result.cookies.length > 0) {
            res.setHeader('Set-Cookie', result.cookies);
        }
        if (typeof result.activeCompanyId === 'number' && result.activeCompanyId > 0) {
            (0, active_shop_cookie_1.setActiveCompanyCookie)(res, result.activeCompanyId);
        }
        return res.status(201).json({
            success: true,
            companyId: result.companyId,
            slug: result.slug,
            trialEndsAt: result.trialEndsAt,
            redirectTo: result.redirectTo,
        });
    }
    catch (error) {
        console.error('Error creating business signup:', error);
        return res.status(getErrorCode(error)).json({
            success: false,
            message: getErrorMessage(error),
        });
    }
}
