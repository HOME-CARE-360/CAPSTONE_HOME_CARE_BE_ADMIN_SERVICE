import { TCPResponseSuccess } from '../interfaces/tcp-response.interface';
import { AdminUserService } from '../services/admin.service';
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
const service = new AdminUserService(repo);

// ========== ENTRY ==========
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

// ========== HANDLERS ==========
async function handleGetAllUsers(data: any): Promise<HandlerResult> {
    const query = parseWithSchema(GetUsersQuerySchema, data);
    const users = await service.getAllUsers({
        ...query,
        page: query.page ?? 1,
        limit: query.limit ?? 10,
    });
    return { message: 'All users fetched successfully', data: users };
}

async function handleGetUserById(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(IdParamSchema, data) as { id: number };
    const user = await service.getUserById(parsed.id);
    return { message: 'User detail fetched successfully', data: user };
}

async function handleCreateUser(data: any): Promise<HandlerResult> {
    const parsed = parseWithSchema(CreateUserSchema, data);
    const user = await service.createUser(parsed);
    return { message: 'Manager created successfully', data: user };
}

async function handleUpdateUser(data: any): Promise<HandlerResult> {
    if (!data?.id) {
        throw new AppError('Error.MissingUserId', [{ message: 'User ID is required', path: ['id'] }], {}, 400);
    }

    const parsedData = parseWithSchema(UpdateUserSchema, data.data);
    const updated = await service.updateUser(Number(data.id), parsedData);
    return { message: 'User updated successfully', data: updated };
}

async function handleDeleteUser(data: any): Promise<HandlerResult> {
    const parsed: { id: number } = parseWithSchema(IdParamSchema, data);
    const deleted = await service.deleteUser(parsed.id);
    return { message: 'User deleted successfully', data: deleted };
}

// ========== HANDLER MAP ==========
const HANDLER_MAP = new Map<string, (data: any) => Promise<HandlerResult>>([
    ['ADMIN_GET_USERS', handleGetAllUsers],
    ['ADMIN_GET_USER_BY_ID', handleGetUserById],
    ['ADMIN_CREATE_USER', handleCreateUser],
    ['ADMIN_UPDATE_USER', handleUpdateUser],
    ['ADMIN_DELETE_USER', handleDeleteUser],
]);
