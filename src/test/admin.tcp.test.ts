import { sendTCPRequest } from '../tcp/client';

interface TCPResponse<T = any> {
    statusCode: number;
    data?: T;
    message?: string;
    error?: string;
}

class AdminUserTCPTest {
    private testUserId?: number;
    private testEmail = `test.admin.${Date.now()}@example.com`;

    private async send<T>(type: string, data: any): Promise<TCPResponse<T>> {
        const res = (await sendTCPRequest({ type, data })) as TCPResponse<T>;
        const prefix = res.statusCode >= 400 ? '❌' : '✅';
        console.log(`${prefix} [${type}] - ${res.message || res.error}`);
        if (res.data) console.dir(res.data, { depth: null });
        return res;
    }

    async run() {
        console.log('\n🚀 Running Admin TCP Test Suite');

        // ===== User CRUD =====
        // await this.testGetAllUsers();
        // await this.testCreateUser();
        // await this.testGetUserById();
        // await this.testUpdateUser();
        // await this.testResetPassword();
        // await this.testDeleteUser();
        // await this.testGetDeletedUsers();
        // await this.testRestoreUser();

        // ===== Role & Permission =====
        // await this.testGetAllRoles();
        // await this.testCreateRole();
        // await this.testAssignPermissionsToRole();
        // await this.testGetPermissionsByRole();
        // await this.testGetAllPermissions();
        // await this.testDeleteRole();

        // ===== Status change =====
        await this.testBlockUnblockActivate();

        console.log('\n✅ All TCP tests completed.');
    }

    // ==== USER ====
    async testGetAllUsers() {
        await this.send('ADMIN_GET_USERS', {});
    }

    async testCreateUser() {
        const res = await this.send<{ id: number }>('ADMIN_CREATE_USER', {
            email: this.testEmail,
            password: 'Test@1234',
            name: 'TCP User',
            phone: '0988098782',
            role: 'MANAGER',
        });

        this.testUserId = res.data?.id;
    }

    async testGetUserById() {
        await this.send('ADMIN_GET_USER_BY_ID', { id: this.testUserId });
    }

    async testUpdateUser() {
        await this.send('ADMIN_UPDATE_USER', {
            id: this.testUserId,
            data: {
                name: 'TCP Updated',
                phone: '0988098782',
            },
        });
    }

    async testResetPassword() {
        await this.send('ADMIN_RESET_USER_PASSWORD', {
            id: this.testUserId,
            newPassword: 'HoangTM2512@'
        });
    }

    async testDeleteUser() {
        await this.send('ADMIN_DELETE_USER', { id: this.testUserId });
    }

    async testGetDeletedUsers() {
        await this.send('ADMIN_GET_DELETED_USERS', {});
    }

    async testRestoreUser() {
        await this.send('ADMIN_RESTORE_USER', { id: this.testUserId });
    }

    // ==== ROLE & PERMISSION ====
    private testRoleId?: number;

    async testGetAllRoles() {
        await this.send('ADMIN_GET_ROLES', {});
    }

    async testCreateRole() {
        const res = await this.send<{ id: number }>('ADMIN_CREATE_ROLE', {
            name: `TEST_ROLE_${Date.now()}`,
        });
        this.testRoleId = res.data?.id;
    }

    async testAssignPermissionsToRole() {
        if (!this.testRoleId) return;
        await this.send('ADMIN_ASSIGN_PERMISSIONS_TO_ROLE', {
            roleId: this.testRoleId,
            permissionIds: [1, 2], // test permission IDs
        });
    }

    async testGetPermissionsByRole() {
        await this.send('ADMIN_GET_PERMISSIONS_BY_ROLE', {
            roleId: this.testRoleId,
        });
    }

    async testGetAllPermissions() {
        await this.send('ADMIN_GET_PERMISSIONS', {});
    }

    async testDeleteRole() {
        if (!this.testRoleId) return;
        await this.send('ADMIN_DELETE_ROLE', { id: this.testRoleId });
    }

    // ==== BLOCK / ACTIVATE ====
    async testBlockUnblockActivate() {
        await this.send('ADMIN_BLOCK_USER', { id: 15 });
            await this.send('ADMIN_UNBLOCK_USER', { id: 15 });
            await this.send('ADMIN_ACTIVATE_USER', { id: 15 });
        // 
    }
}

(async () => {
    const tester = new AdminUserTCPTest();
    await tester.run();
})();
