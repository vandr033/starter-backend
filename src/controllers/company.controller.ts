import { Request, Response } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import * as CompanyService from '../services/company.service';
import { logger } from '../config/logger';
import { buildServiceErrorResponse } from '../utils/mensajeApiUtils';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import { prisma } from '../prisma/client';
import sanitizeHtml from 'sanitize-html';
let mensaje: MensajeApi;

export const getAllCompanies = async (req: Request, res: Response) => {
    try {
        mensaje = await CompanyService.getAllCompanies();
        res.status(200).json(mensaje);

    } catch (error) {
        logger.error("Error al obtener la lista de empresas");
        logger.error(error);
        mensaje = buildServiceErrorResponse('company', 'get all', error);
        res.status(500).json(mensaje);
    }
}

export const getFeaturedCompanies = async (req: Request, res: Response) => {
    try {
        mensaje = await CompanyService.getFeaturedCompanies();
        res.status(200).json(mensaje);
    } catch (error) {
        logger.error("Error getting featured companies");
        logger.error(error);
        mensaje = buildServiceErrorResponse('company', 'get featured', error);
        res.status(500).json(mensaje);
    }
}

export const getCompanyById = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        mensaje = await CompanyService.getCompanyById(id);
        res.status(200).json(mensaje);
    } catch (error) {
        logger.error("Error al obtener la empresa");
        logger.error(error);
        mensaje = buildServiceErrorResponse('company', 'get by id', error);
        res.status(500).json(mensaje);
    }
}

export const getCompanyBySlug = async (req: Request, res: Response) => {
    try {
        mensaje = await CompanyService.getCompanyBySlug(req.params.slug as string);
        res.status(200).json(mensaje);
    } catch (error) {
        logger.error("Error al obtener la empresa");
        logger.error(error);
        mensaje = buildServiceErrorResponse('company', 'get by slug', error);
        res.status(500).json(mensaje);
    }
}

export const getCompanyByPhone = async (req: Request, res: Response) => {
    try {
        mensaje = await CompanyService.getCompanyByPhone(req.params.phone as string);
        res.status(200).json(mensaje);
    } catch (error) {
        logger.error("Error al obtener la empresa");
        logger.error(error);
        mensaje = buildServiceErrorResponse('company', 'get by phone', error);
        res.status(500).json(mensaje);
    }
}

export const createCompany = async (req: Request, res: Response) => {
    try {
        mensaje = await CompanyService.createCompany(req.body);
        res.status(201).json(mensaje);
    } catch (error) {
        logger.error("Error al crear la empresa");
        logger.error(error);
        mensaje = buildServiceErrorResponse('company', 'create', error);
        res.status(500).json(mensaje);
    }
}

export const updateCompany = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        mensaje = await CompanyService.updateCompany(id, req.body);
        res.status(200).json(mensaje);
    } catch (error) {
        logger.error("Error al actualizar la empresa");
        logger.error(error);
        mensaje = buildServiceErrorResponse('company', 'update', error);
        res.status(500).json(mensaje);
    }
}

export const deleteCompany = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (!id) {
            mensaje = buildServiceErrorResponse('company', 'delete', 'No se proporciono un id');
            res.status(400).json(mensaje);
            return;
        }
        mensaje = await CompanyService.deleteCompany(id);
        res.status(200).json(mensaje);
    } catch (error) {
        logger.error("Error al eliminar la empresa");
        logger.error(error);
        mensaje = buildServiceErrorResponse('company', 'delete', error);
        res.status(500).json(mensaje);
    }
}

export const getCompanyPublicPage = async (req: Request, res: Response) => {
    try {
        const slug = req.params.slug as string;
        mensaje = await CompanyService.getCompanyPublicPage(slug);
        res.status(mensaje.code).json(mensaje);
    } catch (error) {
        logger.error("Error al obtener la página pública de la empresa");
        logger.error(error);
        mensaje = buildServiceErrorResponse('company', 'get public page', error);
        res.status(500).json(mensaje);
    }
}

export const getCompanyStatus = async (req: Request, res: Response) => {
    try {
        const slug = req.params.slug as string;
        mensaje = await CompanyService.getCompanyStatus(slug);
        res.status(mensaje.code).json(mensaje);
    } catch (error) {
        logger.error("Error al obtener el estado de la empresa");
        logger.error(error);
        mensaje = buildServiceErrorResponse('company', 'get status', error);
        res.status(500).json(mensaje);
    }
}

export const updateCompanyContent = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { id } = req.params;
        const companyId = parseInt(Array.isArray(id) ? id[0] : id);
        const {
            about_us_text,
            our_story_text,
            about_us_hero_text,
            logo_url,
            home_hero_image_url,
            about_hero_image_url,
            about_image_1_url,
            about_image_2_url,
            about_image_3_url,
        } = req.body;

        if (isNaN(companyId)) {
            return res.status(400).json({
                code: 400,
                error: true,
                message: 'Invalid company ID',
            });
        }

        // Check if user has admin access to this company
        const userCompanyId = (req as any).companyID;
        if (userCompanyId && userCompanyId !== companyId) {
            return res.status(403).json({
                code: 403,
                error: true,
                message: 'Access denied',
            });
        }

        // Check if company exists
        const company = await prisma.company.findUnique({
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
        const updateData: any = {};

        if (about_us_text !== undefined) {
            // Sanitize HTML - allow basic formatting tags
            updateData.about_us_text = sanitizeHtml(about_us_text, {
                allowedTags: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
                allowedAttributes: {},
            });
        }

        if (our_story_text !== undefined) {
            updateData.our_story_text = sanitizeHtml(our_story_text, {
                allowedTags: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
                allowedAttributes: {},
            });
        }

        if (about_us_hero_text !== undefined) {
            updateData.about_us_hero_text = sanitizeHtml(about_us_hero_text, {
                allowedTags: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
                allowedAttributes: {},
            });
        }

        // Handle image URL fields
        if (logo_url !== undefined) updateData.logo_url = logo_url;
        if (home_hero_image_url !== undefined) updateData.home_hero_image_url = home_hero_image_url;
        if (about_hero_image_url !== undefined) updateData.about_hero_image_url = about_hero_image_url;
        if (about_image_1_url !== undefined) updateData.about_image_1_url = about_image_1_url;
        if (about_image_2_url !== undefined) updateData.about_image_2_url = about_image_2_url;
        if (about_image_3_url !== undefined) updateData.about_image_3_url = about_image_3_url;

        // Update company
        const updatedCompany = await prisma.company.update({
            where: { id: companyId },
            data: updateData,
        });

        res.json({
            code: 200,
            error: false,
            message: 'Content updated successfully',
            data: updatedCompany,
        });
    } catch (error) {
        logger.error('Error updating company content:', error as any);
        res.status(500).json({
            code: 500,
            error: true,
            message: 'Failed to update content',
        });
    }
}

export const getCompanyContent = async (req: AuthenticatedRequest, res: Response) => {
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
        const userCompanyId = (req as any).companyID;
        if (userCompanyId && userCompanyId !== companyId) {
            return res.status(403).json({
                code: 403,
                error: true,
                message: 'Access denied',
            });
        }

        // Get company data
        const company = await prisma.company.findUnique({
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
        const staff = await prisma.staffProfile.findMany({
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
    } catch (error) {
        logger.error('Error fetching company content:', error as any);
        res.status(500).json({
            code: 500,
            error: true,
            message: 'Failed to fetch content',
        });
    }
};
