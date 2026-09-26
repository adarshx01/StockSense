import awsLambdaFastify from '@fastify/aws-lambda';
import { buildApp } from './src/app.ts';
import { runMigrations } from './src/db/migrate.ts';
import { runSeed } from './src/db/seed.ts';

type LambdaEvent = {
  task?: string;
  seed?: boolean;
  seedPassword?: string;
  seedEmail?: string;
  requestContext?: unknown;
};

let proxy: ((event: unknown, context: unknown) => Promise<unknown>) | undefined;

async function loadSecrets(): Promise<void> {
  if (process.env.DATABASE_URL && process.env.JWT_SECRET) return;
  const secretId = process.env.APP_SECRET_ID;
  if (!secretId) return;
  const { GetSecretValueCommand, SecretsManagerClient } = await import('@aws-sdk/client-secrets-manager');
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-south-1' });
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  const secret = JSON.parse(response.SecretString || '{}') as {
    databaseUrl?: string;
    jwtSecret?: string;
    sesFromEmail?: string;
  };
  if (secret.databaseUrl) process.env.DATABASE_URL = secret.databaseUrl;
  if (secret.jwtSecret) process.env.JWT_SECRET = secret.jwtSecret;
  if (secret.sesFromEmail) process.env.SES_FROM_EMAIL = secret.sesFromEmail;
  process.env.DATABASE_SSL = 'true';
}

export const handler = async (event: LambdaEvent, context: { callbackWaitsForEmptyEventLoop: boolean }) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await loadSecrets();

  if (event?.task === 'migrate') {
    await runMigrations();
    if (event.seed) {
      if (event.seedPassword) process.env.SEED_PASSWORD = event.seedPassword;
      if (event.seedEmail) process.env.SEED_EMAIL = event.seedEmail;
      await runSeed();
    }
    return { ok: true };
  }

  if (!proxy) {
    const app = await buildApp({ logger: { level: process.env.LOG_LEVEL || 'info' } });
    await app.ready();
    proxy = awsLambdaFastify(app, { callbackWaitsForEmptyEventLoop: false }) as (
      event: unknown,
      context: unknown,
    ) => Promise<unknown>;
  }
  return proxy(event, context);
};
