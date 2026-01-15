import {Prisma, prisma } from '../prisma/client';

export const getFaq = async () => {
    try {
        const faq = await prisma.frequentlyAskedQuestion.findMany({
            select:{
                id:true,
                question:true,
                answer:true,
            },

        });
        return faq;
    } catch (error) {
        console.error(error);
        throw error;
    }
}


export const insertFaq = async (faqData: Prisma.FrequentlyAskedQuestionCreateInput) => {
    try {
        const faq = await prisma.frequentlyAskedQuestion.create({
            data:faqData,
        });
        return faq;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

export const updateFaq = async (id: number, faqData: Prisma.FrequentlyAskedQuestionUpdateInput) => {
    try {
        const faq = await prisma.frequentlyAskedQuestion.update({
            where: { id: id },
            data: faqData,
        });
        return faq;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

export const deleteFaq = async (id: number) => {
    try {
        const faq = await prisma.frequentlyAskedQuestion.delete({
            where: { id: id },
        });
        return faq;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

export const deleteAllFaq = async () => {
    try {
        const faq = await prisma.frequentlyAskedQuestion.deleteMany({
            
        });
        return faq;
    } catch (error) {
        console.error(error);
        throw error;
    }
}