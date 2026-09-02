import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodError } from 'zod';

export function validate(schema: { body?: AnyZodObject; query?: AnyZodObject; params?: AnyZodObject }) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.params) req.params = schema.params.parse(req.params);
      if (schema.query) req.query = schema.query.parse(req.query);
      if (schema.body) req.body = schema.body.parse(req.body);
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        });
      }
      return res.status(500).json({ error: 'Validation middleware error' });
    }
  };
}
