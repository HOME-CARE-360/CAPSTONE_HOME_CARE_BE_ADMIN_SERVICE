import net from 'net';
import dotenv from 'dotenv';
import { handleTCPRequest } from './handlers/tcp-handler';
import { RpcException } from '@nestjs/microservices';
import { AppError } from './handlers/error';

dotenv.config();

const CONFIG = {
    TCP_PORT: parseInt(process.env.STAFF_TCP_PORT || '4002', 10),
    TCP_HOST: process.env.TCP_HOST || '0.0.0.0',
    MAX_CONNECTIONS: parseInt(process.env.MAX_TCP_CONNECTIONS || '100', 10),
    SOCKET_TIMEOUT: parseInt(process.env.SOCKET_TIMEOUT || '30000', 10), // 30s
    MAX_PAYLOAD_SIZE: parseInt(process.env.MAX_PAYLOAD_SIZE || '1048576', 10), // 1MB
    KEEP_ALIVE: true,
    NO_DELAY: true,
} as const;

interface RpcErrorFormat {
    statusCode?: number;
    code?: string;
    message?: any;
    details?: any;
}

interface ErrorResponse {
    statusCode: number;
    error: string;
    message: { message: string; path: string[] };
    details?: any;
    timestamp: string;
}

interface ConnectionMetrics {
    activeConnections: number;
    totalConnections: number;
    totalRequests: number;
    totalErrors: number;
}

class ConnectionManager {
    private metrics: ConnectionMetrics = {
        activeConnections: 0,
        totalConnections: 0,
        totalRequests: 0,
        totalErrors: 0,
    };

    private connections = new Set<net.Socket>();

    addConnection(socket: net.Socket): void {
        this.connections.add(socket);
        this.metrics.activeConnections++;
        this.metrics.totalConnections++;

        socket.on('close', () => {
            this.connections.delete(socket);
            this.metrics.activeConnections--;
        });
    }

    incrementRequests(): void {
        this.metrics.totalRequests++;
    }

    incrementErrors(): void {
        this.metrics.totalErrors++;
    }

    getMetrics(): ConnectionMetrics {
        return { ...this.metrics };
    }

    closeAllConnections(): void {
        this.connections.forEach(socket => {
            if (!socket.destroyed) {
                socket.destroy();
            }
        });
        this.connections.clear();
    }

    canAcceptConnection(): boolean {
        return this.metrics.activeConnections < CONFIG.MAX_CONNECTIONS;
    }
}

const connectionManager = new ConnectionManager();

class TCPMicroservice {
    private server: net.Server;
    private isShuttingDown = false;

    constructor() {
        this.server = net.createServer({
            allowHalfOpen: false,
            pauseOnConnect: false,
        });

        this.setupServerEvents();
        this.setupGracefulShutdown();
    }

    private setupServerEvents(): void {
        this.server.on('connection', this.handleConnection.bind(this));
        this.server.on('error', this.handleServerError.bind(this));
        this.server.on('listening', this.handleServerListening.bind(this));
    }

    private handleConnection(socket: net.Socket): void {
        if (this.isShuttingDown) {
            socket.destroy();
            return;
        }

        if (!connectionManager.canAcceptConnection()) {
            console.warn('🚫 Max connections reached, rejecting new connection');
            socket.destroy();
            return;
        }

        this.configureSocket(socket);
        connectionManager.addConnection(socket);

        console.log(`🔌 New TCP connection established (${connectionManager.getMetrics().activeConnections} active)`);

        let buffer = Buffer.alloc(0);

        socket.on('data', async (data: Buffer) => {
            try {
                buffer = Buffer.concat([buffer, data]);

                // Process complete messages (assuming newline-delimited)
                const messages = this.extractMessages(buffer);

                for (const message of messages.complete) {
                    await this.processMessage(socket, message);
                }

                buffer = messages.remaining;
            } catch (error) {
                console.error('❌ Error processing socket data:', error);
                this.handleSocketError(socket, error);
            }
        });

        socket.on('error', (err: Error) => {
            console.error('❌ TCP socket error:', {
                message: err.message,
                code: (err as any).code,
                remoteAddress: socket.remoteAddress,
            });
        });

        socket.on('timeout', () => {
            console.warn('⏰ Socket timeout, closing connection');
            socket.destroy();
        });

        socket.on('close', (hadError: boolean) => {
            if (hadError) {
                console.log('🔌 TCP connection closed with error');
            } else {
                console.log('🔌 TCP connection closed gracefully');
            }
        });
    }

    private configureSocket(socket: net.Socket): void {
        socket.setTimeout(CONFIG.SOCKET_TIMEOUT);
        socket.setKeepAlive(CONFIG.KEEP_ALIVE, 1000);
        socket.setNoDelay(CONFIG.NO_DELAY);
    }

    private extractMessages(buffer: Buffer): { complete: string[]; remaining: Buffer } {
        const messages: string[] = [];
        let remaining = buffer;

        while (true) {
            const newlineIndex = remaining.indexOf('\n');
            if (newlineIndex === -1) break;

            const messageBuffer = remaining.subarray(0, newlineIndex);
            const messageStr = messageBuffer.toString('utf8').trim();

            if (messageStr) {
                messages.push(messageStr);
            }

            remaining = remaining.subarray(newlineIndex + 1);
        }

        return { complete: messages, remaining };
    }

    private async processMessage(socket: net.Socket, message: string): Promise<void> {
        const startTime = Date.now();

        try {
            // Validate message size
            if (Buffer.byteLength(message, 'utf8') > CONFIG.MAX_PAYLOAD_SIZE) {
                throw new Error('Payload too large');
            }

            const payload = JSON.parse(message);
            connectionManager.incrementRequests();

            const result = await handleTCPRequest(payload);

            this.sendResponse(socket, result);

            console.log(`✅ Request processed in ${Date.now() - startTime}ms`);
        } catch (error) {
            connectionManager.incrementErrors();
            console.error('❌ Error processing message:', {
                error: error instanceof Error ? error.message : 'Unknown error',
                processingTime: Date.now() - startTime,
            });

            this.handleSocketError(socket, error);
        }
    }

    private sendResponse(socket: net.Socket, data: any): void {
        if (socket.destroyed || !socket.writable) {
            console.warn('⚠️ Attempted to write to closed socket');
            return;
        }

        try {
            const response = JSON.stringify(data) + '\n';
            socket.write(response, 'utf8');
        } catch (error) {
            console.error('❌ Error sending response:', error);
            socket.destroy();
        }
    }

    private handleSocketError(socket: net.Socket, error: any): void {
        const errorResponse: ErrorResponse = {
            statusCode: 500,
            error: 'Error.Unexpected',
            message: { message: 'Internal server error', path: [] },
            timestamp: new Date().toISOString(),
        };

        if (error instanceof AppError) {
            errorResponse.statusCode = error.statusCode || 500;
            errorResponse.error = error.error || 'AppError';
            errorResponse.message = {
                message: error.code,
                path: error.messageObject?.path || [],
            };
            errorResponse.details = error.details;
        } else if (error instanceof RpcException && typeof error.getError === 'function') {
            const rpcError = error.getError() as RpcErrorFormat;

            errorResponse.statusCode = rpcError.statusCode || 400;
            errorResponse.error = rpcError.code || 'Error.Rpc';
            errorResponse.message = {
                message: rpcError.message?.message || rpcError.code || 'RPC Error',
                path: rpcError.message?.path || [],
            };
            if (rpcError.details) {
                errorResponse.details = rpcError.details;
            }
        } else if (error instanceof SyntaxError) {
            errorResponse.statusCode = 400;
            errorResponse.error = 'Error.InvalidJSON';
            errorResponse.message = { message: 'Invalid JSON format', path: [] };
        } else if (error?.message === 'Payload too large') {
            errorResponse.statusCode = 413;
            errorResponse.error = 'Error.PayloadTooLarge';
            errorResponse.message = { message: 'Request payload exceeds maximum size', path: [] };
        }

        this.sendResponse(socket, errorResponse);
    }

    private handleServerError(error: Error): void {
        console.error('🚨 TCP Server Error:', {
            message: error.message,
            code: (error as any).code,
            stack: error.stack?.split('\n').slice(0, 5).join('\n'),
        });

        // Handle specific error types
        if ((error as any).code === 'EADDRINUSE') {
            console.error(`❌ Port ${CONFIG.TCP_PORT} is already in use`);
            process.exit(1);
        }
    }

    private handleServerListening(): void {
        console.log(`🚀 TCP Microservice listening on ${CONFIG.TCP_HOST}:${CONFIG.TCP_PORT}`);
        console.log(`📊 Configuration:`, {
            maxConnections: CONFIG.MAX_CONNECTIONS,
            socketTimeout: CONFIG.SOCKET_TIMEOUT,
            maxPayloadSize: CONFIG.MAX_PAYLOAD_SIZE,
        });
    }

    private setupGracefulShutdown(): void {
        const shutdown = async (signal: string) => {
            console.log(`🛑 Received ${signal}, starting graceful shutdown...`);
            this.isShuttingDown = true;

            this.server.close(() => {
                console.log('✅ Server stopped accepting new connections');
            });

            connectionManager.closeAllConnections();

            console.log('📊 Final metrics:', connectionManager.getMetrics());

            console.log('👋 Graceful shutdown completed');
            process.exit(0);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

        process.on('uncaughtException', (error) => {
            console.error('🚨 Uncaught Exception:', error);
            shutdown('UNCAUGHT_EXCEPTION');
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
            shutdown('UNHANDLED_REJECTION');
        });
    }

    public start(): void {
        this.server.listen(CONFIG.TCP_PORT, CONFIG.TCP_HOST);
    }

    public getMetrics(): ConnectionMetrics {
        return connectionManager.getMetrics();
    }
}

if (process.env.ENABLE_HEALTH_CHECK === 'true') {
    const healthPort = parseInt(process.env.HEALTH_PORT || '4003', 10);
    const healthServer = net.createServer((socket) => {
        const metrics = connectionManager.getMetrics();
        const healthResponse = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            metrics,
        };
        socket.write(JSON.stringify(healthResponse) + '\n');
        socket.end();
    });

    healthServer.listen(healthPort, '127.0.0.1', () => {
        console.log(`🏥 Health check server listening on 127.0.0.1:${healthPort}`);
    });
}

const tcpService = new TCPMicroservice();
tcpService.start();