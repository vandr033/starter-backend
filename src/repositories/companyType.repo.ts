import {Prisma, prisma } from '../prisma/client';

export const getCompanyTypesByIds = async (ids: number[]) => {
    try {
        const companyTypes = await prisma.companyType.findMany({
            where: {
                id: {
                    in: ids,
                },
                is_active:true
            },
            select:{
                id:true,
                key:true,
                name:true,
                description:true,
                icon_name:true,
            }
        });
        return companyTypes;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

