"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAllFaq = exports.deleteFaq = exports.updateFaq = exports.insertFaq = exports.getFaq = void 0;
const client_1 = require("../prisma/client");
const getFaq = async () => {
    try {
        const faq = await client_1.prisma.frequentlyAskedQuestion.findMany({
            select: {
                id: true,
                question: true,
                answer: true,
            },
        });
        return faq;
    }
    catch (error) {
        console.error(error);
        throw error;
    }
};
exports.getFaq = getFaq;
const insertFaq = async (faqData) => {
    try {
        const faq = await client_1.prisma.frequentlyAskedQuestion.create({
            data: faqData,
        });
        return faq;
    }
    catch (error) {
        console.error(error);
        throw error;
    }
};
exports.insertFaq = insertFaq;
const updateFaq = async (id, faqData) => {
    try {
        const faq = await client_1.prisma.frequentlyAskedQuestion.update({
            where: { id: id },
            data: faqData,
        });
        return faq;
    }
    catch (error) {
        console.error(error);
        throw error;
    }
};
exports.updateFaq = updateFaq;
const deleteFaq = async (id) => {
    try {
        const faq = await client_1.prisma.frequentlyAskedQuestion.delete({
            where: { id: id },
        });
        return faq;
    }
    catch (error) {
        console.error(error);
        throw error;
    }
};
exports.deleteFaq = deleteFaq;
const deleteAllFaq = async () => {
    try {
        const faq = await client_1.prisma.frequentlyAskedQuestion.deleteMany({});
        return faq;
    }
    catch (error) {
        console.error(error);
        throw error;
    }
};
exports.deleteAllFaq = deleteAllFaq;
