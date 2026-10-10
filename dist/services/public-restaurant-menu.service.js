"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicRestaurantMenu = getPublicRestaurantMenu;
const client_1 = require("../prisma/client");
const company_availability_1 = require("../utils/company-availability");
const plan_enforcement_service_1 = require("./plan-enforcement.service");
const notFound = { code: 404, error: true, message: 'No encontramos el menú o el restaurante solicitado.' };
const asStrings = (value) => Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
async function context(slug, db = client_1.prisma) {
    const company = await db.company.findUnique({ where: { slug }, select: { id: true, slug: true, name: true, currency: true, is_active: true, deleted_at: true, availableUntil: true, restaurant_enabled: true } });
    if (!company || !(0, company_availability_1.isCompanyAvailableNow)(company) || !company.restaurant_enabled || !(await (0, plan_enforcement_service_1.isFeatureEnabledForCompany)(company.id, 'RESTAURANT_MODULE', db)))
        return null;
    return company;
}
const publicItem = (item) => ({ id: item.id, name: item.name, description: item.description, price: item.price?.toFixed(2) ?? null, imageUrl: item.image_url, isAvailable: item.is_available, isFeatured: item.is_featured, preparationMinutes: item.preparation_minutes, dietaryLabels: asStrings(item.dietary_labels), allergens: asStrings(item.allergens) });
async function getPublicRestaurantMenu(slug) {
    const company = await context(slug);
    if (!company)
        return notFound;
    const categories = await client_1.prisma.restaurantMenuCategory.findMany({ where: { company_id: company.id, is_active: true, items: { some: { is_active: true } } }, include: { items: { where: { is_active: true }, orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] } }, orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] });
    const featuredItems = categories.flatMap((category) => category.items.filter((item) => item.is_featured).map(publicItem));
    return { code: 200, error: false, message: 'Menú disponible.', data: { restaurant: { name: company.name, slug: company.slug, currency: company.currency }, featuredItems, categories: categories.map((category) => ({ id: category.id, name: category.name, description: category.description, imageUrl: category.image_url, items: category.items.map(publicItem) })) } };
}
