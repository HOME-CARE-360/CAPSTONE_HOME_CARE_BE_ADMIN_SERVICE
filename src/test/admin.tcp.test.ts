import { sendTCPRequest } from '../tcp/client';

interface TCPResponse<T = any> {
    statusCode: number;
    data?: T;
    message?: string;
    error?: string;
}

interface UserResponse {
    id: number;
    email: string;
    name: string;
    phone: string;
    status: string;
    Role_UserRoles: { id: number; name: string }[];
}

interface AdminUserTestConfig {
    userId?: number;
    email: string;
}

class AdminUserTest {
    private config: AdminUserTestConfig;

    constructor(config: AdminUserTestConfig) {
        this.config = config;
    }

    private async send<T = any>(type: string, data: any): Promise<TCPResponse<T>> {
        const res = (await sendTCPRequest({ type, data })) as TCPResponse<T>;
        const logPrefix = res.statusCode >= 400 ? '❌' : '✅';
        console.log(`${logPrefix} [${type}] - ${res.message || res.error}`);
        if (res.data) console.dir(res.data, { depth: null });
        return res;
    }

    async getAllUsers() {
        const testCases = [
            { desc: 'Default (no params)', payload: {} },
            { desc: 'Pagination: page 2, limit 1', payload: { page: 2, limit: 1 } },
            { desc: 'Search by email', payload: { search: 'test.manager' } },
            { desc: 'Filter by status INACTIVE', payload: { status: 'INACTIVE' } },
            { desc: 'Sort by createdAt asc', payload: { sortBy: 'createdAt', sortOrder: 'asc' } },
            { desc: 'Sort by name desc', payload: { sortBy: 'name', sortOrder: 'desc' } },
        ];

        for (const testCase of testCases) {
            console.log(`\n🔍 [Test] ${testCase.desc}`);
            await this.send('ADMIN_GET_USERS', testCase.payload);
        }
    }


    async createUser(): Promise<TCPResponse<UserResponse>> {
        const result = await this.send<UserResponse>('ADMIN_CREATE_USER', {
            email: this.config.email,
            password: 'HoangTM2511@',
            name: 'Hoang Manager',
            phone: '0901234567',
            role: 'MANAGER',
        });

        if (result.statusCode !== 200 || !result.data?.id) {
            console.error('❌ Failed to create user:', result.error || result.message);
            return result;
        }

        this.config.userId = result.data.id;
        return result;
    }

    async getUserById(userId?: number) {
        const id = userId ?? this.config.userId;
        if (!id) throw new Error('userId is missing');
        return this.send<UserResponse>('ADMIN_GET_USER_BY_ID', { id });
    }

    async updateUser(userId?: number) {
        const id = userId ?? this.config.userId;
        if (!id) throw new Error('userId is missing');

        return this.send<UserResponse>('ADMIN_UPDATE_USER', {
            id,
            data: {
                name: 'Updated Manager',
                phone: '0999999999',
            },
        });
    }

    async deleteUser(userId?: number) {
        const id = userId ?? this.config.userId;
        if (!id) throw new Error('userId is missing');
        return this.send<UserResponse>('ADMIN_DELETE_USER', { id });
    }

    async runAllTests() {
        console.log('🚀 Start ADMIN USER TEST SUITE\n');

        await this.getAllUsers();

        const created = await this.createUser();
        if (created.statusCode !== 200 || !this.config.userId) {
            console.error('❌ Failed to create user. Aborting tests.');
            return;
        }

        await this.getUserById();
        await this.updateUser();
        await this.deleteUser();

        console.log('\n✅ All tests finished');
    }
}

// Main run
(async () => {
    const test = new AdminUserTest({
        email: `test.manager.${Date.now()}@example.com`,
    });

    await test.runAllTests();
})();
