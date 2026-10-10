"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateVerificationCode = exports.getLatestVerification = exports.getVerificationCode = exports.createVerification = void 0;
const client_1 = require("../prisma/client");
const createVerification = (data) => {
    return client_1.prisma.verificationCode.create({
        data,
    });
};
exports.createVerification = createVerification;
const getVerificationCode = (channel, purpose, identifier) => {
    return client_1.prisma.verificationCode.findFirst({
        where: {
            channel,
            purpose,
            identifier,
            consumed_at: null,
            expires_at: { gt: new Date() },
        },
        orderBy: { created_at: "desc" },
    });
};
exports.getVerificationCode = getVerificationCode;
const getLatestVerification = (channel, purpose, identifier) => {
    return client_1.prisma.verificationCode.findFirst({
        where: {
            channel,
            purpose,
            identifier,
        },
        orderBy: { created_at: "desc" },
    });
};
exports.getLatestVerification = getLatestVerification;
const updateVerificationCode = (id, data) => {
    return client_1.prisma.verificationCode.update({
        where: { id },
        data,
    });
};
exports.updateVerificationCode = updateVerificationCode;
