import { Request, Response } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import * as CompanyService from '../services/company.service';
import { logger } from '../config/logger';
import { buildServiceErrorResponse } from '../utils/mensajeApiUtils';
let mensaje:MensajeApi;

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
        mensaje = await CompanyService.getCompanyBySlug(req.params.slug);
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
        mensaje = await CompanyService.getCompanyByPhone(req.params.phone);
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
        if(!id){
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
