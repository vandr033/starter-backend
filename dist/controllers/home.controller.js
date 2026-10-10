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
exports.search = exports.getFaq = exports.getTopShops = exports.getCategories = exports.getCities = exports.getServiceTypes = void 0;
const logger_1 = require("../config/logger");
const mensajeApiUtils_1 = require("../utils/mensajeApiUtils");
const homeService = __importStar(require("../services/home.service"));
let mensaje;
const getServiceTypes = async (req, res) => {
    try {
        const query = req.query.query ?? '';
        mensaje = await homeService.getServiceTypes(query);
        res.status(200).json(mensaje);
    }
    catch (error) {
        logger_1.logger.error("Error al obtener los tipos de servicios");
        logger_1.logger.error(error);
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('home', 'get service types', error);
        res.status(500).json(mensaje);
    }
};
exports.getServiceTypes = getServiceTypes;
const getCities = async (req, res) => {
    try {
        const query = req.query.query ?? '';
        mensaje = await homeService.getCities(query);
        res.status(200).json(mensaje);
    }
    catch (error) {
        logger_1.logger.error("Error al obtener las ciudades");
        logger_1.logger.error(error);
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('home', 'get cities', error);
        res.status(500).json(mensaje);
    }
};
exports.getCities = getCities;
const getCategories = async (req, res) => {
    try {
        mensaje = await homeService.getTopFourCompanyTypes();
        res.status(200).json(mensaje);
    }
    catch (error) {
        logger_1.logger.error("Error al obtener las categorías");
        logger_1.logger.error(error);
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('home', 'get categories', error);
        res.status(500).json(mensaje);
    }
};
exports.getCategories = getCategories;
const getTopShops = async (req, res) => {
    try {
        mensaje = await homeService.getTopRatedShops();
        res.status(200).json(mensaje);
    }
    catch (error) {
        logger_1.logger.error("Error al obtener las tiendas top");
        logger_1.logger.error(error);
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('home', 'get top shops', error);
        res.status(500).json(mensaje);
    }
};
exports.getTopShops = getTopShops;
const getFaq = async (req, res) => {
    try {
        mensaje = await homeService.getFaq();
        res.status(200).json(mensaje);
    }
    catch (error) {
        logger_1.logger.error("Error al obtener las preguntas frecuentes");
        logger_1.logger.error(error);
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('home', 'get faq', error);
        res.status(500).json(mensaje);
    }
};
exports.getFaq = getFaq;
const search = async (req, res) => {
    try {
        const { service, location, date, time, name } = req.query;
        const serviceTypeID = parseInt(service);
        mensaje = await homeService.search(serviceTypeID, location, date, time, name);
        res.status(200).json(mensaje);
    }
    catch (error) {
        logger_1.logger.error("Error al buscar");
        logger_1.logger.error(error);
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('home', 'search', error);
        res.status(500).json(mensaje);
    }
};
exports.search = search;
