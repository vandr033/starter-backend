"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBusinessSignupOptions = getBusinessSignupOptions;
exports.signUpBusiness = signUpBusiness;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const auth_1 = require("../config/auth");
const phoneNormalization_1 = require("../utils/phoneNormalization");
const admin_auth_service_1 = require("./admin-auth.service");
const business_products_1 = require("../config/business-products");
const company_provisioning_service_1 = require("./company-provisioning.service");
const super_admin_shops_service_1 = require("./super-admin-shops.service");
const super_admin_shop_commercial_service_1 = require("./super-admin-shop-commercial.service");
const business_pricing_service_1 = require("./business-pricing.service");
function toSlug(value) {
    return value
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
}
function splitOwnerName(fullName) {
    const normalized = fullName.trim().replace(/\s+/g, ' ');
    const [firstName = '', ...rest] = normalized.split(' ');
    const lastName = rest.join(' ').trim();
    return {
        firstName: firstName.trim(),
        lastName: lastName || null,
        displayName: normalized,
    };
}
function buildSpanishSignupError(message) {
    return {
        code: 400,
        error: true,
        message,
    };
}
function normalizeCompanyTypeToken(value) {
    return value
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}
function readCompanyTypeTranslations(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return [];
    }
    return Object.values(input)
        .filter((value) => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}
async function getActiveCompanyType(rawInput) {
    const normalizedInput = rawInput.trim();
    if (!normalizedInput) {
        return null;
    }
    const directMatch = await client_2.prisma.companyType.findFirst({
        where: {
            key: normalizedInput,
            is_active: true,
        },
        select: {
            id: true,
            key: true,
            name: true,
            name_i18n: true,
        },
    });
    if (directMatch) {
        return directMatch;
    }
    const activeTypes = await client_2.prisma.companyType.findMany({
        where: { is_active: true },
        select: {
            id: true,
            key: true,
            name: true,
            name_i18n: true,
        },
    });
    const comparableInput = normalizeCompanyTypeToken(normalizedInput);
    const numericId = Number.parseInt(normalizedInput, 10);
    return (activeTypes.find((type) => {
        if (Number.isInteger(numericId) && type.id === numericId) {
            return true;
        }
        const comparableValues = [
            type.key,
            type.name,
            ...readCompanyTypeTranslations(type.name_i18n),
        ].map(normalizeCompanyTypeToken);
        return comparableValues.includes(comparableInput);
    }) ?? null);
}
async function createOwnerUser(params) {
    const existingUser = await client_2.prisma.user.findUnique({
        where: { email: params.email },
        select: { id: true },
    });
    if (existingUser) {
        throw buildSpanishSignupError('Ya existe una cuenta con ese email.');
    }
    const normalizedPhone = (0, phoneNormalization_1.canonicalizePhoneParts)({
        phonePrefix: params.phonePrefix,
        phoneNumber: params.phone,
    });
    if (!normalizedPhone.phoneNumber) {
        throw buildSpanishSignupError('Ingresá un teléfono o WhatsApp válido.');
    }
    const existingPhoneUser = await client_2.prisma.user.findFirst({
        where: {
            phoneNumber: normalizedPhone.phoneNumber,
            deleted_at: null,
        },
        select: { id: true },
    });
    if (existingPhoneUser) {
        throw buildSpanishSignupError('Ya existe una cuenta con ese teléfono o WhatsApp.');
    }
    const auth = await (0, auth_1.getAuth)();
    const signUpResponse = await auth.api.signUpEmail({
        body: {
            email: params.email,
            password: params.password,
            name: params.ownerName,
        },
        headers: params.headers,
        asResponse: true,
    });
    if (!signUpResponse.ok) {
        const payload = await signUpResponse.json().catch(() => null);
        const rawMessage = typeof payload?.message === 'string' && payload.message.trim().length > 0
            ? payload.message
            : 'No pudimos crear tu usuario.';
        if (rawMessage.toLowerCase().includes('user already exists')) {
            throw buildSpanishSignupError('Ya existe una cuenta con ese email.');
        }
        throw buildSpanishSignupError(rawMessage);
    }
    const payload = await signUpResponse.json().catch(() => null);
    const userId = typeof payload?.user?.id === 'string' ? payload.user.id : null;
    if (!userId) {
        throw {
            code: 500,
            error: true,
            message: 'No pudimos terminar la creación de tu usuario.',
        };
    }
    const { firstName, lastName, displayName } = splitOwnerName(params.ownerName);
    const user = await client_2.prisma.user.update({
        where: { id: userId },
        data: {
            first_name: firstName || null,
            last_name: lastName,
            name: displayName,
            ...(params.countryCode?.trim() ? { country_code: params.countryCode.trim().toUpperCase() } : {}),
            phone_prefix: normalizedPhone.phonePrefix,
            phoneNumber: normalizedPhone.phoneNumber,
            emailVerified: true,
            must_change_password: false,
            is_active: true,
        },
        select: {
            id: true,
            email: true,
            name: true,
        },
    });
    return {
        user,
        normalizedPhone,
        ownerNames: { firstName, lastName, displayName },
    };
}
async function getBusinessSignupOptions() {
    const companyTypes = await client_2.prisma.companyType.findMany({
        where: { is_active: true },
        select: {
            id: true,
            key: true,
            name: true,
            name_i18n: true,
        },
        orderBy: [{ name: 'asc' }],
    });
    return {
        success: true,
        companyTypes,
    };
}
async function signUpBusiness(input, headers) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const normalizedBusinessType = input.businessType.trim();
    const normalizedSlug = toSlug(input.slug?.trim() || input.businessName);
    if (!normalizedSlug) {
        throw buildSpanishSignupError('No pudimos generar un slug válido para tu negocio.');
    }
    const companyType = await getActiveCompanyType(normalizedBusinessType);
    if (!companyType) {
        throw buildSpanishSignupError('Elegí un tipo de negocio válido.');
    }
    const invalidCoreProduct = input.coreSelections.find((selection) => !(0, business_products_1.isSelectableCoreProduct)(selection.productKey));
    if (invalidCoreProduct) {
        throw buildSpanishSignupError('Solo podés elegir productos principales válidos para tu negocio.');
    }
    const invalidAddOn = (input.addOns ?? []).find((addOn) => !(0, business_products_1.isSupportedAddOn)(addOn));
    if (invalidAddOn) {
        throw buildSpanishSignupError('Seleccionaste un add-on inválido.');
    }
    const existingCompany = await client_2.prisma.company.findFirst({
        where: {
            slug: normalizedSlug,
            deleted_at: null,
        },
        select: { id: true },
    });
    if (existingCompany) {
        throw buildSpanishSignupError('Ese slug ya está en uso. Probá con otro.');
    }
    const pricingState = await (0, business_pricing_service_1.getPublicSelectablePricingState)();
    const trialEndsAt = (0, business_pricing_service_1.calculateTrialEndsAtFromDays)(pricingState.trialLengthDays, new Date());
    const ownerSignup = await createOwnerUser({
        email: normalizedEmail,
        password: input.password,
        ownerName: input.ownerName,
        phone: input.phone,
        phonePrefix: input.phonePrefix,
        countryCode: input.countryCode,
        headers,
    });
    const selectableCoreSelections = (0, business_pricing_service_1.sanitizeCoreTierSelections)(input.coreSelections);
    const supportedAddOns = (input.addOns ?? []).filter(business_products_1.isSupportedAddOn);
    const invalidInactiveCoreSelection = selectableCoreSelections.find((selection) => !pricingState.selectableCoreProducts.has(selection.productKey) ||
        !pricingState.selectableCoreTiers.get(selection.productKey)?.has(selection.tierKey));
    if (invalidInactiveCoreSelection) {
        const productName = pricingState.productsByKey.get(invalidInactiveCoreSelection.productKey)?.displayName ??
            invalidInactiveCoreSelection.productKey;
        throw buildSpanishSignupError(`${productName} no está disponible para activarse en este momento.`);
    }
    const invalidInactiveAddOn = supportedAddOns.find((addOn) => !pricingState.selectableAddOns.has(addOn));
    if (invalidInactiveAddOn) {
        const productName = pricingState.productsByKey.get(invalidInactiveAddOn)?.displayName ??
            invalidInactiveAddOn;
        throw buildSpanishSignupError(`${productName} no está disponible para activarse en este momento.`);
    }
    const activeProducts = [
        ...(0, business_products_1.mapCoreSelectionsToCommercialProducts)(selectableCoreSelections, trialEndsAt),
        ...(0, business_products_1.mapAddOnsToCommercialProducts)(supportedAddOns, trialEndsAt),
    ];
    const restaurantSelected = selectableCoreSelections.some((selection) => selection.productKey === 'RESTAURANTE');
    const normalizedCommercialConfig = (0, super_admin_shop_commercial_service_1.normalizeCommercialConfiguration)({
        activeProducts,
        requestedProducts: [],
        companyBillingCycle: client_1.BillingCycle.MONTHLY,
        companyPricePaid: null,
        companyCurrency: business_products_1.SELF_SERVICE_DEFAULT_CURRENCY,
        companyAvailableUntil: trialEndsAt,
    });
    let companyId;
    try {
        const result = await client_2.prisma.$transaction(async (tx) => {
            const company = await (0, company_provisioning_service_1.createCompanyWithDefaults)({
                tx,
                data: {
                    name: input.businessName.trim(),
                    slug: normalizedSlug,
                    phone_prefix: ownerSignup.normalizedPhone.phonePrefix,
                    phone: ownerSignup.normalizedPhone.phoneNumber ?? input.phone.trim(),
                    email: normalizedEmail,
                    timezone: 'America/La_Paz',
                    currency: business_products_1.SELF_SERVICE_DEFAULT_CURRENCY,
                    company_type_id: companyType.id,
                    plan: normalizedCommercialConfig.legacyPlan,
                    billingCycle: client_1.BillingCycle.MONTHLY,
                    pricePaid: null,
                    availableUntil: trialEndsAt,
                    isMarketplaceVisible: true,
                },
            });
            const syncedCommercialConfig = await (0, super_admin_shops_service_1.syncCompanyProducts)({
                tx,
                companyId: company.id,
                activeProducts,
                requestedProducts: [],
                companyBillingCycle: client_1.BillingCycle.MONTHLY,
                companyPricePaid: null,
                companyCurrency: business_products_1.SELF_SERVICE_DEFAULT_CURRENCY,
                companyAvailableUntil: trialEndsAt,
                legacyPlan: company.plan,
                actorUserId: ownerSignup.user.id,
                source: 'SELF_SERVICE_SIGNUP',
                note: 'Negocio creado desde /negocios/crear-cuenta',
                subscriptionStatus: client_1.CompanyProductSubscriptionStatus.TRIALING,
            });
            if (restaurantSelected) {
                await tx.company.update({
                    where: { id: company.id },
                    data: { restaurant_enabled: true },
                });
                await tx.restaurantSettings.upsert({
                    where: { company_id: company.id },
                    create: { company_id: company.id },
                    update: {},
                });
            }
            if (syncedCommercialConfig.legacyPlan !== company.plan) {
                await tx.company.update({
                    where: { id: company.id },
                    data: {
                        plan: syncedCommercialConfig.legacyPlan,
                    },
                });
            }
            await tx.companySubscriptionHistory.create({
                data: {
                    companyId: company.id,
                    previousPlan: null,
                    newPlan: syncedCommercialConfig.legacyPlan,
                    previousBillingCycle: null,
                    newBillingCycle: client_1.BillingCycle.MONTHLY,
                    previousPricePaid: null,
                    newPricePaid: null,
                    previousAvailableUntil: null,
                    newAvailableUntil: trialEndsAt,
                    previousMarketplaceVisible: null,
                    newMarketplaceVisible: true,
                    changedByUserId: ownerSignup.user.id,
                    note: `Alta self-service con prueba gratis de ${pricingState.trialLengthDays} días`,
                },
            });
            await (0, company_provisioning_service_1.assignOwnerToCompany)({
                tx,
                companyId: company.id,
                userId: ownerSignup.user.id,
                displayName: ownerSignup.ownerNames.displayName,
                isBookable: false,
            });
            return {
                companyId: company.id,
            };
        });
        companyId = result.companyId;
    }
    catch (error) {
        await client_2.prisma.user
            .delete({
            where: { id: ownerSignup.user.id },
        })
            .catch(() => undefined);
        throw error;
    }
    const adminSignIn = await (0, admin_auth_service_1.signInAdmin)(normalizedEmail, input.password, headers);
    if (adminSignIn.error) {
        throw {
            code: 500,
            error: true,
            message: 'Creamos tu cuenta, pero no pudimos iniciar tu sesión automáticamente.',
        };
    }
    return {
        success: true,
        companyId,
        slug: normalizedSlug,
        trialEndsAt: trialEndsAt.toISOString(),
        redirectTo: business_products_1.SELF_SERVICE_REDIRECT_PATH,
        cookies: adminSignIn.cookies,
        activeCompanyId: adminSignIn.data?.activeCompanyId ?? null,
    };
}
