import bcrypt from 'bcrypt';
import { CreateUserDTO, UpdateUserDTO, GetUsersQuery } from '../schemas/type';
import { AppError } from '../handlers/error';
import { AdminRepository } from '../repositories/admin.repository';

export class AdminUserService {
  constructor(private readonly repo: AdminRepository) { }

  async getAllUsers(query: GetUsersQuery) {
    return this.repo.findAll(query);
  }

  async getUserById(id: number) {
    const user = await this.repo.findById(id);
    if (!user) {
      throw new AppError(
        'Error.UserNotFound',
        [{ message: 'User not found', path: ['id'] }],
        { id },
        404
      );
    }
    return user;
  }

  async createUser(data: CreateUserDTO) {
    const existing = await this.repo.findByEmail(data.email);
    if (existing) {
      throw new AppError(
        'Error.EmailExists',
        [{ message: 'Email already in use', path: ['email'] }],
        { email: data.email },
        400
      );
    }

    const role = await this.repo.findRoleByName(data.role);
    if (!role) {
      throw new AppError(
        'Error.RoleNotFound',
        [{ message: `Role ${data.role} not found`, path: ['role'] }],
        { role: data.role },
        400
      );
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const now = new Date();
    return this.repo.create({
      email: data.email,
      password: hashedPassword,
      name: data.name,
      phone: data.phone,
      avatar: data.avatar,
      status: data.status ?? 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      Role_UserRoles: {
        connect: [{ id: role.id }],
      },
    });
  }

  async updateUser(id: number, data: UpdateUserDTO) {
    const updateData: any = { ...data };
    if (data.roleIds) {
      updateData.Role_UserRoles = {
        set: data.roleIds.map((roleId) => ({ id: roleId })),
      };
    }

    return this.repo.update(id, updateData);
  }

  async deleteUser(id: number) {
    return this.repo.softDelete(id);
  }
}
