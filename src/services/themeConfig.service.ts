import { MensajeApi } from "../types/MensajeApi";
import * as ThemeConfigRepo from "../repositories/themeConfig.repo";
import { buildNotFoundResponse, buildServiceErrorResponse, buildSuccessResponse } from "../utils/mensajeApiUtils";
import { Prisma } from "../prisma/client";
let mensaje:MensajeApi;

export const getAllThemeConfigs = async () => {
    try{
        const themeConfigs = await ThemeConfigRepo.getAllThemeConfigs();
        mensaje = buildSuccessResponse('Succesfully retrieved all theme configs', themeConfigs);
        return mensaje;
    }catch(error){
        mensaje = buildServiceErrorResponse('theme config', 'get all', error);
        return mensaje;
    }
};


export const getThemeConfigById = async (id: number) => {
    try{
        const themeConfig = await ThemeConfigRepo.getThemeConfigById(id);
        mensaje = buildSuccessResponse('Succesfully retrieved theme config with id: ' + id, themeConfig);
        return mensaje;
    }catch(error){
        mensaje = buildServiceErrorResponse('theme config', 'get by id', error);
        return mensaje;
    }
};

export const getThemeConfigByCompanyId = async (companyId: number) => {
    try{
        const themeConfig = await ThemeConfigRepo.getThemeConfigByCompanyId(companyId);
        mensaje = buildSuccessResponse('Succesfully retrieved theme config with company id: ' + companyId, themeConfig);
        return mensaje;
    }catch(error){
        mensaje = buildServiceErrorResponse('theme config', 'get by company id', error);
        return mensaje;
    }
};

export const createThemeConfig = async (themeConfigData: Prisma.ThemeConfigCreateInput) => {
    try{
        const themeConfig = await ThemeConfigRepo.createThemeConfig(themeConfigData);
        mensaje = buildSuccessResponse('Succesfully created theme config', themeConfig);
        return mensaje;
    }catch(error){
        mensaje = buildServiceErrorResponse('theme config', 'create', error);
        return mensaje;
    }
};

export const updateThemeConfig = async (id: number, themeConfigData: Prisma.ThemeConfigUpdateInput) => {
    try{
        const themeConfig = await ThemeConfigRepo.getThemeConfigById(id);
        if(!themeConfig){
            mensaje = buildNotFoundResponse('theme config', 'update');
            return mensaje;
        }
        const themeConfigUpdated = await ThemeConfigRepo.updateThemeConfig(id, themeConfigData);
        mensaje = buildSuccessResponse('Succesfully updated theme config with id: ' + id, themeConfigUpdated);
        return mensaje;
    }catch(error){
        mensaje = buildServiceErrorResponse('theme config', 'update', error);
        return mensaje;
    }
};

export const deleteThemeConfig = async (companyId: number) => {
    try{
        const themeConfig = await ThemeConfigRepo.getThemeConfigByCompanyId(companyId);
        if(!themeConfig){
            mensaje = buildNotFoundResponse('theme config', 'delete');
            return mensaje;
        }
        const themeConfigDeleted = await ThemeConfigRepo.deleteThemeConfig(themeConfig.id);
        mensaje = buildSuccessResponse('Succesfully deleted theme config with company id: ' + companyId, themeConfigDeleted);
        return mensaje;
    }catch(error){
        mensaje = buildServiceErrorResponse('theme config', 'delete', error);
        return mensaje;
    }
};