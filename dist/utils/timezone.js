"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.zonedDateTimeToUtc = zonedDateTimeToUtc;
exports.parseDateTimeInTimeZone = parseDateTimeInTimeZone;
const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;
const TIME_ZONE_SUFFIX_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/i;
function getTimeZoneParts(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(date);
    const value = (type) => Number(parts.find((part) => part.type === type)?.value || '0');
    return {
        year: value('year'),
        month: value('month'),
        day: value('day'),
        hour: value('hour'),
        minute: value('minute'),
        second: value('second'),
    };
}
function getTimeZoneOffsetMs(date, timeZone) {
    const parts = getTimeZoneParts(date, timeZone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return asUtc - date.getTime();
}
function zonedDateTimeToUtc(year, month, day, hour, minute, second, timeZone) {
    const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
    return new Date(utcGuess.getTime() - offset);
}
function parseDateTimeInTimeZone(value, timeZone) {
    if (!value || TIME_ZONE_SUFFIX_PATTERN.test(value)) {
        return new Date(value);
    }
    const match = value.match(LOCAL_DATE_TIME_PATTERN);
    if (!match) {
        return new Date(value);
    }
    return zonedDateTimeToUtc(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] || 0), timeZone || 'UTC');
}
