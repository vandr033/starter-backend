import {
    BillingCycle,
    CompanyProductSubscriptionStatus,
    type CompanyType,
} from '@prisma/client';
import { prisma } from '../prisma/client';
import { getAuth } from '../config/auth';
import { canonicalizePhoneParts } from '../utils/phoneNormalization';
import { signInAdmin } from './admin-auth.service';
import {
    isSelectableCoreProduct,
    isSupportedAddOn,
    mapAddOnsToCommercialProducts,
    mapCoreSelectionsToCommercialProducts,
    SELF_SERVICE_DEFAULT_CURRENCY,
    SELF_SERVICE_REDIRECT_PATH,
} from '../config/business-products';
import type { BusinessSignupInput } from '../schemas/business-signup.schema';
import { createCompanyWithDefaults, assignOwnerToCompany } from './company-provisioning.service';
import { syncCompanyProducts } from './super-admin-shops.service';
import { normalizeCommercialConfiguration } from './super-admin-shop-commercial.service';
import {
    calculateTrialEndsAtFromDays,
    getPublicSelectablePricingState,
    sanitizeCoreTierSelections,
} from './business-pricing.service';

function toSlug(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
}

function splitOwnerName(fullName: string) {
    const normalized = fullName.trim().replace(/\s+/g, ' ');
    const [firstName = '', ...rest] = normalized.split(' ');
    const lastName = rest.join(' ').trim();

    return {
        firstName: firstName.trim(),
        lastName: lastName || null,
        displayName: normalized,
    };
}

function buildSpanishSignupError(message: string) {
    return {
        code: 400,
        error: true,
        message,
    };
}

async function getActiveCompanyTypeByKey(key: string): Promise<Pick<CompanyType, 'id' | 'key' | 'name' | 'name_i18n'> | null> {
    return prisma.companyType.findFirst({
        where: {
            key,
            is_active: true,
        },
        select: {
            id: true,
            key: true,
            name: true,
            name_i18n: true,
        },
    });
}

async function createOwnerUser(params: {
    email: string;
    password: string;
    ownerName: string;
    phone: string;
    headers: Record<string, unknown>;
}) {
    const existingUser = await prisma.user.findUnique({
        where: { email: params.email },
        select: { id: true },
    });

    if (existingUser) {
        throw buildSpanishSignupError('Ya existe una cuenta con ese email.');
    }

    const normalizedPhone = canonicalizePhoneParts({
        phoneNumber: params.phone,
        defaultPrefix: '591',
    });

    if (!normalizedPhone.phoneNumber) {
        throw buildSpanishSignupError('Ingresá un teléfono o WhatsApp válido.');
    }

    const existingPhoneUser = await prisma.user.findFirst({
        where: {
            phoneNumber: normalizedPhone.phoneNumber,
            deleted_at: null,
        },
        select: { id: true },
    });

    if (existingPhoneUser) {
        throw buildSpanishSignupError('Ya existe una cuenta con ese teléfono o WhatsApp.');
    }

    const auth = await getAuth();
    const signUpResponse = await auth.api.signUpEmail({
        body: {
            email: params.email,
            password: params.password,
            name: params.ownerName,
        },
        headers: params.headers as any,
        asResponse: true,
    });

    if (!signUpResponse.ok) {
        const payload = await signUpResponse.json().catch(() => null);
        const rawMessage =
            typeof payload?.message === 'string' && payload.message.trim().length > 0
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

    const user = await prisma.user.update({
        where: { id: userId },
        data: {
            first_name: firstName || null,
            last_name: lastName,
            name: displayName,
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

export async function getBusinessSignupOptions() {
    const companyTypes = await prisma.companyType.findMany({
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

export async function signUpBusiness(
    input: BusinessSignupInput,
    headers: Record<string, unknown>,
): Promise<{
    success: true;
    companyId: number;
    slug: string;
    trialEndsAt: string;
    redirectTo: string;
    cookies?: string[];
    activeCompanyId?: number | null;
}> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const normalizedBusinessType = input.businessType.trim();
    const normalizedSlug = toSlug(input.slug?.trim() || input.businessName);

    if (!normalizedSlug) {
        throw buildSpanishSignupError('No pudimos generar un slug válido para tu negocio.');
    }

    const companyType = await getActiveCompanyTypeByKey(normalizedBusinessType);
    if (!companyType) {
        throw buildSpanishSignupError('Elegí un tipo de negocio válido.');
    }

    if (input.coreProducts.some((product) => product === 'TIENDA')) {
        throw buildSpanishSignupError(
            'Tienda todavía no está disponible. Elegí otro producto principal.',
        );
    }

    const invalidCoreProduct = input.coreSelections.find(
        (selection) => !isSelectableCoreProduct(selection.productKey),
    );
    if (invalidCoreProduct) {
        throw buildSpanishSignupError(
            'Solo podés elegir Reservas, Eventos o Clases como productos principales.',
        );
    }

    const invalidAddOn = (input.addOns ?? []).find((addOn) => !isSupportedAddOn(addOn));
    if (invalidAddOn) {
        throw buildSpanishSignupError('Seleccionaste un add-on inválido.');
    }

    const existingCompany = await prisma.company.findFirst({
        where: {
            slug: normalizedSlug,
            deleted_at: null,
        },
        select: { id: true },
    });

    if (existingCompany) {
        throw buildSpanishSignupError('Ese slug ya está en uso. Probá con otro.');
    }

    const pricingState = await getPublicSelectablePricingState();
    const trialEndsAt = calculateTrialEndsAtFromDays(pricingState.trialLengthDays, new Date());
    const ownerSignup = await createOwnerUser({
        email: normalizedEmail,
        password: input.password,
        ownerName: input.ownerName,
        phone: input.phone,
        headers,
    });

    const selectableCoreSelections = sanitizeCoreTierSelections(input.coreSelections);
    const supportedAddOns = (input.addOns ?? []).filter(isSupportedAddOn);

    const invalidInactiveCoreSelection = selectableCoreSelections.find(
        (selection) =>
            !pricingState.selectableCoreProducts.has(selection.productKey) ||
            !pricingState.selectableCoreTiers.get(selection.productKey)?.has(selection.tierKey),
    );

    if (invalidInactiveCoreSelection) {
        const productName =
            pricingState.productsByKey.get(invalidInactiveCoreSelection.productKey)?.displayName ??
            invalidInactiveCoreSelection.productKey;
        throw buildSpanishSignupError(
            `${productName} no está disponible para activarse en este momento.`,
        );
    }

    const invalidInactiveAddOn = supportedAddOns.find(
        (addOn) => !pricingState.selectableAddOns.has(addOn),
    );

    if (invalidInactiveAddOn) {
        const productName =
            pricingState.productsByKey.get(invalidInactiveAddOn)?.displayName ??
            invalidInactiveAddOn;
        throw buildSpanishSignupError(
            `${productName} no está disponible para activarse en este momento.`,
        );
    }

    const activeProducts = [
        ...mapCoreSelectionsToCommercialProducts(selectableCoreSelections, trialEndsAt),
        ...mapAddOnsToCommercialProducts(supportedAddOns, trialEndsAt),
    ];
    const normalizedCommercialConfig = normalizeCommercialConfiguration({
        activeProducts,
        requestedProducts: [],
        companyBillingCycle: BillingCycle.MONTHLY,
        companyPricePaid: null,
        companyCurrency: SELF_SERVICE_DEFAULT_CURRENCY,
        companyAvailableUntil: trialEndsAt,
    });

    let companyId: number;

    try {
        const result = await prisma.$transaction(async (tx) => {

            const company = await createCompanyWithDefaults({
                tx,
                data: {
                    name: input.businessName.trim(),
                    slug: normalizedSlug,
                    phone_prefix: ownerSignup.normalizedPhone.phonePrefix,
                    phone: ownerSignup.normalizedPhone.phoneNumber ?? input.phone.trim(),
                    email: normalizedEmail,
                    timezone: 'America/La_Paz',
                    currency: SELF_SERVICE_DEFAULT_CURRENCY,
                    company_type_id: companyType.id,
                    plan: normalizedCommercialConfig.legacyPlan,
                    billingCycle: BillingCycle.MONTHLY,
                    pricePaid: null,
                    availableUntil: trialEndsAt,
                    isMarketplaceVisible: true,
                },
            });

            const syncedCommercialConfig = await syncCompanyProducts({
                tx,
                companyId: company.id,
                activeProducts,
                requestedProducts: [],
                companyBillingCycle: BillingCycle.MONTHLY,
                companyPricePaid: null,
                companyCurrency: SELF_SERVICE_DEFAULT_CURRENCY,
                companyAvailableUntil: trialEndsAt,
                legacyPlan: company.plan,
                actorUserId: ownerSignup.user.id,
                source: 'SELF_SERVICE_SIGNUP',
                note: 'Negocio creado desde /negocios/crear-cuenta',
                subscriptionStatus: CompanyProductSubscriptionStatus.TRIALING,
            });

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
                    newBillingCycle: BillingCycle.MONTHLY,
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

            await assignOwnerToCompany({
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
    } catch (error) {
        await prisma.user
            .delete({
                where: { id: ownerSignup.user.id },
            })
            .catch(() => undefined);
        throw error;
    }

    const adminSignIn = await signInAdmin(normalizedEmail, input.password, headers);
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
        redirectTo: SELF_SERVICE_REDIRECT_PATH,
        cookies: adminSignIn.cookies,
        activeCompanyId: adminSignIn.data?.activeCompanyId ?? null,
    };
}
