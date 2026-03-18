// prisma/seed.ts
import { PrismaClient, Prisma } from "@prisma/client";
import {
  PageBackgroundPreset,
  CornerRadius,
  CompanyUserRole,
  ShopPlan,
  BillingCycle,
  DiscountType,
  BookingType,
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  VerificationChannel,
  VerificationPurpose,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const baseCreatedAt = new Date("2025-01-01T12:00:00.000Z");
  const baseUpdatedAt = new Date("2025-01-02T12:00:00.000Z");
  const defaultAvailableUntil = new Date("2027-03-12T23:59:59.000Z");

  /**
   * 1) COMPANY TYPES / GLOBAL SERVICE TYPES / TYPES / FAQ
   */
  const companyTypes = [
    {
      id: 1,
      key: "BARBER_SHOP",
      name: "Barber shop",
      name_i18n: { en: "Barber shop", es: "Barbería" },
      description: "Traditional and modern barber services (haircuts, beard, grooming).",
      description_i18n: {
        en: "Traditional and modern barber services (haircuts, beard, grooming).",
        es: "Servicios de barbería tradicionales y modernos (cortes, barba y grooming).",
      },
      icon_name: "scissors-line",
      is_active: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
    {
      id: 2,
      key: "NAIL_SALON",
      name: "Nail salon",
      name_i18n: { en: "Nail salon", es: "Salón de uñas" },
      description: "Nail care, manicure and pedicure services.",
      description_i18n: {
        en: "Nail care, manicure and pedicure services.",
        es: "Servicios de cuidado de uñas, manicure y pedicure.",
      },
      icon_name: "nail-polish-line",
      is_active: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
  ];

  const globalServiceTypes = [
    {
      id: 1,
      key: "HAIRCUT_MENS",
      name: "Men's haircut",
      name_i18n: { en: "Men's haircut", es: "Corte masculino" },
      description: "Short to medium length haircuts for men.",
      description_i18n: {
        en: "Short to medium length haircuts for men.",
        es: "Cortes de cabello masculinos de longitud corta a media.",
      },
    },
    {
      id: 2,
      key: "HAIRCUT_WOMENS",
      name: "Women's haircut",
      name_i18n: { en: "Women's haircut", es: "Corte femenino" },
      description: "Haircuts and styling for women.",
      description_i18n: {
        en: "Haircuts and styling for women.",
        es: "Cortes de cabello y peinados para mujeres.",
      },
    },
    {
      id: 3,
      key: "BEARD_TRIM",
      name: "Beard trim",
      name_i18n: { en: "Beard trim", es: "Recorte de barba" },
      description: "Beard trim and shaping services.",
      description_i18n: {
        en: "Beard trim and shaping services.",
        es: "Servicios de recorte y perfilado de barba.",
      },
    },
    {
      id: 4,
      key: "GEL_MANICURE",
      name: "Gel manicure",
      name_i18n: { en: "Gel manicure", es: "Manicure en gel" },
      description: "Long-lasting gel manicures.",
      description_i18n: {
        en: "Long-lasting gel manicures.",
        es: "Manicures en gel de larga duración.",
      },
    },
    {
      id: 5,
      key: "SPA_PEDICURE",
      name: "Spa pedicure",
      name_i18n: { en: "Spa pedicure", es: "Pedicure spa" },
      description: "Foot spa and pedicure treatments.",
      description_i18n: {
        en: "Foot spa and pedicure treatments.",
        es: "Tratamientos de spa y pedicure para pies.",
      },
    },
  ];

  const typesRows = [
    {
      id: 1,
      name: "Barber shop",
      image: "barber.png",
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
    {
      id: 2,
      name: "Nail salon",
      image: "nails.png",
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
  ];

  const faqs = [
    {
      id: 1,
      question: "¿Puedo reagendar mi cita?",
      answer: "Sí, puedes reagendar hasta 2 horas antes de tu turno.",
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
    {
      id: 2,
      question: "¿Aceptan pagos con QR?",
      answer: "Sí, ambas sucursales aceptan pago por QR.",
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
  ];

  await prisma.companyType.createMany({ data: companyTypes, skipDuplicates: true });
  await prisma.globalServiceType.createMany({ data: globalServiceTypes, skipDuplicates: true });
  await prisma.types.createMany({ data: typesRows, skipDuplicates: true });
  await prisma.frequentlyAskedQuestion.createMany({ data: faqs, skipDuplicates: true });

  /**
   * 2) USERS
   */
  const users = [
    {
      id: "user_super_admin",
      name: "Super Admin",
      email: "superadmin@example.com",
      emailVerified: true,
      image: null,
      createdAt: baseCreatedAt,
      updatedAt: baseUpdatedAt,
      first_name: "Super",
      last_name: "Admin",
      phone_prefix: "591",
      phoneNumber: "+59170000000",
      is_super_admin: true,
      is_active: true,
      deleted_at: null,
      phoneNumberVerified: true,
    },
    {
      id: "user_barber_owner",
      name: "Diego Herrera",
      email: "diego@fadefactory.bo",
      emailVerified: true,
      image: null,
      createdAt: baseCreatedAt,
      updatedAt: baseUpdatedAt,
      first_name: "Diego",
      last_name: "Herrera",
      phone_prefix: "591",
      phoneNumber: "+59170000001",
      is_super_admin: false,
      is_active: true,
      deleted_at: null,
      phoneNumberVerified: true,
    },
    {
      id: "user_barber_staff_1",
      name: "Carlos Rojas",
      email: "carlos@fadefactory.bo",
      emailVerified: true,
      image: null,
      createdAt: baseCreatedAt,
      updatedAt: baseUpdatedAt,
      first_name: "Carlos",
      last_name: "Rojas",
      phone_prefix: "591",
      phoneNumber: "+59170000002",
      is_super_admin: false,
      is_active: true,
      deleted_at: null,
      phoneNumberVerified: true,
    },
    {
      id: "user_barber_staff_2",
      name: "Luis Fernández",
      email: "luis@fadefactory.bo",
      emailVerified: true,
      image: null,
      createdAt: baseCreatedAt,
      updatedAt: baseUpdatedAt,
      first_name: "Luis",
      last_name: "Fernández",
      phone_prefix: "591",
      phoneNumber: "+59170000003",
      is_super_admin: false,
      is_active: true,
      deleted_at: null,
      phoneNumberVerified: true,
    },
    {
      id: "user_barber_customer",
      name: "Juan Pérez",
      email: "juan@example.com",
      emailVerified: true,
      image: null,
      createdAt: baseCreatedAt,
      updatedAt: baseUpdatedAt,
      first_name: "Juan",
      last_name: "Pérez",
      phone_prefix: "591",
      phoneNumber: "+59170000004",
      is_super_admin: false,
      is_active: true,
      deleted_at: null,
      phoneNumberVerified: true,
    },
    {
      id: "user_nails_admin",
      name: "Ana López",
      email: "ana@glownails.bo",
      emailVerified: true,
      image: null,
      createdAt: baseCreatedAt,
      updatedAt: baseUpdatedAt,
      first_name: "Ana",
      last_name: "López",
      phone_prefix: "591",
      phoneNumber: "+59170000005",
      is_super_admin: false,
      is_active: true,
      deleted_at: null,
      phoneNumberVerified: true,
    },
    {
      id: "user_nails_staff_1",
      name: "María Gómez",
      email: "maria@glownails.bo",
      emailVerified: true,
      image: null,
      createdAt: baseCreatedAt,
      updatedAt: baseUpdatedAt,
      first_name: "María",
      last_name: "Gómez",
      phone_prefix: "591",
      phoneNumber: "+59170000006",
      is_super_admin: false,
      is_active: true,
      deleted_at: null,
      phoneNumberVerified: true,
    },
    {
      id: "user_nails_staff_2",
      name: "Paola Rivera",
      email: "paola@glownails.bo",
      emailVerified: true,
      image: null,
      createdAt: baseCreatedAt,
      updatedAt: baseUpdatedAt,
      first_name: "Paola",
      last_name: "Rivera",
      phone_prefix: "591",
      phoneNumber: "+59170000007",
      is_super_admin: false,
      is_active: true,
      deleted_at: null,
      phoneNumberVerified: true,
    },
    {
      id: "user_nails_customer",
      name: "Laura Martínez",
      email: "laura@example.com",
      emailVerified: true,
      image: null,
      createdAt: baseCreatedAt,
      updatedAt: baseUpdatedAt,
      first_name: "Laura",
      last_name: "Martínez",
      phone_prefix: "591",
      phoneNumber: "+59170000008",
      is_super_admin: false,
      is_active: true,
      deleted_at: null,
      phoneNumberVerified: true,
    },
  ];

  await prisma.user.createMany({ data: users, skipDuplicates: true });

  /**
   * 3) COMPANIES
   */
  const companies = [
    {
      id: 1,
      slug: "fade-factory-barbershop",
      name: "Fade Factory Barbershop",
      address: "Av. Velasco 123, Santa Cruz",
      phone_prefix: "591",
      phone: "70000001",
      email: "contact@fadefactory.bo",
      google_maps_url: "https://maps.example.com/fade-factory",
      city: "Santa Cruz de la Sierra",
      state: "Santa Cruz",
      country_code: "BO",
      latitude: -17.783,
      longitude: -63.182,
      timezone: "America/La_Paz",
      logo_url: "https://cdn.example.com/fade-factory/logo.png",
      home_hero_image_url: "https://cdn.example.com/fade-factory/home-hero.jpg",
      about_hero_image_url: "https://cdn.example.com/fade-factory/about-hero.jpg",
      about_image_1_url: "https://cdn.example.com/fade-factory/about-1.jpg",
      about_image_2_url: "https://cdn.example.com/fade-factory/about-2.jpg",
      about_image_3_url: "https://cdn.example.com/fade-factory/about-3.jpg",
      is_active: true,
      plan: ShopPlan.BUSINESS,
      billingCycle: BillingCycle.MONTHLY,
      pricePaid: null,
      availableUntil: defaultAvailableUntil,
      isMarketplaceVisible: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
      company_type_id: 1,
    },
    {
      id: 2,
      slug: "glow-nails-studio",
      name: "Glow Nails Studio",
      address: "Calle Aroma 45, Cochabamba",
      phone_prefix: "591",
      phone: "70000002",
      email: "hola@glownails.bo",
      google_maps_url: "https://maps.example.com/glow-nails",
      city: "Cochabamba",
      state: "Cochabamba",
      country_code: "BO",
      latitude: -17.389,
      longitude: -66.156,
      timezone: "America/La_Paz",
      logo_url: "https://cdn.example.com/glow-nails/logo.png",
      home_hero_image_url: "https://cdn.example.com/glow-nails/home-hero.jpg",
      about_hero_image_url: "https://cdn.example.com/glow-nails/about-hero.jpg",
      about_image_1_url: "https://cdn.example.com/glow-nails/about-1.jpg",
      about_image_2_url: "https://cdn.example.com/glow-nails/about-2.jpg",
      about_image_3_url: "https://cdn.example.com/glow-nails/about-3.jpg",
      is_active: true,
      plan: ShopPlan.BUSINESS,
      billingCycle: BillingCycle.MONTHLY,
      pricePaid: null,
      availableUntil: defaultAvailableUntil,
      isMarketplaceVisible: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
      company_type_id: 2,
    },
  ];

  await prisma.company.createMany({ data: companies, skipDuplicates: true });

  /**
   * 4) THEME CONFIG / COMPANY SETTINGS
   */
  const themeConfigs: Prisma.ThemeConfigCreateManyInput[] = [
    {
      id: 1,
      company_id: 1,
      brand_color: "#FF6B00",
      page_background_color: "#0B0B0F",
      page_background_preset: PageBackgroundPreset.dark,
      cards_elevated: true,
      corner_radius: CornerRadius.md,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
    {
      id: 2,
      company_id: 2,
      brand_color: "#FF3FA4",
      page_background_color: "#FFFFFF",
      page_background_preset: "light",
      cards_elevated: true,
      corner_radius: "lg",
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
  ];

  const companySettings = [
    {
      id: 1,
      company_id: 1,
      booking_buffer_minutes: 15,
      booking_time_granularity_minutes: 15,
      cancel_limit_minutes: 120,
      reschedule_limit_minutes: 120,
      allow_qr_payment: true,
      qr_image_url: "https://cdn.example.com/fade-factory/qr.png",
      allow_cash_payment: true,
      send_email_notifications: true,
      send_whatsapp_notifications: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
    {
      id: 2,
      company_id: 2,
      booking_buffer_minutes: 10,
      booking_time_granularity_minutes: 15,
      cancel_limit_minutes: 180,
      reschedule_limit_minutes: 180,
      allow_qr_payment: true,
      qr_image_url: "https://cdn.example.com/glow-nails/qr.png",
      allow_cash_payment: true,
      send_email_notifications: true,
      send_whatsapp_notifications: false,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
  ];

  await prisma.themeConfig.createMany({ data: themeConfigs, skipDuplicates: true });
  await prisma.companySettings.createMany({ data: companySettings, skipDuplicates: true });

  /**
   * 5) STAFF / CUSTOMER PROFILES
   */
  const staffProfiles = [
    {
      id: 1,
      company_id: 1,
      user_id: "user_barber_staff_1",
      display_name: "Carlos “Fade” Rojas",
      bio: "Specialist in skin fades and modern cuts.",
      image_url: "https://cdn.example.com/fade-factory/staff-carlos.jpg",
      is_bookable: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
    {
      id: 2,
      company_id: 1,
      user_id: "user_barber_staff_2",
      display_name: "Luis “Beard” Fernández",
      bio: "Beard shaping, hot towel shaves and classic cuts.",
      image_url: "https://cdn.example.com/fade-factory/staff-luis.jpg",
      is_bookable: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
    {
      id: 3,
      company_id: 2,
      user_id: "user_nails_staff_1",
      display_name: "María Nail Artist",
      bio: "Gel manicures and nail art.",
      image_url: "https://cdn.example.com/glow-nails/staff-maria.jpg",
      is_bookable: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
    {
      id: 4,
      company_id: 2,
      user_id: "user_nails_staff_2",
      display_name: "Paola Pedi Specialist",
      bio: "Spa pedicures and relaxation treatments.",
      image_url: "https://cdn.example.com/glow-nails/staff-paola.jpg",
      is_bookable: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
  ];

  const customerProfiles = [
    {
      id: 1,
      company_id: 1,
      user_id: "user_barber_customer",
      notes: "Prefers skin fade with low taper.",
      preferred_staff_id: 1,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
    {
      id: 2,
      company_id: 2,
      user_id: "user_nails_customer",
      notes: "Likes neutral colors and short nails.",
      preferred_staff_id: 3,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
  ];

  await prisma.staffProfile.createMany({ data: staffProfiles, skipDuplicates: true });
  await prisma.customerProfile.createMany({ data: customerProfiles, skipDuplicates: true });

  /**
   * 6) COMPANY USERS (OWNER / ADMIN / STAFF / CUSTOMER)
   */
  const companyUsers: Prisma.CompanyUserCreateManyInput[] = [
    {
      id: 1,
      company_id: 1,
      user_id: "user_barber_owner",
      role: "OWNER",
      is_primary_contact: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
    {
      id: 2,
      company_id: 1,
      user_id: "user_barber_staff_1",
      role: "STAFF",
      is_primary_contact: false,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
    {
      id: 3,
      company_id: 1,
      user_id: "user_barber_staff_2",
      role: "STAFF",
      is_primary_contact: false,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
    {
      id: 4,
      company_id: 1,
      user_id: "user_barber_customer",
      role: "CUSTOMER",
      is_primary_contact: false,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
    {
      id: 5,
      company_id: 2,
      user_id: "user_nails_admin",
      role: "ADMIN",
      is_primary_contact: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
    {
      id: 6,
      company_id: 2,
      user_id: "user_nails_staff_1",
      role: "STAFF",
      is_primary_contact: false,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
    {
      id: 7,
      company_id: 2,
      user_id: "user_nails_staff_2",
      role: "STAFF",
      is_primary_contact: false,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
    {
      id: 8,
      company_id: 2,
      user_id: "user_nails_customer",
      role: "CUSTOMER",
      is_primary_contact: false,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
  ];

  await prisma.companyUser.createMany({ data: companyUsers, skipDuplicates: true });

  /**
   * 7) CATEGORIES / SERVICES / HOURS
   */
  const categories = [
    {
      id: 1,
      company_id: 1,
      name: "Hair",
      slug: "hair",
      description: "Haircuts and styling.",
      position: 1,
      is_active: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
    {
      id: 2,
      company_id: 1,
      name: "Beard",
      slug: "beard",
      description: "Beard trims and shaves.",
      position: 2,
      is_active: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
    {
      id: 3,
      company_id: 2,
      name: "Hands",
      slug: "hands",
      description: "Manicures and nail art.",
      position: 1,
      is_active: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
    {
      id: 4,
      company_id: 2,
      name: "Feet",
      slug: "feet",
      description: "Pedicure services.",
      position: 2,
      is_active: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
  ];

  const services = [
    {
      id: 1,
      company_id: 1,
      category_id: 1,
      name: "Skin Fade Cut",
      description: "Skin fade with detailed finish.",
      price_cents: 8000,
      duration_minutes: 45,
      position: 1,
      is_active: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
      global_type_id: 1,
    },
    {
      id: 2,
      company_id: 1,
      category_id: 1,
      name: "Classic Scissor Cut",
      description: "Classic scissors-only cut.",
      price_cents: 7000,
      duration_minutes: 40,
      position: 2,
      is_active: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
      global_type_id: 2,
    },
    {
      id: 3,
      company_id: 1,
      category_id: 2,
      name: "Beard Shape & Trim",
      description: "Beard trim, shaping and hot towel finish.",
      price_cents: 5000,
      duration_minutes: 30,
      position: 1,
      is_active: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
      global_type_id: 3,
    },
    {
      id: 4,
      company_id: 2,
      category_id: 3,
      name: "Classic Gel Manicure",
      description: "Gel manicure with color of your choice.",
      price_cents: 9000,
      duration_minutes: 60,
      position: 1,
      is_active: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
      global_type_id: 4,
    },
    {
      id: 5,
      company_id: 2,
      category_id: 3,
      name: "Express Manicure",
      description: "Quick manicure, no gel.",
      price_cents: 6000,
      duration_minutes: 30,
      position: 2,
      is_active: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
      global_type_id: 4,
    },
    {
      id: 6,
      company_id: 2,
      category_id: 4,
      name: "Spa Pedicure",
      description: "Relaxing pedicure with foot massage.",
      price_cents: 10000,
      duration_minutes: 60,
      position: 1,
      is_active: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
      global_type_id: 5,
    },
  ];

  const hours = [
    // Company 1
    ...[1, 2, 3, 4, 5, 6].map((dow, idx) => ({
      id: idx + 1,
      company_id: 1,
      day_of_week: dow,
      open_time: "09:00",
      close_time: "19:00",
      is_closed: false,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    })),
    {
      id: 7,
      company_id: 1,
      day_of_week: 7,
      open_time: null,
      close_time: null,
      is_closed: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
    // Company 2
    ...[1, 2, 3, 4, 5].map((dow, idx) => ({
      id: 8 + idx,
      company_id: 2,
      day_of_week: dow,
      open_time: "10:00",
      close_time: "18:00",
      is_closed: false,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    })),
    {
      id: 13,
      company_id: 2,
      day_of_week: 6,
      open_time: "10:00",
      close_time: "14:00",
      is_closed: false,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
    {
      id: 14,
      company_id: 2,
      day_of_week: 7,
      open_time: null,
      close_time: null,
      is_closed: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
  ];

  await prisma.category.createMany({ data: categories, skipDuplicates: true });
  await prisma.service.createMany({ data: services, skipDuplicates: true });
  await prisma.hours.createMany({ data: hours, skipDuplicates: true });

  /**
   * 8) DISCOUNT CODES
   */
  const discountCodes: Prisma.DiscountCodeCreateManyInput[] = [
    {
      id: 1,
      company_id: 1,
      code: "WELCOME10",
      description: "10% off first haircut.",
      type: "PERCENT",
      value: "10.00",
      active_from: new Date("2025-01-01T00:00:00.000Z"),
      active_until: null,
      max_uses: 100,
      used_count: 0,
      is_active: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
    {
      id: 2,
      company_id: 2,
      code: "GLOW15",
      description: "15 Bs off gel manicure.",
      type: "FIXED",
      value: "15.00",
      active_from: new Date("2025-01-01T00:00:00.000Z"),
      active_until: null,
      max_uses: null,
      used_count: 0,
      is_active: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
  ];

  await prisma.discountCode.createMany({ data: discountCodes, skipDuplicates: true });

  /**
   * 9) STAFF SERVICES
   */
  const staffServices = [
    {
      id: 1,
      company_id: 1,
      staff_id: 1,
      service_id: 1,
      price_cents_override: 8500,
      duration_minutes_override: 45,
      is_active: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
    {
      id: 2,
      company_id: 1,
      staff_id: 1,
      service_id: 2,
      price_cents_override: null,
      duration_minutes_override: null,
      is_active: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
    {
      id: 3,
      company_id: 1,
      staff_id: 2,
      service_id: 3,
      price_cents_override: 5500,
      duration_minutes_override: 30,
      is_active: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
    {
      id: 4,
      company_id: 2,
      staff_id: 3,
      service_id: 4,
      price_cents_override: 9500,
      duration_minutes_override: 60,
      is_active: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
    {
      id: 5,
      company_id: 2,
      staff_id: 3,
      service_id: 5,
      price_cents_override: null,
      duration_minutes_override: null,
      is_active: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
    {
      id: 6,
      company_id: 2,
      staff_id: 4,
      service_id: 6,
      price_cents_override: 10500,
      duration_minutes_override: 60,
      is_active: true,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
  ];

  await prisma.staffService.createMany({ data: staffServices, skipDuplicates: true });

  /**
   * 10) BOOKINGS
   */
  const bookings: Prisma.BookingCreateManyInput[] = [
    {
      id: 1,
      company_id: 1,
      staff_id: 1,
      customer_id: 1,
      client_name: "Juan Pérez",
      client_email: "juan@example.com",
      client_phone_prefix: "591",
      client_phone_number: "70000004",
      booking_type: "CUSTOMER",
      start_at: new Date("2025-01-10T14:00:00.000Z"),
      end_at: new Date("2025-01-10T15:15:00.000Z"),
      status: "CONFIRMED",
      payment_method: "QR",
      payment_status: "PENDING_CONFIRMATION",
      qr_proof_image_url: "https://cdn.example.com/fade-factory/payments/booking-1.png",
      total_price_cents: 13000,
      notes: "Skin fade + beard shape. First time customer.",
      created_by_user_id: "user_barber_owner",
      updated_by_user_id: "user_barber_owner",
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
    {
      id: 2,
      company_id: 1,
      staff_id: 2,
      customer_id: null,
      client_name: null,
      client_email: null,
      client_phone_prefix: null,
      client_phone_number: null,
      booking_type: "BLOCK",
      start_at: new Date("2025-01-10T15:00:00.000Z"),
      end_at: new Date("2025-01-10T15:30:00.000Z"),
      status: "CONFIRMED",
      payment_method: "NONE",
      payment_status: "UNPAID",
      qr_proof_image_url: null,
      total_price_cents: 0,
      notes: "Coffee break.",
      created_by_user_id: "user_barber_owner",
      updated_by_user_id: "user_barber_owner",
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
    {
      id: 3,
      company_id: 2,
      staff_id: 3,
      customer_id: 2,
      client_name: "Laura Martínez",
      client_email: "laura@example.com",
      client_phone_prefix: "591",
      client_phone_number: "70000008",
      booking_type: "CUSTOMER",
      start_at: new Date("2025-01-11T13:00:00.000Z"),
      end_at: new Date("2025-01-11T14:00:00.000Z"),
      status: "CONFIRMED",
      payment_method: "CASH",
      payment_status: "UNPAID",
      qr_proof_image_url: null,
      total_price_cents: 9000,
      notes: "Classic gel manicure, nude color.",
      created_by_user_id: "user_nails_admin",
      updated_by_user_id: "user_nails_admin",
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
      deleted_at: null,
    },
  ];

  await prisma.booking.createMany({ data: bookings, skipDuplicates: true });

  /**
   * 11) BOOKING SERVICES
   */
  const bookingServices = [
    {
      id: 1,
      booking_id: 1,
      company_id: 1,
      service_id: 1,
      service_name_snapshot: "Skin Fade Cut",
      price_cents_snapshot: 8000,
      duration_minutes_snapshot: 45,
      position: 1,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
    {
      id: 2,
      booking_id: 1,
      company_id: 1,
      service_id: 3,
      service_name_snapshot: "Beard Shape & Trim",
      price_cents_snapshot: 5000,
      duration_minutes_snapshot: 30,
      position: 2,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
    {
      id: 3,
      booking_id: 3,
      company_id: 2,
      service_id: 4,
      service_name_snapshot: "Classic Gel Manicure",
      price_cents_snapshot: 9000,
      duration_minutes_snapshot: 60,
      position: 1,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
  ];

  await prisma.bookingService.createMany({ data: bookingServices, skipDuplicates: true });

  /**
   * 12) BOOKING DISCOUNTS
   */
  const bookingDiscounts = [
    {
      id: 1,
      booking_id: 1,
      discount_code_id: 1,
      company_id: 1,
      discount_amount_cents: 1300,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
  ];

  await prisma.bookingDiscount.createMany({ data: bookingDiscounts, skipDuplicates: true });

  /**
   * 13) CONFIG MESSAGES
   */
  const configMessages = [
    {
      id: 1,
      company_id: 1,
      name: "Booking confirmation subject",
      key: "BOOKING_CONFIRMATION_SUBJECT",
      value: "Tu turno en Fade Factory está confirmado",
      description: "Subject line used for customer confirmation emails.",
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
    {
      id: 2,
      company_id: 2,
      name: "Booking confirmation subject",
      key: "BOOKING_CONFIRMATION_SUBJECT",
      value: "Tu cita en Glow Nails está confirmada",
      description: "Subject line for Glow Nails confirmation emails.",
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
  ];

  await prisma.configMessage.createMany({ data: configMessages, skipDuplicates: true });

  /**
   * 14) REVIEWS
   */
  // Mark bookings 1 and 3 as COMPLETED so reviews are consistent
  await prisma.booking.updateMany({
    where: { id: { in: [1, 3] } },
    data: { status: "COMPLETED" },
  });

  const reviews = [
    {
      id: 1,
      company_id: 1,
      user_id: "user_barber_customer",
      service_id: 1,
      staff_id: 1,
      booking_id: 1,
      rating: 5,
      comment: "Excelente corte, súper prolijo y puntual.",
      rating_service_quality: 5,
      rating_staff_attention: 5,
      rating_punctuality: 5,
      rating_cleanliness: 4,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
    {
      id: 2,
      company_id: 2,
      user_id: "user_nails_customer",
      service_id: 4,
      staff_id: 3,
      booking_id: 3,
      rating: 4,
      comment: "Las uñas quedaron increíbles, un poco de espera al llegar.",
      rating_service_quality: 5,
      rating_staff_attention: 4,
      rating_punctuality: 3,
      rating_cleanliness: 5,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
  ];

  await prisma.review.createMany({ data: reviews, skipDuplicates: true });

  /**
   * 15) SESSIONS
   */
  const sessions = [
    {
      id: "session_barber_owner",
      expiresAt: new Date("2025-02-01T00:00:00.000Z"),
      token: "session-token-barber-owner",
      ipAddress: "192.168.0.10",
      userAgent: "Chrome",
      userId: "user_barber_owner",
      createdAt: baseCreatedAt,
      updatedAt: baseUpdatedAt,
    },
  ];

  await prisma.session.createMany({ data: sessions, skipDuplicates: true });

  /**
   * 16) ACCOUNTS WITH HASHED PASSWORDS (CREDENTIALS PROVIDER)
   * Passwords listed below in the "login details" section.
   */

  const rawAccounts = [
    {
      id: "account_super_admin",
      accountId: "superadmin@example.com",
      providerId: "credentials",
      userId: "user_super_admin",
      plainPassword: "SuperAdmin123!",
    },
    {
      id: "account_barber_owner",
      accountId: "diego@fadefactory.bo",
      providerId: "credentials",
      userId: "user_barber_owner",
      plainPassword: "Owner123!",
    },
    {
      id: "account_nails_admin",
      accountId: "ana@glownails.bo",
      providerId: "credentials",
      userId: "user_nails_admin",
      plainPassword: "Admin123!",
    },
    {
      id: "account_barber_staff",
      accountId: "carlos@fadefactory.bo",
      providerId: "credentials",
      userId: "user_barber_staff_1",
      plainPassword: "Staff123!",
    },
    {
      id: "account_barber_customer",
      accountId: "juan@example.com",
      providerId: "credentials",
      userId: "user_barber_customer",
      plainPassword: "Customer123!",
    },
  ];

  for (const acc of rawAccounts) {
    const hashed = await bcrypt.hash(acc.plainPassword, 10);
    await prisma.account.upsert({
      where: { id: acc.id },
      update: {
        accountId: acc.accountId,
        providerId: acc.providerId,
        userId: acc.userId,
        password: hashed,
      },
      create: {
        id: acc.id,
        accountId: acc.accountId,
        providerId: acc.providerId,
        userId: acc.userId,
        accessToken: null,
        refreshToken: null,
        idToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scope: null,
        password: hashed,
        createdAt: baseCreatedAt,
        updatedAt: baseUpdatedAt,
      },
    });
  }

  /**
   * 17) VERIFICATION CODES / VERIFICATIONS
   */
  const verificationCodes: Prisma.VerificationCodeCreateManyInput[] = [
    {
      id: 1,
      channel: "EMAIL",
      purpose: "CUSTOMER_SIGNUP",
      identifier: "laura@example.com",
      code_hash: "hashed-code-123456",
      attempts: 0,
      max_attempts: 5,
      expires_at: new Date("2025-01-01T13:00:00.000Z"),
      consumed_at: null,
      created_at: baseCreatedAt,
      updated_at: baseUpdatedAt,
    },
  ];

  const verifications = [
    {
      id: "verification_example",
      identifier: "laura@example.com",
      value: "123456",
      expiresAt: new Date("2025-01-01T13:00:00.000Z"),
      createdAt: baseCreatedAt,
      updatedAt: baseUpdatedAt,
    },
  ];

  await prisma.verificationCode.createMany({ data: verificationCodes, skipDuplicates: true });
  await prisma.verification.createMany({ data: verifications, skipDuplicates: true });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
