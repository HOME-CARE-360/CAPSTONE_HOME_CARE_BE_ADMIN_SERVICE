type ErrorMessageObject = {
  message: string;
  path: string[];
};

export class AppError extends Error {
  public error: string; // Tiếng Anh dùng cho client (ex: 'User not found')
  public code: string; // Mã lỗi nội bộ ví dụ: Error.UserNotFound
  public messageObject: ErrorMessageObject;
  public statusCode: number;
  public details?: Record<string, any>;

  constructor(
    error: string,
    messageObject: ErrorMessageObject[],
    details: Record<string, any> = {},
    statusCode = 500
  ) {
    super(error);

    this.name = 'AppError';
    this.error = error;
    this.code = messageObject?.[0]?.message || 'Error.Unknown';
    this.messageObject = {
      message: this.code,
      path: messageObject?.[0]?.path || [],
    };
    this.statusCode = statusCode;
    this.details = details;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  toJSON() {
    return {
      statusCode: this.statusCode,
      error: this.error,
      message: this.messageObject,
      details: this.details,
    };
  }
}
