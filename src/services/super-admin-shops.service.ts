import { prisma } from '../prisma/client';
import { MensajeApi } from '../types/MensajeApi';
import { CompanyUserRole } from '@prisma/client';
import { getAuth } from '../config/auth';
import bcrypt from 'bcryptjs';
import { sendAdminTempPasswordInviteEmail } from '../utils/sendEmail';
import { ensureDefaultStaffAvailabilityFromCompanyHours } from './staff-availability-defaults.service';

const DEFAULT_LANGUAGE_KEY = 'default_language';
const DEFAULT_LANGUAGE_VALUE: 'es' | 'en' = 'es';
const DEFAULT_LANGUAGE_LABEL = 'Default Language';
const DEFAULT_LANGUAGE_DESCRIPTION = 'Default language for customer communications';

/**
 * Generate a URL-friendly slug from a string
 */
function generateSlug(text: string): string {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')        // Replace spaces with -
        .replace(/[^\w\-]+/g, '')    // Remove all non-word chars
        .replace(/\-\-+/g, '-')      // Replace multiple - with single -
        .replace(/^-+/, '')          // Trim - from start of text
        .replace(/-+$/, '');         // Trim - from end of text
}

interface GetAllShopsOptions {
    search?: string;
    page: number;
    limit: number;
}

interface CreateShopData {
    name: string;
    slug?: string;
    address?: string;
    phone_prefix?: string;
    phone: string;
    email?: string;
    city?: string;
    state?: string;
    country_code?: string;
    timezone?: string;
    company_type_id: number;
    owner: {
        email: string;
        password: string;
        first_name?: string;
        last_name?: string;
        phone_prefix?: string;
        phone: string;
        display_name?: string;
        is_bookable?: boolean;
    };
}

interface UpdateShopData {
    name?: string;
    slug?: string;
    address?: string;
    phone_prefix?: string;
    phone?: string;
    email?: string;
    city?: string;
    state?: string;
    country_code?: string;
    timezone?: string;
    company_type_id?: number;
}

interface AddUserToShopData {
    email?: string;
    password?: string;
    phone_prefix?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    role: CompanyUserRole;
    display_name?: string;
    is_bookable?: boolean;
}

/**
 * Get all shops with pagination and search
 */
export async function getAllShops(options: GetAllShopsOptions): Promise<MensajeApi> {
    try {
        const { search, page, limit } = options;
        const skip = (page - 1) * limit;

        const where: any = {
            deleted_at: null
        };

        if (search) {
            where.OR = [
                { name: { contains: search } },
                { slug: { contains: search } }
            ];
        }

        const [shops, total] = await Promise.all([
            prisma.company.findMany({
                where,
                skip,
                take: limit,
                include: {
                    company_type: {
                        select: {
                            id: true,
                            name: true,
                            name_i18n: true
                        }
                    },
                    _count: {
                        select: {
                            company_users: true
                        }
                    }
                },
                orderBy: {
                    created_at: 'desc'
                }
            }),
            prisma.company.count({ where })
        ]);

        const totalPages = Math.ceil(total / limit);

        return {
            code: 200,
            error: false,
            message: 'Shops retrieved successfully',
            data: {
                shops: shops.map(shop => ({
                    id: shop.id,
                    slug: shop.slug,
                    name: shop.name,
                    city: shop.city,
                    is_active: shop.is_active,
                    created_at: shop.created_at,
                    company_type: shop.company_type,
                    user_count: shop._count.company_users
                })),
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages
                }
            }
        };
    } catch (error) {
        console.error('Error getting shops:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to retrieve shops'
        };
    }
}

/**
 * Get a single shop by ID
 */
export async function getShopById(id: number): Promise<MensajeApi> {
    try {
        const shop = await prisma.company.findUnique({
            where: {
                id,
                deleted_at: null
            },
            include: {
                company_type: {
                    select: {
                        id: true,
                        name: true,
                        name_i18n: true,
                        key: true
                    }
                }
            }
        });

        if (!shop) {
            return {
                code: 404,
                error: true,
                message: 'Shop not found'
            };
        }

        return {
            code: 200,
            error: false,
            message: 'Shop retrieved successfully',
            data: {
                id: shop.id,
                slug: shop.slug,
                name: shop.name,
                address: shop.address,
                phone_prefix: shop.phone_prefix,
                phone: shop.phone,
                email: shop.email,
                city: shop.city,
                state: shop.state,
                country_code: shop.country_code,
                timezone: shop.timezone,
                is_active: shop.is_active,
                company_type_id: shop.company_type_id,
                created_at: shop.created_at,
                updated_at: shop.updated_at
            }
        };
    } catch (error) {
        console.error('Error getting shop:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to retrieve shop'
        };
    }
}

/**
 * Create a new shop
 */
export async function createShop(data: CreateShopData): Promise<MensajeApi> {
    try {
        // Generate slug if not provided
        const slug = data.slug || generateSlug(data.name);

        // Check if slug is unique
        const existingShop = await prisma.company.findFirst({
            where: {
                slug,
                deleted_at: null
            }
        });

        if (existingShop) {
            return {
                code: 400,
                error: true,
                message: 'Slug already exists'
            };
        }

        const ownerInput = data.owner;
        const ownerEmail = ownerInput?.email?.trim().toLowerCase() || '';
        const ownerPassword = ownerInput?.password?.trim() || '';
        const ownerPhone = (ownerInput?.phone || '').replace(/\D/g, '');
        const ownerPhonePrefix = (ownerInput?.phone_prefix || '591').replace(/\D/g, '') || '591';

        if (!ownerInput) {
            return {
                code: 400,
                error: true,
                message: 'Owner profile is required when creating a shop'
            };
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!ownerEmail) {
            return {
                code: 400,
                error: true,
                message: 'Owner email is required'
            };
        }
        if (!emailRegex.test(ownerEmail)) {
            return {
                code: 400,
                error: true,
                message: 'Invalid owner email format'
            };
        }
        if (!ownerPassword || ownerPassword.length < 8) {
            return {
                code: 400,
                error: true,
                message: 'Owner password must be at least 8 characters'
            };
        }
        if (!ownerPhone) {
            return {
                code: 400,
                error: true,
                message: 'Owner phone number is required'
            };
        }

        const result = await prisma.$transaction(async (tx) => {
            const shop = await tx.company.create({
                data: {
                    name: data.name,
                    slug,
                    address: data.address,
                    phone_prefix: data.phone_prefix || '591',
                    phone: data.phone,
                    email: data.email,
                    city: data.city,
                    state: data.state,
                    country_code: data.country_code,
                    timezone: data.timezone || 'America/La_Paz',
                    company_type_id: data.company_type_id,
                    // Create default CompanySettings
                    company_settings: {
                        create: {
                            booking_buffer_minutes: 10,
                            booking_time_granularity_minutes: 5,
                            cancel_limit_minutes: 120,
                            reschedule_limit_minutes: 120,
                            allow_qr_payment: true,
                            allow_cash_payment: true,
                            send_email_notifications: true,
                            send_whatsapp_notifications: false
                        }
                    },
                    // Create default ThemeConfig
                    theme_config: {
                        create: {
                            brand_color: '#000000',
                            page_background_color: '#ffffff',
                            page_background_preset: 'light',
                            cards_elevated: true,
                            corner_radius: 'md'
                        }
                    }
                },
                include: {
                    company_type: {
                        select: {
                            id: true,
                            name: true,
                            name_i18n: true
                        }
                    }
                }
            });

            const defaultHours = [];
            for (let day = 0; day < 7; day++) {
                defaultHours.push({
                    company_id: shop.id,
                    day_of_week: day,
                    is_closed: true
                });
            }
            await tx.hours.createMany({
                data: defaultHours
            });

            await tx.configMessage.upsert({
                where: {
                    company_id_key: {
                        company_id: shop.id,
                        key: DEFAULT_LANGUAGE_KEY,
                    },
                },
                update: {
                    value: DEFAULT_LANGUAGE_VALUE,
                    name: DEFAULT_LANGUAGE_LABEL,
                    description: DEFAULT_LANGUAGE_DESCRIPTION,
                },
                create: {
                    company_id: shop.id,
                    key: DEFAULT_LANGUAGE_KEY,
                    value: DEFAULT_LANGUAGE_VALUE,
                    name: DEFAULT_LANGUAGE_LABEL,
                    description: DEFAULT_LANGUAGE_DESCRIPTION,
                },
            });

            let ownerSummary: {
                company_user_id: number;
                user_id: string;
                email: string;
                role: CompanyUserRole;
            } | null = null;

            if (ownerInput) {
                const existingUserByPhone = await tx.user.findFirst({
                    where: {
                        phoneNumber: ownerPhone,
                        deleted_at: null
                    }
                });

                let ownerUser = await tx.user.findFirst({
                    where: {
                        email: ownerEmail,
                        deleted_at: null
                    }
                });

                if (!ownerUser && existingUserByPhone) {
                    return {
                        error: true as const,
                        code: 400,
                        message: 'Owner phone number is already in use by another user'
                    };
                }

                const ownerFirstName = ownerInput.first_name?.trim() || '';
                const ownerLastName = ownerInput.last_name?.trim() || '';
                const ownerNameFromParts = `${ownerFirstName} ${ownerLastName}`.trim();
                const ownerDisplayName =
                    ownerInput.display_name?.trim() ||
                    ownerNameFromParts ||
                    ownerEmail.split('@')[0];

                if (!ownerUser) {
                    ownerUser = await tx.user.create({
                        data: {
                            email: ownerEmail,
                            first_name: ownerFirstName || null,
                            last_name: ownerLastName || null,
                            name: ownerDisplayName,
                            phone_prefix: ownerPhonePrefix,
                            phoneNumber: ownerPhone,
                            is_active: true,
                            emailVerified: true,
                            must_change_password: true
                        }
                    });
                } else {
                    if (ownerPhone && ownerUser.phoneNumber && ownerUser.phoneNumber !== ownerPhone) {
                        return {
                            error: true as const,
                            code: 400,
                            message: 'Owner phone number is already configured on a different account'
                        };
                    }

                    if (existingUserByPhone && existingUserByPhone.id !== ownerUser.id) {
                        return {
                            error: true as const,
                            code: 400,
                            message: 'Owner phone number is already in use by another user'
                        };
                    }

                    ownerUser = await tx.user.update({
                        where: { id: ownerUser.id },
                        data: {
                            ...(ownerFirstName ? { first_name: ownerFirstName } : {}),
                            ...(ownerLastName ? { last_name: ownerLastName } : {}),
                            ...(ownerDisplayName ? { name: ownerDisplayName } : {}),
                            ...(!ownerUser.phoneNumber
                                ? { phoneNumber: ownerPhone, phone_prefix: ownerPhonePrefix }
                                : {})
                        }
                    });
                }

                const hashedOwnerPassword = await bcrypt.hash(ownerPassword, 10);
                const ownerAccounts = await tx.account.findMany({
                    where: {
                        providerId: { in: ['credential', 'credentials'] },
                        accountId: ownerEmail
                    },
                    orderBy: { createdAt: 'asc' }
                });
                const ownerPrimaryAccount =
                    ownerAccounts.find((a) => a.providerId === 'credential') || ownerAccounts[0] || null;

                if (ownerPrimaryAccount) {
                    await tx.account.update({
                        where: { id: ownerPrimaryAccount.id },
                        data: {
                            providerId: 'credential',
                            accountId: ownerEmail,
                            userId: ownerUser.id,
                            password: hashedOwnerPassword
                        }
                    });

                    if (ownerAccounts.length > 1) {
                        await tx.account.deleteMany({
                            where: {
                                providerId: { in: ['credential', 'credentials'] },
                                accountId: ownerEmail,
                                id: { not: ownerPrimaryAccount.id }
                            }
                        });
                    }
                } else {
                    await tx.account.create({
                        data: {
                            providerId: 'credential',
                            accountId: ownerEmail,
                            userId: ownerUser.id,
                            password: hashedOwnerPassword
                        }
                    });
                }

                await tx.user.update({
                    where: { id: ownerUser.id },
                    data: {
                        must_change_password: true,
                    },
                });

                const ownerCompanyUser = await tx.companyUser.upsert({
                    where: {
                        company_id_user_id_role: {
                            company_id: shop.id,
                            user_id: ownerUser.id,
                            role: CompanyUserRole.OWNER
                        }
                    },
                    update: {
                        deleted_at: null,
                        is_primary_contact: true
                    },
                    create: {
                        company_id: shop.id,
                        user_id: ownerUser.id,
                        role: CompanyUserRole.OWNER,
                        is_primary_contact: true
                    }
                });

                const existingOwnerStaffProfile = await tx.staffProfile.findFirst({
                    where: {
                        company_id: shop.id,
                        user_id: ownerUser.id
                    }
                });

                let ownerStaffProfileId: number;

                if (existingOwnerStaffProfile) {
                    const updatedOwnerStaffProfile = await tx.staffProfile.update({
                        where: { id: existingOwnerStaffProfile.id },
                        data: {
                            deleted_at: null,
                            status: 'ACTIVE',
                            display_name: ownerDisplayName,
                            is_bookable: ownerInput.is_bookable ?? false
                        }
                    });
                    ownerStaffProfileId = updatedOwnerStaffProfile.id;
                } else {
                    const createdOwnerStaffProfile = await tx.staffProfile.create({
                        data: {
                            company_id: shop.id,
                            user_id: ownerUser.id,
                            display_name: ownerDisplayName,
                            is_bookable: ownerInput.is_bookable ?? false,
                            status: 'ACTIVE'
                        }
                    });
                    ownerStaffProfileId = createdOwnerStaffProfile.id;
                }

                await ensureDefaultStaffAvailabilityFromCompanyHours({
                    companyId: shop.id,
                    staffId: ownerStaffProfileId,
                    db: tx,
                });

                ownerSummary = {
                    company_user_id: ownerCompanyUser.id,
                    user_id: ownerUser.id,
                    email: ownerUser.email,
                    role: ownerCompanyUser.role
                };
            }

            return {
                error: false as const,
                shop,
                ownerSummary
            };
        });

        if (result.error) {
            return {
                code: result.code,
                error: true,
                message: result.message
            };
        }

        const shop = result.shop;

        const ownerInviteStatus = await sendAdminTempPasswordInviteEmail({
            email: ownerEmail,
            temporaryPassword: ownerPassword,
            companyName: shop.name,
            loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/login`,
        });
        if (ownerInviteStatus !== 1) {
            console.error(`Failed to send owner temp password invite to ${ownerEmail}`);
        }

        return {
            code: 201,
            error: false,
            message:
                ownerInviteStatus === 1
                    ? 'Shop created successfully'
                    : 'Shop created successfully, but invite email could not be sent',
            data: {
                id: shop.id,
                slug: shop.slug,
                name: shop.name,
                address: shop.address,
                phone_prefix: shop.phone_prefix,
                phone: shop.phone,
                email: shop.email,
                city: shop.city,
                state: shop.state,
                country_code: shop.country_code,
                timezone: shop.timezone,
                is_active: shop.is_active,
                company_type_id: shop.company_type_id,
                created_at: shop.created_at,
                updated_at: shop.updated_at,
                company_type: shop.company_type,
                owner: result.ownerSummary || undefined
            }
        };
    } catch (error) {
        console.error('Error creating shop:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to create shop'
        };
    }
}

/**
 * Update an existing shop
 */
export async function updateShop(id: number, data: UpdateShopData): Promise<MensajeApi> {
    try {
        // Check if shop exists
        const existingShop = await prisma.company.findUnique({
            where: {
                id,
                deleted_at: null
            }
        });

        if (!existingShop) {
            return {
                code: 404,
                error: true,
                message: 'Shop not found'
            };
        }

        // If updating slug, check uniqueness
        if (data.slug && data.slug !== existingShop.slug) {
            const slugExists = await prisma.company.findFirst({
                where: {
                    slug: data.slug,
                    deleted_at: null,
                    NOT: {
                        id
                    }
                }
            });

            if (slugExists) {
                return {
                    code: 400,
                    error: true,
                    message: 'Slug already exists'
                };
            }
        }

        // Generate slug if name is being updated and no slug provided
        const updateData: any = { ...data };
        if (data.name && !data.slug) {
            updateData.slug = generateSlug(data.name);
        }

        const shop = await prisma.company.update({
            where: { id },
            data: updateData,
            include: {
                company_type: {
                    select: {
                        id: true,
                        name: true,
                        name_i18n: true
                    }
                }
            }
        });

        return {
            code: 200,
            error: false,
            message: 'Shop updated successfully',
            data: {
                id: shop.id,
                slug: shop.slug,
                name: shop.name,
                address: shop.address,
                phone_prefix: shop.phone_prefix,
                phone: shop.phone,
                email: shop.email,
                city: shop.city,
                state: shop.state,
                country_code: shop.country_code,
                timezone: shop.timezone,
                is_active: shop.is_active,
                company_type_id: shop.company_type_id,
                created_at: shop.created_at,
                updated_at: shop.updated_at,
                company_type: shop.company_type
            }
        };
    } catch (error) {
        console.error('Error updating shop:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to update shop'
        };
    }
}

/**
 * Soft delete a shop
 */
export async function deleteShop(id: number): Promise<MensajeApi> {
    try {
        const shop = await prisma.company.findUnique({
            where: {
                id,
                deleted_at: null
            }
        });

        if (!shop) {
            return {
                code: 404,
                error: true,
                message: 'Shop not found'
            };
        }

        await prisma.company.update({
            where: { id },
            data: {
                deleted_at: new Date()
            }
        });

        return {
            code: 200,
            error: false,
            message: 'Shop deleted successfully'
        };
    } catch (error) {
        console.error('Error deleting shop:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to delete shop'
        };
    }
}

/**
 * Get all users for a specific shop
 */
export async function getShopUsers(shopId: number): Promise<MensajeApi> {
    try {
        const companyUsers = await prisma.companyUser.findMany({
            where: {
                company_id: shopId,
                deleted_at: null
            },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        first_name: true,
                        last_name: true,
                        is_active: true,
                        createdAt: true
                    }
                }
            },
            orderBy: {
                created_at: 'desc'
            }
        });

        // Get staff profiles separately for each user
        const staffProfiles = await prisma.staffProfile.findMany({
            where: {
                company_id: shopId,
                deleted_at: null,
                user_id: {
                    in: companyUsers.map(cu => cu.user_id)
                }
            },
            select: {
                id: true,
                user_id: true,
                display_name: true,
                is_bookable: true
            }
        });

        // Map staff profiles to users
        const staffProfileMap = new Map(
            staffProfiles.map(sp => [sp.user_id, sp])
        );

        return {
            code: 200,
            error: false,
            message: 'Users retrieved successfully',
            data: companyUsers.map(cu => ({
                company_user_id: cu.id,
                role: cu.role,
                user: cu.user,
                staff_profile: staffProfileMap.get(cu.user_id) || null
            }))
        };
    } catch (error) {
        console.error('Error getting shop users:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to retrieve users'
        };
    }
}

/**
 * Add a user to a shop (create new or assign existing)
 */
export async function addUserToShop(shopId: number, data: AddUserToShopData): Promise<MensajeApi> {
    try {
        const normalizedEmail = (data.email || '').trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const cleanPhone = (data.phone || '').replace(/\D/g, '');
        const cleanPhonePrefix = (data.phone_prefix || '591').replace(/\D/g, '') || '591';

        if (!normalizedEmail && !cleanPhone) {
            return {
                code: 400,
                error: true,
                message: 'At least one contact method is required (email or phone)'
            };
        }

        // Admin/staff panel users currently authenticate with email/password.
        if (!normalizedEmail) {
            return {
                code: 400,
                error: true,
                message: 'Email is required for shop users with panel access'
            };
        }

        if (!emailRegex.test(normalizedEmail)) {
            return {
                code: 400,
                error: true,
                message: 'Invalid email format'
            };
        }

        // Check if shop exists
        const shop = await prisma.company.findUnique({
            where: {
                id: shopId,
                deleted_at: null
            }
        });

        if (!shop) {
            return {
                code: 404,
                error: true,
                message: 'Shop not found'
            };
        }

        let user = await prisma.user.findFirst({
            where: {
                email: normalizedEmail,
                deleted_at: null
            }
        });
        const userWithPhone = cleanPhone
            ? await prisma.user.findFirst({
                where: {
                    phoneNumber: cleanPhone,
                    deleted_at: null
                }
            })
            : null;

        if (!user && userWithPhone) {
            return {
                code: 400,
                error: true,
                message: 'Phone number is already in use by another user'
            };
        }

        let tempPasswordForInvite: string | null = null;

        // Create user if doesn't exist
        if (!user) {
            if (!data.password) {
                return {
                    code: 400,
                    error: true,
                    message: 'Password is required for new users'
                };
            }

            const hashedPassword = await bcrypt.hash(data.password, 10);
            tempPasswordForInvite = data.password;

            user = await prisma.user.create({
                data: {
                    email: normalizedEmail,
                    first_name: data.first_name || '',
                    last_name: data.last_name || '',
                    name: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
                    phone_prefix: cleanPhone ? cleanPhonePrefix : undefined,
                    phoneNumber: cleanPhone || undefined,
                    must_change_password: true,
                }
            });

            // Create Account record for Better Auth email/password login
            await prisma.account.create({
                data: {
                    userId: user.id,
                    providerId: 'credential',
                    accountId: normalizedEmail,
                    password: hashedPassword,
                }
            });
        } else if (data.password) {
            const hashedPassword = await bcrypt.hash(data.password, 10);
            tempPasswordForInvite = data.password;

            const existingCredentialAccount = await prisma.account.findFirst({
                where: {
                    userId: user.id,
                    providerId: { in: ['credential', 'credentials'] },
                },
                orderBy: {
                    createdAt: 'asc',
                },
            });

            if (existingCredentialAccount) {
                await prisma.account.update({
                    where: { id: existingCredentialAccount.id },
                    data: {
                        providerId: 'credential',
                        accountId: normalizedEmail,
                        password: hashedPassword,
                    },
                });
            } else {
                await prisma.account.create({
                    data: {
                        userId: user.id,
                        providerId: 'credential',
                        accountId: normalizedEmail,
                        password: hashedPassword,
                    },
                });
            }

            await prisma.user.update({
                where: { id: user.id },
                data: {
                    must_change_password: true,
                },
            });
        } else if (cleanPhone && !user.phoneNumber) {
            if (userWithPhone && userWithPhone.id !== user.id) {
                return {
                    code: 400,
                    error: true,
                    message: 'Phone number is already in use by another user'
                };
            }

            user = await prisma.user.update({
                where: { id: user.id },
                data: {
                    phone_prefix: cleanPhonePrefix,
                    phoneNumber: cleanPhone
                }
            });
        }

        // Check if user is already assigned to this shop
        const existingAssignment = await prisma.companyUser.findFirst({
            where: {
                company_id: shopId,
                user_id: user.id,
                deleted_at: null
            }
        });

        if (existingAssignment) {
            return {
                code: 400,
                error: true,
                message: 'User is already assigned to this shop'
            };
        }

        // Create CompanyUser assignment
        const companyUser = await prisma.companyUser.create({
            data: {
                company_id: shopId,
                user_id: user.id,
                role: data.role
            },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        first_name: true,
                        last_name: true
                    }
                }
            }
        });

        // Create StaffProfile if role is OWNER, ADMIN, or STAFF
        if (['OWNER', 'ADMIN', 'STAFF'].includes(data.role)) {
            const staffProfile = await prisma.staffProfile.create({
                data: {
                    company_id: shopId,
                    user_id: user.id,
                    display_name: data.display_name || user.name,
                    is_bookable: data.is_bookable ?? true
                }
            });

            await ensureDefaultStaffAvailabilityFromCompanyHours({
                companyId: shopId,
                staffId: staffProfile.id,
            });
        }

        if (tempPasswordForInvite) {
            const inviteStatus = await sendAdminTempPasswordInviteEmail({
                email: normalizedEmail,
                temporaryPassword: tempPasswordForInvite,
                companyName: shop.name,
                loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/login`,
            });

            if (inviteStatus !== 1) {
                console.error(`Failed to send temp password invite to ${normalizedEmail}`);
            }
        }

        return {
            code: 201,
            error: false,
            message: 'User added to shop successfully',
            data: {
                company_user_id: companyUser.id,
                role: companyUser.role,
                user_id: user.id,
                user: companyUser.user
            }
        };
    } catch (error) {
        console.error('Error adding user to shop:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to add user to shop'
        };
    }
}

/**
 * Update user role in a shop
 */
export async function updateUserRoleInShop(companyUserId: number, role: CompanyUserRole): Promise<MensajeApi> {
    try {
        const companyUser = await prisma.companyUser.findUnique({
            where: {
                id: companyUserId,
                deleted_at: null
            }
        });

        if (!companyUser) {
            return {
                code: 404,
                error: true,
                message: 'User assignment not found'
            };
        }

        const updated = await prisma.companyUser.update({
            where: { id: companyUserId },
            data: { role }
        });

        return {
            code: 200,
            error: false,
            message: 'User role updated successfully',
            data: {
                company_user_id: updated.id,
                role: updated.role
            }
        };
    } catch (error) {
        console.error('Error updating user role:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to update user role'
        };
    }
}

/**
 * Remove user from a shop
 */
export async function removeUserFromShop(companyUserId: number): Promise<MensajeApi> {
    try {
        const companyUser = await prisma.companyUser.findUnique({
            where: {
                id: companyUserId,
                deleted_at: null
            }
        });

        if (!companyUser) {
            return {
                code: 404,
                error: true,
                message: 'User assignment not found'
            };
        }

        // Check if user has a staff profile
        const staffProfile = await prisma.staffProfile.findFirst({
            where: {
                company_id: companyUser.company_id,
                user_id: companyUser.user_id,
                deleted_at: null
            }
        });

        // Soft delete StaffProfile if exists
        if (staffProfile) {
            await prisma.staffProfile.update({
                where: { id: staffProfile.id },
                data: { deleted_at: new Date() }
            });
        }

        // Delete CompanyUser record
        await prisma.companyUser.update({
            where: { id: companyUserId },
            data: { deleted_at: new Date() }
        });

        return {
            code: 200,
            error: false,
            message: 'User removed from shop successfully'
        };
    } catch (error) {
        console.error('Error removing user from shop:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to remove user from shop'
        };
    }
}

/**
 * Get all company types
 */
export async function getCompanyTypes(): Promise<MensajeApi> {
    try {
        const companyTypes = await prisma.companyType.findMany({
            where: {
                is_active: true
            },
            select: {
                id: true,
                key: true,
                name: true,
                name_i18n: true
            },
            orderBy: {
                name: 'asc'
            }
        });

        return {
            code: 200,
            error: false,
            message: 'Company types retrieved successfully',
            data: companyTypes
        };
    } catch (error) {
        console.error('Error getting company types:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to retrieve company types'
        };
    }
}

/**
 * Allow super admin to impersonate a shop
 */
export async function impersonateShop(shopId: number, superAdminUser: any, headers: any): Promise<MensajeApi & { cookie?: string }> {
    try {
        const auth = await getAuth();
        // Check if shop exists
        const shop = await prisma.company.findUnique({
            where: {
                id: shopId,
                deleted_at: null
            }
        });

        if (!shop) {
            return {
                code: 404,
                error: true,
                message: 'Shop not found'
            };
        }

        // Create or update a temporary CompanyUser record for impersonation
        const companyUser = await prisma.companyUser.upsert({
            where: {
                company_id_user_id_role: {
                    company_id: shopId,
                    user_id: superAdminUser.id,
                    role: CompanyUserRole.OWNER
                }
            },
            update: {
                deleted_at: null
            },
            create: {
                company_id: shopId,
                user_id: superAdminUser.id,
                role: CompanyUserRole.OWNER
            },
            include: {
                company: {
                    select: {
                        id: true,
                        slug: true,
                        name: true
                    }
                }
            }
        });

        // Create a new session for the impersonated user
        const session = await auth.api.getSession({
            headers: headers
        });

        if (!session) {
            return {
                code: 401,
                error: true,
                message: 'No active session found'
            };
        }

        // The existing session is already valid, we just need to return the company user info
        return {
            code: 200,
            error: false,
            message: 'Impersonation session created',
            data: {
                user: superAdminUser,
                companyUser: companyUser
            }
        };
    } catch (error) {
        console.error('Error impersonating shop:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to create impersonation session'
        };
    }
}
