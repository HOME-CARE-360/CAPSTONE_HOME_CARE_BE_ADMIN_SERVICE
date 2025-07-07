import { z } from 'zod';
import { UserStatus } from '../generated/prisma';

// Base validation patterns
const phoneRegex = /^(\+84|0)[0-9]{9,10}$/; // Vietnamese phone format
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;

// Common schemas
export const IdParamSchema = z.object({
  id: z.number().int().positive(),
});

export const AdminIdSchema = z.object({
  adminId: z.number().int().positive(),
});

// User Management Schemas
export const CreateUserSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .min(1, 'Email is required')
    .max(255, 'Email too long'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .regex(passwordRegex, 'Password must contain uppercase, lowercase, number and special character'),
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name too long')
    .trim(),
  phone: z.string()
    .regex(phoneRegex, 'Invalid Vietnamese phone number format')
    .trim(),
  avatar: z.string()
    .url('Invalid URL format')
    .max(500, 'Avatar URL too long')
    .optional(),
  status: z.nativeEnum(UserStatus).default(UserStatus.ACTIVE),
  role: z.literal('MANAGER'), // Chỉ được tạo MANAGER
});

export const UpdateUserSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .max(255, 'Email too long')
    .optional(),
  name: z.string()
    .min(1, 'Name cannot be empty')
    .max(100, 'Name too long')
    .trim()
    .optional(),
  phone: z.string()
    .regex(phoneRegex, 'Invalid Vietnamese phone number format')
    .trim()
    .optional(),
  avatar: z.string()
    .url('Invalid URL format')
    .max(500, 'Avatar URL too long')
    .optional(),
  roleIds: z.array(z.number().int().positive()).optional(),
});

// Query schemas
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
  search: z.string().trim().optional(),
  role: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']).optional(),
  sortBy: z.enum(allowedUserSortFields).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// Password management schemas
export const ResetPasswordSchema = AdminIdSchema.extend({
  id: z.number().int().positive(),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .regex(passwordRegex, 'Password must contain uppercase, lowercase, number and special character'),
  confirmPassword: z.string(),
}).refine(
  (data) => data.newPassword === data.confirmPassword,
  {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }
);

// Role management schemas
export const CreateRoleSchema = AdminIdSchema.extend({
  name: z.string()
    .min(1, 'Role name is required')
    .max(50, 'Role name too long')
    .trim(),
});

export const UpdateRoleSchema = AdminIdSchema.extend({
  id: z.number().int().positive(),
  name: z.string()
    .min(1, 'Role name is required')
    .max(50, 'Role name too long')
    .trim()
});

export const DeleteRoleSchema = AdminIdSchema.extend({
  id: z.number().int().positive(),
});

// Permission management schemas
export const AssignPermissionsToRoleSchema = AdminIdSchema.extend({
  roleId: z.number().int().positive(),
  permissionIds: z.array(z.number().int().positive()),
});

// Role assignment schemas
export const AssignRolesSchema = AdminIdSchema.extend({
  userId: z.number().int().positive(),
  roleIds: z.array(z.number().int().positive()),
});

// Report schemas
export const MonthlyReportSchema = AdminIdSchema.extend({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000),
});

export const MultiMonthReportSchema = AdminIdSchema.extend({
  startMonth: z.number().int().min(1).max(12),
  startYear: z.number().int().min(2000),
  endMonth: z.number().int().min(1).max(12),
  endYear: z.number().int().min(2000),
}).refine(
  (data) => {
    const startDate = new Date(data.startYear, data.startMonth - 1);
    const endDate = new Date(data.endYear, data.endMonth - 1);
    return startDate <= endDate;
  },
  {
    message: 'Start date must be before or equal to end date',
    path: ['endMonth'],
  }
);

// User action schemas (for service methods)
export const UserActionSchema = AdminIdSchema.extend({
  id: z.number().int().positive(),
});

export const CreateUserWithAdminSchema = CreateUserSchema.extend({
  adminId: z.number().int().positive(),
});

export const UpdateUserWithAdminSchema = z.object({
  id: z.number().int().positive(),
  data: UpdateUserSchema,
  adminId: z.number().int().positive(),
});

export const AssignRolesWithUserIdSchema = z.object({
  userId: z.number().int().positive(),
  roleIds: z.array(z.number().int().positive()),
  adminId: z.number().int().positive(),
});

export const AssignPermissionsWithRoleIdSchema = z.object({
  roleId: z.number().int().positive(),
  permissionIds: z.array(z.number().int().positive()),
  adminId: z.number().int().positive(),
});

// TCP message schemas (for service communication)
export const TcpMessageSchema = z.object({
  type: z.string(),
  data: z.any(),
});

// Service response schemas
export const ServiceResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  data: z.any().optional(),
  error: z.string().optional(),
});

// Statistics schemas
export const UserStatisticsSchema = z.object({
  totalUsers: z.number().int().nonnegative(),
  activeUsers: z.number().int().nonnegative(),
  inactiveUsers: z.number().int().nonnegative(),
  blockedUsers: z.number().int().nonnegative(),
  newUsersThisMonth: z.number().int().nonnegative(),
});

export const RoleStatisticsSchema = z.object({
  totalRoles: z.number().int().nonnegative(),
  rolesWithUsers: z.number().int().nonnegative(),
  rolesWithoutUsers: z.number().int().nonnegative(),
  averageUsersPerRole: z.number().nonnegative(),
});

// Activity log schemas
export const ActivityLogSchema = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  action: z.string(),
  details: z.string().optional(),
  createdAt: z.date(),
  adminId: z.number().int().positive().optional(),
});

// Pagination schemas
export const PaginationMetaSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export const PaginatedResponseSchema = z.object({
  data: z.array(z.any()),
  meta: PaginationMetaSchema,
});

// Export type definitions
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type GetUsersQuery = z.infer<typeof GetUsersQuerySchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;
export type AssignRolesInput = z.infer<typeof AssignRolesSchema>;
export type AssignPermissionsToRoleInput = z.infer<typeof AssignPermissionsToRoleSchema>;
export type MonthlyReportInput = z.infer<typeof MonthlyReportSchema>;
export type MultiMonthReportInput = z.infer<typeof MultiMonthReportSchema>;
export type UserAction = z.infer<typeof UserActionSchema>;
export type UserStatistics = z.infer<typeof UserStatisticsSchema>;
export type RoleStatistics = z.infer<typeof RoleStatisticsSchema>;
export type ActivityLog = z.infer<typeof ActivityLogSchema>;
export type PaginatedResponse<T> = {
  data: T[];
  meta: z.infer<typeof PaginationMetaSchema>;
};

// Validation helper functions
export const validateCreateUser = (data: unknown) => CreateUserSchema.parse(data);
export const validateUpdateUser = (data: unknown) => UpdateUserSchema.parse(data);
export const validateGetUsersQuery = (data: unknown) => GetUsersQuerySchema.parse(data);
export const validateResetPassword = (data: unknown) => ResetPasswordSchema.parse(data);
export const validateCreateRole = (data: unknown) => CreateRoleSchema.parse(data);
export const validateUpdateRole = (data: unknown) => UpdateRoleSchema.parse(data);
export const validateAssignRoles = (data: unknown) => AssignRolesSchema.parse(data);
export const validateAssignPermissionsToRole = (data: unknown) => AssignPermissionsToRoleSchema.parse(data);
export const validateMonthlyReport = (data: unknown) => MonthlyReportSchema.parse(data);
export const validateMultiMonthReport = (data: unknown) => MultiMonthReportSchema.parse(data);
export const validateIdParam = (data: unknown) => IdParamSchema.parse(data);
export const validateUserAction = (data: unknown) => UserActionSchema.parse(data);

// Constants for validation
export const USER_CONSTRAINTS = {
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  NAME_MAX_LENGTH: 100,
  EMAIL_MAX_LENGTH: 255,
  AVATAR_URL_MAX_LENGTH: 500,
  ROLE_NAME_MAX_LENGTH: 50,
} as const;

export const PAGINATION_CONSTRAINTS = {
  MIN_PAGE: 1,
  MIN_LIMIT: 1,
  MAX_LIMIT: 100,
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
} as const;

export const REPORT_CONSTRAINTS = {
  MIN_MONTH: 1,
  MAX_MONTH: 12,
  MIN_YEAR: 2000,
  MAX_YEAR: new Date().getFullYear() + 10,
} as const;