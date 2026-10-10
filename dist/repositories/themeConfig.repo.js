"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDefaultThemeConfig = exports.deleteThemeConfig = exports.updateThemeConfig = exports.createThemeConfig = exports.getThemeConfigByCompanyId = exports.getThemeConfigById = exports.getAllThemeConfigs = void 0;
const client_1 = require("../prisma/client");
//set default values
const defaultThemeConfig = {
    brand_color: "#000000",
    page_background_color: "#FFFFFF",
    page_background_preset: "light",
    cards_elevated: true,
    corner_radius: "md",
    company: {
        connect: {
            id: 1,
        },
    },
};
const getAllThemeConfigs = () => {
    return client_1.prisma.themeConfig.findMany();
};
exports.getAllThemeConfigs = getAllThemeConfigs;
const getThemeConfigById = (id) => {
    return client_1.prisma.themeConfig.findUnique({
        where: { id },
    });
};
exports.getThemeConfigById = getThemeConfigById;
const getThemeConfigByCompanyId = (companyId) => {
    return client_1.prisma.themeConfig.findUnique({
        where: { company_id: companyId },
    });
};
exports.getThemeConfigByCompanyId = getThemeConfigByCompanyId;
const createThemeConfig = (themeConfigData) => {
    return client_1.prisma.themeConfig.create({
        data: themeConfigData,
    });
};
exports.createThemeConfig = createThemeConfig;
const updateThemeConfig = (id, themeConfigData) => {
    return client_1.prisma.themeConfig.update({
        where: { id },
        data: themeConfigData,
    });
};
exports.updateThemeConfig = updateThemeConfig;
const deleteThemeConfig = (id) => {
    return client_1.prisma.themeConfig.delete({
        where: { id },
    });
};
exports.deleteThemeConfig = deleteThemeConfig;
const createDefaultThemeConfig = (companyId) => {
    defaultThemeConfig.company.connect.id = companyId;
    return client_1.prisma.themeConfig.create({
        data: defaultThemeConfig,
    });
};
exports.createDefaultThemeConfig = createDefaultThemeConfig;
