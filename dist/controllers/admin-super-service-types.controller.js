"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteServiceType = exports.updateServiceType = exports.createServiceType = exports.getServiceTypes = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const NAME_FALLBACK_LOCALES = ["es", "en"];
function isMissingCategoryGlobalTypeColumnError(error) {
    if (!(error instanceof client_1.Prisma.PrismaClientKnownRequestError))
        return false;
    if (error.code !== "P2022")
        return false;
    const column = error.meta?.column;
    return typeof column === "string" && column.includes("category.global_service_type_id");
}
function toI18nMap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return {};
    const normalized = {};
    for (const [rawKey, rawValue] of Object.entries(value)) {
        const key = rawKey.trim().toLowerCase();
        const strValue = typeof rawValue === "string" ? rawValue.trim() : "";
        if (key && strValue)
            normalized[key] = strValue;
    }
    return normalized;
}
function parseI18nMapInput(raw) {
    if (raw === undefined)
        return { provided: false, value: {} };
    if (raw === null)
        return { provided: true, value: {} };
    if (typeof raw !== "object" || Array.isArray(raw)) {
        return { provided: true, value: {}, error: "Invalid i18n map format" };
    }
    const normalized = {};
    for (const [rawKey, rawValue] of Object.entries(raw)) {
        const key = rawKey.trim().toLowerCase();
        const strValue = typeof rawValue === "string" ? rawValue.trim() : "";
        if (key && strValue)
            normalized[key] = strValue;
    }
    return { provided: true, value: normalized };
}
function getPreferredLocalizedText(map) {
    for (const locale of NAME_FALLBACK_LOCALES) {
        const value = map[locale];
        if (value)
            return value;
    }
    const firstValue = Object.values(map)[0];
    return firstValue || null;
}
function ensureNameI18n(name, map) {
    if (Object.keys(map).length > 0)
        return map;
    return {
        es: name,
        en: name,
    };
}
const getServiceTypes = async (req, res) => {
    try {
        try {
            const serviceTypes = await client_2.prisma.globalServiceType.findMany({
                select: {
                    id: true,
                    key: true,
                    name: true,
                    name_i18n: true,
                    description: true,
                    description_i18n: true,
                    _count: {
                        select: {
                            categories: true,
                            services: true,
                        },
                    },
                },
                orderBy: {
                    name: "asc",
                },
            });
            const serviceTypesWithUsage = serviceTypes.map((type) => ({
                id: type.id,
                key: type.key,
                name: type.name,
                name_i18n: toI18nMap(type.name_i18n),
                description: type.description,
                description_i18n: toI18nMap(type.description_i18n),
                usageCount: type._count.categories + type._count.services,
                categories_count: type._count.categories,
                services_count: type._count.services,
            }));
            return res.json(serviceTypesWithUsage);
        }
        catch (countError) {
            if (!isMissingCategoryGlobalTypeColumnError(countError)) {
                throw countError;
            }
            // Legacy DB fallback: category.global_service_type_id does not exist yet.
            // Return service types with service usage only so the page stays functional.
            const serviceTypes = await client_2.prisma.globalServiceType.findMany({
                select: {
                    id: true,
                    key: true,
                    name: true,
                    name_i18n: true,
                    description: true,
                    description_i18n: true,
                    _count: {
                        select: {
                            services: true,
                        },
                    },
                },
                orderBy: {
                    name: "asc",
                },
            });
            const serviceTypesWithUsage = serviceTypes.map((type) => ({
                id: type.id,
                key: type.key,
                name: type.name,
                name_i18n: toI18nMap(type.name_i18n),
                description: type.description,
                description_i18n: toI18nMap(type.description_i18n),
                usageCount: type._count.services,
                categories_count: 0,
                services_count: type._count.services,
            }));
            return res.json(serviceTypesWithUsage);
        }
    }
    catch (error) {
        console.error("Error fetching service types:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
exports.getServiceTypes = getServiceTypes;
const createServiceType = async (req, res) => {
    try {
        const { key, name, description, name_i18n, description_i18n } = req.body;
        if (!key) {
            return res.status(400).json({ error: "Key is required" });
        }
        const parsedNameI18n = parseI18nMapInput(name_i18n);
        if (parsedNameI18n.error) {
            return res.status(400).json({ error: "Invalid name_i18n format" });
        }
        const parsedDescriptionI18n = parseI18nMapInput(description_i18n);
        if (parsedDescriptionI18n.error) {
            return res.status(400).json({ error: "Invalid description_i18n format" });
        }
        const normalizedName = name?.trim() || "";
        const inferredName = getPreferredLocalizedText(parsedNameI18n.value) || "";
        const finalName = normalizedName || inferredName;
        if (!finalName) {
            return res.status(400).json({ error: "Name is required" });
        }
        const upperKey = key.trim().toUpperCase();
        const existingType = await client_2.prisma.globalServiceType.findUnique({
            where: { key: upperKey },
        });
        if (existingType) {
            return res.status(409).json({ error: "Service type with this key already exists" });
        }
        const serviceType = await client_2.prisma.globalServiceType.create({
            data: {
                key: upperKey,
                name: finalName,
                name_i18n: ensureNameI18n(finalName, parsedNameI18n.value),
                description: description?.trim() || null,
                description_i18n: parsedDescriptionI18n.value,
            },
            select: {
                id: true,
                key: true,
                name: true,
                name_i18n: true,
                description: true,
                description_i18n: true,
            },
        });
        res.status(201).json({
            ...serviceType,
            name_i18n: toI18nMap(serviceType.name_i18n),
            description_i18n: toI18nMap(serviceType.description_i18n),
        });
    }
    catch (error) {
        console.error("Error creating service type:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
exports.createServiceType = createServiceType;
const updateServiceType = async (req, res) => {
    try {
        const { id } = req.params;
        const idNum = Array.isArray(id) ? parseInt(id[0], 10) : parseInt(id, 10);
        if (!Number.isFinite(idNum)) {
            return res.status(400).json({ error: "Invalid service type id" });
        }
        const { key, name, description, name_i18n, description_i18n } = req.body;
        const serviceType = await client_2.prisma.globalServiceType.findUnique({
            where: { id: idNum },
            select: {
                id: true,
                name: true,
                name_i18n: true,
            },
        });
        if (!serviceType) {
            return res.status(404).json({ error: "Service type not found" });
        }
        const parsedNameI18n = parseI18nMapInput(name_i18n);
        if (parsedNameI18n.error) {
            return res.status(400).json({ error: "Invalid name_i18n format" });
        }
        const parsedDescriptionI18n = parseI18nMapInput(description_i18n);
        if (parsedDescriptionI18n.error) {
            return res.status(400).json({ error: "Invalid description_i18n format" });
        }
        if (key) {
            const upperKey = key.trim().toUpperCase();
            const existingType = await client_2.prisma.globalServiceType.findFirst({
                where: {
                    key: upperKey,
                    id: { not: idNum },
                },
            });
            if (existingType) {
                return res.status(409).json({ error: "Service type with this key already exists" });
            }
        }
        const existingNameMap = toI18nMap(serviceType.name_i18n);
        const nextNameMap = parsedNameI18n.provided ? parsedNameI18n.value : existingNameMap;
        const nextName = (name?.trim() || "") ||
            getPreferredLocalizedText(nextNameMap) ||
            serviceType.name;
        const updateData = {
            ...(key && { key: key.trim().toUpperCase() }),
            ...(description !== undefined && { description: description?.trim() || null }),
            ...(parsedDescriptionI18n.provided && { description_i18n: parsedDescriptionI18n.value }),
        };
        if (nextName !== serviceType.name || parsedNameI18n.provided) {
            updateData.name = nextName;
            updateData.name_i18n = ensureNameI18n(nextName, nextNameMap);
        }
        const updatedServiceType = await client_2.prisma.globalServiceType.update({
            where: { id: idNum },
            data: updateData,
            select: {
                id: true,
                key: true,
                name: true,
                name_i18n: true,
                description: true,
                description_i18n: true,
            },
        });
        res.json({
            ...updatedServiceType,
            name_i18n: toI18nMap(updatedServiceType.name_i18n),
            description_i18n: toI18nMap(updatedServiceType.description_i18n),
        });
    }
    catch (error) {
        console.error("Error updating service type:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
exports.updateServiceType = updateServiceType;
const deleteServiceType = async (req, res) => {
    try {
        const { id } = req.params;
        const idNum = Array.isArray(id) ? parseInt(id[0], 10) : parseInt(id, 10);
        const serviceType = await client_2.prisma.globalServiceType.findUnique({
            where: { id: idNum },
            select: {
                id: true,
            },
        });
        if (!serviceType) {
            return res.status(404).json({ error: "Service type not found" });
        }
        let categoriesCount = 0;
        try {
            categoriesCount = await client_2.prisma.category.count({
                where: { global_service_type_id: idNum },
            });
        }
        catch (countError) {
            if (!isMissingCategoryGlobalTypeColumnError(countError)) {
                throw countError;
            }
            categoriesCount = 0;
        }
        const servicesCount = await client_2.prisma.service.count({
            where: { global_type_id: idNum },
        });
        const totalUsage = categoriesCount + servicesCount;
        if (totalUsage > 0) {
            return res.status(409).json({
                error: `Cannot delete: ${totalUsage} record${totalUsage === 1 ? " is" : "s are"} using this type`,
            });
        }
        await client_2.prisma.globalServiceType.delete({
            where: { id: idNum },
        });
        res.status(204).send();
    }
    catch (error) {
        console.error("Error deleting service type:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
exports.deleteServiceType = deleteServiceType;
