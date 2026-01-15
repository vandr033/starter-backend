import { prisma, Prisma } from "../prisma/client";
//set default values
const defaultThemeConfig: Prisma.ThemeConfigCreateInput = {
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
}


export const getAllThemeConfigs = () => {
    return prisma.themeConfig.findMany();
}

export const getThemeConfigById = (id: number) => {
    return prisma.themeConfig.findUnique({
        where: { id },
    });
}

export const getThemeConfigByCompanyId = (companyId: number) => {
    return prisma.themeConfig.findUnique({
        where: { company_id: companyId },
    });
}

export const createThemeConfig = (themeConfigData: Prisma.ThemeConfigCreateInput) => {
    return prisma.themeConfig.create({
        data: themeConfigData,
    });
}

export const updateThemeConfig = (id: number, themeConfigData: Prisma.ThemeConfigUpdateInput) => {
    return prisma.themeConfig.update({
        where: { id },
        data: themeConfigData,
    });
}

export const deleteThemeConfig = (id: number) => {
    return prisma.themeConfig.delete({
        where: { id },
    });
}

export const createDefaultThemeConfig =(companyId: number)=>{
    defaultThemeConfig.company.connect!.id = companyId;
    return prisma.themeConfig.create({
        data: defaultThemeConfig,
    });
}
