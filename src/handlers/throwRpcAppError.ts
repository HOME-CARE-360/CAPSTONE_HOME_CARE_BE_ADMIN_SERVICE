import { AppError } from "./error";

export function throwRpcAppError(error: AppError): never {
    throw error;
}