import { z } from 'zod';
import { UserStatus } from '../generated/prisma';

export const CreateUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    name: z.string().min(1),
    phone: z.string().min(6).max(20),
    avatar: z.string().url().optional(),
    status: z.nativeEnum(UserStatus).optional(),
    role: z.literal('MANAGER'), // Chỉ được tạo MANAGER
});

export const UpdateUserSchema = z.object({
    email: z.string().email().optional(),
    name: z.string().optional(),
    phone: z.string().optional(),
    avatar: z.string().url().optional(),
    roleIds: z.array(z.number().int().positive()).optional(),
});

export const IdParamSchema = z.object({
    id: z.number().int().positive(),
});


export const allowedUserSortFields = [
    'id',
    'email',
    'name',
    'phone',
    'createdAt',
    'updatedAt',
] as const;

export const GetUsersQuerySchema = z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(10),
    search: z.string().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']).optional(),
    sortBy: z.enum(allowedUserSortFields).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const AdminIdSchema = z.object({
  adminId: z.number().int().positive()
});

export const AssignRolesSchema = AdminIdSchema.extend({
  userId: z.number().int().positive(),
  roleIds: z.array(z.number().int().positive()),
});

export const ResetPasswordSchema = AdminIdSchema.extend({
  id: z.number().int().positive(),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine(
  (data) => data.newPassword === data.confirmPassword,
  {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }
);


export const CreateRoleSchema = AdminIdSchema.extend({
  name: z.string().min(1),
});

export const UpdateRoleSchema = AdminIdSchema.extend({
  id: z.number().int().positive(),
  name: z.string().min(1),
});

export const DeleteRoleSchema = AdminIdSchema.extend({
  id: z.number().int().positive(),
});

export const AssignPermissionsToRoleSchema = AdminIdSchema.extend({
  roleId: z.number().int().positive(),
  permissionIds: z.array(z.number().int().positive()),
});

export const MonthlyReportSchema = AdminIdSchema.extend({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000),
});

export const MultiMonthReportSchema = AdminIdSchema.extend({
  startMonth: z.number().int().min(1).max(12),
  startYear: z.number().int().min(2000),
  endMonth: z.number().int().min(1).max(12),
  endYear: z.number().int().min(2000),
});