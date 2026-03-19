import {
  buildServiceErrorResponse,
  buildSuccessResponse,
  buildNotFoundResponse,
} from '../utils/mensajeApiUtils';
import * as CompanyRepo from '../repositories/company.repo';
import { MensajeApi } from '../types/MensajeApi';
import { Prisma } from '../prisma/client';
let mensaje: MensajeApi;
export const getAllCompanies = async () => {
  try {
    const companies = await CompanyRepo.getAllCompanies();
    mensaje = buildSuccessResponse('Succesfully retrieved all companies', companies);
    return mensaje;
  } catch (error) {
    mensaje = buildServiceErrorResponse('company', 'get all', error);
    return mensaje;
  }
};

const BACKEND_BASE_URL = (process.env.BASE_URL || '').trim();

/** Turn a relative path like `/api/storage/...` into a full URL */
function resolveImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (!BACKEND_BASE_URL) return url;
  return `${BACKEND_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

export const getFeaturedCompanies = async () => {
  try {
    const companies = await CompanyRepo.getFeaturedCompanies(8);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const featured = companies.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      city: c.city ?? '',
      neighborhood: c.address ?? '',
      imageUrl: resolveImageUrl(c.home_hero_image_url || c.logo_url),
      rating: Math.round((c.rating.avg + Number.EPSILON) * 10) / 10,
      reviewCount: c.rating.count,
      isTopRated: c.rating.avg >= 4.5 && c.rating.count >= 2,
      isNew: c.created_at >= thirtyDaysAgo,
      category: c.company_type?.name ?? null,
    }));

    mensaje = buildSuccessResponse('Successfully retrieved featured companies', featured);
    return mensaje;
  } catch (error) {
    mensaje = buildServiceErrorResponse('company', 'get featured', error);
    return mensaje;
  }
};

export const getCompanyById = async (id: number) => {
  try {
    const company = await CompanyRepo.getCompanyById(id);
    mensaje = buildSuccessResponse('Succesfully retrieved company with id: ' + id, company);
    return mensaje;
  } catch (error) {
    mensaje = buildServiceErrorResponse('company', 'get by id', error);
    return mensaje;
  }
};

export const getCompanyBySlug = async (slug: string) => {
  try {
    const company = await CompanyRepo.getCompanyBySlug(slug);
    mensaje = buildSuccessResponse('Succesfully retrieved company with slug: ' + slug, company);
    return mensaje;
  } catch (error) {
    mensaje = buildServiceErrorResponse('company', 'get by slug', error);
    return mensaje;
  }
};

export const getCompanyByPhone = async (phone: string) => {
  try {
    const company = await CompanyRepo.getCompanyByPhone(phone);
    mensaje = buildSuccessResponse('Succesfully retrieved company with phone: ' + phone, company);
    return mensaje;
  } catch (error) {
    mensaje = buildServiceErrorResponse('company', 'get by phone', error);
    return mensaje;
  }
};

export const createCompany = async (companyData: Prisma.CompanyCreateInput) => {
  try {
    const company = await CompanyRepo.createCompany(companyData);
    mensaje = buildSuccessResponse('Succesfully created company', company);
    return mensaje;
  } catch (error) {
    mensaje = buildServiceErrorResponse('company', 'create', error);
    return mensaje;
  }
};

export const updateCompany = async (id: number, companyData: Prisma.CompanyUpdateInput) => {
  try {
    const company = await CompanyRepo.updateCompany(id, companyData);
    mensaje = buildSuccessResponse('Succesfully updated company with id: ' + id, company);
    return mensaje;
  } catch (error) {
    mensaje = buildServiceErrorResponse('company', 'update', error);
    return mensaje;
  }
};

export const deleteCompany = async (id: number) => {
  try {
    const company = await CompanyRepo.deleteCompany(id);
    mensaje = buildSuccessResponse('Succesfully deleted company with id: ' + id, company);
    return mensaje;
  } catch (error) {
    mensaje = buildServiceErrorResponse('company', 'delete', error);
    return mensaje;
  }
};

const DEFAULT_THEME = {
  brand_color: '#2563eb',
  page_background_color: '#f3f4f6',
  page_background_preset: 'auto',
  cards_elevated: true,
  corner_radius: 'md',
};

export const getCompanyPublicPage = async (slug: string) => {
  try {
    const companyData = await CompanyRepo.getCompanyPublicPageBySlug(slug);

    if (!companyData) {
      return buildNotFoundResponse('Company', 'Company not found or inactive');
    }

    // Extract company base fields (without relations)
    const {
      categories,
      services,
      staff_profiles,
      company_settings,
      theme_config,
      reviews,
      ...company
    } = companyData;

    // Calculate review stats
    const reviewCount = reviews.length;
    const reviewAverage = reviewCount > 0
      ? reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviewCount
      : 0;

    // Extract only public settings
    const settings = company_settings
      ? {
        allow_qr_payment: company_settings.allow_qr_payment,
        qr_image_url: company_settings.qr_image_url,
        allow_cash_payment: company_settings.allow_cash_payment,
        social_links: (company_settings as any).social_links || {},
        max_advance_booking_days: company_settings.max_advance_booking_days ?? null,
        min_advance_booking_hours: company_settings.min_advance_booking_hours ?? null,
      }
      : {
        allow_qr_payment: true,
        qr_image_url: null,
        allow_cash_payment: true,
        social_links: {},
        max_advance_booking_days: null,
        min_advance_booking_hours: null,
      };

    // Apply theme defaults if no config exists
    const theme = theme_config
      ? {
        brand_color: theme_config.brand_color,
        page_background_color: theme_config.page_background_color,
        page_background_preset: theme_config.page_background_preset,
        cards_elevated: theme_config.cards_elevated,
        corner_radius: theme_config.corner_radius,
        font_pairing: (theme_config as any).font_pairing || 'classic',
        hero_variant: (theme_config as any).hero_variant || 'hero-cinematic',
        services_variant: (theme_config as any).services_variant || 'services-grid',
        team_variant: (theme_config as any).team_variant || 'team-cards',
      }
      : DEFAULT_THEME;

    const responseData = {
      company,
      categories,
      services,
      staff: staff_profiles,
      settings,
      theme,
      reviewStats: {
        average: Math.round(reviewAverage * 10) / 10, // Round to 1 decimal
        count: reviewCount,
      },
    };
    return buildSuccessResponse('Company retrieved', responseData);
  } catch (error) {
    return buildServiceErrorResponse('company', 'get public page', error);
  }
};

export const getCompanyStatus = async (slug: string) => {
  try {
    const company = await CompanyRepo.getCompanyBySlug(slug);

    if (!company) {
      return {
        code: 404,
        message: 'Company not found',
        error: true,
      };
    }

    // Get company timezone
    const timezone = company.timezone || 'UTC';

    // Get current time in company's timezone
    const now = new Date();
    const currentTimeInTimezone = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
    const currentMinutes = currentTimeInTimezone.getHours() * 60 + currentTimeInTimezone.getMinutes();
    const currentTimeString = `${currentTimeInTimezone.getHours().toString().padStart(2, '0')}:${currentTimeInTimezone.getMinutes().toString().padStart(2, '0')}`;

    // Get today's day of week (0 = Sunday, 6 = Saturday)
    const dayOfWeek = currentTimeInTimezone.getDay();

    // Get today's hours
    const todayHours = await CompanyRepo.getCompanyHoursForDay(company.id, dayOfWeek);

    // Initialize response
    const response = {
      is_open_now: false,
      current_time: currentTimeString,
      today_windows: [] as Array<{ open_time: string; close_time: string }>,
      next_open_time: null as string | null,
      next_open_today: false,
      is_closed_today: true,
    };

    if (!todayHours || todayHours.is_closed) {
      // Company is closed today
      response.is_closed_today = true;
      return {
        code: 200,
        message: 'Company status retrieved',
        error: false,
        data: response,
      };
    }

    // Get all hours for today (supporting multiple windows)
    const allTodayHours = await CompanyRepo.getAllHoursForDay(company.id, dayOfWeek);

    if (allTodayHours.length === 0) {
      // No hours configured for today
      response.is_closed_today = true;
      return {
        code: 200,
        message: 'Company status retrieved',
        error: false,
        data: response,
      };
    }

    // Process each time window
    let isOpenNow = false;
    let nextOpenTime: string | null = null;

    for (const hourWindow of allTodayHours) {
      if (hourWindow.is_closed || !hourWindow.open_time || !hourWindow.close_time) {
        continue;
      }

      const [openHour, openMin] = hourWindow.open_time.split(':').map(Number);
      const [closeHour, closeMin] = hourWindow.close_time.split(':').map(Number);
      const openMinutes = openHour * 60 + openMin;
      const closeMinutes = closeHour * 60 + closeMin;

      // Add window to response
      response.today_windows.push({
        open_time: hourWindow.open_time,
        close_time: hourWindow.close_time,
      });

      // Check if current time is within this window
      if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
        isOpenNow = true;
      }

      // Find next opening time today
      if (!nextOpenTime && currentMinutes < openMinutes) {
        nextOpenTime = hourWindow.open_time;
      }
    }

    // Set response values
    response.is_open_now = isOpenNow;
    response.next_open_time = nextOpenTime;
    response.next_open_today = nextOpenTime !== null;
    response.is_closed_today = response.today_windows.length === 0;

    return {
      code: 200,
      message: 'Company status retrieved',
      error: false,
      data: response,
    };
  } catch (error) {
    return buildServiceErrorResponse('company', 'get status', error);
  }
};
