import { ZodError } from 'zod';
import { AppError } from './error';

export function handleZodError(err: ZodError, context: object = {}) {
    throw new AppError(
        'Invalid input data',
        [{ message: 'Error.ValidationFailed', path: ['data'] }],
        {
            ...context,
            validationErrors: err.errors.map((e) => ({
                path: e.path.join('.'),
                message: e.message,
            })),
        },
        422
    );
}
