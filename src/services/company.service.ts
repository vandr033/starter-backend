import {
  buildServiceErrorResponse,
  buildSuccessResponse,
} from '../utils/mensajeApiUtils';
import * as CompanyRepo from '../repositories/company.repo';
import { MensajeApi } from '../types/MensajeApi';
import { Prisma } from '../prisma/client';
let mensaje:MensajeApi;
export const getAllCompanies = async () => {
  try{
    const companies = await CompanyRepo.getAllCompanies();
    mensaje = buildSuccessResponse('Succesfully retrieved all companies', companies);
    return mensaje;
  }catch(error){
    mensaje = buildServiceErrorResponse('company', 'get all', error);
    return mensaje;
  }
};

export const getCompanyById = async (id: number) => {
  try{
    const company = await CompanyRepo.getCompanyById(id);
    mensaje = buildSuccessResponse('Succesfully retrieved company with id: ' + id, company);
    return mensaje;
  }catch(error){
    mensaje = buildServiceErrorResponse('company', 'get by id', error);
    return mensaje;
  }
};
  
export const getCompanyBySlug = async (slug: string) => {
  try{
    const company = await CompanyRepo.getCompanyBySlug(slug);
    mensaje = buildSuccessResponse('Succesfully retrieved company with slug: ' + slug, company);
    return mensaje;
  }catch(error){
    mensaje = buildServiceErrorResponse('company', 'get by slug', error);
    return mensaje;
  }
};

export const getCompanyByPhone = async (phone: string) => {
  try{
    const company = await CompanyRepo.getCompanyByPhone(phone);
    mensaje = buildSuccessResponse('Succesfully retrieved company with phone: ' + phone, company);
    return mensaje;
  }catch(error){
    mensaje = buildServiceErrorResponse('company', 'get by phone', error);
    return mensaje;
  }
};

export const createCompany = async (companyData: Prisma.CompanyCreateInput) => {
  try{
    const company = await CompanyRepo.createCompany(companyData);
    mensaje = buildSuccessResponse('Succesfully created company', company);
    return mensaje;
  }catch(error){
    mensaje = buildServiceErrorResponse('company', 'create', error);
    return mensaje;
  }
};

export const updateCompany = async (id: number, companyData: Prisma.CompanyUpdateInput) => {
  try{
    const company = await CompanyRepo.updateCompany(id, companyData);
    mensaje = buildSuccessResponse('Succesfully updated company with id: ' + id, company);
    return mensaje;
  }catch(error){
    mensaje = buildServiceErrorResponse('company', 'update', error);
    return mensaje;
  }
};

export const deleteCompany = async (id: number) => {
  try{
    const company = await CompanyRepo.deleteCompany(id);
    mensaje = buildSuccessResponse('Succesfully deleted company with id: ' + id, company);
    return mensaje;
  }catch(error){
    mensaje = buildServiceErrorResponse('company', 'delete', error);
    return mensaje;
  }
};
