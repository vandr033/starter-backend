"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const node_path_1 = __importDefault(require("node:path"));
const pino_1 = __importDefault(require("pino"));
const env_1 = require("./env");
const FALLBACK_LOCATION = {
    file: 'unknown',
    line: -1
};
const getFrameLocation = (frame) => {
    if (!frame.trim().startsWith('at')) {
        return null;
    }
    let locationSegment = frame.trim().replace(/^at\s+/, '');
    if (locationSegment.includes('(') && locationSegment.includes(')')) {
        locationSegment = locationSegment.slice(locationSegment.indexOf('(') + 1, locationSegment.lastIndexOf(')'));
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
    const normalizedPath = node_path_1.default.normalize(filePath);
    if (normalizedPath.includes(`${node_path_1.default.sep}node_modules${node_path_1.default.sep}`) ||
        normalizedPath.includes(`src${node_path_1.default.sep}config${node_path_1.default.sep}logger`)) {
        return null;
    }
    const relativePath = node_path_1.default
        .relative(process.cwd(), normalizedPath)
        .replace(/\\/g, '/');
    return {
        file: relativePath || normalizedPath,
        line: Number(line)
    };
};
const getCallerLocation = () => {
    const stack = new Error().stack?.split('\n').slice(2) ?? [];
    for (const frame of stack) {
        const location = getFrameLocation(frame);
        if (location) {
            return location;
        }
    }
    return FALLBACK_LOCATION;
};
const isProduction = env_1.env.nodeEnv === 'production';
const loggerOptions = {
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
exports.logger = (0, pino_1.default)(loggerOptions);
