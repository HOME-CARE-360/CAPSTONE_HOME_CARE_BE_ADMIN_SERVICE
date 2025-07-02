// TCPRequestHandler.ts
import { z } from 'zod';
import { TCPResponseSuccess } from '../interfaces/tcp-response.interface';
import {
    CreateUserSchema,
    UpdateUserSchema,
    IdParamSchema,
    GetUsersQuerySchema,
} from '../schemas/app.schema';
import { parseWithSchema } from './parseWithSchema';
import { AppError } from './error';
import { throwRpcAppError } from './throwRpcAppError';
import { AdminRepository } from '../repositories/admin.repository';
import { AdminService } from '../services/admin.service';

interface TCPPayload {
    type: string;
    data: any;
}

interface HandlerResult {
    message: string;
    data: any;
}

type HandleTCPReturn<T = any> = TCPResponseSuccess<T>;

const repo = new AdminRepository();
const service = new AdminService(repo);

async function assertIsAdmin(userId: number): Promise<void> {
    const roles = await service.getUserRoles(userId);
    const isAdmin = roles.some((r) => r.name === 'ADMIN');
    if (!isAdmin) {
        throw new AppError(
            'Error.Forbidden',
            [{ message: 'User must have ADMIN role', path: ['userId'] }],
            { userId },
            403
        );
    }
}

export async function handleTCPRequest(payload: TCPPayload): Promise<HandleTCPReturn> {
    const { type, data } = payload;

    console.log(`[TCP] Incoming: ${type}`, {
        payload: { ...payload, data: data ? '[REDACTED]' : undefined },
    });

    try {
        const handler = HANDLER_MAP.get(type);
        if (!handler) {
            throw new AppError(
                'Error.UnknownRequestType',
                [{ message: 'Unknown request type', path: ['type'] }],
                { receivedType: type },
                400
            );
        }

        const result = await handler(data);

        return {
            success: true,
            code: 'SUCCESS',
            message: result.message,
            data: result.data,
            statusCode: 200,
            timestamp: new Date().toISOString(),
        };
    } catch (err) {
        return handleError(err, payload);
    }
}

function handleError(err: any, payload: TCPPayload): never {
    const errorContext = {
        name: err?.name || 'Unknown',
        message: err?.message || 'No message',
        code: err?.code || 'NO_CODE',
        statusCode: err?.statusCode || 500,
        stack: err?.stack?.split('\n').slice(0, 3).join('\n'),
    };

    console.error(`[TCP] ${payload?.type ?? 'Unknown'} Failed:`, errorContext);

    if (err instanceof AppError) {
        throwRpcAppError(err);
    }

    throwRpcAppError(
        new AppError(
            'Error.Unexpected',
            [{ message: 'An unexpected error occurred', path: [] }],
            {
                originalError: {
                    name: err?.name,
                    message: err?.message,
                },
                requestType: payload?.type,
            },
            500
        )
    );
}

// === HANDLERS ===
async function handleCreateUser(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(CreateUserSchema.extend({ adminId: z.number().int().positive() }), data);
    await assertIsAdmin(parsed.adminId);
    const user = await service.createUser(parsed, parsed.adminId);
    return { message: 'Manager created successfully', data: user };
}

async function handleUpdateUser(data: any): Promise<HandlerResult> {
    if (!data?.id || !data?.adminId) {
        throw new AppError('Error.MissingUserId', [{ message: 'User ID and adminId are required', path: ['id'] }], {}, 400);
    }
    await assertIsAdmin(data.adminId);
    const parsedData = parseWithSchema(UpdateUserSchema, data.data);
    const updated = await service.updateUser(Number(data.id), parsedData, data.adminId);
    return { message: 'User updated successfully', data: updated };
}

async function handleDeleteUser(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(IdParamSchema.extend({ adminId: z.number().int().positive() }), data);
    await assertIsAdmin(parsed.adminId);
    const deleted = await service.deleteUser(parsed.id, parsed.adminId);
    return { message: 'User deleted successfully', data: deleted };
}

async function handleBlockUser(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(IdParamSchema.extend({ adminId: z.number().int().positive() }), data);
    await assertIsAdmin(parsed.adminId);
    const user = await service.blockUser(parsed.id, parsed.adminId);
    return { message: 'User blocked successfully', data: user };
}

async function handleUnblockUser(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(IdParamSchema.extend({ adminId: z.number().int().positive() }), data);
    await assertIsAdmin(parsed.adminId);
    const user = await service.unblockUser(parsed.id, parsed.adminId);
    return { message: 'User unblocked successfully', data: user };
}

async function handleActivateUser(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(IdParamSchema.extend({ adminId: z.number().int().positive() }), data);
    await assertIsAdmin(parsed.adminId);
    const user = await service.activateUser(parsed.id, parsed.adminId);
    return { message: 'User activated successfully', data: user };
}

async function handleResetPassword(data: any): Promise<HandlerResult> {
    const { id, newPassword, adminId } = data;
    await assertIsAdmin(adminId);
    const user = await service.resetUserPassword(id, newPassword, adminId);
    return { message: 'Password reset successfully', data: user };
}

async function handleAssignRoles(data: any): Promise<HandlerResult> {
    const { userId, roleIds, adminId } = data;
    await assertIsAdmin(adminId);
    await service.assignRolesToUser({ userId, roleIds }, adminId);
    return { message: 'Roles assigned successfully', data: null };
}

async function handleCreateRole(data: any): Promise<HandlerResult> {
    const { name, adminId } = data;
    await assertIsAdmin(adminId);
    const role = await service.createRole(name, adminId);
    return { message: 'Role created successfully', data: role };
}

async function handleUpdateRole(data: any): Promise<HandlerResult> {
    const { id, name, adminId } = data;
    await assertIsAdmin(adminId);
    const updated = await service.updateRole(id, name, adminId);
    return { message: 'Role updated successfully', data: updated };
}

async function handleDeleteRole(data: any): Promise<HandlerResult> {
    const { id, adminId } = data;
    await assertIsAdmin(adminId);
    await service.deleteRole(id, adminId);
    return { message: 'Role deleted successfully', data: null };
}

async function handleAssignPermissionsToRole(data: any): Promise<HandlerResult> {
    const { roleId, permissionIds, adminId } = data;
    await assertIsAdmin(adminId);
    await service.assignPermissionToRole(roleId, permissionIds, adminId);
    return { message: 'Permissions assigned to role successfully', data: null };
}

async function handleRestoreUser(data: any): Promise<HandlerResult> {
    const { id, adminId } = data;
    await assertIsAdmin(adminId);
    const user = await service.restoreDeletedUser(id, adminId);
    return { message: 'User restored successfully', data: user };
}

// Basic handlers not requiring admin check
async function handleGetAllUsers(data: any): Promise<HandlerResult> {
    const query = parseWithSchema(GetUsersQuerySchema, data);
    const users = await service.getAllUsers({ ...query, page: query.page ?? 1, limit: query.limit ?? 10 });
    return { message: 'All users fetched successfully', data: users };
}

async function handleGetUserById(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(IdParamSchema, data) as { id: number };
    const user = await service.getUserById(parsed.id);
    return { message: 'User detail fetched successfully', data: user };
}

async function handleGetUserRoles(data: any): Promise<HandlerResult> {
    const { id } = parseWithSchema(IdParamSchema, data);
    const roles = await service.getUserRoles(id);
    return { message: 'User roles fetched successfully', data: roles };
}

async function handleGetRoles(): Promise<HandlerResult> {
    const roles = await service.getAllRoles();
    return { message: 'All roles fetched successfully', data: roles };
}

async function handleGetPermissions(): Promise<HandlerResult> {
    const permissions = await service.getAllPermissions();
    return { message: 'All permissions fetched successfully', data: permissions };
}

async function handleGetPermissionsByRole(data: any): Promise<HandlerResult> {
    const { roleId } = data;
    const permissions = await service.getPermissionsByRole(roleId);
    return { message: 'Permissions fetched successfully', data: permissions };
}

async function handleGetDeletedUsers(): Promise<HandlerResult> {
    const users = await service.getDeletedUsers();
    return { message: 'Deleted users fetched successfully', data: users };
}

const HANDLER_MAP = new Map<string, (data: any) => Promise<HandlerResult>>([
    ['ADMIN_CREATE_USER', handleCreateUser],
    ['ADMIN_UPDATE_USER', handleUpdateUser],
    ['ADMIN_DELETE_USER', handleDeleteUser],
    ['ADMIN_BLOCK_USER', handleBlockUser],
    ['ADMIN_UNBLOCK_USER', handleUnblockUser],
    ['ADMIN_ACTIVATE_USER', handleActivateUser],
    ['ADMIN_RESET_USER_PASSWORD', handleResetPassword],
    ['ADMIN_ASSIGN_ROLES', handleAssignRoles],
    ['ADMIN_GET_USER_ROLES', handleGetUserRoles],
    ['ADMIN_GET_USERS', handleGetAllUsers],
    ['ADMIN_GET_USER_BY_ID', handleGetUserById],
    ['ADMIN_GET_ROLES', handleGetRoles],
    ['ADMIN_CREATE_ROLE', handleCreateRole],
    ['ADMIN_UPDATE_ROLE', handleUpdateRole],
    ['ADMIN_DELETE_ROLE', handleDeleteRole],
    ['ADMIN_GET_PERMISSIONS_BY_ROLE', handleGetPermissionsByRole],
    ['ADMIN_ASSIGN_PERMISSIONS_TO_ROLE', handleAssignPermissionsToRole],
    ['ADMIN_GET_PERMISSIONS', handleGetPermissions],
    ['ADMIN_GET_DELETED_USERS', handleGetDeletedUsers],
    ['ADMIN_RESTORE_USER', handleRestoreUser],
]);