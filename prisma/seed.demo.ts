import {
    BillingCycle,
    BookingSource,
    BookingStatus,
    BookingType,
    ClassPricingMode,
    CompanyProductSubscriptionStatus,
    CompanyUserRole,
    CommerceFulfillmentStatus,
    CommerceFulfillmentType,
    CommercePaymentMethod,
    CommercePaymentStatus,
    CommerceProductType,
    GroupBookingStatus,
    GroupItemStatus,
    CheckInMethod,
    FreeEventRegistrationStatus,
    Gender,
    PaymentMethod,
    PaymentStatus,
    RestaurantDepositMode,
    RestaurantDepositPaymentMethod,
    RestaurantDepositStatus,
    RestaurantReservationSource,
    RestaurantReservationStatus,
    RestaurantShiftCloseoutStatus,
    RestaurantShiftMemberRole,
    RestaurantShiftStatus,
    RestaurantTableOperationalStatus,
    RestaurantVisitPaymentMethod,
    RestaurantVisitStatus,
    RestaurantWaitlistSource,
    RestaurantWaitlistStatus,
    ShopPlan,
} from '@prisma/client';
import { DEMO_OPERATOR_EMAIL, DEMO_PROFILES } from '../src/config/demo-profiles';
import { PRODUCT_CATALOG_SEED, PRODUCT_TIER_CAPABILITY_SEED, PRODUCT_TIER_SEED } from '../src/config/product-entitlements';
import { assertDemoOperatorMayJoinCompany, assertDemoOperatorMembershipsAreDemo } from '../src/services/demo-operator-membership.service';
import { prisma } from '../src/prisma/client';

const farFuture = new Date('2099-12-31T23:59:59.000Z');
const fixtureNote = 'demo-fixture:seed:v1';

const customers = [
    'Lucía Fernández', 'Camila Rojas', 'Valentina Vargas', 'Daniela Flores', 'Sofía Gutiérrez',
    'Mariana Salvatierra', 'Paula Méndez', 'Andrea Quiroga', 'Carolina Mercado', 'Gabriela Suárez',
    'Natalia Rivero', 'Isabel Céspedes', 'Fernanda Arce', 'Mónica Aguilar', 'Renata Molina',
    'Jimena Velasco', 'Claudia Soria', 'Alejandra Daza', 'Pilar Rocha', 'Victoria Peña',
];
const staffNames = ['María Fernanda Ríos', 'Valeria Suárez', 'Andrea Molina', 'Daniela Paz', 'Lucía Mercado'];

const serviceRows = [
    ['Cabello', 'corte-mujer', 'Corte y brushing', 18000, 60],
    ['Cabello', 'coloracion-raiz', 'Coloración de raíz', 32000, 90],
    ['Cabello', 'balayage', 'Balayage luminoso', 95000, 210],
    ['Cabello', 'tratamiento-hidratante', 'Tratamiento hidratante', 42000, 75],
    ['Cabello', 'peinado-evento', 'Peinado para evento', 38000, 75],
    ['Uñas', 'manicure-clasica', 'Manicure clásica', 15000, 45],
    ['Uñas', 'manicure-gel', 'Manicure en gel', 26000, 70],
    ['Uñas', 'pedicure-spa', 'Pedicure spa', 30000, 70],
    ['Uñas', 'nail-art', 'Diseño de uñas', 35000, 90],
    ['Piel', 'limpieza-facial', 'Limpieza facial profunda', 48000, 80],
    ['Piel', 'hidratacion-facial', 'Hidratación facial', 42000, 60],
    ['Piel', 'masaje-relajante', 'Masaje relajante', 65000, 75],
    ['Cejas y pestañas', 'diseno-cejas', 'Diseño y perfilado de cejas', 18000, 35],
    ['Cejas y pestañas', 'lifting-pestanas', 'Lifting de pestañas', 45000, 70],
    ['Cejas y pestañas', 'laminado-cejas', 'Laminado de cejas', 32000, 50],
    ['Bienestar', 'masaje-piedras', 'Masaje con piedras calientes', 78000, 90],
    ['Bienestar', 'ritual-aromaterapia', 'Ritual de aromaterapia', 72000, 90],
    ['Bienestar', 'consulta-piel', 'Consulta de cuidado de piel', 25000, 30],
] as const;

function dateFromNow(days: number, hour = 14) {
    const value = new Date();
    value.setUTCDate(value.getUTCDate() + days);
    value.setUTCHours(hour, 0, 0, 0);
    return value;
}

function nameParts(name: string) {
    const [first_name, ...rest] = name.split(' ');
    return { first_name, last_name: rest.join(' ') };
}

async function ensureUser(email: string, name: string) {
    const parts = nameParts(name);
    return prisma.user.upsert({
        where: { email },
        update: { name, ...parts, is_active: true, is_super_admin: false, deleted_at: null },
        create: { email, name, ...parts, is_active: true, is_super_admin: false, emailVerified: false },
        select: { id: true, email: true },
    });
}

async function seedCatalog() {
    for (const product of PRODUCT_CATALOG_SEED) {
        await prisma.productCatalog.upsert({ where: { code: product.code }, update: product, create: product });
    }
    for (const tier of PRODUCT_TIER_SEED) {
        const product = await prisma.productCatalog.findUniqueOrThrow({ where: { code: tier.productCode }, select: { id: true } });
        const tierData = {
            code: tier.code,
            name: tier.name,
            description: tier.description,
            tierLevel: tier.tierLevel,
            isBase: tier.isBase,
            isPro: tier.isPro,
            isActive: tier.isActive,
            sortOrder: tier.sortOrder,
        };
        await prisma.productTier.upsert({
            where: { code: tier.code },
            update: { ...tierData, productId: product.id },
            create: { ...tierData, productId: product.id },
        });
    }
    const tiers = await prisma.productTier.findMany({ select: { id: true, code: true } });
    const tierIds = new Map(tiers.map((tier) => [tier.code, tier.id]));
    await prisma.productTierCapability.createMany({
        data: PRODUCT_TIER_CAPABILITY_SEED.map((entry) => ({
            productTierId: tierIds.get(entry.productTierCode)!,
            capability: entry.capability,
        })),
        skipDuplicates: true,
    });
}

async function seedCompany(profile: (typeof DEMO_PROFILES)[keyof typeof DEMO_PROFILES], operatorId: string) {
    const companyType = await prisma.companyType.upsert({
        where: { key: profile.companyTypeKey },
        update: { name: profile.companyName, is_active: true },
        create: { key: profile.companyTypeKey, name: profile.companyName, description: 'Tenant de demostración de PriConPri.' },
    });
    const colors: Record<string, string> = {
        reservas: '#9b4778', restaurante: '#a44831', eventos: '#5746a6', clases: '#37746b', tienda: '#56804d', completo: '#315f82',
    };
    const company = await prisma.company.upsert({
        where: { slug: profile.companySlug },
        update: {
            name: profile.companyName, email: `${profile.companySlug}@demo.priconpri.invalid`, phone: '00000000',
            phone_prefix: '591', timezone: 'America/La_Paz', currency: 'BOB', company_type_id: companyType.id,
            is_active: true, deleted_at: null, availableUntil: farFuture, isMarketplaceVisible: false,
            restaurant_enabled: profile.enabledProducts.includes('RESTAURANTE'),
        },
        create: {
            slug: profile.companySlug, name: profile.companyName,
            address: 'Zona Sur, La Paz, Bolivia', phone_prefix: '591', phone: '00000000',
            email: `${profile.companySlug}@demo.priconpri.invalid`, timezone: 'America/La_Paz', currency: 'BOB',
            city: 'La Paz', state: 'La Paz', country_code: 'BO', is_active: true, plan: ShopPlan.BUSINESS,
            availableUntil: farFuture, isMarketplaceVisible: false, company_type_id: companyType.id,
            restaurant_enabled: profile.enabledProducts.includes('RESTAURANTE'),
            about_us_text: `${profile.companyName} es un negocio de demostración creado para explorar la plataforma PriConPri.`,
        },
        select: { id: true, slug: true },
    });

    await assertDemoOperatorMayJoinCompany(prisma, operatorId, company.id);
    await prisma.companyUser.upsert({
        where: { company_id_user_id_role: { company_id: company.id, user_id: operatorId, role: CompanyUserRole.OWNER } },
        update: { deleted_at: null, is_primary_contact: true },
        create: { company_id: company.id, user_id: operatorId, role: CompanyUserRole.OWNER, is_primary_contact: true },
    });
    await prisma.themeConfig.upsert({
        where: { company_id: company.id },
        update: { brand_color: colors[profile.key] },
        create: { company_id: company.id, brand_color: colors[profile.key], page_background_color: '#f8f6f3' },
    });
    await prisma.companySettings.upsert({
        where: { company_id: company.id },
        update: { send_email_notifications: false, send_whatsapp_notifications: false },
        create: { company_id: company.id, send_email_notifications: false, send_whatsapp_notifications: false, staff_label: 'Equipo' },
    });
    await prisma.configMessage.upsert({
        where: { company_id_key: { company_id: company.id, key: 'default_language' } },
        update: { value: 'es' },
        create: { company_id: company.id, name: 'Idioma predeterminado', key: 'default_language', value: 'es' },
    });

    const catalog = new Map((await prisma.productCatalog.findMany()).map((product) => [product.code, product]));
    const tierRows = await prisma.productTier.findMany({ include: { product: true } });
    const tierByCode = new Map(tierRows.map((tier) => [tier.code, tier]));
    const enabled = profile.productTiers.map((code) => {
        const tier = tierByCode.get(code as (typeof PRODUCT_TIER_SEED)[number]['code']);
        if (!tier) throw new Error(`Missing product tier ${code}`);
        return tier;
    });
    await prisma.companyProductSubscription.deleteMany({ where: { companyId: company.id } });
    await prisma.companyProductSubscription.createMany({
        data: enabled.map((tier) => ({
            companyId: company.id, productId: tier.productId, productTierId: tier.id,
            status: CompanyProductSubscriptionStatus.ACTIVE, billingCycle: BillingCycle.MONTHLY,
            currency: 'BOB', startsAt: new Date('2025-01-01T00:00:00.000Z'), availableUntil: farFuture,
        })),
        skipDuplicates: true,
    });
    void catalog;
    return company;
}

async function seedCustomers(companyId: number, slug: string) {
    const result = [];
    for (const [index, fullName] of customers.entries()) {
        const user = await ensureUser(`demo.customer.${slug}.${index + 1}@demo.priconpri.invalid`, fullName);
        const profile = await prisma.customerProfile.upsert({
            where: { company_id_user_id: { company_id: companyId, user_id: user.id } },
            update: { notes: index % 3 === 0 ? 'Visita con frecuencia y prefiere coordinar con anticipación.' : null },
            create: {
                company_id: companyId, user_id: user.id,
                notes: index % 3 === 0 ? 'Visita con frecuencia y prefiere coordinar con anticipación.' : null,
            },
        });
        result.push({ user, profile, fullName });
    }
    return result;
}

async function seedReservations(companyId: number, slug: string, operatorId: string, customerRows: Awaited<ReturnType<typeof seedCustomers>>) {
    const categoryNames = [...new Set(serviceRows.map(([category]) => category))];
    const categories = new Map<string, number>();
    for (const [index, name] of categoryNames.entries()) {
        const slugged = name.toLowerCase().replace(/\s+/g, '-');
        const category = await prisma.category.upsert({
            where: { company_id_slug: { company_id: companyId, slug: slugged } },
            update: { name, position: index },
            create: { company_id: companyId, name, slug: slugged, position: index },
        });
        categories.set(name, category.id);
    }
    const services = [];
    for (const [index, [categoryName, serviceSlug, name, price, duration]] of serviceRows.entries()) {
        const existing = await prisma.service.findFirst({ where: { company_id: companyId, name }, select: { id: true } });
        const data = {
            company_id: companyId, name, description: `${name} en un espacio tranquilo y personalizado.`,
            price_cents: price, duration_minutes: duration, position: index, category_id: categories.get(categoryName)!,
            is_active: true, notify_customer: false, notify_assigned_staff: false, notify_management: false,
        };
        const service = existing
            ? await prisma.service.update({ where: { id: existing.id }, data })
            : await prisma.service.create({ data: { ...data, is_invite_only: false } });
        services.push({ ...service, seedSlug: serviceSlug });
    }

    const staff = [];
    for (const [index, displayName] of staffNames.entries()) {
        const user = await ensureUser(`demo.staff.${slug}.${index + 1}@demo.priconpri.invalid`, displayName);
        const profile = await prisma.staffProfile.upsert({
            where: { company_id_user_id: { company_id: companyId, user_id: user.id } },
            update: { display_name: displayName, bio: 'Profesional con experiencia y atención personalizada.', is_bookable: true, deleted_at: null },
            create: { company_id: companyId, user_id: user.id, display_name: displayName, bio: 'Profesional con experiencia y atención personalizada.', is_bookable: true },
        });
        staff.push(profile);
    }

    for (const member of staff) {
        for (const service of services) {
            await prisma.staffService.upsert({
                where: { company_id_staff_id_service_id: { company_id: companyId, staff_id: member.id, service_id: service.id } },
                update: { is_active: true },
                create: { company_id: companyId, staff_id: member.id, service_id: service.id },
            });
        }
    }
    await prisma.hours.deleteMany({ where: { company_id: companyId } });
    await prisma.hours.createMany({ data: Array.from({ length: 7 }, (_, day_of_week) => ({
        company_id: companyId, day_of_week, open_time: day_of_week === 0 ? null : '09:00',
        close_time: day_of_week === 0 ? null : '19:00', is_closed: day_of_week === 0,
    })) });
    await prisma.staffAvailability.deleteMany({ where: { company_id: companyId } });
    await prisma.staffAvailability.createMany({ data: staff.flatMap((member) => [1, 2, 3, 4, 5, 6].map((day_of_week) => ({
        company_id: companyId, staff_id: member.id, day_of_week, start_time: '09:00', end_time: '18:30', is_active: true,
    }))) });

    const oldBookings = await prisma.booking.findMany({ where: { company_id: companyId, notes: fixtureNote }, select: { id: true } });
    const oldBookingIds = oldBookings.map((booking) => booking.id);
    if (oldBookingIds.length) {
        await prisma.review.deleteMany({ where: { booking_id: { in: oldBookingIds } } });
        await prisma.bookingService.deleteMany({ where: { booking_id: { in: oldBookingIds } } });
        await prisma.bookingAuditLog.deleteMany({ where: { booking_id: { in: oldBookingIds } } });
        await prisma.bookingNotificationAttempt.deleteMany({ where: { booking_id: { in: oldBookingIds } } });
        await prisma.booking.deleteMany({ where: { id: { in: oldBookingIds } } });
    }

    const seededBookings = [];
    for (let index = 0; index < 54; index += 1) {
        const past = index < 48;
        const customer = customerRows[index % customerRows.length]!;
        const service = services[(index * 7) % services.length]!;
        const member = staff[index % staff.length]!;
        const startAt = past ? dateFromNow(-(index * 6 + 1), 14 + (index % 4)) : dateFromNow(index - 47, 15 + (index % 3));
        const status = past
            ? index % 13 === 0 ? BookingStatus.CANCELLED : index % 17 === 0 ? BookingStatus.NO_SHOW : index % 9 === 0 ? BookingStatus.PENDING : BookingStatus.COMPLETED
            : index % 2 === 0 ? BookingStatus.CONFIRMED : BookingStatus.PENDING;
        const booking = await prisma.booking.create({
            data: {
                company_id: companyId, staff_id: member.id, customer_id: customer.profile.id,
                booking_type: BookingType.CUSTOMER, booking_source: BookingSource.SALON_SITE,
                start_at: startAt, end_at: new Date(startAt.getTime() + service.duration_minutes * 60_000),
                status, payment_method: status === BookingStatus.COMPLETED ? PaymentMethod.CASH : PaymentMethod.NONE,
                payment_status: status === BookingStatus.COMPLETED ? PaymentStatus.PAID : PaymentStatus.UNPAID,
                total_price_cents: service.price_cents, notes: fixtureNote, created_by_user_id: operatorId,
            },
        });
        await prisma.bookingService.create({ data: {
            booking_id: booking.id, company_id: companyId, service_id: service.id,
            service_name_snapshot: service.name, price_cents_snapshot: service.price_cents,
            duration_minutes_snapshot: service.duration_minutes, position: 0,
        } });
        if (status === BookingStatus.COMPLETED && index % 4 === 0) {
            await prisma.review.create({ data: {
                company_id: companyId, user_id: customer.user.id, service_id: service.id,
                booking_id: booking.id, staff_id: member.id, rating: 4 + (index % 2),
                comment: ['Excelente atención y un resultado precioso.', 'Muy buena experiencia; volveré pronto.', 'El equipo cuidó cada detalle.'][index % 3],
                created_at: new Date(startAt.getTime() + 2 * 60 * 60 * 1000),
            } });
        }
        seededBookings.push(booking);
    }
    return { services, staff, bookings: seededBookings };
}

async function seedRestaurant(companyId: number, profileKey: keyof typeof DEMO_PROFILES, customersForCompany: Awaited<ReturnType<typeof seedCustomers>>) {
    await prisma.restaurantSettings.upsert({
        where: { company_id: companyId },
        update: { auto_confirm_reservations: false, require_email: false, deposit_enabled: true, deposit_amount_cents: 5000 },
        create: { company_id: companyId, auto_confirm_reservations: false, require_email: false, deposit_enabled: true, deposit_amount_cents: 5000 },
    });
    const areas = [];
    for (const name of ['Salón principal', 'Patio interior']) {
        const area = await prisma.restaurantDiningArea.upsert({
            where: { company_id_name: { company_id: companyId, name } },
            update: { is_active: true },
            create: { company_id: companyId, name, is_active: true },
        });
        areas.push(area);
    }
    const tables = [];
    for (const [areaIndex, area] of areas.entries()) {
        for (let index = 1; index <= 5; index += 1) {
            tables.push(await prisma.restaurantTable.upsert({
                where: { dining_area_id_name: { dining_area_id: area.id, name: `Mesa ${areaIndex + 1}${index}` } },
                update: { maximum_seats: index % 2 ? 4 : 6, is_active: true },
                create: { company_id: companyId, dining_area_id: area.id, name: `Mesa ${areaIndex + 1}${index}`, maximum_seats: index % 2 ? 4 : 6 },
            }));
        }
    }
    // Remove tagged shifts first because their service-period FK is restrictive.
    await prisma.restaurantShift.deleteMany({ where: { company_id: companyId, notes: fixtureNote } });
    await prisma.restaurantServicePeriod.deleteMany({ where: { company_id: companyId } });
    await prisma.restaurantServicePeriod.createMany({ data: [1, 2, 3, 4, 5, 6].flatMap((day_of_week) => [
        { company_id: companyId, day_of_week, name: 'Almuerzo', start_time: '12:00', end_time: '15:00' },
        { company_id: companyId, day_of_week, name: 'Cena', start_time: '18:30', end_time: '22:30' },
    ]) });

    const periods = await prisma.restaurantServicePeriod.findMany({
        where: { company_id: companyId },
        orderBy: [{ day_of_week: 'asc' }, { start_time: 'asc' }],
    });
    const operator = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_OPERATOR_EMAIL }, select: { id: true } });
    const waiters = await Promise.all([0, 1, 2].map((index) => ensureUser(
        `demo.restaurant.staff.${companyId}.${index + 1}@demo.priconpri.invalid`,
        ['Mateo Salas', 'Daniela Arias', 'Tomás Paredes'][index]!,
    )));

    // Child membership, assignments, closeouts, and notes cascade with these shifts.
    const shifts = [];
    for (const [index, dayOffset] of [-1, 0, 1].entries()) {
        const shiftDate = dateFromNow(dayOffset, 0);
        const startAt = dateFromNow(dayOffset, index === 1 ? 18 : 12);
        const endAt = dateFromNow(dayOffset, index === 1 ? 23 : 16);
        const status = index === 0 ? RestaurantShiftStatus.CLOSED : index === 1 ? RestaurantShiftStatus.OPEN : RestaurantShiftStatus.DRAFT;
        const period = periods.find((entry) => entry.day_of_week === shiftDate.getUTCDay() && entry.name === (index === 1 ? 'Cena' : 'Almuerzo'));
        const shift = await prisma.restaurantShift.create({
            data: {
                company_id: companyId,
                name: index === 0 ? 'Almuerzo · turno cerrado' : index === 1 ? 'Cena · turno en curso' : 'Almuerzo · próximo turno',
                shift_date: shiftDate,
                start_at: startAt,
                end_at: endAt,
                timezone: 'America/La_Paz',
                status,
                service_period_id: period?.id,
                notes: fixtureNote,
                created_by_user_id: operator.id,
                shift_manager_user_id: waiters[0]!.id,
                ...(status === RestaurantShiftStatus.OPEN ? { opened_at: startAt, opened_by_user_id: operator.id } : {}),
                ...(status === RestaurantShiftStatus.CLOSED ? { opened_at: startAt, opened_by_user_id: operator.id, closed_at: endAt, closed_by_user_id: operator.id } : {}),
            },
        });
        shifts.push(shift);
        const manager = await prisma.restaurantShiftMember.create({
            data: { company_id: companyId, shift_id: shift.id, user_id: waiters[0]!.id, role: RestaurantShiftMemberRole.MANAGER, created_by_user_id: operator.id },
        });
        const server = await prisma.restaurantShiftMember.create({
            data: { company_id: companyId, shift_id: shift.id, user_id: waiters[(index % 2) + 1]!.id, role: RestaurantShiftMemberRole.WAITER, created_by_user_id: operator.id },
        });
        await prisma.restaurantShiftDiningArea.createMany({ data: areas.map((area) => ({ company_id: companyId, shift_id: shift.id, dining_area_id: area.id })) });
        await prisma.restaurantShiftTableAssignment.createMany({ data: tables.slice(index, index + 4).map((table, tableIndex) => ({
            company_id: companyId, shift_id: shift.id, table_id: table.id,
            member_id: tableIndex % 2 === 0 ? server.id : manager.id, assigned_by_user_id: operator.id,
        })) });
        if (status === RestaurantShiftStatus.CLOSED) {
            await prisma.restaurantShiftCloseout.create({
                data: {
                    company_id: companyId, shift_id: shift.id, status: RestaurantShiftCloseoutStatus.CLOSED,
                    closed_by_user_id: operator.id, closed_at: endAt,
                    manager_notes: 'Cierre de demostración, sin conciliación bancaria real.',
                    reservations_summary: { completed: 6, cancelled: 1 },
                    waitlist_summary: { seated: 2, cancelled: 0 },
                    revenue_summary: { currency: 'BOB', totalPaidAmountCents: 184500 },
                    tip_summary: { amountCents: 12500 },
                },
            });
        }
    }

    const patioMenu = [
        ['Para compartir', 'Empanadas de queso', 'Masa dorada, queso criollo y llajua suave.', 3200],
        ['Para compartir', 'Humintas al horno', 'Maíz tierno, queso y albahaca.', 2800],
        ['Principales', 'Silpancho de la casa', 'Res apanada, arroz, papa, huevo y salsa criolla.', 6200],
        ['Principales', 'Trucha del lago', 'Trucha a la plancha con papas nativas y hierbas.', 8800],
        ['Principales', 'Lomo saltado', 'Lomo, vegetales salteados y arroz.', 7600],
        ['Principales', 'Ravioles de zapallo', 'Ravioles artesanales con mantequilla de salvia.', 5900],
        ['Postres', 'Tarta de chocolate', 'Chocolate amargo y crema de vainilla.', 2600],
        ['Postres', 'Cheesecake de tumbo', 'Queso suave con coulis de tumbo.', 2900],
        ['Bebidas', 'Limonada de hierbabuena', 'Limón, hierbabuena fresca y agua filtrada.', 1800],
        ['Bebidas', 'Mocochinchi de la casa', 'Durazno deshidratado, canela y clavo.', 1600],
    ] as const;
    const clubMenu = [
        ['Para compartir', 'Hummus de tarwi', 'Tarwi cremoso, vegetales de estación y tostadas de masa madre.', 3600],
        ['Para compartir', 'Tabla de quesos andinos', 'Quesos artesanales, frutas y miel de altura.', 6400],
        ['Principales', 'Bowl de quinoa andina', 'Quinoa, verduras asadas, palta y vinagreta cítrica.', 5200],
        ['Principales', 'Trucha a las hierbas', 'Trucha del lago con ensalada fresca y papa nativa.', 7900],
        ['Principales', 'Pollo grillado del club', 'Pollo de campo, arroz integral y vegetales.', 6500],
        ['Principales', 'Pasta de temporada', 'Pasta fresca con vegetales y hierbas del jardín.', 6100],
        ['Postres', 'Tarta de cacao', 'Cacao boliviano con crema suave de vainilla.', 3200],
        ['Postres', 'Fruta fresca con yogur', 'Fruta de estación, yogur natural y granola.', 2600],
        ['Bebidas', 'Jugo verde del día', 'Manzana, pepino, limón y hierbabuena.', 2400],
        ['Bebidas', 'Infusión de muña y cedrón', 'Infusión andina servida caliente o fría.', 1800],
    ] as const;
    const menu = profileKey === 'completo' ? clubMenu : patioMenu;
    const items = [];
    for (const [index, [categoryName, name, description, price]] of menu.entries()) {
        const category = await prisma.restaurantMenuCategory.upsert({
            where: { company_id_name: { company_id: companyId, name: categoryName } },
            update: { sort_order: ['Para compartir', 'Principales', 'Postres', 'Bebidas'].indexOf(categoryName) },
            create: { company_id: companyId, name: categoryName, sort_order: ['Para compartir', 'Principales', 'Postres', 'Bebidas'].indexOf(categoryName) },
        });
        const existing = await prisma.restaurantMenuItem.findFirst({ where: { company_id: companyId, category_id: category.id, name }, select: { id: true } });
        const data = { company_id: companyId, category_id: category.id, name, description, price: (price / 100).toFixed(2), is_active: true, is_available: true, is_featured: index === 2 || index === 3, sort_order: index };
        items.push(existing
            ? await prisma.restaurantMenuItem.update({ where: { id: existing.id }, data })
            : await prisma.restaurantMenuItem.create({ data }));
    }

    for (let index = 0; index < 16; index += 1) {
        const customer = customersForCompany[index % customersForCompany.length]!;
        const past = index < 8;
        const date = past ? dateFromNow(-(index * 9 + 2), 17) : dateFromNow(index + 1, 17);
        const status = past ? (index % 4 === 0 ? RestaurantReservationStatus.CANCELLED : RestaurantReservationStatus.COMPLETED) : index % 4 === 0 ? RestaurantReservationStatus.PENDING : RestaurantReservationStatus.CONFIRMED;
        const reservation = await prisma.restaurantReservation.upsert({
            where: { reservation_code: `DEMO-${companyId}-${String(index + 1).padStart(3, '0')}` },
            update: {
                status, party_size: 2 + (index % 5), customer_profile_id: customer.profile.id,
                table_id: tables[index % tables.length]!.id, preferred_dining_area_id: areas[index % areas.length]!.id,
                reservation_date: new Date(date.toISOString().slice(0, 10)), start_time: date,
                end_time: new Date(date.getTime() + 90 * 60_000), customer_name: customer.fullName,
                customer_phone: '0000000000', customer_email: customer.user.email,
                deposit_amount_cents: 5000, source: RestaurantReservationSource.ONLINE,
                completed_at: status === RestaurantReservationStatus.COMPLETED ? new Date(date.getTime() + 90 * 60_000) : null,
                cancelled_at: status === RestaurantReservationStatus.CANCELLED ? date : null,
            },
            create: {
                company_id: companyId, customer_profile_id: customer.profile.id, table_id: tables[index % tables.length]!.id,
                preferred_dining_area_id: areas[index % areas.length]!.id,
                reservation_code: `DEMO-${companyId}-${String(index + 1).padStart(3, '0')}`,
                reservation_date: new Date(date.toISOString().slice(0, 10)), start_time: date,
                end_time: new Date(date.getTime() + 90 * 60_000), party_size: 2 + (index % 5),
                customer_name: customer.fullName, customer_phone: '0000000000', customer_email: customer.user.email,
                deposit_amount_cents: 5000, status, source: RestaurantReservationSource.ONLINE,
                completed_at: status === RestaurantReservationStatus.COMPLETED ? new Date(date.getTime() + 90 * 60_000) : null,
                cancelled_at: status === RestaurantReservationStatus.CANCELLED ? date : null,
            },
        });
        if (status === RestaurantReservationStatus.COMPLETED) {
            await prisma.restaurantVisit.upsert({
                where: { reservation_id: reservation.id },
                update: {
                    company_id: companyId, shift_id: shifts[0]!.id, table_id: reservation.table_id,
                    guest_count: reservation.party_size, subtotal_amount_cents: 20000 + index * 1200,
                    tip_amount_cents: 2000, total_paid_amount_cents: 22000 + index * 1500,
                    payment_method: RestaurantVisitPaymentMethod.CASH, status: RestaurantVisitStatus.CLOSED,
                    closed_at: new Date(date.getTime() + 2 * 60 * 60_000),
                },
                create: {
                    company_id: companyId, reservation_id: reservation.id, shift_id: shifts[0]!.id, table_id: reservation.table_id,
                    guest_count: reservation.party_size, subtotal_amount_cents: 20000 + index * 1200,
                    tip_amount_cents: 2000, total_paid_amount_cents: 22000 + index * 1500, currency: 'BOB',
                    payment_method: RestaurantVisitPaymentMethod.CASH, status: RestaurantVisitStatus.CLOSED,
                    closed_at: new Date(date.getTime() + 2 * 60 * 60_000),
                },
            });
        }
        if (index % 3 !== 1) {
            const depositStatus = status === RestaurantReservationStatus.COMPLETED
                ? RestaurantDepositStatus.APPROVED
                : status === RestaurantReservationStatus.CANCELLED
                    ? RestaurantDepositStatus.REFUNDED
                    : index % 2 === 0 ? RestaurantDepositStatus.PENDING : RestaurantDepositStatus.REQUIRED;
            await prisma.restaurantReservationDeposit.upsert({
                where: { reservation_id: reservation.id },
                update: {
                    company_id: companyId, required_amount_cents: 5000, currency: 'BOB',
                    mode: RestaurantDepositMode.PER_TABLE, status: depositStatus,
                    payment_method: depositStatus === RestaurantDepositStatus.APPROVED ? RestaurantDepositPaymentMethod.QR : null,
                    approved_at: depositStatus === RestaurantDepositStatus.APPROVED ? new Date(date.getTime() + 60 * 60_000) : null,
                    refunded_amount_cents: depositStatus === RestaurantDepositStatus.REFUNDED ? 5000 : 0,
                    refunded_at: depositStatus === RestaurantDepositStatus.REFUNDED ? new Date(date.getTime() + 2 * 60 * 60_000) : null,
                    payment_deadline: new Date(date.getTime() - 30 * 60_000),
                },
                create: {
                    company_id: companyId, reservation_id: reservation.id, required_amount_cents: 5000,
                    currency: 'BOB', mode: RestaurantDepositMode.PER_TABLE, status: depositStatus,
                    payment_method: depositStatus === RestaurantDepositStatus.APPROVED ? RestaurantDepositPaymentMethod.QR : null,
                    approved_at: depositStatus === RestaurantDepositStatus.APPROVED ? new Date(date.getTime() + 60 * 60_000) : null,
                    refunded_amount_cents: depositStatus === RestaurantDepositStatus.REFUNDED ? 5000 : 0,
                    refunded_at: depositStatus === RestaurantDepositStatus.REFUNDED ? new Date(date.getTime() + 2 * 60 * 60_000) : null,
                    payment_deadline: new Date(date.getTime() - 30 * 60_000),
                },
            });
        }
    }

    for (const [index, customer] of customersForCompany.slice(0, 12).entries()) {
        const customerReservations = await prisma.restaurantReservation.findMany({
            where: { company_id: companyId, customer_profile_id: customer.profile.id },
            select: { status: true, party_size: true, reservation_date: true, deposit_amount_cents: true },
        });
        const completed = customerReservations.filter((reservation) => reservation.status === RestaurantReservationStatus.COMPLETED);
        const lastVisit = completed.sort((a, b) => b.reservation_date.getTime() - a.reservation_date.getTime())[0];
        await prisma.restaurantCustomerProfile.upsert({
            where: { customer_profile_id: customer.profile.id },
            update: {
                vip: index < 3, vip_level: index === 0 ? 'Oro' : index < 3 ? 'Plata' : null,
                preferred_dining_area_id: areas[index % areas.length]!.id,
                preferred_table_id: tables[index % tables.length]!.id,
                dietary_preferences: ['Vegetariana', 'Sin gluten', 'Sin restricciones'][index % 3],
                allergies: index === 1 ? 'Sin frutos secos' : null,
                favorite_items: ['Silpancho de la casa', 'Cheesecake de tumbo'],
                customer_facing_notes: index < 3 ? 'Agradecemos tu preferencia; te esperamos pronto.' : null,
                internal_hospitality_notes: 'Perfil ficticio de demostración. No contactar.',
                tags: index < 3 ? ['habitual', 'preferente'] : ['cliente'],
                last_visit_at: lastVisit?.reservation_date ?? null,
                visit_count: completed.length,
                cancellation_count: customerReservations.filter((reservation) => reservation.status === RestaurantReservationStatus.CANCELLED).length,
                total_spend_cents: completed.reduce((total, reservation) => total + reservation.deposit_amount_cents + 20000, 0),
                average_spend_cents: completed.length ? Math.round(completed.reduce((total) => total + 22000, 0) / completed.length) : 0,
                average_party_size: completed.length ? completed.reduce((total, reservation) => total + reservation.party_size, 0) / completed.length : 0,
            },
            create: {
                company_id: companyId, customer_profile_id: customer.profile.id,
                vip: index < 3, vip_level: index === 0 ? 'Oro' : index < 3 ? 'Plata' : null,
                preferred_dining_area_id: areas[index % areas.length]!.id,
                preferred_table_id: tables[index % tables.length]!.id,
                dietary_preferences: ['Vegetariana', 'Sin gluten', 'Sin restricciones'][index % 3],
                allergies: index === 1 ? 'Sin frutos secos' : null,
                favorite_items: ['Silpancho de la casa', 'Cheesecake de tumbo'],
                customer_facing_notes: index < 3 ? 'Agradecemos tu preferencia; te esperamos pronto.' : null,
                internal_hospitality_notes: 'Perfil ficticio de demostración. No contactar.',
                tags: index < 3 ? ['habitual', 'preferente'] : ['cliente'],
                last_visit_at: lastVisit?.reservation_date ?? null,
                visit_count: completed.length,
                cancellation_count: customerReservations.filter((reservation) => reservation.status === RestaurantReservationStatus.CANCELLED).length,
                total_spend_cents: completed.reduce((total, reservation) => total + reservation.deposit_amount_cents + 20000, 0),
                average_spend_cents: completed.length ? Math.round(completed.reduce((total) => total + 22000, 0) / completed.length) : 0,
                average_party_size: completed.length ? completed.reduce((total, reservation) => total + reservation.party_size, 0) / completed.length : 0,
            },
        });
    }

    await prisma.restaurantWaitlist.deleteMany({ where: { company_id: companyId, internal_notes: fixtureNote } });
    for (const [index, customer] of customersForCompany.slice(12, 16).entries()) {
        const arrivalTime = dateFromNow(-index, 19);
        const status = [RestaurantWaitlistStatus.WAITING, RestaurantWaitlistStatus.NOTIFIED, RestaurantWaitlistStatus.SEATED, RestaurantWaitlistStatus.CANCELLED][index]!;
        const waitlist = await prisma.restaurantWaitlist.create({
            data: {
                company_id: companyId,
                guest_name: customer.fullName,
                phone: '0000000000',
                email: customer.user.email,
                customer_profile_id: customer.profile.id,
                party_size: 2 + index,
                preferred_dining_area_id: areas[index % areas.length]!.id,
                arrival_time: arrivalTime,
                estimated_wait_minutes: 20 + index * 5,
                status,
                source: RestaurantWaitlistSource.WALK_IN,
                priority: index === 0 ? 1 : 0,
                manual_order: index + 1,
                internal_notes: fixtureNote,
                created_by_user_id: operator.id,
                ...(status === RestaurantWaitlistStatus.NOTIFIED ? { notified_at: arrivalTime } : {}),
                ...(status === RestaurantWaitlistStatus.SEATED ? { seated_at: arrivalTime, assigned_table_id: tables[index]!.id } : {}),
                ...(status === RestaurantWaitlistStatus.CANCELLED ? { cancelled_at: arrivalTime } : {}),
            },
        });
        await prisma.restaurantWaitlistEvent.create({
            data: { company_id: companyId, waitlist_id: waitlist.id, event: 'ADDED', to_status: RestaurantWaitlistStatus.WAITING, actor_user_id: operator.id },
        });
    }

    // A restaurant table map is easier to read with a current operational state.
    for (const [index, table] of tables.entries()) {
        const operationalStatus = index === 0 ? RestaurantTableOperationalStatus.SEATED
            : index === 1 ? RestaurantTableOperationalStatus.RESERVED_SOON
                : index === 2 ? RestaurantTableOperationalStatus.CLEANING
                    : RestaurantTableOperationalStatus.AVAILABLE;
        await prisma.restaurantTableOperationalState.upsert({
            where: { table_id: table.id },
            update: {
                company_id: companyId, status: operationalStatus,
                occupied_at: operationalStatus === RestaurantTableOperationalStatus.SEATED ? dateFromNow(0, 19) : null,
                cleaning_started_at: operationalStatus === RestaurantTableOperationalStatus.CLEANING ? dateFromNow(0, 18) : null,
                updated_by_user_id: operator.id,
            },
            create: {
                company_id: companyId, table_id: table.id, status: operationalStatus,
                occupied_at: operationalStatus === RestaurantTableOperationalStatus.SEATED ? dateFromNow(0, 19) : null,
                cleaning_started_at: operationalStatus === RestaurantTableOperationalStatus.CLEANING ? dateFromNow(0, 18) : null,
                updated_by_user_id: operator.id,
            },
        });
    }
    return { items, tables };
}

async function ensureDemoOfferingCategory(companyId: number) {
    return prisma.category.upsert({
        where: { company_id_slug: { company_id: companyId, slug: 'actividades' } },
        update: { name: 'Actividades', is_active: true, deleted_at: null },
        create: { company_id: companyId, name: 'Actividades', slug: 'actividades' },
    });
}

async function seedEvents(companyId: number, slug: string, profileKey: keyof typeof DEMO_PROFILES, operatorId: string, customerRows: Awaited<ReturnType<typeof seedCustomers>>) {
    const category = await ensureDemoOfferingCategory(companyId);
    const districtEvents = [
        { slug: 'cata-de-temporada', title: 'Cata de temporada', description: 'Una tarde para descubrir vinos bolivianos y maridajes locales.', days: 12, free: false, price: 12500, capacity: 36 },
        { slug: 'noche-de-jazz', title: 'Noche de jazz en el patio', description: 'Música en vivo y una mesa compartida al caer la tarde.', days: 24, free: true, price: 0, capacity: 48 },
        { slug: 'taller-de-cafe', title: 'Taller de café de altura', description: 'Métodos de filtrado con productores invitados.', days: 8, free: false, price: 8500, capacity: 18 },
        { slug: 'mercado-creativo', title: 'Mercado creativo', description: 'Encuentro de diseño local, cerámica y cocina.', days: -38, free: true, price: 0, capacity: 80 },
        { slug: 'cena-con-productores', title: 'Cena con productores', description: 'Menú especial de cinco tiempos con ingredientes del altiplano.', days: 19, free: false, price: 22000, capacity: 12 },
    ] as const;
    const clubEvents = [
        { slug: 'cata-de-temporada', title: 'Cata de vinos de altura', description: 'Vinos regionales, maridajes ligeros y conversación en el salón del club.', days: 12, free: false, price: 12500, capacity: 36 },
        { slug: 'noche-de-jazz', title: 'Música en vivo en la terraza', description: 'Una velada musical para socios y amistades del club.', days: 24, free: true, price: 0, capacity: 48 },
        { slug: 'taller-de-cafe', title: 'Café de especialidad: métodos y origen', description: 'Taller práctico con una tostadora local invitada.', days: 8, free: false, price: 8500, capacity: 18 },
        { slug: 'mercado-creativo', title: 'Feria de diseño y bienestar', description: 'Marcas locales, movimiento y cocina de temporada en el jardín.', days: -38, free: true, price: 0, capacity: 80 },
        { slug: 'cena-con-productores', title: 'Mesa de temporada del club', description: 'Cena de cinco tiempos con productores y cocineros de la región.', days: 19, free: false, price: 22000, capacity: 12 },
    ] as const;
    const definitions = profileKey === 'completo' ? clubEvents : districtEvents;
    const events = [];
    for (const [index, definition] of definitions.entries()) {
        const start = dateFromNow(definition.days, 22);
        const coverImage = profileKey === 'completo'
            ? '/assets/priconpri/negocios%20cards/wellness.webp'
            : `/assets/priconpri/featured%20section/${(index % 4) + 1}.webp`;
        const event = await prisma.groupEvent.upsert({
            where: { company_id_slug: { company_id: companyId, slug: definition.slug } },
            update: { category_id: category.id, title: definition.title, description: definition.description, cover_image_url: coverImage, thumbnail_url: coverImage, capacity_visible: true, status: GroupItemStatus.PUBLISHED, is_free: definition.free, price_cents: definition.price, max_capacity: definition.capacity, start_at: start, end_at: new Date(start.getTime() + 3 * 60 * 60_000), location_text: profileKey === 'completo' ? 'Club Horizonte, La Paz' : 'Patio central, La Paz' },
            create: { company_id: companyId, category_id: category.id, title: definition.title, slug: definition.slug, description: definition.description, cover_image_url: coverImage, thumbnail_url: coverImage, capacity_visible: true, status: GroupItemStatus.PUBLISHED, is_free: definition.free, price_cents: definition.price, max_capacity: definition.capacity, start_at: start, end_at: new Date(start.getTime() + 3 * 60 * 60_000), location_text: profileKey === 'completo' ? 'Club Horizonte, La Paz' : 'Patio central, La Paz', created_by_user_id: operatorId },
        });
        events.push(event);
        const oldBookings = await prisma.groupEventBooking.findMany({
            where: { company_id: companyId, group_event_id: event.id, notes: fixtureNote },
            select: { id: true },
        });
        const oldBookingIds = oldBookings.map((booking) => booking.id);
        if (oldBookingIds.length) {
            await prisma.groupSessionAttendance.deleteMany({ where: { event_booking_id: { in: oldBookingIds } } });
            await prisma.groupTicket.deleteMany({ where: { group_event_booking_id: { in: oldBookingIds } } });
            await prisma.groupEventBooking.deleteMany({ where: { id: { in: oldBookingIds } } });
        }

        const bookingCount = [17, 12, 9, 14, 6][index]!;
        for (let attendeeIndex = 0; attendeeIndex < bookingCount; attendeeIndex += 1) {
            const customer = customerRows[attendeeIndex % customerRows.length]!;
            const status = index === 1 && attendeeIndex % 6 === 0 ? GroupBookingStatus.PENDING : GroupBookingStatus.CONFIRMED;
            const bookedSpots = index === 3 ? 1 : index === 1 ? 1 : 2;
            const bookingData = {
                company_id: companyId, group_event_id: event.id, customer_profile_id: customer.profile.id,
                user_id: customer.user.id, status, booked_spots: bookedSpots,
                payment_method: definition.free ? PaymentMethod.NONE : PaymentMethod.CASH,
                payment_status: definition.free ? PaymentStatus.PAID : status === GroupBookingStatus.CONFIRMED ? PaymentStatus.PAID : PaymentStatus.UNPAID,
                total_price_cents: definition.free ? 0 : definition.price * bookedSpots,
                extra_attendees_json: bookedSpots > 1 ? [{
                    full_name: `${customer.fullName.split(' ')[0]} · acompañante`,
                    email: customer.user.email,
                    phone: '0000000000',
                }] : undefined,
                notes: fixtureNote,
            };
            const saved = await prisma.groupEventBooking.create({ data: bookingData });
            if (status === GroupBookingStatus.CONFIRMED) {
                for (let seat = 1; seat <= bookedSpots; seat += 1) {
                    const extra = seat > 1 ? customer.fullName.split(' ')[0] + ' · acompañante' : null;
                    const code = `DEMO-${slug}-EV${index + 1}-T${attendeeIndex + 1}-S${seat}`.toUpperCase();
                    await prisma.groupTicket.upsert({
                        where: { ticket_code: code },
                        update: {
                            group_event_booking_id: saved.id, seat_number: seat,
                            holder_name: extra ?? customer.fullName, holder_email: customer.user.email,
                            holder_phone: '0000000000', status: index === 3 ? 'USED' : 'ACTIVE', valid_from: start,
                            valid_until: new Date(start.getTime() + 4 * 60 * 60_000),
                            used_at: index === 3 ? new Date(start.getTime() + 20 * 60_000) : null,
                        },
                        create: {
                            company_id: companyId, group_event_booking_id: saved.id, ticket_code: code,
                            seat_number: seat, holder_name: extra ?? customer.fullName,
                            holder_email: customer.user.email, holder_phone: '0000000000',
                            status: index === 3 ? 'USED' : 'ACTIVE', valid_from: start,
                            valid_until: new Date(start.getTime() + 4 * 60 * 60_000),
                            used_at: index === 3 ? new Date(start.getTime() + 20 * 60_000) : null,
                        },
                    });
                }
                if (index === 3) {
                    await prisma.groupSessionAttendance.upsert({
                        where: { group_event_id_user_id: { group_event_id: event.id, user_id: customer.user.id } },
                        update: { checked_in_at: new Date(start.getTime() + 20 * 60_000) },
                        create: { company_id: companyId, group_event_id: event.id, customer_profile_id: customer.profile.id, user_id: customer.user.id, event_booking_id: saved.id, checked_in_at: new Date(start.getTime() + 20 * 60_000) },
                    });
                }
            }
        }

        if (index === 2) {
            for (const customer of customerRows.slice(18, 20)) {
                await prisma.groupEventBooking.create({
                    data: {
                        company_id: companyId, group_event_id: event.id,
                        customer_profile_id: customer.profile.id, user_id: customer.user.id,
                        status: GroupBookingStatus.WAITLISTED, booked_spots: 1,
                        payment_method: PaymentMethod.NONE, payment_status: PaymentStatus.UNPAID,
                        total_price_cents: 0, notes: fixtureNote,
                    },
                });
            }
        }

        if (definition.free) {
            await prisma.freeEventRegistration.deleteMany({ where: { group_event_id: event.id, source: fixtureNote } });
            for (const [guestIndex, customer] of customerRows.slice(14, 19).entries()) {
                const parts = nameParts(customer.fullName);
                const reservationCode = `D${companyId.toString(36).toUpperCase().padStart(3, '0').slice(-3)}${index.toString(36).toUpperCase()}${guestIndex.toString(36).toUpperCase()}`;
                await prisma.freeEventRegistration.create({
                    data: {
                        company_id: companyId, group_event_id: event.id, user_id: customer.user.id,
                        reservation_code: reservationCode, first_name: parts.first_name,
                        last_name: parts.last_name, gender: guestIndex % 2 ? Gender.FEMALE : Gender.PREFER_NOT_TO_SAY,
                        age: 24 + guestIndex, email: customer.user.email, country_code: 'BO',
                        phone_prefix: '591', phone_number: '0000000000',
                        registration_question_answer: guestIndex % 2 ? 'Me interesa conocer a los artistas locales.' : null,
                        tos_accepted: true, source: fixtureNote,
                        status: FreeEventRegistrationStatus.CONFIRMED,
                        checked_in_at: index === 3 ? new Date(start.getTime() + 25 * 60_000) : null,
                        checked_in_method: index === 3 ? CheckInMethod.MANUAL : null,
                    },
                });
            }
        }
    }
    return events;
}

async function seedClasses(companyId: number, slug: string, profileKey: keyof typeof DEMO_PROFILES, customerRows: Awaited<ReturnType<typeof seedCustomers>>) {
    const category = await ensureDemoOfferingCategory(companyId);
    const studioClasses = [
        { slug: 'pilates-reformer', title: 'Pilates reformer', price: 4800, mode: ClassPricingMode.PER_SESSION, time: '08:00', day: 1 },
        { slug: 'yoga-flujo', title: 'Yoga flujo', price: 3500, mode: ClassPricingMode.PER_SESSION, time: '18:30', day: 2 },
        { slug: 'movilidad-y-fuerza', title: 'Movilidad y fuerza', price: 32000, mode: ClassPricingMode.MONTHLY_PASS, time: '07:30', day: 3 },
    ] as const;
    const clubClasses = [
        { slug: 'pilates-reformer', title: 'Yoga restaurativo', price: 4200, mode: ClassPricingMode.PER_SESSION, time: '08:00', day: 1 },
        { slug: 'yoga-flujo', title: 'Pilates y movilidad', price: 4800, mode: ClassPricingMode.PER_SESSION, time: '18:30', day: 2 },
        { slug: 'movilidad-y-fuerza', title: 'Clínica de tenis', price: 36000, mode: ClassPricingMode.MONTHLY_PASS, time: '07:30', day: 3 },
    ] as const;
    const definitions = profileKey === 'completo' ? clubClasses : studioClasses;
    const location = profileKey === 'completo' ? 'Club Horizonte, La Paz' : 'Forma Studio, La Paz';
    const classes = [];
    for (const [classIndex, definition] of definitions.entries()) {
        const now = new Date();
        const classRow = await prisma.groupClass.upsert({
            where: { company_id_slug: { company_id: companyId, slug: definition.slug } },
            update: {
                category_id: category.id,
                title: definition.title,
                description: `${definition.title} con instructores certificados y grupos reducidos.`,
                cover_image_url: profileKey === 'completo'
                    ? '/assets/priconpri/negocios%20cards/wellness.webp'
                    : '/assets/priconpri/negocios%20cards/fitness.webp',
                status: GroupItemStatus.PUBLISHED, price_cents: definition.price, pricing_mode: definition.mode,
                max_capacity_per_session: 14, session_duration_minutes: 55, recurrence_type: 'WEEKLY',
                recurrence_config: { weekday: definition.day }, recurrence_start_date: new Date(now.toISOString().slice(0, 10)),
                start_time: definition.time, location_text: location,
            },
            create: {
                company_id: companyId, category_id: category.id, title: definition.title, slug: definition.slug,
                description: `${definition.title} con instructores certificados y grupos reducidos.`,
                cover_image_url: profileKey === 'completo'
                    ? '/assets/priconpri/negocios%20cards/wellness.webp'
                    : '/assets/priconpri/negocios%20cards/fitness.webp',
                status: GroupItemStatus.PUBLISHED, pricing_mode: definition.mode, price_cents: definition.price,
                max_capacity_per_session: 14, session_duration_minutes: 55, recurrence_type: 'WEEKLY',
                recurrence_config: { weekday: definition.day }, recurrence_start_date: new Date(now.toISOString().slice(0, 10)),
                start_time: definition.time, location_text: location,
            },
        });
        classes.push(classRow);
        const assignment = await prisma.groupStaffAssignment.findFirst({ where: { company_id: companyId, group_class_id: classRow.id } });
        if (assignment) await prisma.groupStaffAssignment.update({ where: { id: assignment.id }, data: { display_name: staffNames[classIndex], role: 'INSTRUCTOR' } });
        else await prisma.groupStaffAssignment.create({ data: { company_id: companyId, group_class_id: classRow.id, display_name: staffNames[classIndex], role: 'INSTRUCTOR' } });

        // The fixture window is relative to today. Replace prior generated
        // sessions so daily reseeds do not accumulate shifted date windows.
        await prisma.groupClassSession.deleteMany({ where: { company_id: companyId, group_class_id: classRow.id } });
        const sessionRows = [];
        for (let week = -8; week <= 9; week += 1) {
            const start = dateFromNow(week * 7 + ((definition.day + 7 - new Date().getUTCDay()) % 7), Number(definition.time.slice(0, 2)) + 12);
            const session = await prisma.groupClassSession.upsert({
                where: { group_class_id_start_at: { group_class_id: classRow.id, start_at: start } },
                update: { company_id: companyId, status: GroupItemStatus.PUBLISHED },
                create: { company_id: companyId, group_class_id: classRow.id, start_at: start, end_at: new Date(start.getTime() + 55 * 60_000), status: GroupItemStatus.PUBLISHED },
            });
            sessionRows.push(session);
        }
        for (let customerIndex = 0; customerIndex < 14; customerIndex += 1) {
            const customer = customerRows[customerIndex]!;
            const existing = await prisma.groupClassEnrollment.findFirst({ where: { group_class_id: classRow.id, user_id: customer.user.id }, select: { id: true } });
            const data = {
                company_id: companyId, group_class_id: classRow.id, customer_profile_id: customer.profile.id,
                user_id: customer.user.id, pricing_mode: definition.mode, price_cents_snapshot: definition.price,
                status: customerIndex === 12 ? GroupBookingStatus.CANCELLED : customerIndex === 11 ? GroupBookingStatus.PENDING : customerIndex === 13 ? GroupBookingStatus.WAITLISTED : GroupBookingStatus.CONFIRMED,
                payment_method: PaymentMethod.CASH, payment_status: customerIndex === 11 ? PaymentStatus.UNPAID : PaymentStatus.PAID,
                valid_from: dateFromNow(-60), valid_until: dateFromNow(60), source: 'PUBLIC_CHECKOUT' as const,
            };
            const enrollment = existing
                ? await prisma.groupClassEnrollment.update({ where: { id: existing.id }, data })
                : await prisma.groupClassEnrollment.create({ data });
            if (customerIndex < 10) {
                const ticketCode = `DEMO-${slug}-CL${classIndex + 1}-U${customerIndex + 1}`.toUpperCase();
                await prisma.groupTicket.upsert({
                    where: { ticket_code: ticketCode },
                    update: {
                        group_class_enrollment_id: enrollment.id, holder_name: customer.fullName,
                        holder_email: customer.user.email, valid_from: dateFromNow(-30), valid_until: dateFromNow(60),
                    },
                    create: { company_id: companyId, group_class_enrollment_id: enrollment.id, ticket_code: ticketCode, holder_name: customer.fullName, holder_email: customer.user.email, valid_from: dateFromNow(-30), valid_until: dateFromNow(60) },
                });
            }
        }
        const confirmed = customerRows.slice(0, 10);
        for (const [sessionIndex, session] of sessionRows.entries()) {
            if (session.start_at.getTime() > Date.now()) continue;
            for (const [customerIndex, customer] of confirmed.entries()) {
                const checkedIn = (sessionIndex + customerIndex) % 5 !== 0;
                await prisma.groupSessionAttendance.upsert({
                    where: { group_class_session_id_user_id: { group_class_session_id: session.id, user_id: customer.user.id } },
                    update: { checked_in_at: checkedIn ? new Date(session.start_at.getTime() + 5 * 60_000) : null },
                    create: { company_id: companyId, group_class_session_id: session.id, customer_profile_id: customer.profile.id, user_id: customer.user.id, checked_in_at: checkedIn ? new Date(session.start_at.getTime() + 5 * 60_000) : null },
                });
            }
        }
    }
    return classes;
}

async function seedStore(companyId: number, profileKey: keyof typeof DEMO_PROFILES, customersForCompany: Awaited<ReturnType<typeof seedCustomers>>) {
    const store = await prisma.commerceStore.upsert({
        where: { company_id: companyId },
        update: { is_active: true, payment_proof_required: false },
        create: { company_id: companyId, is_active: true, fulfillment_mode: 'PICKUP_AND_DELIVERY', allow_cash_payment: true, allow_qr_payment: true, payment_proof_required: false, delivery_cost_mode: 'FIXED', fixed_delivery_cost: '15.00' },
    });
    const clubProducts = [
        ['Ropa deportiva', 'ropa-deportiva', 'Polera técnica liviana', '149.00', 24],
        ['Ropa deportiva', 'hoodie-algodon', 'Hoodie de algodón orgánico', '279.00', 12],
        ['Accesorios', 'botella-termica', 'Botella térmica Horizonte', '89.00', 32],
        ['Accesorios', 'mat-yoga', 'Mat de yoga antideslizante', '195.00', 9],
        ['Cuidado personal', 'aceite-masaje', 'Aceite de masaje de muña', '72.00', 18],
        ['Cuidado personal', 'kit-relajacion', 'Kit de relajación', '165.00', 7],
        ['Ropa deportiva', 'short-training', 'Short training', '119.00', 21],
        ['Accesorios', 'toalla-microfibra', 'Toalla de microfibra', '54.00', 40],
    ] as const;
    const nativaProducts = [
        ['Ropa deportiva', 'ropa-deportiva', 'Polera técnica Nativa', '149.00', 24],
        ['Ropa deportiva', 'hoodie-algodon', 'Hoodie de algodón orgánico', '279.00', 12],
        ['Accesorios', 'botella-termica', 'Botella térmica Nativa', '89.00', 32],
        ['Accesorios', 'mat-yoga', 'Mat de yoga antideslizante', '195.00', 9],
        ['Cuidado personal', 'aceite-masaje', 'Aceite de masaje de muña', '72.00', 18],
        ['Cuidado personal', 'kit-relajacion', 'Kit de autocuidado', '165.00', 7],
        ['Ropa deportiva', 'short-training', 'Short training', '119.00', 21],
        ['Accesorios', 'toalla-microfibra', 'Toalla de microfibra', '54.00', 40],
    ] as const;
    const definitions = profileKey === 'completo' ? clubProducts : nativaProducts;
    const products = [];
    for (const [index, [categoryName, categorySlug, name, price, stock]] of definitions.entries()) {
        const category = await prisma.commerceCategory.upsert({
            where: { company_id_slug: { company_id: companyId, slug: categorySlug } },
            update: { name: categoryName, store_id: store.id, is_active: true },
            create: { company_id: companyId, store_id: store.id, name: categoryName, slug: categorySlug, sort_order: index },
        });
        const productSlug = `${categorySlug}-${index + 1}`;
        products.push(await prisma.commerceProduct.upsert({
            where: { company_id_slug: { company_id: companyId, slug: productSlug } },
            update: { name, price, regular_price: price, stock_quantity: stock, category_id: category.id, store_id: store.id, is_featured: index < 3 },
            create: { company_id: companyId, store_id: store.id, category_id: category.id, name, slug: productSlug, description: `${name}, seleccionado por el equipo.`, price, regular_price: price, stock_quantity: stock, low_stock_threshold: 4, is_featured: index < 3, product_type: CommerceProductType.SIMPLE },
        }));
    }
    const pickupName = profileKey === 'completo' ? 'Recepción Club Horizonte' : 'Punto de retiro Nativa';
    const pickup = await prisma.commercePickupPoint.findFirst({ where: { company_id: companyId, name: pickupName }, select: { id: true } });
    const pickupPoint = pickup
        ? await prisma.commercePickupPoint.update({ where: { id: pickup.id }, data: { store_id: store.id, is_active: true } })
        : await prisma.commercePickupPoint.create({ data: { company_id: companyId, store_id: store.id, name: pickupName, address: 'Av. Los Álamos 145, La Paz', instructions: 'Retira tu pedido en recepción.', is_active: true } });

    for (let index = 0; index < 10; index += 1) {
        const customer = customersForCompany[index % customersForCompany.length]!;
        const product = products[index % products.length]!;
        const orderNumber = `DEMO-${String(index + 1).padStart(4, '0')}`;
        const price = Number(product.price.toString());
        const order = await prisma.commerceOrder.upsert({
            where: { company_id_order_number: { company_id: companyId, order_number: orderNumber } },
            update: { customer_profile_id: customer.profile.id, customer_name: customer.fullName, store_id: store.id, pickup_point_id: pickupPoint.id, items: undefined },
            create: {
                company_id: companyId, store_id: store.id, customer_profile_id: customer.profile.id,
                order_number: orderNumber, public_access_token: `demo-${companyId}-${index + 1}-access-token`,
                customer_name: customer.fullName, customer_phone_prefix: '591', customer_phone: '0000000000', customer_email: customer.user.email,
                fulfillment_type: CommerceFulfillmentType.PICKUP, pickup_point_id: pickupPoint.id,
                subtotal: price, total: price, payment_method: CommercePaymentMethod.CASH,
                payment_status: index < 7 ? CommercePaymentStatus.PAYMENT_CONFIRMED : CommercePaymentStatus.PENDING_REVIEW,
                fulfillment_status: index < 4 ? CommerceFulfillmentStatus.COMPLETED : index < 7 ? CommerceFulfillmentStatus.READY_FOR_PICKUP : CommerceFulfillmentStatus.NEW,
                created_at: dateFromNow(-index * 13, 18), completed_at: index < 4 ? dateFromNow(-index * 13, 20) : null,
            },
        });
        await prisma.commerceOrderItem.deleteMany({ where: { order_id: order.id } });
        await prisma.commerceOrderItem.create({ data: {
            order_id: order.id, product_id: product.id, product_name_snapshot: product.name,
            product_type_snapshot: CommerceProductType.SIMPLE, unit_price_snapshot: price,
            regular_price_snapshot: price, quantity: 1 + (index % 2), total: price * (1 + (index % 2)),
        } });
    }
}

export async function seedDemoProfiles() {
    const existingOperator = await prisma.user.findUnique({ where: { email: DEMO_OPERATOR_EMAIL }, select: { id: true } });
    if (existingOperator) await assertDemoOperatorMembershipsAreDemo();
    await seedCatalog();
    const operator = await ensureUser(DEMO_OPERATOR_EMAIL, 'Equipo de demostración PriConPri');
    await assertDemoOperatorMembershipsAreDemo();
    for (const profile of Object.values(DEMO_PROFILES)) {
        const company = await seedCompany(profile, operator.id);
        const customerRows = await seedCustomers(company.id, profile.companySlug);
        if (profile.enabledProducts.includes('RESERVAS')) await seedReservations(company.id, company.slug, operator.id, customerRows);
        if (profile.enabledProducts.includes('RESTAURANTE')) await seedRestaurant(company.id, profile.key, customerRows);
        if (profile.enabledProducts.includes('EVENTOS')) await seedEvents(company.id, company.slug, profile.key, operator.id, customerRows);
        if (profile.enabledProducts.includes('CLASES')) await seedClasses(company.id, company.slug, profile.key, customerRows);
        if (profile.enabledProducts.includes('STORES')) await seedStore(company.id, profile.key, customerRows);
        console.log(`Seeded ${profile.displayName} → /shop/${profile.companySlug}`);
    }
    await assertDemoOperatorMembershipsAreDemo();
}

if (require.main === module) {
    seedDemoProfiles()
        .catch((error) => { console.error('Demo fixture seeding failed:', error); process.exitCode = 1; })
        .finally(async () => { await prisma.$disconnect(); });
}
