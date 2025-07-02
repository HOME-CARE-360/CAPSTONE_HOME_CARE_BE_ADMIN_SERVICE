import { z } from 'zod';

export const InspectionStatusSchema = z.enum([
    'NOT_YET',
    'IN_PROGRESS',
    'DONE',
]);

export type InspectionStatus = z.infer<typeof InspectionStatusSchema>;
