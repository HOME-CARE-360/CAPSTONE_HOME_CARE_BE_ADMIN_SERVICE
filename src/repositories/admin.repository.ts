import { PrismaClient, Prisma, UserStatus } from '../generated/prisma';
import { AppError } from '../handlers/error';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

interface PaginationParams {
  page?: number;
  limit?: number;
}

interface UserSearchParams extends PaginationParams {
  search?: string;
  status?: UserStatus;
  sortBy?: keyof Prisma.UserOrderByWithRelationInput;
  sortOrder?: 'asc' | 'desc';
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface CreateRoleInput {
  name: string;
}

interface UpdateRoleInput {
  name?: string;
}

interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  phone: string;
  avatar?: string;
  status?: UserStatus;
  roleIds?: number[];
}

interface UpdateUserInput {
  email?: string;
  name?: string;
  phone?: string;
  avatar?: string;
  status?: UserStatus;
  roleIds?: number[];
}

interface UserAssignRolesInput {
  userId: number;
  roleIds: number[];
}

export interface UserResponse {
  id: number;
  email: string;
  name: string;
  phone: string;
  avatar?: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  customer?: {
    id: number;
    address?: string;
    dateOfBirth?: Date;
    gender?: string;
    rewardPoints?: number;
    totalBookings?: number;
  };
  staff?: {
    id: number;
    isActive: boolean;
    jobTitle?: string;
    joinedAt?: Date;
    totalReviews?: number;
    provider?: {
      id: number;
      name: string;
      verificationStatus: string;
      address?: string;
      industry?: string;
      companyType?: string;
    };
  };
  provider?: {
    id: number;
    description?: string;
    address?: string;
    verificationStatus: string;
    companyType?: string;
    industry?: string;
    taxId?: string;
    licenseNo?: string;
    verifiedAt?: Date;
    staffCount?: number;
    serviceCount?: number;
  };
  roles: Array<{
    id: number;
    name: string;
  }>;
}

interface RoleResponse {
  id: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  permissions: Array<{
    id: number;
    name: string;
    description?: string;
    path: string;
    method: string;
    module: string;
  }>;
  userCount: number;
}

interface PermissionResponse {
  id: number;
  name: string;
  description?: string;
  path: string;
  method: string;
  module: string;
  createdAt: Date;
  updatedAt: Date;
}

export class AdminRepository {
  private static readonly DEFAULT_PAGE = 1;
  private static readonly DEFAULT_LIMIT = 10;
  private static readonly DEFAULT_SORT_BY = 'createdAt';
  private static readonly DEFAULT_SORT_ORDER = 'desc';
  private static readonly BCRYPT_ROUNDS = 10;
  private static readonly MAX_LIMIT = 100;

  private static readonly USER_INCLUDE = {
    CustomerProfile: {
      select: {
        id: true,
        address: true,
        dateOfBirth: true,
        gender: true,
      }
    },
    Staff: {
      select: {
        id: true,
        isActive: true,
        ServiceProvider: {
          select: {
            id: true,
            description: true,
            address: true,
            verificationStatus: true,
          }
        }
      }
    },
    ServiceProvider_ServiceProvider_userIdToUser: {
      select: {
        id: true,
        description: true,
        address: true,
        verificationStatus: true,
      }
    },
    Device: {
      select: {
        id: true,
        userAgent: true,
        ip: true,
        lastActive: true,
        isActive: true,
      }
    },
    Role_UserRoles: {
      select: {
        id: true,
        name: true,
      }
    },
    _count: {
      select: {
        Notification: true,
        RefreshToken: true,
      }
    }
  } as const;

  private static readonly ROLE_INCLUDE = {
    Permission: {
      select: {
        id: true,
        name: true,
        description: true,
        path: true,
        method: true,
        module: true,
      }
    },
    _count: {
      select: {
        User_UserRoles: true,
      }
    }
  } as const;

  // ==================== HELPER METHODS ====================

  private transformUser(user: any): UserResponse {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      avatar: user.avatar,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deletedAt: user.deletedAt,
      customer: user.CustomerProfile ? {
        id: user.CustomerProfile.id,
        address: user.CustomerProfile.address,
        dateOfBirth: user.CustomerProfile.dateOfBirth,
        gender: user.CustomerProfile.gender,
      } : undefined,
      staff: user.Staff ? {
        id: user.Staff.id,
        isActive: user.Staff.isActive,
        provider: user.Staff.ServiceProvider ? {
          id: user.Staff.ServiceProvider.id,
          name: user.Staff.ServiceProvider.description, // Assuming description acts as name
          verificationStatus: user.Staff.ServiceProvider.verificationStatus,
        } : undefined,
      } : undefined,
      provider: user.ServiceProvider_ServiceProvider_userIdToUser ? {
        id: user.ServiceProvider_ServiceProvider_userIdToUser.id,
        description: user.ServiceProvider_ServiceProvider_userIdToUser.description,
        address: user.ServiceProvider_ServiceProvider_userIdToUser.address,
        verificationStatus: user.ServiceProvider_ServiceProvider_userIdToUser.verificationStatus,
      } : undefined,
      roles: user.Role_UserRoles.map((role: any) => ({
        id: role.id,
        name: role.name,
      })),
    };
  }

  private transformRole(role: any): RoleResponse {
    return {
      id: role.id,
      name: role.name,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      permissions: role.Permission.map((perm: any) => ({
        id: perm.id,
        name: perm.name,
        description: perm.description,
        path: perm.path,
        method: perm.method,
        module: perm.module,
      })),
      userCount: role._count.User_UserRoles,
    };
  }

  private transformPermission(permission: any): PermissionResponse {
    return {
      id: permission.id,
      name: permission.name,
      description: permission.description,
      path: permission.path,
      method: permission.method,
      module: permission.module,
      createdAt: permission.createdAt,
      updatedAt: permission.updatedAt,
    };
  }

  // ==================== USER MANAGEMENT ====================

  async findAll(params?: UserSearchParams): Promise<PaginatedResult<UserResponse>> {
    const {
      page = AdminRepository.DEFAULT_PAGE,
      limit: requestedLimit = AdminRepository.DEFAULT_LIMIT,
      search,
      status,
      sortBy = AdminRepository.DEFAULT_SORT_BY,
      sortOrder = AdminRepository.DEFAULT_SORT_ORDER,
    } = params || {};

    // Validate and sanitize inputs
    const validatedPage = Math.max(1, page);
    const validatedLimit = Math.min(Math.max(1, requestedLimit), AdminRepository.MAX_LIMIT);

    if (sortBy && !this._isValidSortField(sortBy)) {
      throw new AppError(
        'Invalid sort field',
        [{ message: 'Error.InvalidSortField', path: ['sortBy'] }],
        { sortBy },
        400
      );
    }

    // Build where clause
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(status && { status }),
      ...(search && {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    // Execute queries in parallel
    const [totalCount, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (validatedPage - 1) * validatedLimit,
        take: validatedLimit,
        include: AdminRepository.USER_INCLUDE,
      }),
    ]);

    const totalPages = Math.ceil(totalCount / validatedLimit);

    return {
      data: users.map(user => this.transformUser(user)),
      total: totalCount,
      page: validatedPage,
      limit: validatedLimit,
      totalPages,
      hasNext: validatedPage < totalPages,
      hasPrev: validatedPage > 1,
    };
  }

  async findById(id: number): Promise<UserResponse> {
    this._validateId(id);

    const user = await prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: AdminRepository.USER_INCLUDE,
    });

    if (!user) {
      throw new AppError(
        'User not found',
        [{ message: 'Error.UserNotFound', path: ['id'] }],
        { id },
        404
      );
    }

    return this.transformUser(user);
  }

  async findByEmailOrThrow(email: string): Promise<UserResponse | null> {
    this._validateEmail(email);

    const user = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase().trim(),
        deletedAt: null,
      },
      include: AdminRepository.USER_INCLUDE,
    });

    return user ? this.transformUser(user) : null;
  }

  async create(data: CreateUserInput, adminId: number): Promise<UserResponse> {
    await this._validateUserCreation(data);

    const now = new Date();
    const hashedPassword = await bcrypt.hash(data.password, AdminRepository.BCRYPT_ROUNDS);

    const createData: Prisma.UserCreateInput = {
      email: data.email.toLowerCase().trim(),
      password: hashedPassword,
      name: data.name.trim(),
      phone: data.phone.trim(),
      avatar: data.avatar,
      status: data.status || UserStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
      User_User_createdByIdToUser: {
        connect: { id: adminId }
      },
      ...(data.roleIds && {
        Role_UserRoles: {
          connect: data.roleIds.map(id => ({ id }))
        }
      }),
    };

    try {
      const user = await prisma.user.create({
        data: createData,
        include: AdminRepository.USER_INCLUDE,
      });
      return this.transformUser(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new AppError(
            'User already exists',
            [{ message: 'Error.UserAlreadyExists', path: ['email'] }],
            { email: data.email },
            409
          );
        }
      }
      throw error;
    }
  }

  async update(id: number, data: UpdateUserInput, adminId?: number): Promise<UserResponse> {
    this._validateId(id);
    await this._assertUserExists(id);
    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { deletedAt: true, status: true }
    });

    if (existingUser?.deletedAt) {
      throw new AppError(
        'Cannot update deleted user',
        [{ message: 'Error.UserDeleted', path: ['id'] }],
        { id },
        400
      );
    }

    const updateData: Prisma.UserUpdateInput = {
      updatedAt: new Date(),
      ...(data.email && { email: data.email.toLowerCase().trim() }),
      ...(data.name && { name: data.name.trim() }),
      ...(data.phone && { phone: data.phone.trim() }),
      ...(data.avatar !== undefined && { avatar: data.avatar }),
      ...(data.status && { status: data.status }),
      ...(adminId && {
        User_User_updatedByIdToUser: {
          connect: { id: adminId }
        }
      }),
      ...(data.roleIds && {
        Role_UserRoles: {
          set: data.roleIds.map(id => ({ id }))
        }
      }),
    };

    try {
      const user = await prisma.user.update({
        where: { id },
        data: updateData,
        include: AdminRepository.USER_INCLUDE,
      });
      return this.transformUser(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new AppError(
            'Email already exists',
            [{ message: 'Error.EmailExists', path: ['email'] }],
            { email: data.email },
            409
          );
        }
      }
      throw error;
    }
  }

  async softDelete(id: number, adminId?: number): Promise<UserResponse> {
    this._validateId(id);
    await this._assertUserExists(id);
    await this._validateUserDeletion(id);

    const user = await prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedAt: new Date(),
        status: UserStatus.INACTIVE,
        ...(adminId && {
          User_User_deletedByIdToUser: {
            connect: { id: adminId }
          }
        }),
      },
      include: AdminRepository.USER_INCLUDE,
    });

    return this.transformUser(user);
  }

  async blockUser(id: number, adminId?: number): Promise<UserResponse> {
    this._validateId(id);
    await this._assertUserActiveStatus(id);

    const user = await prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.BLOCKED,
        updatedAt: new Date(),
        User_User_updatedByIdToUser: {
          connect: { id: adminId }
        }
      },
      include: AdminRepository.USER_INCLUDE,
    });

    return this.transformUser(user);
  }

  async unblockUser(id: number, adminId?: number): Promise<UserResponse> {
    this._validateId(id);
    await this._assertUserBlockedStatus(id);

    const user = await prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.ACTIVE,
        updatedAt: new Date(),
        User_User_updatedByIdToUser: {
          connect: { id: adminId }
        }
      },
      include: AdminRepository.USER_INCLUDE,
    });

    return this.transformUser(user);
  }

  async activateUser(id: number, adminId?: number): Promise<UserResponse> {
    this._validateId(id);
    await this._assertUserExists(id);

    const user = await prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.ACTIVE,
        updatedAt: new Date(),
        User_User_updatedByIdToUser: {
          connect: { id: adminId }
        }
      },
      include: AdminRepository.USER_INCLUDE,
    });

    return this.transformUser(user);
  }

async resetUserPassword(id: number, hashedPassword: string, adminId?: number): Promise<UserResponse> {
  this._validateId(id);
  await this._assertUserExists(id);

  const user = await prisma.user.update({
    where: { id },
    data: {
      password: hashedPassword,
      updatedAt: new Date(),
      ...(adminId && {
        User_User_updatedByIdToUser: {
          connect: { id: adminId }
        }
      }),
    },
    include: AdminRepository.USER_INCLUDE,
  });

  return this.transformUser(user);
}


  async assignRolesToUser(data: UserAssignRolesInput, adminId?: number): Promise<UserResponse> {
    this._validateId(data.userId);
    this._validateRoleIds(data.roleIds);

    await this._assertUserExists(data.userId);
    await this._validateRoleIds(data.roleIds);

    const user = await prisma.user.update({
      where: { id: data.userId },
      data: {
        updatedAt: new Date(),
        ...(adminId && {
          User_User_updatedByIdToUser: {
            connect: { id: adminId }
          }
        }),
        Role_UserRoles: {
          set: data.roleIds.map(id => ({ id }))
        }
      },
      include: AdminRepository.USER_INCLUDE,
    });

    return this.transformUser(user);
  }

  async getUserRoles(userId: number): Promise<Array<{ id: number; name: string }>> {
    this._validateId(userId);
    await this._assertUserExists(userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        Role_UserRoles: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    });

    return user?.Role_UserRoles || [];
  }

  // ==================== ROLE & PERMISSION MANAGEMENT ====================

async getAllRoles(params?: PaginationParams): Promise<PaginatedResult<RoleResponse>> {
  const {
    page = AdminRepository.DEFAULT_PAGE,
    limit = AdminRepository.DEFAULT_LIMIT,
  } = params || {};

  const validatedPage = Math.max(1, page);
  const validatedLimit = Math.min(Math.max(1, limit), AdminRepository.MAX_LIMIT);

  const [totalCount, roles] = await Promise.all([
    prisma.role.count({ where: { deletedAt: null } }),
    prisma.role.findMany({
      where: { deletedAt: null },
      include: AdminRepository.ROLE_INCLUDE,
      orderBy: { name: 'asc' },
      skip: (validatedPage - 1) * validatedLimit,
      take: validatedLimit,
    }),
  ]);

  const totalPages = Math.ceil(totalCount / validatedLimit);

  return {
    data: roles.map(role => this.transformRole(role)),
    total: totalCount,
    page: validatedPage,
    limit: validatedLimit,
    totalPages,
    hasNext: validatedPage < totalPages,
    hasPrev: validatedPage > 1,
  };
}

  async getRoleById(id: number): Promise<RoleResponse> {
    this._validateId(id);

    const role = await prisma.role.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!role) {
      throw new AppError(
        'Role not found',
        [{ message: 'Error.RoleNotFound', path: ['id'] }],
        { id },
        404
      );
    }

    return this.transformRole(role);
  }


  async createRole(data: CreateRoleInput, adminId: number): Promise<RoleResponse> {
    this._validateRoleName(data.name);

    const existing = await prisma.role.findFirst({
      where: {
        name: { equals: data.name, mode: 'insensitive' },
        deletedAt: null,
      }
    });

    if (existing) {
      throw new AppError(
        'Role name already exists',
        [{ message: 'Error.RoleNameExists', path: ['name'] }],
        { name: data.name },
        409
      );
    }

    const now = new Date();
    const role = await prisma.role.create({
      data: {
        name: data.name.trim(),
        createdAt: now,
        updatedAt: now,
        User_Role_createdByIdToUser: {
          connect: { id: adminId }
        }
      },
      include: AdminRepository.ROLE_INCLUDE,
    });

    return this.transformRole(role);
  }

  async updateRole(id: number, data: UpdateRoleInput, adminId?: number): Promise<RoleResponse> {
    this._validateId(id);
    await this._assertRoleExists(id);

    if (data.name) {
      this._validateRoleName(data.name);

      const existing = await prisma.role.findFirst({
        where: {
          name: { equals: data.name, mode: 'insensitive' },
          deletedAt: null,
          id: { not: id },
        }
      });

      if (existing) {
        throw new AppError(
          'Role name already exists',
          [{ message: 'Error.RoleNameExists', path: ['name'] }],
          { name: data.name },
          409
        );
      }
    }

    const role = await prisma.role.update({
      where: { id },
      data: {
        ...data,
        ...(data.name && { name: data.name.trim() }),
        updatedAt: new Date(),
        ...(adminId && {
          User_Role_updatedByIdToUser: {
            connect: { id: adminId }
          }
        }),
      },
      include: AdminRepository.ROLE_INCLUDE,
    });

    return this.transformRole(role);
  }

  async deleteRole(id: number, adminId?: number): Promise<RoleResponse> {
    this._validateId(id);
    await this._assertRoleExists(id);
    const usageCount = await prisma.user.count({
      where: {
        Role_UserRoles: {
          some: { id }
        }
      }
    });

    if (usageCount > 0) {
      throw new AppError(
        'Cannot delete role that is currently assigned to users',
        [{ message: 'Error.RoleInUse', path: ['id'] }],
        { id, usageCount },
        400
      );
    }

    const role = await prisma.role.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedAt: new Date(),
        ...(adminId && {
          User_Role_deletedByIdToUser: {
            connect: { id: adminId }
          }
        }),
      },
      include: AdminRepository.ROLE_INCLUDE,
    });

    return this.transformRole(role);
  }

async getPermissionsByRole(
  roleId: number,
  params?: PaginationParams
): Promise<PaginatedResult<PermissionResponse>> {
  this._validateId(roleId);

  const {
    page = AdminRepository.DEFAULT_PAGE,
    limit = AdminRepository.DEFAULT_LIMIT,
  } = params || {};

  const validatedPage = Math.max(1, page);
  const validatedLimit = Math.min(Math.max(1, limit), AdminRepository.MAX_LIMIT);

  const role = await prisma.role.findUnique({
    where: { id: roleId, deletedAt: null },
    select: { id: true }
  });

  if (!role) {
    throw new AppError(
      'Role not found',
      [{ message: 'Error.RoleNotFound', path: ['roleId'] }],
      { roleId },
      404
    );
  }

  const [totalCount, permissions] = await Promise.all([
    prisma.permission.count({
      where: {
        deletedAt: null,
        Role: {
          some: {
            id: roleId
          }
        }
      }
    }),
    prisma.permission.findMany({
      where: {
        deletedAt: null,
        Role: {
          some: {
            id: roleId
          }
        }
      },
      orderBy: { name: 'asc' },
      skip: (validatedPage - 1) * validatedLimit,
      take: validatedLimit,
      select: {
        id: true,
        name: true,
        description: true,
        path: true,
        method: true,
        module: true,
        createdAt: true,
        updatedAt: true,
      }
    })
  ]);

  const totalPages = Math.ceil(totalCount / validatedLimit);

  return {
    data: permissions.map(this.transformPermission),
    total: totalCount,
    page: validatedPage,
    limit: validatedLimit,
    totalPages,
    hasNext: validatedPage < totalPages,
    hasPrev: validatedPage > 1,
  };
}

  async assignPermissionToRole(roleId: number, permissionIds: number[], adminId?: number): Promise<RoleResponse> {
    this._validateId(roleId);
    this._validatePermissionIds(permissionIds);

    await this._assertRoleExists(roleId);

    const existingPermissions = await prisma.permission.findMany({
      where: {
        id: { in: permissionIds },
        deletedAt: null,
      },
      select: { id: true }
    });

    const existingIds = existingPermissions.map(p => p.id);
    const invalidIds = permissionIds.filter(id => !existingIds.includes(id));

    if (invalidIds.length > 0) {
      throw new AppError(
        'Some permissions not found',
        [{ message: 'Error.PermissionsNotFound', path: ['permissionIds'] }],
        { invalidIds },
        400
      );
    }

    const role = await prisma.role.update({
      where: { id: roleId },
      data: {
        Permission: {
          set: permissionIds.map(id => ({ id })),
        },
        updatedAt: new Date(),
        ...(adminId && {
          User_Role_updatedByIdToUser: {
            connect: { id: adminId }
          }
        }),
      },
      include: AdminRepository.ROLE_INCLUDE,
    });

    return this.transformRole(role);
  }

async getAllPermissions(params?: PaginationParams): Promise<PaginatedResult<PermissionResponse>> {
  const {
    page = AdminRepository.DEFAULT_PAGE,
    limit = AdminRepository.DEFAULT_LIMIT,
  } = params || {};

  const validatedPage = Math.max(1, page);
  const validatedLimit = Math.min(Math.max(1, limit), AdminRepository.MAX_LIMIT);

  const [totalCount, permissions] = await Promise.all([
    prisma.permission.count({ where: { deletedAt: null } }),
    prisma.permission.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        path: true,
        method: true,
        module: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        { module: 'asc' },
        { name: 'asc' },
      ],
      skip: (validatedPage - 1) * validatedLimit,
      take: validatedLimit,
    }),
  ]);

  const totalPages = Math.ceil(totalCount / validatedLimit);

  return {
    data: permissions.map(perm => this.transformPermission(perm)),
    total: totalCount,
    page: validatedPage,
    limit: validatedLimit,
    totalPages,
    hasNext: validatedPage < totalPages,
    hasPrev: validatedPage > 1,
  };
}


  async findRoleByName(name: string): Promise<RoleResponse> {
    this._validateRoleName(name);

    const role = await prisma.role.findFirst({
      where: {
        name: { equals: name.trim(), mode: 'insensitive' },
        deletedAt: null,
      },
      include: AdminRepository.ROLE_INCLUDE,
    });

    if (!role) {
      throw new AppError(
        'Role not found',
        [{ message: 'Error.RoleNotFound', path: ['name'] }],
        { name },
        404
      );
    }

    return this.transformRole(role);
  }

  // ==================== STATISTICS & ANALYTICS ====================

async  getUserStatistics() {
  const [
    totalUsers,
    activeUsers,
    inactiveUsers,
    blockedUsers,
    usersWithCustomerProfile,
    usersWithServiceProvider,
    usersWithStaff
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, status: UserStatus.ACTIVE } }),
    prisma.user.count({ where: { deletedAt: null, status: UserStatus.INACTIVE } }),
    prisma.user.count({ where: { deletedAt: null, status: UserStatus.BLOCKED } }),
    prisma.user.count({
      where: {
        deletedAt: null,
        CustomerProfile: { isNot: null }
      }
    }),
    prisma.user.count({
      where: {
        deletedAt: null,
        ServiceProvider_ServiceProvider_userIdToUser: { isNot: null }
      }
    }),
    prisma.user.count({
      where: {
        deletedAt: null,
        Staff: { isNot: null }
      }
    }),
  ]);

  return {
    totals: {
      users: totalUsers,
      active: activeUsers,
      inactive: inactiveUsers,
      blocked: blockedUsers
    },
    types: {
      customers: usersWithCustomerProfile,
      serviceProviders: usersWithServiceProvider,
      staff: usersWithStaff,
      adminOnly: totalUsers - usersWithCustomerProfile - usersWithServiceProvider - usersWithStaff
    }
  };
}

async  getRoleStatistics() {
  const [totalRoles, rolesWithUsers] = await Promise.all([
    prisma.role.count({ where: { deletedAt: null } }),
    prisma.role.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        _count: {
          select: { User_UserRoles: true },
        },
      },
    }),
  ]);
  const totalUsersWithRole = rolesWithUsers.reduce(
    (sum, role) => sum + role._count.User_UserRoles,
    0
  );

  return {
    totalRoles,
    roles: rolesWithUsers.map((role) => ({
      id: role.id,
      name: role.name,
      userCount: role._count.User_UserRoles,
      percentage:
        totalUsersWithRole > 0
          ? Math.round((role._count.User_UserRoles / totalUsersWithRole) * 100)
          : 0,
    })),
  };
}


  // ==================== AUDIT & ACTIVITY LOGS ====================

  async getUserActivity(userId: number, limit: number = 50) {
    this._validateId(userId);

    const [devices, notifications, refreshTokens] = await Promise.all([
      prisma.device.findMany({
        where: { userId },
        orderBy: { lastActive: 'desc' },
        take: limit,
        select: {
          id: true,
          userAgent: true,
          ip: true,
          lastActive: true,
          isActive: true,
          createdAt: true,
        }
      }),
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          content: true,
          isRead: true,
          createdAt: true,
        }
      }),
      prisma.refreshToken.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          expiresAt: true,
          createdAt: true,
          Device: {
            select: {
              userAgent: true,
              ip: true,
            }
          }
        }
      })
    ]);

    return {
      devices: devices.map(device => ({
        id: device.id,
        userAgent: device.userAgent,
        ip: device.ip,
        lastActive: device.lastActive,
        isActive: device.isActive,
        createdAt: device.createdAt,
      })),
      notifications: notifications.map(notification => ({
        id: notification.id,
        content: notification.content,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
      })),
      sessions: refreshTokens.map(token => ({
        id: token.id,
        createdAt: token.createdAt,
        expiresAt: token.expiresAt,
        device: {
          userAgent: token.Device.userAgent,
          ip: token.Device.ip,
        }
      }))
    };
  }

  // ==================== DELETED USERS ====================

  async getDeletedUsers(params?: PaginationParams): Promise<PaginatedResult<UserResponse>> {
    const {
      page = AdminRepository.DEFAULT_PAGE,
      limit = AdminRepository.DEFAULT_LIMIT,
    } = params || {};

    const [totalCount, users] = await Promise.all([
      prisma.user.count({ where: { deletedAt: { not: null } } }),
      prisma.user.findMany({
        where: { deletedAt: { not: null } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { deletedAt: 'desc' },
        include: AdminRepository.USER_INCLUDE,
      }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return {
      data: users.map(user => this.transformUser(user)),
      total: totalCount,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async restoreUser(id: number, adminId?: number): Promise<UserResponse> {
    this._validateId(id);

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user || !user.deletedAt) {
      throw new AppError(
        'User is not deleted or not found',
        [{ message: 'Error.UserNotDeleted', path: ['id'] }],
        { id },
        400
      );
    }

    const restoredUser = await prisma.user.update({
      where: { id },
      data: {
        User_User_deletedByIdToUser: {
          disconnect: true
        },
        status: UserStatus.ACTIVE,
        deletedAt: null,
        updatedAt: new Date(),
        ...(adminId && {
          User_User_updatedByIdToUser: {
            connect: { id: adminId }
          }
        }),
      },
      include: AdminRepository.USER_INCLUDE,
    });

    return this.transformUser(restoredUser);
  }

  // ==================== PRIVATE VALIDATION METHODS ====================

  private _validateId(id: number) {
    if (!id || !Number.isInteger(id) || id <= 0) {
      throw new AppError(
        'Invalid ID',
        [{ message: 'Error.InvalidId', path: ['id'] }],
        { id },
        400
      );
    }
  }

  private _validateEmail(email: string) {
    if (!email || typeof email !== 'string') {
      throw new AppError(
        'Email is required',
        [{ message: 'Error.EmailRequired', path: ['email'] }],
        { email },
        400
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new AppError(
        'Invalid email format',
        [{ message: 'Error.InvalidEmail', path: ['email'] }],
        { email },
        400
      );
    }
  }

  private _validatePassword(password: string) {
    if (!password || typeof password !== 'string') {
      throw new AppError(
        'Password is required',
        [{ message: 'Error.PasswordRequired', path: ['password'] }],
        {},
        400
      );
    }

    if (password.length < 8) {
      throw new AppError(
        'Password must be at least 8 characters long',
        [{ message: 'Error.PasswordTooShort', path: ['password'] }],
        {},
        400
      );
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      throw new AppError(
        'Password must contain at least one lowercase letter, one uppercase letter, and one number',
        [{ message: 'Error.WeakPassword', path: ['password'] }],
        {},
        400
      );
    }
  }

  private _validateRoleName(name: string) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new AppError(
        'Role name is required',
        [{ message: 'Error.RoleNameRequired', path: ['name'] }],
        { name },
        400
      );
    }

    if (name.trim().length < 2 || name.trim().length > 50) {
      throw new AppError(
        'Role name must be between 2 and 50 characters',
        [{ message: 'Error.RoleNameLength', path: ['name'] }],
        { name },
        400
      );
    }
  }

  private _validatePermissionIds(permissionIds: number[]) {
    if (!Array.isArray(permissionIds) || permissionIds.length === 0) {
      throw new AppError(
        'Permission IDs are required',
        [{ message: 'Error.PermissionIdsRequired', path: ['permissionIds'] }],
        { permissionIds },
        400
      );
    }

    const invalidIds = permissionIds.filter(id => !Number.isInteger(id) || id <= 0);
    if (invalidIds.length > 0) {
      throw new AppError(
        'Invalid permission IDs',
        [{ message: 'Error.InvalidPermissionIds', path: ['permissionIds'] }],
        { invalidIds },
        400
      );
    }
  }

  private _validateRoleIds(roleIds: number[]) {
    if (!Array.isArray(roleIds) || roleIds.length === 0) {
      throw new AppError(
        'Role IDs are required',
        [{ message: 'Error.RoleIdsRequired', path: ['roleIds'] }],
        { roleIds },
        400
      );
    }

    const invalidIds = roleIds.filter(id => !Number.isInteger(id) || id <= 0);
    if (invalidIds.length > 0) {
      throw new AppError(
        'Invalid role IDs',
        [{ message: 'Error.InvalidRoleIds', path: ['roleIds'] }],
        { invalidIds },
        400
      );
    }
  }

  private _isValidSortField(field: string): boolean {
    const validFields = ['id', 'email', 'name', 'phone', 'status', 'createdAt', 'updatedAt'];
    return validFields.includes(field);
  }

  private async _validateUserCreation(data: CreateUserInput) {
    if (data.email) {
      this._validateEmail(data.email);
    }

    if (data.password) {
      this._validatePassword(data.password);
    }

    if (!data.name || !data.name.trim()) {
      throw new AppError(
        'Name is required',
        [{ message: 'Error.NameRequired', path: ['name'] }],
        {},
        400
      );
    }

    if (!data.phone || !data.phone.trim()) {
      throw new AppError(
        'Phone is required',
        [{ message: 'Error.PhoneRequired', path: ['phone'] }],
        {},
        400
      );
    }

    const phoneRegex = /^(?:\+84|0)(3|5|7|8|9)\d{8}$/;
    if (!phoneRegex.test(data.phone.replace(/\s+/g, ''))) {
      throw new AppError(
        'Invalid phone format',
        [{ message: 'Error.InvalidPhone', path: ['phone'] }],
        { phone: data.phone },
        400
      );
    }

    // Validate role IDs if provided
    if (data.roleIds && data.roleIds.length > 0) {
      this._validateRoleIds(data.roleIds);

      const existingRoles = await prisma.role.findMany({
        where: {
          id: { in: data.roleIds },
          deletedAt: null,
        },
        select: { id: true }
      });

      const existingIds = existingRoles.map(r => r.id);
      const invalidIds = data.roleIds.filter(id => !existingIds.includes(id));

      if (invalidIds.length > 0) {
        throw new AppError(
          'Some roles not found',
          [{ message: 'Error.RolesNotFound', path: ['roleIds'] }],
          { invalidIds },
          400
        );
      }
    }
  }

  private async _assertUserExists(id: number) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, deletedAt: true }
    });
    if (!user || user.deletedAt) {
      throw new AppError(
        'User not found',
        [{ message: 'Error.UserNotFound', path: ['id'] }],
        { id },
        404
      );
    }
  }

  private async _assertRoleExists(id: number) {
    const role = await prisma.role.findUnique({
      where: { id },
      select: { id: true, deletedAt: true }
    });
    if (!role || role.deletedAt) {
      throw new AppError(
        'Role not found',
        [{ message: 'Error.RoleNotFound', path: ['id'] }],
        { id },
        404
      );
    }
  }

  private async _validateUserDeletion(id: number) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { deletedAt: true }
    });
    if (user?.deletedAt) {
      throw new AppError(
        'User is already deleted',
        [{ message: 'Error.UserAlreadyDeleted', path: ['id'] }],
        { id },
        400
      );
    }
  }

  private async _assertUserBlockedStatus(id: number) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, status: true, deletedAt: true }
    });
    if (!user || user.deletedAt) {
      throw new AppError(
        'User not found',
        [{ message: 'Error.UserNotFound', path: ['id'] }],
        { id },
        404
      );
    }
    if (user.status !== UserStatus.BLOCKED) {
      throw new AppError(
        'User is not blocked',
        [{ message: 'Error.UserNotBlocked', path: ['id'] }],
        { id },
        400
      );
    }
  }

  private async _assertUserActiveStatus(id: number) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, status: true, deletedAt: true }
    });
    if (!user || user.deletedAt) {
      throw new AppError(
        'User not found',
        [{ message: 'Error.UserNotFound', path: ['id'] }],
        { id },
        404
      );
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new AppError(
        'User is not active',
        [{ message: 'Error.UserNotActive', path: ['id'] }],
        { id },
        400
      );
    }
  }
}