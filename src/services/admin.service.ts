import { CreateUserDTO, UpdateUserDTO, GetUsersQuery } from "../schemas/type";
import { AppError } from "../handlers/error";
import { AdminRepository } from "../repositories/admin.repository";
import { UserStatus } from "../generated/prisma";
import { ReportRepository } from "../repositories/admin.report.repository";
import { PaginationParams } from "../schemas/app.schema";
import { hash } from 'bcryptjs';

// ========= CACHE LAYER =========
interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class SimpleCache {
  private cache = new Map<string, CacheItem<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.DEFAULT_TTL,
    });
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  // Cache invalidation patterns
  invalidatePattern(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}

export class AdminService {
  private static readonly BCRYPT_ROUNDS = 10;
  private static readonly DEFAULT_USER_STATUS = UserStatus.ACTIVE;

  // Cache instances
  private readonly cache = new SimpleCache();
  private readonly adminRoleCache = new Map<number, boolean>();

  // Performance monitoring
  private performanceLog = (operation: string, startTime: number) => {
    const duration = Date.now() - startTime;
    if (duration > 1000) {
      // Log slow operations
      console.warn(`🐌 Slow operation: ${operation} took ${duration}ms`);
    }
  };

  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly reportRepository: ReportRepository,
  ) {}

  // =================== USER ===================

  async getAllUsers(query: GetUsersQuery) {
    const startTime = Date.now();

    // Cache key based on query params
    const cacheKey = `users:all:${JSON.stringify(query)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log("📋 Cache hit: getAllUsers");
      return cached;
    }

    const result = await this.adminRepository.findAll(query);

    // Cache for 2 minutes (user data changes frequently)
    this.cache.set(cacheKey, result, 2 * 60 * 1000);

    this.performanceLog("getAllUsers", startTime);
    return result;
  }

  async getUserById(id: number) {
    const startTime = Date.now();

    const cacheKey = `user:${id}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log(`📋 Cache hit: getUserById(${id})`);
      return cached;
    }

    const result = await this.adminRepository.findById(id);

    // Cache for 5 minutes
    this.cache.set(cacheKey, result);

    this.performanceLog(`getUserById(${id})`, startTime);
    return result;
  }

  async createUser(data: CreateUserDTO, adminId: number) {
    const startTime = Date.now();
    console.time("CREATE_USER_TOTAL");

    // Parallel validation for better performance
    console.time("PARALLEL_VALIDATION");
    const [existingUser, role] = await Promise.all([
      this.adminRepository.findByEmail(data.email),
      this.adminRepository.findRoleByName(data.role),
    ]);
    console.timeEnd("PARALLEL_VALIDATION");

    if (existingUser) {
      throw new AppError(
        "Email already in use",
        [{ message: "Error.EmailExists", path: ["email"] }],
        { email: data.email },
        400,
      );
    }

    if (!role) {
      throw new AppError(
        "Role not found",
        [{ message: `Error.RoleNotFound`, path: ["role"] }],
        { role: data.role },
        400,
      );
    }

    console.time("HASH_PASSWORD");
    const hashedPassword = await this.hashPassword(data.password);
    console.timeEnd("HASH_PASSWORD");

    console.time("DB_CREATE_USER");
    const result = await this.adminRepository.create(
      {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        phone: data.phone,
        avatar: data.avatar,
        status: data.status ?? UserStatus.ACTIVE,
        roleIds: [role.id],
      },
      adminId,
    );
    console.timeEnd("DB_CREATE_USER");

    // Invalidate related caches
    this.cache.invalidatePattern("users:all");
    this.cache.invalidatePattern("user:");

    console.timeEnd("CREATE_USER_TOTAL");
    this.performanceLog("createUser", startTime);
    return result;
  }

  async updateUser(id: number, data: UpdateUserDTO, adminId: number) {
    const startTime = Date.now();

    const result = await this.adminRepository.update(id, data, adminId);

    // Invalidate caches
    this.cache.delete(`user:${id}`);
    this.cache.invalidatePattern("users:all");

    this.performanceLog(`updateUser(${id})`, startTime);
    return result;
  }

  async deleteUser(id: number, adminId: number) {
    const startTime = Date.now();

    const result = await this.adminRepository.softDelete(id, adminId);

    // Invalidate caches
    this.cache.delete(`user:${id}`);
    this.cache.invalidatePattern("users:all");
    this.adminRoleCache.delete(id); // Remove from admin cache

    this.performanceLog(`deleteUser(${id})`, startTime);
    return result;
  }

  async blockUser(id: number, adminId: number) {
    const startTime = Date.now();

    const result = await this.adminRepository.blockUser(id, adminId);

    // Invalidate caches
    this.cache.delete(`user:${id}`);
    this.cache.invalidatePattern("users:all");

    this.performanceLog(`blockUser(${id})`, startTime);
    return result;
  }

  async unblockUser(id: number, adminId: number) {
    const startTime = Date.now();

    const result = await this.adminRepository.unblockUser(id, adminId);

    // Invalidate caches
    this.cache.delete(`user:${id}`);
    this.cache.invalidatePattern("users:all");

    this.performanceLog(`unblockUser(${id})`, startTime);
    return result;
  }

  async activateUser(id: number, adminId: number) {
    const startTime = Date.now();

    const result = await this.adminRepository.activateUser(id, adminId);

    // Invalidate caches
    this.cache.delete(`user:${id}`);
    this.cache.invalidatePattern("users:all");

    this.performanceLog(`activateUser(${id})`, startTime);
    return result;
  }

  async resetUserPassword(id: number, newPassword: string, adminId: number) {
    const startTime = Date.now();
    console.time("RESET_PASSWORD_TOTAL");

    console.time("HASH_PASSWORD");
    const hashedPassword = await this.hashPassword(newPassword);
    console.timeEnd("HASH_PASSWORD");

    console.time("DB_RESET_PASSWORD");
    const result = await this.adminRepository.resetUserPassword(
      id,
      hashedPassword,
      adminId,
    );
    console.timeEnd("DB_RESET_PASSWORD");

    // Invalidate user cache
    this.cache.delete(`user:${id}`);

    console.timeEnd("RESET_PASSWORD_TOTAL");
    this.performanceLog(`resetUserPassword(${id})`, startTime);
    return result;
  }

  async assignRolesToUser(
    data: { userId: number; roleIds: number[] },
    adminId: number,
  ) {
    const startTime = Date.now();

    const result = await this.adminRepository.assignRolesToUser(data, adminId);

    // Invalidate caches
    this.cache.delete(`user:${data.userId}`);
    this.cache.delete(`user:roles:${data.userId}`);
    this.cache.invalidatePattern("users:all");
    this.adminRoleCache.delete(data.userId); // Remove from admin cache

    this.performanceLog(`assignRolesToUser(${data.userId})`, startTime);
    return result;
  }

  // ⚡ OPTIMIZED: Fast admin check with cache
  async isUserAdmin(userId: number): Promise<boolean> {
    // Check cache first
    if (this.adminRoleCache.has(userId)) {
      const isAdmin = this.adminRoleCache.get(userId)!;
      console.log(`📋 Admin cache hit: user ${userId} = ${isAdmin}`);
      return isAdmin;
    }

    console.time(`CHECK_ADMIN_${userId}`);
    const roles: { name: string }[] = await this.getUserRoles(userId);
    const isAdmin = roles.some((r) => r.name === "ADMIN");
    console.timeEnd(`CHECK_ADMIN_${userId}`);

    // Cache for 10 minutes (admin status doesn't change often)
    this.adminRoleCache.set(userId, isAdmin);

    console.log(`💾 Admin status cached: user ${userId} = ${isAdmin}`);
    return isAdmin;
  }

  async getUserRoles(userId: number): Promise<{ name: string }[]> {
    const startTime = Date.now();

    const cacheKey = `user:roles:${userId}`;
    const cached = this.cache.get<{ name: string }[]>(cacheKey);
    if (cached) {
      console.log(`📋 Cache hit: getUserRoles(${userId})`);
      return cached;
    }

    console.time(`GET_USER_ROLES_${userId}`);
    const result: { name: string }[] =
      await this.adminRepository.getUserRoles(userId);
    console.timeEnd(`GET_USER_ROLES_${userId}`);

    // Cache for 10 minutes (roles don't change frequently)
    this.cache.set(cacheKey, result, 10 * 60 * 1000);

    this.performanceLog(`getUserRoles(${userId})`, startTime);
    return result;
  }

  // =================== ROLE ===================

  async getAllRoles(query?: PaginationParams) {
    const startTime = Date.now();

    const cacheKey = `roles:all:${JSON.stringify(query || {})}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log("📋 Cache hit: getAllRoles");
      return cached;
    }

    const result = await this.adminRepository.getAllRoles(query);

    // Cache for 10 minutes (roles are relatively static)
    this.cache.set(cacheKey, result, 10 * 60 * 1000);

    this.performanceLog("getAllRoles", startTime);
    return result;
  }

  async getRoleById(id: number) {
    const startTime = Date.now();

    const cacheKey = `role:${id}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log(`📋 Cache hit: getRoleById(${id})`);
      return cached;
    }

    const result = await this.adminRepository.getRoleById(id);

    // Cache for 10 minutes
    this.cache.set(cacheKey, result, 10 * 60 * 1000);

    this.performanceLog(`getRoleById(${id})`, startTime);
    return result;
  }

  async createRole(name: string, adminId: number) {
    const startTime = Date.now();
    console.time("CREATE_ROLE_TOTAL");

    console.time("DB_CREATE_ROLE");
    const result = await this.adminRepository.createRole({ name }, adminId);
    console.timeEnd("DB_CREATE_ROLE");

    // Invalidate role caches
    this.cache.invalidatePattern("roles:all");

    console.timeEnd("CREATE_ROLE_TOTAL");
    this.performanceLog("createRole", startTime);
    return result;
  }

  async updateRole(id: number, name: string, adminId: number) {
    const startTime = Date.now();

    const result = await this.adminRepository.updateRole(id, { name }, adminId);

    // Invalidate caches
    this.cache.delete(`role:${id}`);
    this.cache.invalidatePattern("roles:all");
    this.cache.invalidatePattern("user:roles:"); // User roles might be affected

    this.performanceLog(`updateRole(${id})`, startTime);
    return result;
  }

  async deleteRole(id: number, adminId: number) {
    const startTime = Date.now();

    const result = await this.adminRepository.deleteRole(id, adminId);

    // Invalidate caches
    this.cache.delete(`role:${id}`);
    this.cache.invalidatePattern("roles:all");
    this.cache.invalidatePattern("user:roles:"); // Clear all user roles cache
    this.adminRoleCache.clear(); // Clear admin cache as roles changed

    this.performanceLog(`deleteRole(${id})`, startTime);
    return result;
  }

  // =================== PERMISSION ===================

  async getPermissionsByRole(roleId: number, query?: PaginationParams) {
    const startTime = Date.now();

    const cacheKey = `role:permissions:${roleId}:${JSON.stringify(query || {})}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log(`📋 Cache hit: getPermissionsByRole(${roleId})`);
      return cached;
    }

    const result = await this.adminRepository.getPermissionsByRole(
      roleId,
      query,
    );

    // Cache for 15 minutes (permissions change rarely)
    this.cache.set(cacheKey, result, 15 * 60 * 1000);

    this.performanceLog(`getPermissionsByRole(${roleId})`, startTime);
    return result;
  }

  async assignPermissionToRole(
    roleId: number,
    permissionIds: number[],
    adminId: number,
  ) {
    const startTime = Date.now();

    const result = await this.adminRepository.assignPermissionToRole(
      roleId,
      permissionIds,
      adminId,
    );

    // Invalidate permission caches
    this.cache.invalidatePattern(`role:permissions:${roleId}`);

    this.performanceLog(`assignPermissionToRole(${roleId})`, startTime);
    return result;
  }

  async getAllPermissions(query?: PaginationParams) {
    const startTime = Date.now();

    const cacheKey = `permissions:all:${JSON.stringify(query || {})}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log("📋 Cache hit: getAllPermissions");
      return cached;
    }

    const result = await this.adminRepository.getAllPermissions(query);

    // Cache for 30 minutes (permissions are very static)
    this.cache.set(cacheKey, result, 30 * 60 * 1000);

    this.performanceLog("getAllPermissions", startTime);
    return result;
  }

  // =================== STATS ===================

  async getUserStatistics() {
    const startTime = Date.now();

    const cacheKey = "stats:users";
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log("📋 Cache hit: getUserStatistics");
      return cached;
    }

    const result = await this.adminRepository.getUserStatistics();

    // Cache for 5 minutes (stats can be slightly stale)
    this.cache.set(cacheKey, result, 5 * 60 * 1000);

    this.performanceLog("getUserStatistics", startTime);
    return result;
  }

  async getRoleStatistics() {
    const startTime = Date.now();

    const cacheKey = "stats:roles";
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log("📋 Cache hit: getRoleStatistics");
      return cached;
    }

    const result = await this.adminRepository.getRoleStatistics();

    // Cache for 10 minutes
    this.cache.set(cacheKey, result, 10 * 60 * 1000);

    this.performanceLog("getRoleStatistics", startTime);
    return result;
  }

  async getUserActivity(userId: number) {
    const startTime = Date.now();

    const cacheKey = `user:activity:${userId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log(`📋 Cache hit: getUserActivity(${userId})`);
      return cached;
    }

    const result = await this.adminRepository.getUserActivity(userId);

    // Cache for 2 minutes (activity data should be fresh)
    this.cache.set(cacheKey, result, 2 * 60 * 1000);

    this.performanceLog(`getUserActivity(${userId})`, startTime);
    return result;
  }

  async getDeletedUsers(query?: PaginationParams) {
    const startTime = Date.now();

    const cacheKey = `users:deleted:${JSON.stringify(query || {})}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log("📋 Cache hit: getDeletedUsers");
      return cached;
    }

    const result = await this.adminRepository.getDeletedUsers(query);

    // Cache for 5 minutes
    this.cache.set(cacheKey, result, 5 * 60 * 1000);

    this.performanceLog("getDeletedUsers", startTime);
    return result;
  }

  async restoreDeletedUser(id: number, adminId: number) {
    const startTime = Date.now();

    const result = await this.adminRepository.restoreUser(id, adminId);

    // Invalidate caches
    this.cache.delete(`user:${id}`);
    this.cache.invalidatePattern("users:all");
    this.cache.invalidatePattern("users:deleted");

    this.performanceLog(`restoreDeletedUser(${id})`, startTime);
    return result;
  }

  // =================== PRIVATE ===================

  private async hashPassword(password: string): Promise<string> {
    const startTime = Date.now();
    const hashed = await hash(password, 10);
    this.performanceLog("hashPassword", startTime);
    return hashed;
  }

  // =================== REPORTS ===================

  async getMonthlyReport(month: number, year: number) {
    const startTime = Date.now();

    const cacheKey = `report:monthly:${month}:${year}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log(`📋 Cache hit: getMonthlyReport(${month}/${year})`);
      return cached;
    }

    const result = await this.reportRepository.getMonthlyReportData(
      month,
      year,
    );

    // Cache for 1 hour (reports don't change often)
    this.cache.set(cacheKey, result, 60 * 60 * 1000);

    this.performanceLog(`getMonthlyReport(${month}/${year})`, startTime);
    return result;
  }

  async exportMonthlyReportPDF(month: number, year: number) {
    const startTime = Date.now();
    const result = await this.reportRepository.exportMonthlyReportPDF(
      month,
      year,
    );
    this.performanceLog(`exportMonthlyReportPDF(${month}/${year})`, startTime);
    return result;
  }

  async exportMultiMonthReportPDF(
    startMonth: number,
    startYear: number,
    endMonth: number,
    endYear: number,
  ) {
    const startTime = Date.now();
    const result = await this.reportRepository.exportMultipleMonthsReportPDF(
      startMonth,
      startYear,
      endMonth,
      endYear,
    );
    this.performanceLog(
      `exportMultiMonthReportPDF(${startMonth}/${startYear}-${endMonth}/${endYear})`,
      startTime,
    );
    return result;
  }

  // =================== CACHE MANAGEMENT ===================

  clearCache(): void {
    this.cache.clear();
    this.adminRoleCache.clear();
    console.log("🧹 All caches cleared");
  }

  getCacheStats(): object {
    return {
      cacheSize: this.cache["cache"].size,
      adminCacheSize: this.adminRoleCache.size,
    };
  }
}
