import { z } from "zod";
import { AppError } from "./error";

export function parseWithSchema<T>(schema: z.ZodSchema<T>, data: unknown): T {
    try {
        return schema.parse(data);
    } catch (error) {
        throw new AppError(
            'Error.InvalidPayload',
            [{ message: 'Invalid input data', path: [] }],
            { zodError: error },
            400
        );
    }
}
