"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCompanyTypesByIds = void 0;
const client_1 = require("../prisma/client");
const getCompanyTypesByIds = async (ids) => {
    try {
        const companyTypes = await client_1.prisma.companyType.findMany({
            where: {
                id: {
                    in: ids,
                },
                is_active: true
            },
            select: {
                id: true,
                key: true,
                name: true,
                description: true,
                icon_name: true,
            }
        });
        return companyTypes;
    }
    catch (error) {
        console.error(error);
        throw error;
    }
};
exports.getCompanyTypesByIds = getCompanyTypesByIds;
