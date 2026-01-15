import { MensajeApi } from "../types/MensajeApi";
import * as globalserviceTypes from "../repositories/globalServiceTypes.repo";
import { buildServiceErrorResponse, buildSuccessResponse } from "../utils/mensajeApiUtils";
import * as companyRepo from "../repositories/company.repo";
import * as companyTypeRepo from "../repositories/companyType.repo";
import * as reviewsRepo from "../repositories/reviews.repo";
import * as faqRepo from "../repositories/faq.repo";
let mensaje:MensajeApi;

export const getServiceTypes= async (query:string) => {
    try {
    const services = await globalserviceTypes.queryServiceTypes(query);
    mensaje = buildSuccessResponse('home', services);        
    } catch (error) {
        mensaje = buildServiceErrorResponse('home', 'get service types', error);
    }
    return mensaje;
}


export const getCities = async (query:string) => {
    try {
     const cities = await companyRepo.getCities(query);
    mensaje = buildSuccessResponse('home', cities);        
    } catch (error) {
        mensaje = buildServiceErrorResponse('home', 'get cities', error);
    }
    return mensaje;
}

export const getTopFourCompanyTypes = async () => {
    try {
        const topFourCompanyTypesIds = await companyRepo.getTopFourCompanyTypesIds();
        const topFourCompanyTypesIdsArray = topFourCompanyTypesIds.map((item) => item.company_type_id);
        const topFourCompanyTypes = await companyTypeRepo.getCompanyTypesByIds(topFourCompanyTypesIdsArray);
        mensaje = buildSuccessResponse('home', topFourCompanyTypes);        
    } catch (error) {
        mensaje = buildServiceErrorResponse('home', 'get top four company types', error);
    }
    return mensaje;
}

export const getTopRatedShops = async () => {
    try {
        const limit = 6;
        const shopWithMostReviews = await reviewsRepo.getTopRatedReviews(limit);
        const shopIds = shopWithMostReviews.map((item) => item.company_id);
        if(shopIds.length === 0){
            const topRatedShops = await companyRepo.getAllCompanies(limit);
            mensaje = buildSuccessResponse('home', topRatedShops);        
            return mensaje;
        }
        const topRatedShops = await companyRepo.getCompaniesByIds(shopIds);
        mensaje = buildSuccessResponse('home', topRatedShops);        
    } catch (error) {
        mensaje = buildServiceErrorResponse('home', 'get top rated shops', error);
    }
    return mensaje;
}


export const getFaq = async () => {
    try {
        const faq = await faqRepo.getFaq();
        mensaje = buildSuccessResponse('home', faq);        
    } catch (error) {
        mensaje = buildServiceErrorResponse('home', 'get faq', error);
    }
    return mensaje;
}


export const search = async (serviceTypeID?:number, location?:string, date?:string, time?:string, name?:string) => {
    try{

            const companies = await companyRepo.getCompanySearch(serviceTypeID, location, name, date, time);
        mensaje = buildSuccessResponse('home', companies);        
    } catch (error) {
        mensaje = buildServiceErrorResponse('home', 'search', error);
    }
    return mensaje;
}
