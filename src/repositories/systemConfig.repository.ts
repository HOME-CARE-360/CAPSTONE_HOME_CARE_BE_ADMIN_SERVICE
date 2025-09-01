import { AppError } from "../handlers/error";
import { PrismaClient, Prisma } from "../generated/prisma";

export interface ListSystemConfigQuery {
  q?: string;
  type?: string;
  includeExpired?: boolean;
  page?: number;
  limit?: number;
  orderBy?: "createdAt" | "updatedAt" | "key" | "expiresAt";
  order?: "asc" | "desc";
}

export interface CreateSystemConfigDTO {
  key: string;
  value?: string | null;
  type?: string | null;
  expiresAt?: Date | null;
}

export interface UpdateSystemConfigDTO {
  value?: string | null;
  type?: string | null;
  expiresAt?: Date | null;
}

export class SystemConfigRepository {
  constructor(private prisma: PrismaClient = new PrismaClient()) {}

  // ====== LIST WITH PAGINATION ======
  async list(query: ListSystemConfigQuery = {}) {
    const {
      q,
      type,
      includeExpired = false,
      page = 1,
      limit = 20,
      orderBy = "updatedAt",
      order = "desc",
    } = query;

    if (page <= 0 || limit <= 0) {
      throw new AppError(
        "Invalid pagination params",
        [{ message: "Error.InvalidPagination", path: ["page", "limit"] }],
        { page, limit },
        400,
      );
    }

    const where: Prisma.SystemConfigWhereInput = {
      AND: [
        q
          ? {
              OR: [
                { key: { contains: q, mode: "insensitive" } },
                { value: { contains: q, mode: "insensitive" } },
                { type: { contains: q, mode: "insensitive" } },
              ],
            }
          : undefined,
        type ? { type: { equals: type } } : undefined,
        includeExpired
          ? undefined
          : {
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
      ].filter(Boolean) as Prisma.SystemConfigWhereInput[],
    };

    const [items, total] = await Promise.all([
      this.prisma.systemConfig.findMany({
        where,
        orderBy: { [orderBy]: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.systemConfig.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        orderBy,
        order,
      },
    };
  }

  // ====== GETTER ======
  async getById(id: number) {
    const cfg = await this.prisma.systemConfig.findUnique({ where: { id } });
    if (!cfg) {
      throw new AppError(
        "SystemConfig not found",
        [{ message: "Error.SystemConfigNotFound", path: ["id"] }],
        { id },
        404,
      );
    }
    return cfg;
  }

  /**
   * Gets a system config value by key, with an optional type-safe parser.
   * Handles expiry check.
   */
  async getValue<T = string>(
    keyStr: string,
    defaultValue?: T,
    parser?: (raw: string) => T,
    options?: { includeExpired?: boolean },
  ): Promise<T | null> {
    const cfg = await this.prisma.systemConfig.findUnique({
      where: { key: keyStr },
    });

    // Check for existence and expiration
    if (
      !cfg ||
      (!options?.includeExpired && cfg.expiresAt && cfg.expiresAt < new Date())
    ) {
      if (defaultValue !== undefined) return defaultValue;
      return null;
    }

    // Parse value if a parser is provided, otherwise return raw value
    if (parser && cfg.value !== null) {
      return parser(cfg.value);
    }

    // Return default if value is null
    if (cfg.value === null) {
      return defaultValue ?? null;
    }

    // If no parser, return raw value
    return cfg.value as unknown as T;
  }

  // ====== CREATE ======
  async create(data: CreateSystemConfigDTO) {
    const key = data.key?.trim();
    if (!key) {
      throw new AppError(
        "Key is required",
        [{ message: "Error.MissingKey", path: ["key"] }],
        { data },
        400,
      );
    }

    const existed = await this.prisma.systemConfig.findUnique({ where: { key } });
    if (existed) {
      throw new AppError(
        "SystemConfig key already exists",
        [{ message: "Error.SystemConfigKeyExists", path: ["key"] }],
        { key },
        409,
      );
    }

    const now = new Date();
    const created = await this.prisma.systemConfig.create({
      data: {
        key,
        value: data.value ?? null,
        type: data.type ?? null,
        expiresAt: data.expiresAt ?? null,
        updatedAt: now,
        createdAt: now,
      },
    });

    return created;
  }

// ====== UPDATE (by id) ======
async updateById(id: number, data: UpdateSystemConfigDTO) {
  const cfg = await this.getById(id);
  console.log("Existing config:", cfg);
  console.log("Updating config with data:", data);

  const updated = await this.prisma.systemConfig.update({
    where: { id },
    data: {
      value: data.value ?? undefined,
      type: data.type ?? undefined, // Fixed: removed extra parentheses
      expiresAt:
        data.expiresAt === undefined
          ? undefined
          : data.expiresAt === null
          ? null
          : new Date(data.expiresAt),
    },
  });

  console.log("Updated config:", updated);
  return updated;
}
  // ====== DELETE ======
  async deleteById(id: number) {
    // đảm bảo tồn tại
    await this.getById(id);
    await this.prisma.systemConfig.delete({ where: { id } });
    return { success: true };
  }
}
