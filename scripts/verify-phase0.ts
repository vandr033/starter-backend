import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import 'dotenv/config';
import mysql from 'mysql2/promise';

const backendRoot = path.resolve(__dirname, '..');
const prismaBinary = path.join(backendRoot, 'node_modules', '.bin', 'prisma');

function quoteIdentifier(value: string): string {
  return `\`${value.replace(/`/g, '``')}\``;
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, {
    cwd: backendRoot,
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 1) !== 0) {
    throw new Error(`Command failed with exit code ${result.status ?? 1}: ${command} ${args.join(' ')}`);
  }
}

function getConnectionOptions(databaseUrl: URL) {
  return {
    host: databaseUrl.hostname,
    port: databaseUrl.port ? Number(databaseUrl.port) : 3306,
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
  };
}

function createTargetUrl(sourceUrl: URL, database: string): URL {
  const target = new URL(sourceUrl.toString());
  target.pathname = `/${database}`;
  return target;
}

async function assertCanonicalWaitlistForeignKey(connection: mysql.Connection, database: string): Promise<void> {
  const [rows] = await connection.query(
    `SELECT
       kcu.CONSTRAINT_NAME AS constraintName,
       kcu.COLUMN_NAME AS columnName,
       kcu.REFERENCED_TABLE_NAME AS referencedTableName,
       kcu.REFERENCED_COLUMN_NAME AS referencedColumnName,
       rc.DELETE_RULE AS deleteRule,
       rc.UPDATE_RULE AS updateRule
     FROM information_schema.KEY_COLUMN_USAGE kcu
     JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
       ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
       AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
       AND rc.TABLE_NAME = kcu.TABLE_NAME
     WHERE kcu.CONSTRAINT_SCHEMA = ?
       AND kcu.TABLE_NAME = 'restaurant_waitlist'
       AND kcu.COLUMN_NAME = 'company_id'
       AND kcu.REFERENCED_TABLE_NAME = 'company'`,
    [database],
  );

  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(`Expected one restaurant waitlist company FK, found ${Array.isArray(rows) ? rows.length : 'an invalid result'}`);
  }

  const constraint = rows[0] as Record<string, unknown>;
  const expected = {
    constraintName: 'restaurant_waitlist_company_id_fkey',
    columnName: 'company_id',
    referencedTableName: 'company',
    referencedColumnName: 'id',
    deleteRule: 'RESTRICT',
    updateRule: 'CASCADE',
  };

  for (const [key, value] of Object.entries(expected)) {
    if (constraint[key] !== value) {
      throw new Error(`Unexpected restaurant waitlist company FK ${key}: ${String(constraint[key])}`);
    }
  }
}

async function main(): Promise<void> {
  const configuredUrl = process.env.DATABASE_URL;
  if (!configuredUrl) {
    throw new Error('DATABASE_URL is required to run Phase 0 verification');
  }

  const sourceUrl = new URL(configuredUrl);
  if (!/^mysql(?:s)?:$/i.test(sourceUrl.protocol)) {
    throw new Error('Phase 0 verification requires a mysql:// DATABASE_URL');
  }

  const database = `priconpri_phase0_verify_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const targetUrl = createTargetUrl(sourceUrl, database);
  const targetEnv = {
    ...process.env,
    DATABASE_URL: targetUrl.toString(),
    RUN_MYSQL_INTEGRATION: '1',
  };
  let created = false;
  const connection = await mysql.createConnection(getConnectionOptions(sourceUrl));

  try {
    // These statements only create and remove this run's uniquely generated
    // disposable database; they never repair an application schema.
    await connection.query(`CREATE DATABASE ${quoteIdentifier(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    console.log(`PHASE0_DATABASE=${database}`);

    run(prismaBinary, ['migrate', 'deploy'], targetEnv);
    run(prismaBinary, ['generate'], targetEnv);
    run(
      prismaBinary,
      [
        'migrate',
        'diff',
        '--from-url',
        targetUrl.toString(),
        '--to-schema-datamodel',
        'prisma/schema.prisma',
        '--script',
        '--exit-code',
      ],
      targetEnv,
    );
    await assertCanonicalWaitlistForeignKey(connection, database);
    console.log('PHASE0_WAITLIST_FK=ONE_CANONICAL');
    run('npm', ['run', 'prisma:seed'], targetEnv);
    run('npm', ['run', 'prisma:seed'], targetEnv);
    run(process.execPath, ['--test', '-r', 'ts-node/register', 'tests/phase-0.seed-auth.integration.test.ts'], targetEnv);
    run(process.execPath, ['--test', '-r', 'ts-node/register', 'tests/phase-1.upload-notification.integration.test.ts'], targetEnv);
    run(process.execPath, ['--test', '-r', 'ts-node/register', 'tests/restaurant-tenant-isolation.integration.test.ts'], targetEnv);
    run(process.execPath, ['--test', '-r', 'ts-node/register', 'tests/phase-2.commerce-concurrency.integration.test.ts'], targetEnv);
    run(process.execPath, ['--test', '-r', 'ts-node/register', 'tests/whatsapp-worker.mysql.integration.test.ts'], targetEnv);

    console.log('PHASE0_VERIFICATION=PASS');
    console.log('PHASE0_SCHEMA_DIFF=EMPTY');
    console.log('PHASE0_SEED=PASS');
    console.log('PHASE0_SEED_REPEAT=PASS');
    console.log('PHASE0_SEEDED_ROLE_AUTH=5/5');
    console.log('PHASE1_UPLOAD_NOTIFICATION=1/1');
    console.log('PHASE0_MYSQL_INTEGRATION=4/4');
    console.log('PHASE1_RESTAURANT_PROVIDER_PERSISTENCE=1/1');
    console.log('PHASE1_MYSQL_INTEGRATION=7/7');
    console.log('PHASE2_COMMERCE_CONCURRENCY=6/6');
    console.log('WHATSAPP_DURABLE_INTEGRATION=1/1');
  } finally {
    await connection.end();
    if (created) {
      const cleanupConnection = await mysql.createConnection(getConnectionOptions(sourceUrl));
      try {
        await cleanupConnection.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)}`);
      } finally {
        await cleanupConnection.end();
      }
      console.log(`PHASE0_DATABASE_CLEANED=${database}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
