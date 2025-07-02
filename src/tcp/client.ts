import net from 'net';
import dotenv from 'dotenv';

dotenv.config();

const TCP_PORT = parseInt(process.env.TCP_PORT || '4002', 10);
const TCP_HOST = process.env.TCP_HOST || 'localhost';

export function sendTCPRequest(message: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const dataToSend = JSON.stringify(message) + '\n';
    let buffer = '';
    let isResolved = false;

    const resolveOnce = (data: any) => {
      if (!isResolved) {
        isResolved = true;
        resolve(data);
        client.destroy();
      }
    };

    client.connect(TCP_PORT, TCP_HOST, () => {
      try {
        client.write(dataToSend, 'utf-8');
      } catch (err: any) {
        console.error('[TCP] Write Error:', err.message);
        reject(err);
        client.destroy();
      }
    });

    client.setEncoding('utf-8');

    client.on('data', (chunk) => {
      buffer += chunk;

      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const raw = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (!raw) continue;

        try {
          const parsed = JSON.parse(raw);
          resolveOnce(parsed);
        } catch (err) {
          console.error('[TCP] ❌ Failed to parse response:', raw);
          reject(err);
          client.destroy();
        }
      }
    });

    client.on('error', (err) => {
      console.error('[TCP] ❌ Connection error:', err.message);
      reject(err);
    });

    client.setTimeout(10000, () => {
      console.error('[TCP] ⏱ Timeout: No response within 10 seconds');
      reject(new Error('TCP Timeout'));
      client.destroy();
    });

    client.on('close', () => {
      console.log('[TCP] 🔌 Connection closed');
    });
  });
}
