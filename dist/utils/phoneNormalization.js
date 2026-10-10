"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePhoneDigits = normalizePhoneDigits;
exports.canonicalizePhoneParts = canonicalizePhoneParts;
function normalizePhoneDigits(value) {
    return (value ?? '').replace(/\D/g, '');
}
function inferPrefixFromCombinedNumber(number, defaultPrefix) {
    if (!number)
        return null;
    if (number.startsWith(defaultPrefix) && number.length > defaultPrefix.length + 5) {
        return {
            prefix: defaultPrefix,
            number: number.slice(defaultPrefix.length),
        };
    }
    if (number.length === 11 && number.startsWith('1')) {
        return {
            prefix: '1',
            number: number.slice(1),
        };
    }
    return null;
}
function canonicalizePhoneParts(params) {
    const defaultPrefix = normalizePhoneDigits(params.defaultPrefix ?? '591') || '591';
    let phonePrefix = normalizePhoneDigits(params.phonePrefix);
    let phoneNumber = normalizePhoneDigits(params.phoneNumber);
    if (!phoneNumber) {
        return {
            phonePrefix: phonePrefix || defaultPrefix,
            phoneNumber: null,
            fullPhone: null,
        };
    }
    if (phoneNumber.startsWith('00')) {
        phoneNumber = phoneNumber.slice(2);
    }
    if (phonePrefix && phoneNumber.startsWith(phonePrefix) && phoneNumber.length > phonePrefix.length + 5) {
        phoneNumber = phoneNumber.slice(phonePrefix.length);
    }
    else if (!phonePrefix) {
        const inferred = inferPrefixFromCombinedNumber(phoneNumber, defaultPrefix);
        if (inferred) {
            phonePrefix = inferred.prefix;
            phoneNumber = inferred.number;
        }
    }
    phonePrefix = phonePrefix || defaultPrefix;
    if (phoneNumber.startsWith(phonePrefix) && phoneNumber.length > phonePrefix.length + 5) {
        phoneNumber = phoneNumber.slice(phonePrefix.length);
    }
    return {
        phonePrefix,
        phoneNumber,
        fullPhone: `${phonePrefix}${phoneNumber}`,
    };
}
