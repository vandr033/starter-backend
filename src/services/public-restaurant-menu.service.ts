import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { isCompanyAvailableNow } from '../utils/company-availability';
import { isFeatureEnabledForCompany } from './plan-enforcement.service';

type DbClient = typeof prisma | Prisma.TransactionClient;
const notFound = { code: 404, error: true, message: 'No encontramos el menú o el restaurante solicitado.' };
const asStrings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
async function context(slug: string, db: DbClient = prisma) {
  const company = await db.company.findUnique({ where: { slug }, select: { id: true, slug: true, name: true, currency: true, is_active: true, deleted_at: true, availableUntil: true, restaurant_enabled: true } });
  if (!company || !isCompanyAvailableNow(company) || !company.restaurant_enabled || !(await isFeatureEnabledForCompany(company.id, 'RESTAURANT_MODULE', db))) return null;
  return company;
}
const publicItem = (item: any) => ({ id: item.id, name: item.name, description: item.description, price: item.price?.toFixed(2) ?? null, imageUrl: item.image_url, isAvailable: item.is_available, isFeatured: item.is_featured, preparationMinutes: item.preparation_minutes, dietaryLabels: asStrings(item.dietary_labels), allergens: asStrings(item.allergens) });
export async function getPublicRestaurantMenu(slug: string) {
  const company = await context(slug); if (!company) return notFound;
  const categories = await prisma.restaurantMenuCategory.findMany({ where: { company_id: company.id, is_active: true, items: { some: { is_active: true } } }, include: { items: { where: { is_active: true }, orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] } }, orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] });
  const featuredItems = categories.flatMap((category) => category.items.filter((item) => item.is_featured).map(publicItem));
  return { code: 200, error: false, message: 'Menú disponible.', data: { restaurant: { name: company.name, slug: company.slug, currency: company.currency }, featuredItems, categories: categories.map((category) => ({ id: category.id, name: category.name, description: category.description, imageUrl: category.image_url, items: category.items.map(publicItem) })) } };
}
