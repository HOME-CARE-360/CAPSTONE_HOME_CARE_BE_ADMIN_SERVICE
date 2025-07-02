import bcrypt from 'bcrypt';
import {
  CreateUserDTO,
  UpdateUserDTO,
  GetUsersQuery,
} from '../schemas/type';
import { AppError } from '../handlers/error';
import { AdminRepository } from '../repositories/admin.repository';
import { UserStatus } from '../generated/prisma';

export class AdminService {
  private static readonly BCRYPT_ROUNDS = 12;
  private static readonly DEFAULT_USER_STATUS = UserStatus.ACTIVE;

  constructor(private readonly adminRepository: AdminRepository) { }

  // =================== USER ===================

  async getAllUsers(query: GetUsersQuery) {
    return this.adminRepository.findAll(query);
  }

  async getUserById(id: number) {
    return this.adminRepository.findById(id);
  }

  async createUser(data: CreateUserDTO, adminId: number) {
    const existingUser = await this.adminRepository.findByEmailOrThrow(data.email);
    if (existingUser) {
      throw new AppError(
        'Error.EmailExists',
        [{ message: 'Email already in use', path: ['email'] }],
        { email: data.email },
        400
      );
    }

    const role = await this.adminRepository.findRoleByName(data.role);
    if (!role) {
      throw new AppError(
        'Error.RoleNotFound',
        [{ message: `Role ${data.role} not found`, path: ['role'] }],
        { role: data.role },
        400
      );
    }

    const hashedPassword = await this.hashPassword(data.password);

    return this.adminRepository.create(
      {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        phone: data.phone,
        avatar: data.avatar,
        status: data.status ?? AdminService.DEFAULT_USER_STATUS,
        roleIds: [role.id],
      },
      adminId // createdById
    );
  }

  async updateUser(id: number, data: UpdateUserDTO, adminId: number) {
    if (data.password) {
      data.password = await this.hashPassword(data.password);
    }
    return this.adminRepository.update(id, data, adminId); // updatedById
  }

  async deleteUser(id: number, adminId: number) {
    return this.adminRepository.softDelete(id, adminId); // deletedById
  }

  async blockUser(id: number, adminId: number) {
    return this.adminRepository.blockUser(id, adminId); // updatedById
  }

  async unblockUser(id: number, adminId: number) {
    return this.adminRepository.unblockUser(id, adminId); // updatedById
  }

  async activateUser(id: number, adminId: number) {
    return this.adminRepository.activateUser(id, adminId); // updatedById
  }

  async resetUserPassword(id: number, newPassword: string, adminId: number) {
    const hashedPassword = await this.hashPassword(newPassword);
    return this.adminRepository.resetUserPassword(id, hashedPassword, adminId); // updatedById
  }

  async assignRolesToUser(data: { userId: number; roleIds: number[] }, adminId: number) {
    return this.adminRepository.assignRolesToUser(data, adminId); // updatedById
  }

  async getUserRoles(userId: number) {
    return this.adminRepository.getUserRoles(userId);
  }

  // =================== ROLE ===================

  async getAllRoles() {
    return this.adminRepository.getAllRoles();
  }

  async getRoleById(id: number) {
    return this.adminRepository.getRoleById(id);
  }

  async createRole(name: string, adminId: number) {
    return this.adminRepository.createRole({ name }, adminId); // createdById
  }

  async updateRole(id: number, name: string, adminId: number) {
    return this.adminRepository.updateRole(id, { name }, adminId); // updatedById
  }

  async deleteRole(id: number, adminId: number) {
    return this.adminRepository.deleteRole(id, adminId); // deletedById
  }

  // =================== PERMISSION ===================

  async getPermissionsByRole(roleId: number) {
    return this.adminRepository.getPermissionsByRole(roleId);
  }

  async assignPermissionToRole(roleId: number, permissionIds: number[], adminId: number) {
    return this.adminRepository.assignPermissionToRole(roleId, permissionIds, adminId); // updatedById
  }

  async getAllPermissions() {
    return this.adminRepository.getAllPermissions();
  }

  // =================== STATS ===================

  async getUserStatistics() {
    return this.adminRepository.getUserStatistics();
  }

  async getRoleStatistics() {
    return this.adminRepository.getRoleStatistics();
  }

  async getUserActivity(userId: number) {
    return this.adminRepository.getUserActivity(userId);
  }

  async getDeletedUsers() {
    return this.adminRepository.getDeletedUsers();
  }

  async restoreDeletedUser(id: number, adminId: number) {
    return this.adminRepository.restoreUser(id, adminId); 
  }

  // =================== PRIVATE ===================

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, AdminService.BCRYPT_ROUNDS);
  }

  private async validateUserPermission(userId: number, requiredPermission: string): Promise<boolean> {
    const userRoles = await this.getUserRoles(userId);
    const roleIds = userRoles.map((role) => role.id);
    if (roleIds.length === 0) return false;

    const permissions = await Promise.all(roleIds.map((id) => this.getPermissionsByRole(id)));
    return permissions.flat().some((p) => p.name === requiredPermission);
  }
}
