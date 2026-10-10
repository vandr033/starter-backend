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
exports.search = exports.getFaq = exports.getTopRatedShops = exports.getTopFourCompanyTypes = exports.getCities = exports.getServiceTypes = void 0;
const globalserviceTypes = __importStar(require("../repositories/globalServiceTypes.repo"));
const mensajeApiUtils_1 = require("../utils/mensajeApiUtils");
const companyRepo = __importStar(require("../repositories/company.repo"));
const companyTypeRepo = __importStar(require("../repositories/companyType.repo"));
const reviewsRepo = __importStar(require("../repositories/reviews.repo"));
const faqRepo = __importStar(require("../repositories/faq.repo"));
let mensaje;
const getServiceTypes = async (query) => {
    try {
        const services = await globalserviceTypes.queryServiceTypes(query);
        mensaje = (0, mensajeApiUtils_1.buildSuccessResponse)('home', services);
    }
    catch (error) {
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('home', 'get service types', error);
    }
    return mensaje;
};
exports.getServiceTypes = getServiceTypes;
const getCities = async (query) => {
    try {
        const cities = await companyRepo.getCities(query);
        mensaje = (0, mensajeApiUtils_1.buildSuccessResponse)('home', cities);
    }
    catch (error) {
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('home', 'get cities', error);
    }
    return mensaje;
};
exports.getCities = getCities;
const getTopFourCompanyTypes = async () => {
    try {
        const topFourCompanyTypesIds = await companyRepo.getTopFourCompanyTypesIds();
        const topFourCompanyTypesIdsArray = topFourCompanyTypesIds.map((item) => item.company_type_id);
        const topFourCompanyTypes = await companyTypeRepo.getCompanyTypesByIds(topFourCompanyTypesIdsArray);
        mensaje = (0, mensajeApiUtils_1.buildSuccessResponse)('home', topFourCompanyTypes);
    }
    catch (error) {
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('home', 'get top four company types', error);
    }
    return mensaje;
};
exports.getTopFourCompanyTypes = getTopFourCompanyTypes;
const getTopRatedShops = async () => {
    try {
        const limit = 6;
        const shopWithMostReviews = await reviewsRepo.getTopRatedReviews(limit);
        const shopIds = shopWithMostReviews.map((item) => item.company_id);
        if (shopIds.length === 0) {
            const topRatedShops = await companyRepo.getMarketplaceDiscoverableCompanies(limit);
            mensaje = (0, mensajeApiUtils_1.buildSuccessResponse)('home', topRatedShops);
            return mensaje;
        }
        const topRatedShops = await companyRepo.getMarketplaceDiscoverableCompaniesByIds(shopIds);
        mensaje = (0, mensajeApiUtils_1.buildSuccessResponse)('home', topRatedShops);
    }
    catch (error) {
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('home', 'get top rated shops', error);
    }
    return mensaje;
};
exports.getTopRatedShops = getTopRatedShops;
const getFaq = async () => {
    try {
        const faq = await faqRepo.getFaq();
        mensaje = (0, mensajeApiUtils_1.buildSuccessResponse)('home', faq);
    }
    catch (error) {
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('home', 'get faq', error);
    }
    return mensaje;
};
exports.getFaq = getFaq;
const search = async (serviceTypeID, location, date, time, name) => {
    try {
        const companies = await companyRepo.getCompanySearch(serviceTypeID, location, name, date, time);
        mensaje = (0, mensajeApiUtils_1.buildSuccessResponse)('home', companies);
    }
    catch (error) {
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('home', 'search', error);
    }
    return mensaje;
};
exports.search = search;
