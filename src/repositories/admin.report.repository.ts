import PDFDocument from "pdfkit";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { AppError } from "../handlers/error";
import { PrismaClient, UserStatus } from "../generated/prisma";

// Constants
const PDF_CONFIG = {
  MARGIN: 50,
  PAGE_SIZE: "A4" as const,
  FONT_SIZES: {
    TITLE: 20,
    SECTION: 16,
    SUBSECTION: 14,
    BODY: 12,
    SMALL: 10,
  },
  FONTS: {
    BOLD: "Helvetica-Bold",
    REGULAR: "Helvetica",
  },
  COLORS: {
    PRIMARY: "#000000",
    SECONDARY: "#333333",
    BACKGROUND: "#f0f0f0",
  },
} as const;

const DATE_CONFIG = {
  MIN_YEAR: 2020,
  MAX_YEAR: new Date().getFullYear(),
} as const;

// Interfaces
interface UserStatistics {
  totalUsers: number;
  newUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  blockedUsers: number;
  deletedUsers: number;
}

interface UserTypeBreakdown {
  customers: number;
  serviceProviders: number;
  staff: number;
  adminOnly: number;
}

interface RoleStatistic {
  id: number;
  name: string;
  userCount: number;
  percentage: number;
}

interface RoleStatistics {
  totalRoles: number;
  roles: RoleStatistic[];
}

interface TopUser {
  id: number;
  name: string;
  email: string;
  status: string;
  createdAt: Date;
  roles: string[];
}

interface ActiveUser {
  name: string;
  email: string;
  loginCount: number;
}

interface ActivitySummary {
  totalLogins: number;
  totalDevices: number;
  totalNotifications: number;
  mostActiveUsers: ActiveUser[];
}

interface MonthlyReportData {
  month: number;
  year: number;
  userStatistics: UserStatistics;
  usersByType: UserTypeBreakdown;
  roleStatistics: RoleStatistics;
  topUsers: TopUser[];
  activitySummary: ActivitySummary;
}

interface DateRange {
  startDate: Date;
  endDate: Date;
}

// Utility functions
class DateUtils {
  static createDateRange(month: number, year: number): DateRange {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    return { startDate, endDate };
  }

  static validateMonth(month: number): void {
    if (!month || month < 1 || month > 12) {
      throw new AppError(
        "Invalid month parameter",
        [{ message: "Error.InvalidMonth", path: ["month"] }],
        { month },
        400,
      );
    }
  }

  static validateYear(year: number): void {
    if (!year || year < DATE_CONFIG.MIN_YEAR || year > DATE_CONFIG.MAX_YEAR) {
      throw new AppError(
        "Invalid year parameter",
        [{ message: "Error.InvalidYear", path: ["year"] }],
        { year },
        400,
      );
    }
  }

  static formatCurrentDateTime(): string {
    return format(new Date(), "MM/dd/yyyy HH:mm:ss", { locale: enUS });
  }

  static getMonthName(month: number, year: number): string {
    return format(new Date(year, month - 1), "MMMM", { locale: enUS });
  }
}

class StatusUtils {
  private static readonly STATUS_MAP: Record<string, string> = {
    ACTIVE: "Active",
    INACTIVE: "Inactive",
    BLOCKED: "Blocked",
    DELETED: "Deleted",
  };

  static getStatusText(status: string): string {
    return this.STATUS_MAP[status] || status;
  }
}

// PDF Generation utilities
class PDFUtils {
  static drawTable(
    doc: PDFKit.PDFDocument,
    data: string[][],
    x: number,
    y: number,
    width: number,
    rowHeight: number,
    hasHeader: boolean = false,
  ): void {
    if (data.length === 0) return;

    const colWidth = width / data[0].length;

    data.forEach((row, rowIndex) => {
      const isHeader = hasHeader && rowIndex === 0;

      // Draw header background
      if (isHeader) {
        doc
          .rect(x, y + rowIndex * rowHeight, width, rowHeight)
          .fill(PDF_CONFIG.COLORS.BACKGROUND)
          .stroke();
      }

      // Draw row border
      doc.rect(x, y + rowIndex * rowHeight, width, rowHeight).stroke();

      // Draw cell content
      row.forEach((cell, colIndex) => {
        const cellX = x + colIndex * colWidth;
        const cellY = y + rowIndex * rowHeight;

        doc
          .fontSize(PDF_CONFIG.FONT_SIZES.SMALL)
          .font(isHeader ? PDF_CONFIG.FONTS.BOLD : PDF_CONFIG.FONTS.REGULAR)
          .fillColor(
            isHeader ? PDF_CONFIG.COLORS.PRIMARY : PDF_CONFIG.COLORS.SECONDARY,
          )
          .text(cell || "", cellX + 5, cellY + rowHeight / 2 - 6, {
            width: colWidth - 10,
            align: "left",
            ellipsis: true,
          });
      });

      // Draw vertical lines
      for (let i = 1; i < row.length; i++) {
        doc
          .moveTo(x + i * colWidth, y + rowIndex * rowHeight)
          .lineTo(x + i * colWidth, y + rowIndex * rowHeight + rowHeight)
          .stroke();
      }
    });
  }

  static addSectionTitle(
    doc: PDFKit.PDFDocument,
    title: string,
    yPosition: number,
  ): number {
    doc
      .fontSize(PDF_CONFIG.FONT_SIZES.SECTION)
      .font(PDF_CONFIG.FONTS.BOLD)
      .text(title, PDF_CONFIG.MARGIN, yPosition);
    return yPosition + 30;
  }

  static addSubsectionTitle(
    doc: PDFKit.PDFDocument,
    title: string,
    yPosition: number,
  ): number {
    doc
      .fontSize(PDF_CONFIG.FONT_SIZES.SUBSECTION)
      .font(PDF_CONFIG.FONTS.BOLD)
      .text(title, PDF_CONFIG.MARGIN, yPosition);
    return yPosition + 25;
  }

  static checkPageBreak(
    doc: PDFKit.PDFDocument,
    yPosition: number,
    requiredSpace: number,
  ): number {
    if (yPosition + requiredSpace > doc.page.height - 100) {
      doc.addPage();
      return 50;
    }
    return yPosition;
  }
}

// Database query utilities
class DatabaseQueries {
  constructor(private prisma: PrismaClient) {}

  async getUserStatistics(
    startDate: Date,
    endDate: Date,
  ): Promise<UserStatistics> {
    const [
      totalUsers,
      newUsers,
      activeUsers,
      inactiveUsers,
      blockedUsers,
      deletedUsers,
    ] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: { lte: endDate } } }),
      this.prisma.user.count({
        where: { createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.user.count({
        where: {
          createdAt: { lte: endDate },
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
      }),
      this.prisma.user.count({
        where: {
          createdAt: { lte: endDate },
          status: UserStatus.INACTIVE,
          deletedAt: null,
        },
      }),
      this.prisma.user.count({
        where: {
          createdAt: { lte: endDate },
          status: UserStatus.BLOCKED,
          deletedAt: null,
        },
      }),
      this.prisma.user.count({
        where: {
          deletedAt: { gte: startDate, lte: endDate },
        },
      }),
    ]);

    return {
      totalUsers,
      newUsers,
      activeUsers,
      inactiveUsers,
      blockedUsers,
      deletedUsers,
    };
  }

  async getUserTypeBreakdown(endDate: Date): Promise<UserTypeBreakdown> {
    const [customers, serviceProviders, staff, totalUsers] = await Promise.all([
      this.prisma.user.count({
        where: {
          createdAt: { lte: endDate },
          deletedAt: null,
          CustomerProfile: { isNot: null },
        },
      }),
      this.prisma.user.count({
        where: {
          createdAt: { lte: endDate },
          deletedAt: null,
          ServiceProvider_ServiceProvider_userIdToUser: { isNot: null },
        },
      }),
      this.prisma.user.count({
        where: {
          createdAt: { lte: endDate },
          deletedAt: null,
          Staff: { isNot: null },
        },
      }),
      this.prisma.user.count({
        where: {
          createdAt: { lte: endDate },
          deletedAt: null,
        },
      }),
    ]);

    return {
      customers,
      serviceProviders,
      staff,
      adminOnly: totalUsers - customers - serviceProviders - staff,
    };
  }

  async getRoleStatistics(endDate: Date): Promise<RoleStatistics> {
    const rolesWithUsers = await this.prisma.role.findMany({
      where: {
        deletedAt: null,
        createdAt: { lte: endDate },
      },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            User_UserRoles: {
              where: {
                createdAt: { lte: endDate },
                deletedAt: null,
              },
            },
          },
        },
      },
    });

    const totalUsers = await this.prisma.user.count({
      where: {
        createdAt: { lte: endDate },
        deletedAt: null,
      },
    });

    const roles = rolesWithUsers.map((role) => ({
      id: role.id,
      name: role.name,
      userCount: role._count.User_UserRoles,
      percentage:
        totalUsers > 0
          ? Math.round((role._count.User_UserRoles / totalUsers) * 100)
          : 0,
    }));

    return {
      totalRoles: rolesWithUsers.length,
      roles,
    };
  }

  async getTopUsers(
    startDate: Date,
    endDate: Date,
    limit: number = 10,
  ): Promise<TopUser[]> {
    const users = await this.prisma.user.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        Role_UserRoles: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
    });

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      createdAt: user.createdAt,
      roles: user.Role_UserRoles.map((role) => role.name),
    }));
  }

  async getActivitySummary(
    startDate: Date,
    endDate: Date,
  ): Promise<ActivitySummary> {
    const [totalDevices, totalNotifications, mostActiveUsers] =
      await Promise.all([
        this.prisma.device.count({
          where: {
            createdAt: { gte: startDate, lte: endDate },
          },
        }),
        this.prisma.notification.count({
          where: {
            createdAt: { gte: startDate, lte: endDate },
          },
        }),
        this.prisma.user.findMany({
          where: {
            deletedAt: null,
            Device: {
              some: {
                lastActive: { gte: startDate, lte: endDate },
              },
            },
          },
          select: {
            name: true,
            email: true,
            _count: {
              select: {
                Device: {
                  where: {
                    lastActive: { gte: startDate, lte: endDate },
                  },
                },
              },
            },
          },
          orderBy: {
            Device: {
              _count: "desc",
            },
          },
          take: 5,
        }),
      ]);

    return {
      totalLogins: totalDevices,
      totalDevices,
      totalNotifications,
      mostActiveUsers: mostActiveUsers.map((user) => ({
        name: user.name,
        email: user.email,
        loginCount: user._count.Device,
      })),
    };
  }
}

// PDF Content generators
class PDFContentGenerator {
  static generateHeader(doc: PDFKit.PDFDocument, title: string): number {
    doc
      .fontSize(PDF_CONFIG.FONT_SIZES.TITLE)
      .font(PDF_CONFIG.FONTS.BOLD)
      .text(title, PDF_CONFIG.MARGIN, 50, { align: "center" });

    doc
      .fontSize(PDF_CONFIG.FONT_SIZES.BODY)
      .font(PDF_CONFIG.FONTS.REGULAR)
      .text(
        `Generated on: ${DateUtils.formatCurrentDateTime()}`,
        PDF_CONFIG.MARGIN,
        80,
        { align: "center" },
      );

    // Draw horizontal line
    doc.moveTo(PDF_CONFIG.MARGIN, 110).lineTo(550, 110).stroke();

    return 130;
  }

  static generateUserStatisticsSection(
    doc: PDFKit.PDFDocument,
    data: MonthlyReportData,
    yPosition: number,
  ): number {
    yPosition = PDFUtils.addSectionTitle(doc, "1. USER STATISTICS", yPosition);

    const userStats = [
      ["Total Users", data.userStatistics.totalUsers.toLocaleString()],
      ["New Users This Month", data.userStatistics.newUsers.toLocaleString()],
      ["Active Users", data.userStatistics.activeUsers.toLocaleString()],
      ["Inactive Users", data.userStatistics.inactiveUsers.toLocaleString()],
      ["Blocked Users", data.userStatistics.blockedUsers.toLocaleString()],
      [
        "Deleted Users This Month",
        data.userStatistics.deletedUsers.toLocaleString(),
      ],
    ];

    PDFUtils.drawTable(doc, userStats, PDF_CONFIG.MARGIN, yPosition, 500, 25);
    yPosition += userStats.length * 25 + 20;

    // User type breakdown
    yPosition = PDFUtils.addSubsectionTitle(
      doc,
      "User Type Breakdown:",
      yPosition,
    );

    const userTypeStats = [
      ["Customers", data.usersByType.customers.toLocaleString()],
      ["Service Providers", data.usersByType.serviceProviders.toLocaleString()],
      ["Staff", data.usersByType.staff.toLocaleString()],
      ["Admin Only", data.usersByType.adminOnly.toLocaleString()],
    ];

    PDFUtils.drawTable(
      doc,
      userTypeStats,
      PDF_CONFIG.MARGIN,
      yPosition,
      500,
      25,
    );
    return yPosition + userTypeStats.length * 25 + 30;
  }

  static generateRoleStatisticsSection(
    doc: PDFKit.PDFDocument,
    data: MonthlyReportData,
    yPosition: number,
  ): number {
    yPosition = PDFUtils.checkPageBreak(doc, yPosition, 200);
    yPosition = PDFUtils.addSectionTitle(doc, "2. ROLE STATISTICS", yPosition);

    doc
      .fontSize(PDF_CONFIG.FONT_SIZES.BODY)
      .font(PDF_CONFIG.FONTS.REGULAR)
      .text(
        `Total Roles: ${data.roleStatistics.totalRoles}`,
        PDF_CONFIG.MARGIN,
        yPosition,
      );

    yPosition += 25;

    if (data.roleStatistics.roles.length > 0) {
      const roleHeaders = ["Role Name", "User Count", "Percentage"];
      const roleData = data.roleStatistics.roles.map((role) => [
        role.name,
        role.userCount.toString(),
        `${role.percentage}%`,
      ]);

      PDFUtils.drawTable(
        doc,
        [roleHeaders, ...roleData],
        PDF_CONFIG.MARGIN,
        yPosition,
        500,
        25,
        true,
      );
      yPosition += (roleData.length + 1) * 25 + 30;
    }

    return yPosition;
  }

  static generateTopUsersSection(
    doc: PDFKit.PDFDocument,
    data: MonthlyReportData,
    yPosition: number,
  ): number {
    yPosition = PDFUtils.checkPageBreak(doc, yPosition, 250);
    yPosition = PDFUtils.addSectionTitle(
      doc,
      "3. NEW USERS THIS MONTH",
      yPosition,
    );

    if (data.topUsers.length > 0) {
      const userHeaders = ["Name", "Email", "Status", "Roles"];
      const userData = data.topUsers.map((user) => [
        user.name,
        user.email,
        StatusUtils.getStatusText(user.status),
        user.roles.join(", ") || "No roles assigned",
      ]);

      PDFUtils.drawTable(
        doc,
        [userHeaders, ...userData],
        PDF_CONFIG.MARGIN,
        yPosition,
        500,
        25,
        true,
      );
      yPosition += (userData.length + 1) * 25 + 30;
    } else {
      doc
        .fontSize(PDF_CONFIG.FONT_SIZES.BODY)
        .font(PDF_CONFIG.FONTS.REGULAR)
        .text("No new users this month.", PDF_CONFIG.MARGIN, yPosition);
      yPosition += 30;
    }

    return yPosition;
  }

  static generateActivitySection(
    doc: PDFKit.PDFDocument,
    data: MonthlyReportData,
    yPosition: number,
  ): number {
    yPosition = PDFUtils.checkPageBreak(doc, yPosition, 250);
    yPosition = PDFUtils.addSectionTitle(doc, "4. ACTIVITY SUMMARY", yPosition);

    const activityStats = [
      ["Total Logins", data.activitySummary.totalLogins.toLocaleString()],
      ["Total Devices", data.activitySummary.totalDevices.toLocaleString()],
      [
        "Total Notifications",
        data.activitySummary.totalNotifications.toLocaleString(),
      ],
    ];

    PDFUtils.drawTable(
      doc,
      activityStats,
      PDF_CONFIG.MARGIN,
      yPosition,
      500,
      25,
    );
    yPosition += activityStats.length * 25 + 30;

    // Most active users
    if (data.activitySummary.mostActiveUsers.length > 0) {
      yPosition = PDFUtils.addSubsectionTitle(
        doc,
        "Most Active Users:",
        yPosition,
      );

      const activeUserHeaders = ["Name", "Email", "Login Count"];
      const activeUserData = data.activitySummary.mostActiveUsers.map(
        (user) => [user.name, user.email, user.loginCount.toString()],
      );

      PDFUtils.drawTable(
        doc,
        [activeUserHeaders, ...activeUserData],
        PDF_CONFIG.MARGIN,
        yPosition,
        500,
        25,
        true,
      );
      yPosition += (activeUserData.length + 1) * 25 + 30;
    }

    return yPosition;
  }

  static generateFooter(doc: PDFKit.PDFDocument): void {
    doc
      .fontSize(PDF_CONFIG.FONT_SIZES.SMALL)
      .font(PDF_CONFIG.FONTS.REGULAR)
      .text(
        "Report generated automatically by Admin System",
        PDF_CONFIG.MARGIN,
        doc.page.height - 70,
        { align: "center" },
      );
  }
}

// Main Repository Class
export class ReportRepository {
  private readonly prisma: PrismaClient;
  private readonly dbQueries: DatabaseQueries;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
    this.dbQueries = new DatabaseQueries(this.prisma);
  }

  async getMonthlyReportData(
    month: number,
    year: number,
  ): Promise<MonthlyReportData> {
    DateUtils.validateMonth(month);
    DateUtils.validateYear(year);

    const { startDate, endDate } = DateUtils.createDateRange(month, year);

    try {
      const [
        userStatistics,
        usersByType,
        roleStatistics,
        topUsers,
        activitySummary,
      ] = await Promise.all([
        this.dbQueries.getUserStatistics(startDate, endDate),
        this.dbQueries.getUserTypeBreakdown(endDate),
        this.dbQueries.getRoleStatistics(endDate),
        this.dbQueries.getTopUsers(startDate, endDate),
        this.dbQueries.getActivitySummary(startDate, endDate),
      ]);

      return {
        month,
        year,
        userStatistics,
        usersByType,
        roleStatistics,
        topUsers,
        activitySummary,
      };
    } catch (error) {
      throw new AppError(
        "Failed to retrieve monthly report data",
        [{ message: "Error.MonthlyReportDataFailed", path: ["data"] }],
        {
          month,
          year,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  }

  async exportMonthlyReportPDF(month: number, year: number): Promise<Buffer> {
    try {
      const reportData = await this.getMonthlyReportData(month, year);
      const monthName = DateUtils.getMonthName(month, year);

      const doc = new PDFDocument({
        margin: PDF_CONFIG.MARGIN,
        size: PDF_CONFIG.PAGE_SIZE,
        info: {
          Title: `Monthly Report - ${monthName} ${year}`,
          Author: "Admin System",
          Subject: "Monthly Report",
          Keywords: "report, monthly, statistics",
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));

      return new Promise((resolve, reject) => {
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        this.generateSingleMonthPDFContent(doc, reportData);
        doc.end();
      });
    } catch (error) {
      throw new AppError(
        "Failed to export monthly PDF report",
        [{ message: "Error.PDFExportFailed", path: ["export"] }],
        {
          month,
          year,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  }

  async exportMultipleMonthsReportPDF(
    startMonth: number,
    startYear: number,
    endMonth: number,
    endYear: number,
  ): Promise<Buffer> {
    try {
      const reports = await this.getMultipleMonthsData(
        startMonth,
        startYear,
        endMonth,
        endYear,
      );

      const doc = new PDFDocument({
        margin: PDF_CONFIG.MARGIN,
        size: PDF_CONFIG.PAGE_SIZE,
        info: {
          Title: `Multi-Month Report - ${startMonth}/${startYear} to ${endMonth}/${endYear}`,
          Author: "Admin System",
          Subject: "Multi-Month Report",
          Keywords: "report, multi-month, statistics",
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));

      return new Promise((resolve, reject) => {
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        this.generateMultiMonthPDFContent(
          doc,
          reports,
          startMonth,
          startYear,
          endMonth,
          endYear,
        );
        doc.end();
      });
    } catch (error) {
      throw new AppError(
        "Failed to export multi-month PDF report",
        [{ message: "Error.MultiMonthPDFExportFailed", path: ["export"] }],
        {
          startMonth,
          startYear,
          endMonth,
          endYear,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  }

  private async getMultipleMonthsData(
    startMonth: number,
    startYear: number,
    endMonth: number,
    endYear: number,
  ): Promise<MonthlyReportData[]> {
    const reports: MonthlyReportData[] = [];
    let currentMonth = startMonth;
    let currentYear = startYear;

    while (
      currentYear < endYear ||
      (currentYear === endYear && currentMonth <= endMonth)
    ) {
      const monthData = await this.getMonthlyReportData(
        currentMonth,
        currentYear,
      );
      reports.push(monthData);

      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }

    return reports;
  }

  private generateSingleMonthPDFContent(
    doc: PDFKit.PDFDocument,
    data: MonthlyReportData,
  ): void {
    const monthName = DateUtils.getMonthName(data.month, data.year);

    let yPosition = PDFContentGenerator.generateHeader(
      doc,
      `MONTHLY REPORT - ${monthName.toUpperCase()} ${data.year}`,
    );

    yPosition = PDFContentGenerator.generateUserStatisticsSection(
      doc,
      data,
      yPosition,
    );
    yPosition = PDFContentGenerator.generateRoleStatisticsSection(
      doc,
      data,
      yPosition,
    );
    yPosition = PDFContentGenerator.generateTopUsersSection(
      doc,
      data,
      yPosition,
    );
    yPosition = PDFContentGenerator.generateActivitySection(
      doc,
      data,
      yPosition,
    );

    PDFContentGenerator.generateFooter(doc);
  }

  private generateMultiMonthPDFContent(
    doc: PDFKit.PDFDocument,
    reports: MonthlyReportData[],
    startMonth: number,
    startYear: number,
    endMonth: number,
    endYear: number,
  ): void {
    let yPosition = PDFContentGenerator.generateHeader(
      doc,
      `COMPREHENSIVE REPORT - ${startMonth}/${startYear} to ${endMonth}/${endYear}`,
    );

    // Summary table
    const summaryHeaders = [
      "Month/Year",
      "New Users",
      "Total Users",
      "Active Users",
      "Logins",
    ];
    const summaryData = reports.map((report) => [
      `${report.month}/${report.year}`,
      report.userStatistics.newUsers.toString(),
      report.userStatistics.totalUsers.toString(),
      report.userStatistics.activeUsers.toString(),
      report.activitySummary.totalLogins.toString(),
    ]);

    yPosition = PDFUtils.addSectionTitle(doc, "MONTHLY OVERVIEW", yPosition);
    PDFUtils.drawTable(
      doc,
      [summaryHeaders, ...summaryData],
      PDF_CONFIG.MARGIN,
      yPosition,
      500,
      25,
      true,
    );

    // Generate detailed pages for each month
    reports.forEach((report, index) => {
      if (index > 0) {
        doc.addPage();
      }
      this.generateSingleMonthPDFContent(doc, report);
    });
  }
}
