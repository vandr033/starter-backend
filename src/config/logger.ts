import path from 'node:path';
import pino, { LoggerOptions } from 'pino';
import { env } from './env';

type StackLocation = {
  file: string;
  line: number;
};

const FALLBACK_LOCATION: StackLocation = {
  file: 'unknown',
  line: -1
};

const getFrameLocation = (frame: string): StackLocation | null => {
  if (!frame.trim().startsWith('at')) {
    return null;
  }

  let locationSegment = frame.trim().replace(/^at\s+/, '');

  if (locationSegment.includes('(') && locationSegment.includes(')')) {
    locationSegment = locationSegment.slice(
      locationSegment.indexOf('(') + 1,
      locationSegment.lastIndexOf(')')
    );
  }

  const parts = locationSegment.split(':');

  if (parts.length < 3) {
    return null;
  }

  parts.pop(); // column
  const line = parts.pop();

  if (!line || Number.isNaN(Number(line))) {
    return null;
  }

  const filePath = parts.join(':');

  if (!filePath || filePath.startsWith('node:')) {
    return null;
  }

  const normalizedPath = path.normalize(filePath);

  if (
    normalizedPath.includes(`${path.sep}node_modules${path.sep}`) ||
    normalizedPath.includes(`src${path.sep}config${path.sep}logger`)
  ) {
    return null;
  }

  const relativePath = path
    .relative(process.cwd(), normalizedPath)
    .replace(/\\/g, '/');

  return {
    file: relativePath || normalizedPath,
    line: Number(line)
  };
};

const getCallerLocation = (): StackLocation => {
  const stack = new Error().stack?.split('\n').slice(2) ?? [];

  for (const frame of stack) {
    const location = getFrameLocation(frame);

    if (location) {
      return location;
    }
  }

  return FALLBACK_LOCATION;
};

const isProduction = env.nodeEnv === 'production';

const loggerOptions: LoggerOptions = {
  level: isProduction ? 'info' : 'debug',
  base: { pid: false },
  mixin: () => getCallerLocation()
};

if (!isProduction) {
  loggerOptions.transport = {
    target: 'pino-pretty',
    options: {
      translateTime: true,
      ignore: 'pid,hostname',
      messageFormat: '[{levelLabel}] {file}:{line} {msg}'
    }
  };
}

export const logger = pino(loggerOptions);
