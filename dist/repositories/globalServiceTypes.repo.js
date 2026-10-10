"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryServiceTypes = exports.getServiceTypes = void 0;
const logger_1 = require("../config/logger");
const client_1 = require("../prisma/client");
const getServiceTypes = async () => {
    try {
        const getServiceTypes = await client_1.prisma.globalServiceType.findMany({
            select: {
                id: true,
                name: true,
                description: true,
            }
        });
        return getServiceTypes;
    }
    catch (error) {
        console.error(error);
        throw error;
    }
};
exports.getServiceTypes = getServiceTypes;
const queryServiceTypes = async (query) => {
    logger_1.logger.info(query.toString());
    try {
        const queryServiceTypes = await client_1.prisma.globalServiceType.findMany({
            select: {
                id: true,
                name: true,
                description: true,
            },
            where: {
                name: {
                    contains: query,
                }
            }
        });
        return queryServiceTypes;
    }
    catch (error) {
        console.error(error);
        throw error;
    }
};
exports.queryServiceTypes = queryServiceTypes;
