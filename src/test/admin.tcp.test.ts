import { sendTCPRequest } from '../tcp/client';

interface TCPResponse<T = any> {
    statusCode: number;
    data?: T;
    message?: string;
    error?: string;
}

class AdminUserTCPTest {
    private testUserId?: number;
    private testRoleId?: number = 5;
    private adminId = 5;
    private testEmail = `test.admin.${Date.now()}@example.com`;

    private async send<T>(type: string, data: any): Promise<TCPResponse<T>> {
        const res = (await sendTCPRequest({ type, data })) as TCPResponse<T>;
        const prefix = res.statusCode >= 400 ? '❌' : '✅';
        console.log(`${prefix} [${type}] - ${res.message || res.error}`);
        if (res) console.dir(res);
        return res;
    }

    async run() {
        console.log('\n🚀 Running Admin TCP Test Suite');

        // === USER CRUD ===
        // await this.testGetAllUsers();
        await this.testCreateUser();
        // await this.testGetUserById();
        // await this.testUpdateUser();
        // await this.testResetPassword();

        // // === STATUS ===
        // await this.testBlockUser();
        // await this.testUnblockUser();
        // await this.testActivateUser();

        // // === ROLE & PERMISSION ===
        // await this.testGetAllRoles();
        // await this.testCreateRole();
        // await this.testAssignPermissionsToRole();
        // await this.testGetPermissionsByRole();
        // await this.testGetAllPermissions();

        // // === DELETE & RESTORE ===
        // await this.testDeleteUser();
        // await this.testGetDeletedUsers();
        // await this.testRestoreUser();
        // await this.testDeleteRole();

        // // === REPORTS ===
        // await this.testGetMonthlyReport();
        // await this.testExportMonthlyPDF();
        // await this.testExportMultiMonthPDF();
        console.log('\n✅ All TCP tests completed.');
    }

    // === USER TESTS ===

    async testGetAllUsers() {
        await this.send('ADMIN_GET_USERS', {});
    }

    async testCreateUser() {
        const res = await this.send<{ id: number }>('ADMIN_CREATE_USER', {
            email: this.testEmail,
            password: 'Test@1234',
            name: 'TCP Test User',
            phone: '0988888888',
            role: 'MANAGER',
            adminId: this.adminId,
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
                name: 'TCP Updated Name',
                phone: '0911999999',
            },
            adminId: this.adminId,
        });
    }

    async testResetPassword() {
        await this.send('ADMIN_RESET_USER_PASSWORD', {
            id: this.testUserId,
            newPassword: 'StrongPass123@',
            adminId: this.adminId,
        });
    }

    async testBlockUser() {
        await this.send('ADMIN_BLOCK_USER', {
            id: this.testUserId,
            adminId: this.adminId,
        });
    }

    async testUnblockUser() {
        await this.send('ADMIN_UNBLOCK_USER', {
            id: this.testUserId,
            adminId: this.adminId,
        });
    }

    async testActivateUser() {
        await this.send('ADMIN_ACTIVATE_USER', {
            id: this.testUserId,
            adminId: this.adminId,
        });
    }

    async testDeleteUser() {
        await this.send('ADMIN_DELETE_USER', {
            id: this.testUserId,
            adminId: this.adminId,
        });
    }

    async testGetDeletedUsers() {
        await this.send('ADMIN_GET_DELETED_USERS', {});
    }

    async testRestoreUser() {
        await this.send('ADMIN_RESTORE_USER', {
            id: this.testUserId,
            adminId: this.adminId,
        });
    }

    // === ROLE & PERMISSION ===

    async testGetAllRoles() {
        await this.send('ADMIN_GET_ROLES', {});
    }

    async testCreateRole() {
        const res = await this.send<{ id: number }>('ADMIN_CREATE_ROLE', {
            name: `TCP_ROLE_${Date.now()}`,
            adminId: this.adminId,
        });
        this.testRoleId = res.data?.id;
    }

    async testAssignPermissionsToRole() {
        if (!this.testRoleId) return;
        await this.send('ADMIN_ASSIGN_PERMISSIONS_TO_ROLE', {
            roleId: this.testRoleId,
            permissionIds: [1, 2],
            adminId: this.adminId,
        });
    }

    async testGetPermissionsByRole() {
        if (!this.testRoleId) return;
        await this.send('ADMIN_GET_PERMISSIONS_BY_ROLE', {
            roleId: this.testRoleId,
        });
    }

    async testGetAllPermissions() {
        await this.send('ADMIN_GET_PERMISSIONS', {});
    }

    async testDeleteRole() {
        if (!this.testRoleId) return;
        await this.send('ADMIN_DELETE_ROLE', {
            id: this.testRoleId,
            adminId: this.adminId,
        });
    }


    async testGetMonthlyReport() {
        await this.send('ADMIN_GET_MONTHLY_REPORT', {
            month: 7,
            year: 2025,
            adminId: this.adminId,
        });
    }

    async testExportMonthlyPDF() {
        const res = await this.send<string>('ADMIN_EXPORT_MONTHLY_PDF', {
            month: 7,
            year: 2025,
            adminId: this.adminId,
        });

        if (res.data) {
            const buffer = Buffer.from(res.data, 'base64');
            console.log(`📄 Monthly PDF size: ${buffer.length} bytes`);
        }
    }

    async testExportMultiMonthPDF() {
        const res = await this.send<string>('ADMIN_EXPORT_MULTI_MONTHS_PDF', {
            startMonth: 4,
            startYear: 2025,
            endMonth: 7,
            endYear: 2025,
            adminId: this.adminId,
        });

        if (res.data) {
            const buffer = Buffer.from(res.data, 'base64');
            console.log(`📄 Multi-month PDF size: ${buffer.length} bytes`);
        }
    }
}

// Auto run
(async () => {
    const tester = new AdminUserTCPTest();
    await tester.run();
})();
