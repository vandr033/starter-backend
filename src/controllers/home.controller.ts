import { MensajeApi } from "../types/MensajeApi";
import { Request, Response } from "express";
import { logger } from "../config/logger";
import { buildServiceErrorResponse } from "../utils/mensajeApiUtils";
import * as homeService from "../services/home.service";


let mensaje:MensajeApi;

export const getServiceTypes = async (req: Request, res: Response) => {
    try {
        const query = req.query.query as string ?? '';
        mensaje = await homeService.getServiceTypes(query);
        res.status(200).json(mensaje);
    } catch (error) {
        logger.error("Error al obtener los tipos de servicios");
        logger.error(error);
        mensaje = buildServiceErrorResponse('home', 'get service types', error);
        res.status(500).json(mensaje);
    }   
}


export const getCities = async (req: Request, res: Response) => {
    try {
        const query = req.query.query as string ?? '';
        mensaje = await homeService.getCities(query);
        res.status(200).json(mensaje);
    } catch (error) {
        logger.error("Error al obtener las ciudades");
        logger.error(error);
        mensaje = buildServiceErrorResponse('home', 'get cities', error);
        res.status(500).json(mensaje);
    }   
}

export const getCategories = async (req: Request, res: Response) => {
    try {
        mensaje = await homeService.getTopFourCompanyTypes();
        res.status(200).json(mensaje);
    } catch (error) {
        logger.error("Error al obtener las categorías");
        logger.error(error);
        mensaje = buildServiceErrorResponse('home', 'get categories', error);
        res.status(500).json(mensaje);
    }   
}

export const getTopShops = async (req: Request, res: Response) => {
    try {
        mensaje = await homeService.getTopRatedShops();
        res.status(200).json(mensaje);
    } catch (error) {
        logger.error("Error al obtener las tiendas top");
        logger.error(error);
        mensaje = buildServiceErrorResponse('home', 'get top shops', error);
        res.status(500).json(mensaje);
    }   
}

export const getFaq = async (req: Request, res: Response) => {
    try {
        mensaje = await homeService.getFaq();
        res.status(200).json(mensaje);
    } catch (error) {
        logger.error("Error al obtener las preguntas frecuentes");
        logger.error(error);
        mensaje = buildServiceErrorResponse('home', 'get faq', error);
        res.status(500).json(mensaje);
    }   
}

export const search = async (req: Request, res: Response) => {
    try {
        const {service, location, date, time, name } = req.query;
        const serviceTypeID = parseInt(service as string);
        mensaje = await homeService.search(serviceTypeID, location as string, date as string, time as string, name as string);
        res.status(200).json(mensaje);
    } catch (error) {
        logger.error("Error al buscar");
        logger.error(error);
        mensaje = buildServiceErrorResponse('home', 'search', error);
        res.status(500).json(mensaje);
    }   
}