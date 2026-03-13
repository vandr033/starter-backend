import { logger } from "../config/logger";
import { Prisma, prisma } from "../prisma/client";
import { buildMarketplaceVisibilityWhere } from "./marketplace-visibility";

export const getTopRatedReviews = async (limit:number = 10) => {
    try {
        const ratedGroups = await prisma.review.groupBy({
      by: ['company_id'],
      _avg: {
        rating: true,
      },
      _count: {
        rating: true,  // we'll sort by this count as tie-breaker
        // or use _all: true if you prefer
      },
      where: {
        company: buildMarketplaceVisibilityWhere(),
      },
      orderBy: [
        {
          _avg: {
            rating: 'desc',   // highest average rating first
          },
        },
        {
          _count: {
            rating: 'desc',   // or _all: 'desc', more reviews first
          },
        },
      ],
      take: limit,
    });
        return ratedGroups;
    } catch (error) {
        logger.error("Error al obtener las reseñas top");
        logger.error(error);
        throw error;
    }
}
