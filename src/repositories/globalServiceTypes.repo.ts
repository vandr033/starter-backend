import { logger } from '../config/logger';
import {Prisma, prisma } from '../prisma/client';

export const getServiceTypes= async () => {
    try {
        const getServiceTypes = await prisma.globalServiceType.findMany({
            select:{
                id:true,
                name:true,
                description:true,
            }
        });
        return getServiceTypes;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

export const queryServiceTypes= async (query: string) => {
    logger.info( query.toString());
    try {
        const queryServiceTypes = await prisma.globalServiceType.findMany({
            select:{
                id:true,
                name:true,
                description:true,
            },
            where:{
                name:{
                    contains: query,
                }
            }
        });
        return queryServiceTypes;
    } catch (error) {
        console.error(error);
        throw error;
    }
}