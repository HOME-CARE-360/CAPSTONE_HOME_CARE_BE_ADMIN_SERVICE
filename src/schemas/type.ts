

import { z } from 'zod';
import { AssignPermissionsToRoleSchema, AssignRolesSchema, CreateRoleSchema, CreateUserSchema, DeleteRoleSchema, GetUsersQuerySchema, IdParamSchema, MonthlyReportSchema, MultiMonthReportSchema, ResetPasswordSchema, UpdateRoleSchema, UpdateUserSchema } from './app.schema';

export type CreateUserDTO = z.infer<typeof CreateUserSchema>;
export type UpdateUserDTO = z.infer<typeof UpdateUserSchema>;
export type IdParamDTO = z.infer<typeof IdParamSchema>;
export type GetUsersQuery = z.infer<typeof GetUsersQuerySchema>;
export type AssignRolesDTO = z.infer<typeof AssignRolesSchema>;
export type ResetPasswordDTO = z.infer<typeof ResetPasswordSchema>;
export type CreateRoleDTO = z.infer<typeof CreateRoleSchema>;
export type UpdateRoleDTO = z.infer<typeof UpdateRoleSchema>;
export type DeleteRoleDTO = z.infer<typeof DeleteRoleSchema>;
export type AssignPermissionsToRoleDTO = z.infer<typeof AssignPermissionsToRoleSchema>;
export type MonthlyReportDTO = z.infer<typeof MonthlyReportSchema>;
export type MultiMonthReportDTO = z.infer<typeof MultiMonthReportSchema>;