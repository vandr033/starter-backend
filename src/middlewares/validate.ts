import { ZodTypeAny } from 'zod';
import { Request, Response, NextFunction } from 'express';

export const validate = (schema: ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.flatten();
      return res.status(400).json({
        code: 400,
        error: true,
        message: 'Validation failed',
        errors,
      });
    }
    (req as any).validated = parsed.data;
    next();
  };
