import { BookingStatus } from '@prisma/client';

export const LEGACY_NO_SHOW_NOTE_MARKER = '[NO_SHOW]';
export const INACTIVE_BOOKING_STATUSES = [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] as const;

export function hasLegacyNoShowMarker(notes?: string | null): boolean {
    return (notes || '').includes(LEGACY_NO_SHOW_NOTE_MARKER);
}

export function stripLegacyNoShowMarker(notes?: string | null): string | null {
    if (!notes) return null;

    const cleaned = notes
        .split('\n')
        .map((line) => line.replace(LEGACY_NO_SHOW_NOTE_MARKER, '').trim())
        .filter((line) => line.length > 0)
        .join('\n')
        .trim();

    return cleaned || null;
}

export function getBookingLifecycleStatus(status: BookingStatus, notes?: string | null): BookingStatus {
    if (status === BookingStatus.NO_SHOW) {
        return BookingStatus.NO_SHOW;
    }

    if (status === BookingStatus.CANCELLED && hasLegacyNoShowMarker(notes)) {
        return BookingStatus.NO_SHOW;
    }

    return status;
}

export function isNoShowBooking(status: BookingStatus, notes?: string | null): boolean {
    return getBookingLifecycleStatus(status, notes) === BookingStatus.NO_SHOW;
}

export function isCancelledBooking(status: BookingStatus, notes?: string | null): boolean {
    return getBookingLifecycleStatus(status, notes) === BookingStatus.CANCELLED;
}

export function isTerminalBookingStatus(status: BookingStatus, notes?: string | null): boolean {
    const lifecycleStatus = getBookingLifecycleStatus(status, notes);
    return (
        lifecycleStatus === BookingStatus.CANCELLED ||
        lifecycleStatus === BookingStatus.COMPLETED ||
        lifecycleStatus === BookingStatus.NO_SHOW
    );
}
