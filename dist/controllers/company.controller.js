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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCompanyContent = exports.updateCompanyContent = exports.getCompanyStatus = exports.getCompanyInviteService = exports.getCompanyPublicPage = exports.deleteCompany = exports.updateCompany = exports.createCompany = exports.getCompanyByPhone = exports.getCompanyBySlug = exports.getCompanyById = exports.getFeaturedCompanies = exports.getAllCompanies = void 0;
const CompanyService = __importStar(require("../services/company.service"));
const logger_1 = require("../config/logger");
const mensajeApiUtils_1 = require("../utils/mensajeApiUtils");
const client_1 = require("../prisma/client");
const sanitize_html_1 = __importDefault(require("sanitize-html"));
let mensaje;
const SANITIZE_HTML_OPTIONS = {
    allowedTags: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    allowedAttributes: {},
};
function sanitizeOptionalRichText(value) {
    if (value === undefined)
        return undefined;
    if (value === null)
        return null;
    return (0, sanitize_html_1.default)(value, SANITIZE_HTML_OPTIONS);
}
function parsePositiveCompanyId(rawId) {
    const parsed = Number(rawId);
    if (!Number.isInteger(parsed) || parsed < 1)
        return null;
    return parsed;
}
function normalizeCurrencyInput(value) {
    if (typeof value !== 'string')
        return null;
    const normalized = value.trim();
    if (normalized.length === 0 || normalized.length > 3)
        return null;
    return normalized;
}
const getAllCompanies = async (req, res) => {
    try {
        mensaje = await CompanyService.getAllCompanies();
        res.status(200).json(mensaje);
    }
    catch (error) {
        logger_1.logger.error("Error al obtener la lista de empresas");
        logger_1.logger.error(error);
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'get all', error);
        res.status(500).json(mensaje);
    }
};
exports.getAllCompanies = getAllCompanies;
const getFeaturedCompanies = async (req, res) => {
    try {
        mensaje = await CompanyService.getFeaturedCompanies();
        res.status(200).json(mensaje);
    }
    catch (error) {
        logger_1.logger.error("Error getting featured companies");
        logger_1.logger.error(error);
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'get featured', error);
        res.status(500).json(mensaje);
    }
};
exports.getFeaturedCompanies = getFeaturedCompanies;
const getCompanyById = async (req, res) => {
    try {
        const id = Number(req.params.id);
        mensaje = await CompanyService.getCompanyById(id);
        res.status(200).json(mensaje);
    }
    catch (error) {
        logger_1.logger.error("Error al obtener la empresa");
        logger_1.logger.error(error);
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'get by id', error);
        res.status(500).json(mensaje);
    }
};
exports.getCompanyById = getCompanyById;
const getCompanyBySlug = async (req, res) => {
    try {
        mensaje = await CompanyService.getCompanyBySlug(req.params.slug);
        res.status(200).json(mensaje);
    }
    catch (error) {
        logger_1.logger.error("Error al obtener la empresa");
        logger_1.logger.error(error);
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'get by slug', error);
        res.status(500).json(mensaje);
    }
};
exports.getCompanyBySlug = getCompanyBySlug;
const getCompanyByPhone = async (req, res) => {
    try {
        mensaje = await CompanyService.getCompanyByPhone(req.params.phone);
        res.status(200).json(mensaje);
    }
    catch (error) {
        logger_1.logger.error("Error al obtener la empresa");
        logger_1.logger.error(error);
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'get by phone', error);
        res.status(500).json(mensaje);
    }
};
exports.getCompanyByPhone = getCompanyByPhone;
const createCompany = async (req, res) => {
    try {
        if (req.body.currency === undefined || req.body.currency === null || String(req.body.currency).trim() === '') {
            return res.status(400).json({
                code: 400,
                message: 'currency is required',
                error: true,
            });
        }
        const normalizedCurrency = normalizeCurrencyInput(req.body.currency);
        if (!normalizedCurrency) {
            return res.status(400).json({
                code: 400,
                message: 'currency must be a non-empty string up to 3 characters',
                error: true,
            });
        }
        req.body.currency = normalizedCurrency;
        mensaje = await CompanyService.createCompany(req.body);
        res.status(201).json(mensaje);
    }
    catch (error) {
        logger_1.logger.error("Error al crear la empresa");
        logger_1.logger.error(error);
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'create', error);
        res.status(500).json(mensaje);
    }
};
exports.createCompany = createCompany;
const updateCompany = async (req, res) => {
    try {
        const id = parsePositiveCompanyId(req.params.id);
        if (!id) {
            return res.status(400).json({
                code: 400,
                message: 'Invalid company ID',
                error: true,
            });
        }
        const authReq = req;
        const isSuperAdmin = Boolean(authReq.authUser?.is_super_admin);
        const userCompanyId = Number(req.companyID);
        if (!isSuperAdmin && userCompanyId !== id) {
            return res.status(403).json({
                code: 403,
                message: 'Access denied',
                error: true,
            });
        }
        const payload = req.validated ?? req.body;
        if (payload.currency !== undefined) {
            const normalizedCurrency = normalizeCurrencyInput(payload.currency);
            if (!normalizedCurrency) {
                return res.status(400).json({
                    code: 400,
                    message: 'currency must be a non-empty string up to 3 characters',
                    error: true,
                });
            }
            payload.currency = normalizedCurrency;
        }
        mensaje = await CompanyService.updateCompany(id, payload);
        res.status(200).json(mensaje);
    }
    catch (error) {
        logger_1.logger.error("Error al actualizar la empresa");
        logger_1.logger.error(error);
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'update', error);
        res.status(500).json(mensaje);
    }
};
exports.updateCompany = updateCompany;
const deleteCompany = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) {
            mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'delete', 'No se proporciono un id');
            res.status(400).json(mensaje);
            return;
        }
        mensaje = await CompanyService.deleteCompany(id);
        res.status(200).json(mensaje);
    }
    catch (error) {
        logger_1.logger.error("Error al eliminar la empresa");
        logger_1.logger.error(error);
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'delete', error);
        res.status(500).json(mensaje);
    }
};
exports.deleteCompany = deleteCompany;
const getCompanyPublicPage = async (req, res) => {
    try {
        const slug = req.params.slug;
        mensaje = await CompanyService.getCompanyPublicPage(slug);
        res.status(mensaje.code).json(mensaje);
    }
    catch (error) {
        logger_1.logger.error("Error al obtener la página pública de la empresa");
        logger_1.logger.error(error);
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'get public page', error);
        res.status(500).json(mensaje);
    }
};
exports.getCompanyPublicPage = getCompanyPublicPage;
const getCompanyInviteService = async (req, res) => {
    try {
        const slug = req.params.slug;
        const token = req.params.token;
        mensaje = await CompanyService.getCompanyInviteService(slug, token);
        res.status(mensaje.code).json(mensaje);
    }
    catch (error) {
        logger_1.logger.error("Error al obtener el servicio con invitación");
        logger_1.logger.error(error);
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'get invite service', error);
        res.status(500).json(mensaje);
    }
};
exports.getCompanyInviteService = getCompanyInviteService;
const getCompanyStatus = async (req, res) => {
    try {
        const slug = req.params.slug;
        mensaje = await CompanyService.getCompanyStatus(slug);
        res.status(mensaje.code).json(mensaje);
    }
    catch (error) {
        logger_1.logger.error("Error al obtener el estado de la empresa");
        logger_1.logger.error(error);
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'get status', error);
        res.status(500).json(mensaje);
    }
};
exports.getCompanyStatus = getCompanyStatus;
const updateCompanyContent = async (req, res) => {
    try {
        const companyId = parsePositiveCompanyId(req.params.id);
        const payload = req.validated ?? req.body;
        const { about_us_text, our_story_text, about_us_hero_text, logo_url, home_hero_image_url, about_hero_image_url, about_image_1_url, about_image_2_url, about_image_3_url, } = payload;
        if (!companyId) {
            return res.status(400).json({
                code: 400,
                error: true,
                message: 'Invalid company ID',
            });
        }
        // Check if user has admin access to this company
        const isSuperAdmin = Boolean(req.authUser?.is_super_admin);
        const userCompanyId = Number(req.companyID);
        if (!isSuperAdmin && userCompanyId !== companyId) {
            return res.status(403).json({
                code: 403,
                error: true,
                message: 'Access denied',
            });
        }
        // Check if company exists
        const company = await client_1.prisma.company.findUnique({
            where: { id: companyId },
        });
        if (!company) {
            return res.status(404).json({
                code: 404,
                error: true,
                message: 'Company not found',
            });
        }
        // Prepare update data with sanitized HTML
        const updateData = {};
        if (about_us_text !== undefined) {
            updateData.about_us_text = sanitizeOptionalRichText(about_us_text);
        }
        if (our_story_text !== undefined) {
            updateData.our_story_text = sanitizeOptionalRichText(our_story_text);
        }
        if (about_us_hero_text !== undefined) {
            updateData.about_us_hero_text = sanitizeOptionalRichText(about_us_hero_text);
        }
        // Handle image URL fields
        if (logo_url !== undefined)
            updateData.logo_url = logo_url;
        if (home_hero_image_url !== undefined)
            updateData.home_hero_image_url = home_hero_image_url;
        if (about_hero_image_url !== undefined)
            updateData.about_hero_image_url = about_hero_image_url;
        if (about_image_1_url !== undefined)
            updateData.about_image_1_url = about_image_1_url;
        if (about_image_2_url !== undefined)
            updateData.about_image_2_url = about_image_2_url;
        if (about_image_3_url !== undefined)
            updateData.about_image_3_url = about_image_3_url;
        // Update company
        const updatedCompany = await client_1.prisma.company.update({
            where: { id: companyId },
            data: updateData,
        });
        res.json({
            code: 200,
            error: false,
            message: 'Content updated successfully',
            data: updatedCompany,
        });
    }
    catch (error) {
        logger_1.logger.error('Error updating company content:', error);
        res.status(500).json({
            code: 500,
            error: true,
            message: 'Failed to update content',
        });
    }
};
exports.updateCompanyContent = updateCompanyContent;
const getCompanyContent = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = parseInt(Array.isArray(id) ? id[0] : id);
        if (isNaN(companyId)) {
            return res.status(400).json({
                code: 400,
                error: true,
                message: 'Invalid company ID',
            });
        }
        // Check if user has admin access to this company
        const userCompanyId = req.companyID;
        if (userCompanyId && userCompanyId !== companyId) {
            return res.status(403).json({
                code: 403,
                error: true,
                message: 'Access denied',
            });
        }
        // Get company data
        const company = await client_1.prisma.company.findUnique({
            where: { id: companyId },
            select: {
                about_us_text: true,
                our_story_text: true,
                about_us_hero_text: true,
                logo_url: true,
                home_hero_image_url: true,
                about_hero_image_url: true,
                about_image_1_url: true,
                about_image_2_url: true,
                about_image_3_url: true,
            },
        });
        if (!company) {
            return res.status(404).json({
                code: 404,
                error: true,
                message: 'Company not found',
            });
        }
        // Get staff profiles
        const staff = await client_1.prisma.staffProfile.findMany({
            where: {
                company_id: companyId,
                deleted_at: null,
            },
            select: {
                id: true,
                display_name: true,
                image_url: true,
            },
            orderBy: {
                display_name: 'asc',
            },
        });
        // Organize response
        const response = {
            texts: {
                about_us_text: company.about_us_text || '',
                our_story_text: company.our_story_text || '',
                about_us_hero_text: company.about_us_hero_text || '',
            },
            images: {
                logo_url: company.logo_url,
                home_hero_image_url: company.home_hero_image_url,
                about_hero_image_url: company.about_hero_image_url,
                about_image_1_url: company.about_image_1_url,
                about_image_2_url: company.about_image_2_url,
                about_image_3_url: company.about_image_3_url,
            },
            staff: staff,
        };
        res.json({
            code: 200,
            error: false,
            data: response,
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching company content:', error);
        res.status(500).json({
            code: 500,
            error: true,
            message: 'Failed to fetch content',
        });
    }
};
exports.getCompanyContent = getCompanyContent;
