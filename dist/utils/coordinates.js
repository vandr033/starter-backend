"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getValidCoordinates = getValidCoordinates;
exports.getSafeMapUrl = getSafeMapUrl;
function parseCoordinate(value, minimum, maximum) {
    if (value === null || value === undefined)
        return null;
    if (typeof value === 'string' && value.trim() === '')
        return null;
    if (typeof value === 'string' && /^(null|undefined|nan)$/i.test(value.trim()))
        return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum)
        return null;
    return parsed;
}
function getValidCoordinates(latitude, longitude) {
    const parsedLatitude = parseCoordinate(latitude, -90, 90);
    const parsedLongitude = parseCoordinate(longitude, -180, 180);
    if (parsedLatitude === null || parsedLongitude === null)
        return null;
    return { latitude: parsedLatitude, longitude: parsedLongitude };
}
function getSafeMapUrl(value) {
    const trimmed = value?.trim();
    if (!trimmed || /^(null|undefined|nan)$/i.test(trimmed))
        return null;
    try {
        const url = new URL(trimmed);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
    }
    catch {
        return null;
    }
}
