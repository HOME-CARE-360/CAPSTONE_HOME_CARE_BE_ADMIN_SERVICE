

import { z } from 'zod';
import { CreateUserSchema, GetUsersQuerySchema, IdParamSchema, UpdateUserSchema } from './app.schema';

export type CreateUserDTO = z.infer<typeof CreateUserSchema>;
export type UpdateUserDTO = z.infer<typeof UpdateUserSchema>;
export type IdParamDTO = z.infer<typeof IdParamSchema>;
export type GetUsersQuery = z.infer<typeof GetUsersQuerySchema>;
