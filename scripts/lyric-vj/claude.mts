// The Claude calls the directors share: one streamed reply that survives a dropped connection, and the prices.
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// the key lives outside the repo; read before the client is made (the client reads the environment once)
const env = join(homedir(), '.config/vjflow/anthropic.env');
if (!process.env['ANTHROPIC_API_KEY'] && existsSync(env)) {
  for (const line of readFileSync(env, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}

/** USD per million tokens (input, output). */
export const PRICES: Record<string, [number, number]> = { 'claude-opus-5-5': [4, 20], 'claude-fable-5-1': [10, 50] };

// overloaded (529) and rate limits: the SDK retries with backoff; a long design run should ride them out
const client = new Anthropic({ maxRetries: 8 });
/**
 * One streamed reply, retried when the connection drops mid-stream ("terminated"): the SDK's own retries only cover
 * a request that fails before the reply starts, and a paid song must not fail on a dropped connection.
 */
export async function streamed(params: Anthropic.Beta.Messages.MessageStreamParams) {
  for (let k = 0; ; k++) {
    // a stream that goes silent never ends on its own (one waited 3 hours): no event for 5 minutes counts as dropped
    const stream = client.beta.messages.stream(params);
    let idle: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(idle);
      idle = setTimeout(() => stream.abort(), 5 * 60_000);
    };
    arm();
    stream.on('streamEvent', arm);
    try {
      return await stream.finalMessage();
    } catch (e) {
      // a dropped stream, or the server failing mid-reply (an api_error 500 arrives as a stream event, past the SDK's
      // own retries): ask again
      const serverSide = e instanceof Anthropic.APIError && (((e as { status?: number }).status ?? 500) >= 500 || /api_error|overloaded/i.test(String((e as Error).message)));
      const dropped = serverSide || stream.aborted || e instanceof Anthropic.APIConnectionError || /terminated|ECONNRESET|socket hang up|other side closed/i.test(String((e as Error)?.message) + String((e as { cause?: unknown })?.cause));
      if (!dropped || k >= 3) throw e;
      console.error(`連線中斷或伺服器錯誤，重試第 ${k + 1} 次：${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 5000 * (k + 1)));
    } finally {
      clearTimeout(idle);
    }
  }
}
