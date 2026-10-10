"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INACTIVE_BOOKING_STATUSES = exports.LEGACY_NO_SHOW_NOTE_MARKER = void 0;
exports.hasLegacyNoShowMarker = hasLegacyNoShowMarker;
exports.stripLegacyNoShowMarker = stripLegacyNoShowMarker;
exports.getBookingLifecycleStatus = getBookingLifecycleStatus;
exports.isNoShowBooking = isNoShowBooking;
exports.isCancelledBooking = isCancelledBooking;
exports.isTerminalBookingStatus = isTerminalBookingStatus;
const client_1 = require("@prisma/client");
exports.LEGACY_NO_SHOW_NOTE_MARKER = '[NO_SHOW]';
exports.INACTIVE_BOOKING_STATUSES = [client_1.BookingStatus.CANCELLED, client_1.BookingStatus.NO_SHOW];
function hasLegacyNoShowMarker(notes) {
    return (notes || '').includes(exports.LEGACY_NO_SHOW_NOTE_MARKER);
}
function stripLegacyNoShowMarker(notes) {
    if (!notes)
        return null;
    const cleaned = notes
        .split('\n')
        .map((line) => line.replace(exports.LEGACY_NO_SHOW_NOTE_MARKER, '').trim())
        .filter((line) => line.length > 0)
        .join('\n')
        .trim();
    return cleaned || null;
}
function getBookingLifecycleStatus(status, notes) {
    if (status === client_1.BookingStatus.NO_SHOW) {
        return client_1.BookingStatus.NO_SHOW;
    }
    if (status === client_1.BookingStatus.CANCELLED && hasLegacyNoShowMarker(notes)) {
        return client_1.BookingStatus.NO_SHOW;
    }
    return status;
}
function isNoShowBooking(status, notes) {
    return getBookingLifecycleStatus(status, notes) === client_1.BookingStatus.NO_SHOW;
}
function isCancelledBooking(status, notes) {
    return getBookingLifecycleStatus(status, notes) === client_1.BookingStatus.CANCELLED;
}
function isTerminalBookingStatus(status, notes) {
    const lifecycleStatus = getBookingLifecycleStatus(status, notes);
    return (lifecycleStatus === client_1.BookingStatus.CANCELLED ||
        lifecycleStatus === client_1.BookingStatus.COMPLETED ||
        lifecycleStatus === client_1.BookingStatus.NO_SHOW);
}
