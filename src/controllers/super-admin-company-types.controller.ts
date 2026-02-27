import type { Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client";
import { AuthenticatedRequest } from "../middlewares/requireAuth";

function generateKey(name: string): string {
    return name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
}

type I18nMap = Record<string, string>;
const NAME_FALLBACK_LOCALES = ["es", "en"] as const;

function toI18nMap(value: Prisma.JsonValue | null | undefined): I18nMap {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const normalized: I18nMap = {};
    for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
        const key = rawKey.trim().toLowerCase();
        const strValue = typeof rawValue === "string" ? rawValue.trim() : "";
        if (key && strValue) normalized[key] = strValue;
    }
    return normalized;
}

function parseI18nMapInput(raw: unknown): { provided: boolean; value: I18nMap; error?: string } {
    if (raw === undefined) return { provided: false, value: {} };
    if (raw === null) return { provided: true, value: {} };

    if (typeof raw !== "object" || Array.isArray(raw)) {
        return { provided: true, value: {}, error: "Invalid i18n map format" };
    }

    const normalized: I18nMap = {};
    for (const [rawKey, rawValue] of Object.entries(raw as Record<string, unknown>)) {
        const key = rawKey.trim().toLowerCase();
        const strValue = typeof rawValue === "string" ? rawValue.trim() : "";
        if (key && strValue) normalized[key] = strValue;
    }

    return { provided: true, value: normalized };
}

function getPreferredLocalizedText(map: I18nMap): string | null {
    for (const locale of NAME_FALLBACK_LOCALES) {
        const value = map[locale];
        if (value) return value;
    }

    const firstValue = Object.values(map)[0];
    return firstValue || null;
}

function ensureNameI18n(name: string, map: I18nMap): I18nMap {
    if (Object.keys(map).length > 0) return map;
    return {
        es: name,
        en: name,
    };
}

/**
 * GET /api/super-admin/company-types
 * List all company types with usage count
 */
export async function getCompanyTypes(req: AuthenticatedRequest, res: Response) {
    try {
        const companyTypes = await prisma.companyType.findMany({
            select: {
                id: true,
                key: true,
                name: true,
                name_i18n: true,
                description: true,
                description_i18n: true,
                icon_name: true,
                is_active: true,
                _count: {
                    select: {
                        companies: true,
                    },
                },
            },
            orderBy: { name: "asc" },
        });

        const data = companyTypes.map((ct) => ({
            id: ct.id,
            key: ct.key,
            name: ct.name,
            name_i18n: toI18nMap(ct.name_i18n),
            description: ct.description,
            description_i18n: toI18nMap(ct.description_i18n),
            icon_name: ct.icon_name,
            is_active: ct.is_active,
            companies_count: ct._count.companies,
        }));

        return res.json({ code: 200, error: false, message: "Company types retrieved", data });
    } catch (error) {
        console.error("Error fetching company types:", error);
        return res.status(500).json({ code: 500, error: true, message: "Internal server error" });
    }
}

/**
 * POST /api/super-admin/company-types
 * Create a new company type
 */
export async function createCompanyType(req: AuthenticatedRequest, res: Response) {
    try {
        const { name, description, icon_name, name_i18n, description_i18n } = req.body as {
            name?: string;
            description?: string;
            icon_name?: string;
            name_i18n?: unknown;
            description_i18n?: unknown;
        };

        const parsedNameI18n = parseI18nMapInput(name_i18n);
        if (parsedNameI18n.error) {
            return res.status(400).json({ code: 400, error: true, message: "Invalid name_i18n format" });
        }

        const parsedDescriptionI18n = parseI18nMapInput(description_i18n);
        if (parsedDescriptionI18n.error) {
            return res.status(400).json({ code: 400, error: true, message: "Invalid description_i18n format" });
        }

        const normalizedName = name?.trim() || "";
        const inferredName = getPreferredLocalizedText(parsedNameI18n.value) || "";
        const finalName = normalizedName || inferredName;

        if (!finalName) {
            return res.status(400).json({ code: 400, error: true, message: "Name is required" });
        }

        const key = generateKey(finalName);

        const existing = await prisma.companyType.findUnique({ where: { key } });
        if (existing) {
            return res.status(409).json({ code: 409, error: true, message: "A company type with this key already exists" });
        }

        const descriptionText = description?.trim() || null;

        const companyType = await prisma.companyType.create({
            data: {
                key,
                name: finalName,
                name_i18n: ensureNameI18n(finalName, parsedNameI18n.value),
                description: descriptionText,
                description_i18n: parsedDescriptionI18n.value,
                icon_name: icon_name?.trim() || null,
            },
            select: {
                id: true,
                key: true,
                name: true,
                name_i18n: true,
                description: true,
                description_i18n: true,
                icon_name: true,
                is_active: true,
            },
        });

        return res.status(201).json({
            code: 201,
            error: false,
            message: "Company type created",
            data: {
                ...companyType,
                name_i18n: toI18nMap(companyType.name_i18n),
                description_i18n: toI18nMap(companyType.description_i18n),
            },
        });
    } catch (error) {
        console.error("Error creating company type:", error);
        return res.status(500).json({ code: 500, error: true, message: "Internal server error" });
    }
}

/**
 * PUT /api/super-admin/company-types/:id
 * Update a company type
 */
export async function updateCompanyType(req: AuthenticatedRequest, res: Response) {
    try {
        const id = parseInt(req.params.id as string, 10);
        if (!Number.isFinite(id)) {
            return res.status(400).json({ code: 400, error: true, message: "Invalid company type id" });
        }

        const { name, description, icon_name, name_i18n, description_i18n } = req.body as {
            name?: string;
            description?: string;
            icon_name?: string;
            name_i18n?: unknown;
            description_i18n?: unknown;
        };

        const existing = await prisma.companyType.findUnique({
            where: { id },
            select: {
                id: true,
                key: true,
                name: true,
                name_i18n: true,
            },
        });

        if (!existing) {
            return res.status(404).json({ code: 404, error: true, message: "Company type not found" });
        }

        const parsedNameI18n = parseI18nMapInput(name_i18n);
        if (parsedNameI18n.error) {
            return res.status(400).json({ code: 400, error: true, message: "Invalid name_i18n format" });
        }

        const parsedDescriptionI18n = parseI18nMapInput(description_i18n);
        if (parsedDescriptionI18n.error) {
            return res.status(400).json({ code: 400, error: true, message: "Invalid description_i18n format" });
        }

        const updateData: Prisma.CompanyTypeUpdateInput = {};

        const existingNameMap = toI18nMap(existing.name_i18n);
        const nextNameMap = parsedNameI18n.provided ? parsedNameI18n.value : existingNameMap;
        const nextName =
            (name?.trim() || "") ||
            getPreferredLocalizedText(nextNameMap) ||
            existing.name;

        if (nextName !== existing.name || parsedNameI18n.provided) {
            const nextKey = generateKey(nextName);
            const keyConflict = await prisma.companyType.findFirst({
                where: {
                    key: nextKey,
                    id: { not: id },
                },
            });
            if (keyConflict) {
                return res.status(409).json({ code: 409, error: true, message: "A company type with this key already exists" });
            }

            updateData.name = nextName;
            updateData.key = nextKey;
            updateData.name_i18n = ensureNameI18n(nextName, nextNameMap);
        }

        if (description !== undefined) updateData.description = description?.trim() || null;
        if (parsedDescriptionI18n.provided) updateData.description_i18n = parsedDescriptionI18n.value;
        if (icon_name !== undefined) updateData.icon_name = icon_name?.trim() || null;

        const companyType = await prisma.companyType.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                key: true,
                name: true,
                name_i18n: true,
                description: true,
                description_i18n: true,
                icon_name: true,
                is_active: true,
            },
        });

        return res.json({
            code: 200,
            error: false,
            message: "Company type updated",
            data: {
                ...companyType,
                name_i18n: toI18nMap(companyType.name_i18n),
                description_i18n: toI18nMap(companyType.description_i18n),
            },
        });
    } catch (error) {
        console.error("Error updating company type:", error);
        return res.status(500).json({ code: 500, error: true, message: "Internal server error" });
    }
}

/**
 * DELETE /api/super-admin/company-types/:id
 * Delete a company type (only if no companies are using it)
 */
export async function deleteCompanyType(req: AuthenticatedRequest, res: Response) {
    try {
        const id = parseInt(req.params.id as string, 10);

        const companyType = await prisma.companyType.findUnique({
            where: { id },
            include: { _count: { select: { companies: true } } },
        });

        if (!companyType) {
            return res.status(404).json({ code: 404, error: true, message: "Company type not found" });
        }

        if (companyType._count.companies > 0) {
            return res.status(409).json({
                code: 409,
                error: true,
                message: `Cannot delete: ${companyType._count.companies} shop${companyType._count.companies === 1 ? " is" : "s are"} using this type`,
            });
        }

        await prisma.companyType.delete({ where: { id } });

        return res.status(200).json({ code: 200, error: false, message: "Company type deleted" });
    } catch (error) {
        console.error("Error deleting company type:", error);
        return res.status(500).json({ code: 500, error: true, message: "Internal server error" });
    }
}
