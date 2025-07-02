import { PrismaClient, Prisma, UserStatus } from '../generated/prisma';

const prisma = new PrismaClient();

export class AdminRepository {
  async findAll(params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    sortBy?: keyof Prisma.UserOrderByWithRelationInput;
    sortOrder?: 'asc' | 'desc';
  }) {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params || {};

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(status ? { status: status as UserStatus } : {}),
      ...(search
        ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ],
        }
        : {}),
    };

    const [totalCount, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        include: { Role_UserRoles: true },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      totalCount,
      page,
      limit,
      users,
    };
  }

  async findById(id: number) {
    return prisma.user.findUnique({
      where: { id },
      include: { Role_UserRoles: true },
    });
  }

  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  async create(data: Prisma.UserCreateInput) {
    const now = new Date();
    return prisma.user.create({
      data: {
        ...data,
        createdAt: now,
        updatedAt: now,
      },
      include: { Role_UserRoles: true },
    });
  }

  async update(id: number, data: Prisma.UserUpdateInput) {
    return prisma.user.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: { Role_UserRoles: true },
    });
  }

  async softDelete(id: number) {
    return prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findRoleByName(name: string) {
    return prisma.role.findUnique({
      where: { name },
    });
  }
}
