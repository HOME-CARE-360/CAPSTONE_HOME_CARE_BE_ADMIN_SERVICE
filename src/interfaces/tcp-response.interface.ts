export interface TCPResponseSuccess<T = any> {
  success: boolean;
  code: string;
  message: string;
  timestamp: string;
  statusCode: number;
  data: T;
}

export interface TCPResponseError {
  message: {
    message: string;
    path: string[];
  };
  error: string;
  statusCode: number;
}
