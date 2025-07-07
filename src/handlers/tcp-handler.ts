// TCPRequestHandler.ts
import { z } from 'zod';
import { TCPResponseSuccess } from '../interfaces/tcp-response.interface';
import {
    CreateUserSchema,
    UpdateUserSchema,
    IdParamSchema,
    GetUsersQuerySchema,
    AssignRolesSchema,
    ResetPasswordSchema,
    CreateRoleSchema,
    UpdateRoleSchema,
    DeleteRoleSchema,
    AssignPermissionsToRoleSchema,
    MonthlyReportSchema,
    MultiMonthReportSchema,
} from '../schemas/app.schema';
import {
    CreateUserDTO,
    UpdateUserDTO,
    IdParamDTO,
    GetUsersQuery,
    AssignRolesDTO,
    ResetPasswordDTO,
    CreateRoleDTO,
    UpdateRoleDTO,
    DeleteRoleDTO,
    AssignPermissionsToRoleDTO,
    MonthlyReportDTO,
    MultiMonthReportDTO,
} from '../schemas/type';
import { parseWithSchema } from './parseWithSchema';
import { AppError } from './error';
import { throwRpcAppError } from './throwRpcAppError';
import { AdminRepository } from '../repositories/admin.repository';
import { AdminService } from '../services/admin.service';
import { ReportRepository } from '../repositories/admin.report.repository';

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
const reportRepo = new ReportRepository();
const service = new AdminService(repo, reportRepo);

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
    const parsed = parseWithSchema(
        CreateUserSchema.extend({ adminId: z.number().int().positive() }),
        data
    ) as CreateUserDTO & { adminId: number };

    await assertIsAdmin(parsed.adminId);
    const user = await service.createUser(parsed, parsed.adminId);
    return { message: 'Manager created successfully', data: user };
}

async function handleUpdateUser(data: any): Promise<HandlerResult> {
    if (!data?.id || !data?.adminId) {
        throw new AppError('Error.MissingUserId', [{ message: 'User ID and adminId are required', path: ['id'] }], {}, 400);
    }
    await assertIsAdmin(data.adminId);

    const parsedData = parseWithSchema(UpdateUserSchema, data.data) as UpdateUserDTO;
    const updated = await service.updateUser(Number(data.id), parsedData, data.adminId);
    return { message: 'User updated successfully', data: updated };
}

async function handleDeleteUser(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(
        IdParamSchema.extend({ adminId: z.number().int().positive() }),
        data
    ) as IdParamDTO & { adminId: number };

    await assertIsAdmin(parsed.adminId);
    const deleted = await service.deleteUser(parsed.id, parsed.adminId);
    return { message: 'User deleted successfully', data: deleted };
}

async function handleBlockUser(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(
        IdParamSchema.extend({ adminId: z.number().int().positive() }),
        data
    ) as IdParamDTO & { adminId: number };

    await assertIsAdmin(parsed.adminId);
    const user = await service.blockUser(parsed.id, parsed.adminId);
    return { message: 'User blocked successfully', data: user };
}

async function handleUnblockUser(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(
        IdParamSchema.extend({ adminId: z.number().int().positive() }),
        data
    ) as IdParamDTO & { adminId: number };

    await assertIsAdmin(parsed.adminId);
    const user = await service.unblockUser(parsed.id, parsed.adminId);
    return { message: 'User unblocked successfully', data: user };
}

async function handleActivateUser(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(
        IdParamSchema.extend({ adminId: z.number().int().positive() }),
        data
    ) as IdParamDTO & { adminId: number };

    await assertIsAdmin(parsed.adminId);
    const user = await service.activateUser(parsed.id, parsed.adminId);
    return { message: 'User activated successfully', data: user };
}

async function handleResetPassword(data: any): Promise<HandlerResult> {
  console.log('=== RESET PASSWORD DEBUG ===');
  console.log('Raw data received:', JSON.stringify(data, null, 2));
  
  try {
    const ResetPasswordFullSchema = z.object({
      id: z.number().int().positive(),
      adminId: z.number().int().positive(),
      newPassword: z.string().min(6),
      confirmPassword: z.string().min(6)
    }).refine((data) => data.newPassword === data.confirmPassword, {
      message: "Password confirmation does not match",
      path: ["confirmPassword"]
    });

    const parsed = parseWithSchema(ResetPasswordFullSchema, data);
    await assertIsAdmin(parsed.adminId);
    const user = await service.resetUserPassword(parsed.id, parsed.newPassword, parsed.adminId);

    return {
      message: 'Password reset successfully',
      data: user,
    };
  } catch (error) {
    console.error('Error in handleResetPassword:', error);
    throw error;
  }
}

async function handleAssignRoles(data: any): Promise<HandlerResult> {
  const parsed = parseWithSchema(AssignRolesSchema, data) as AssignRolesDTO & { adminId: number };

  await assertIsAdmin(parsed.adminId);
  await service.assignRolesToUser(parsed, parsed.adminId);
  return { message: 'Roles assigned successfully', data: null };
}


async function handleCreateRole(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(
        CreateRoleSchema.extend({ adminId: z.number().int().positive() }),
        data
    ) as CreateRoleDTO & { adminId: number };

    await assertIsAdmin(parsed.adminId);
    const role = await service.createRole(parsed.name, parsed.adminId);
    return { message: 'Role created successfully', data: role };
}

async function handleUpdateRole(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(
        UpdateRoleSchema.extend({ adminId: z.number().int().positive() }),
        data
    ) as UpdateRoleDTO & { adminId: number };

    await assertIsAdmin(parsed.adminId);
    const updated = await service.updateRole(parsed.id, parsed.name, parsed.adminId);
    return { message: 'Role updated successfully', data: updated };
}

async function handleDeleteRole(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(
        DeleteRoleSchema.extend({ adminId: z.number().int().positive() }),
        data
    ) as DeleteRoleDTO & { adminId: number };

    await assertIsAdmin(parsed.adminId);
    await service.deleteRole(parsed.id, parsed.adminId);
    return { message: 'Role deleted successfully', data: null };
}

async function handleAssignPermissionsToRole(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(
        AssignPermissionsToRoleSchema.extend({ adminId: z.number().int().positive() }),
        data
    ) as AssignPermissionsToRoleDTO & { adminId: number };

    await assertIsAdmin(parsed.adminId);
    await service.assignPermissionToRole(parsed.roleId, parsed.permissionIds, parsed.adminId);
    return { message: 'Permissions assigned to role successfully', data: null };
}

async function handleRestoreUser(data: any): Promise<HandlerResult> {
  const RestoreUserSchema = z.object({
    id: z.number().int().positive(),
    adminId: z.number().int().positive(),
  });

  const parsed = parseWithSchema(RestoreUserSchema, data);

  await assertIsAdmin(parsed.adminId);
  const user = await service.restoreDeletedUser(parsed.id, parsed.adminId);

  return {
    message: 'User restored successfully',
    data: user,
  };
}

async function handleGetAllUsers(data: any): Promise<HandlerResult> {
    const query = parseWithSchema(GetUsersQuerySchema, data) as GetUsersQuery;
    const users = await service.getAllUsers({
        ...query,
        page: query.page ?? 1,
        limit: query.limit ?? 10
    });
    return { message: 'All users fetched successfully', data: users };
}

async function handleGetUserById(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(IdParamSchema, data) as IdParamDTO;
    const user = await service.getUserById(parsed.id);
    return { message: 'User detail fetched successfully', data: user };
}

async function handleGetUserRoles(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(IdParamSchema, data) as IdParamDTO;
    const roles = await service.getUserRoles(parsed.id);
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
    const parsed = parseWithSchema(IdParamSchema, data) as IdParamDTO;
    const permissions = await service.getPermissionsByRole(parsed.id);
    return { message: 'Permissions fetched successfully', data: permissions };
}

async function handleGetDeletedUsers(): Promise<HandlerResult> {
    const users = await service.getDeletedUsers();
    return { message: 'Deleted users fetched successfully', data: users };
}

async function handleGetRoleById(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(IdParamSchema, data) as IdParamDTO;
    const role = await service.getRoleById(parsed.id);
    return { message: 'Role detail fetched successfully', data: role };
}

async function handleGetUserStatistics(): Promise<HandlerResult> {
    const stats = await service.getUserStatistics();
    return { message: 'User statistics fetched successfully', data: stats };
}

async function handleGetRoleStatistics(): Promise<HandlerResult> {
    const stats = await service.getRoleStatistics();
    return { message: 'Role statistics fetched successfully', data: stats };
}

async function handleGetUserActivity(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(IdParamSchema, data) as IdParamDTO;
    const logs = await service.getUserActivity(parsed.id);
    return { message: 'User activity fetched successfully', data: logs };
}

async function handleGetMonthlyReport(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(
        MonthlyReportSchema.extend({ adminId: z.number().int().positive() }),
        data
    ) as MonthlyReportDTO & { adminId: number };

    await assertIsAdmin(parsed.adminId);
    const report = await service.getMonthlyReport(parsed.month, parsed.year);
    return { message: 'Monthly report fetched successfully', data: report };
}

async function handleExportMonthlyPDF(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(
        MonthlyReportSchema.extend({ adminId: z.number().int().positive() }),
        data
    ) as MonthlyReportDTO & { adminId: number };

    await assertIsAdmin(parsed.adminId);
    const buffer = await service.exportMonthlyReportPDF(parsed.month, parsed.year);
    return {
        message: 'Monthly PDF report generated successfully',
        data: buffer.toString('base64')
    };
}

async function handleExportMultiMonthsPDF(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(
        MultiMonthReportSchema,
        data
    ) as MultiMonthReportDTO & { adminId: number };

    await assertIsAdmin(parsed.adminId);
    const buffer = await service.exportMultiMonthReportPDF(
        parsed.startMonth,
        parsed.startYear,
        parsed.endMonth,
        parsed.endYear
    );
    return {
        message: 'Multi-month PDF report generated successfully',
        data: buffer.toString('base64')
    };
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
    ['ADMIN_GET_ROLE_BY_ID', handleGetRoleById],
    ['ADMIN_GET_USER_STATISTICS', handleGetUserStatistics],
    ['ADMIN_GET_ROLE_STATISTICS', handleGetRoleStatistics],
    ['ADMIN_GET_USER_ACTIVITY', handleGetUserActivity],
    ['ADMIN_GET_MONTHLY_REPORT', handleGetMonthlyReport],
    ['ADMIN_EXPORT_MONTHLY_PDF', handleExportMonthlyPDF],
    ['ADMIN_EXPORT_MULTI_MONTHS_PDF', handleExportMultiMonthsPDF],
]);