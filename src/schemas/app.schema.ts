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
    password: z.string().min(6, 'Password must be at least 6 characters').optional(),
    avatar: z.string().url().optional(),
    status: z.nativeEnum(UserStatus).optional(),
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
