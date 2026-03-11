export type MarketplaceMatchType = 'exact' | 'flexible' | 'similar';
export type MarketplaceMatchClassification = 'exact_match' | 'flexible_match' | 'similar_booking';

function toDisplayTime(time24: string): string {
  const [hourRaw, minuteRaw] = time24.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time24;

  const ampm = hour >= 12 ? 'PM' : 'AM';
  const normalizedHour = ((hour + 11) % 12) + 1;
  return `${normalizedHour}:${String(minute).padStart(2, '0')} ${ampm}`;
}

export function toMatchClassification(matchType: MarketplaceMatchType): MarketplaceMatchClassification {
  if (matchType === 'exact') return 'exact_match';
  if (matchType === 'flexible') return 'flexible_match';
  return 'similar_booking';
}

export function toMatchLabel(
  classification: MarketplaceMatchClassification,
  options: { hasRequestedTime: boolean },
): string {
  if (!options.hasRequestedTime) {
    return 'Available today';
  }

  if (classification === 'exact_match') return 'Exact match';
  if (classification === 'flexible_match') return 'Flexible match';
  return 'Similar booking';
}

export function buildWhyThisResult(params: {
  matchType: MarketplaceMatchType;
  slotTime: string;
  requestedTime?: string;
  matchDeltaMinutes: number | null;
  noTimeRequested: boolean;
  fromRelaxedArea: boolean;
  rating: number;
  reviewCount: number;
}): string {
  const slotLabel = toDisplayTime(params.slotTime);
  const requestedLabel = params.requestedTime ? toDisplayTime(params.requestedTime) : null;
  const hasStrongRating = params.rating >= 4.5 && params.reviewCount >= 12;

  if (params.noTimeRequested) {
    if (params.fromRelaxedArea) return 'Available today in nearby area.';
    if (hasStrongRating) return 'High-rated option available today.';
    return 'Same service with availability today in your selected area.';
  }

  if (params.matchType === 'exact') {
    if (requestedLabel) {
      return `Available at ${slotLabel} (requested ${requestedLabel}).`;
    }
    return `Available at ${slotLabel} within your requested time window.`;
  }

  if (params.matchType === 'flexible') {
    if (requestedLabel && (params.matchDeltaMinutes ?? Number.MAX_SAFE_INTEGER) <= 60) {
      return `Available at ${slotLabel} (requested ${requestedLabel}).`;
    }

    if (requestedLabel) {
      return `Closest available time today is ${slotLabel} (requested ${requestedLabel}).`;
    }

    return `Closest available time today is ${slotLabel}.`;
  }

  if (params.fromRelaxedArea) {
    return `Available today in nearby area at ${slotLabel}.`;
  }

  if (hasStrongRating) {
    return `High-rated option with close availability at ${slotLabel}.`;
  }

  if (requestedLabel) {
    return `Closest available time today is ${slotLabel} (requested ${requestedLabel}).`;
  }

  return `Closest available time today is ${slotLabel}.`;
}
