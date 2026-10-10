"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const validate = (schema) => (req, res, next) => {
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
    req.validated = parsed.data;
    next();
};
exports.validate = validate;
