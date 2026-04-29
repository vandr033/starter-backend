export type CompanyAvailabilitySnapshot = {
  availableUntil: Date;
  is_active?: boolean | null;
  deleted_at?: Date | null;
};

const SHOP_UNAVAILABLE_COPY = {
  title: {
    es: 'Negocio no disponible',
    en: 'Business unavailable',
  },
  subtitle: {
    es: 'Esta tienda no se encuentra activa en este momento.',
    en: 'This shop is not active at the moment.',
  },
  adminBanner: {
    es: 'Tu prueba o plan terminó el {date}. Activá tu plan para volver a operar.',
    en: 'Your plan expired on {date}. Contact support or renew to reactivate the shop.',
  },
} as const;

export function isCompanyAvailableNow(
  company: CompanyAvailabilitySnapshot,
  now: Date = new Date(),
): boolean {
  if (company.deleted_at) return false;
  if (company.is_active === false) return false;
  return now.getTime() <= company.availableUntil.getTime();
}

export function buildShopUnavailablePayload(availableUntil: Date, message?: string) {
  return {
    code: 403,
    error: true,
    reason: 'SHOP_EXPIRED',
    message: message || SHOP_UNAVAILABLE_COPY.title.es,
    data: {
      availableUntil: availableUntil.toISOString(),
      ...SHOP_UNAVAILABLE_COPY,
    },
  };
}
