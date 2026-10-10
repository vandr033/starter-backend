"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logoutSession = exports.restartSession = exports.startSession = exports.getQRCode = exports.getSessionStatus = exports.wahaAdminService = void 0;
exports.createWahaAdminService = createWahaAdminService;
const MensajeApi_1 = require("../types/MensajeApi");
const waha_service_1 = require("./waha.service");
function normalizeOptionalString(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function getConfiguredSession(env = process.env) {
    return normalizeOptionalString(env.WAHA_SESSION) || 'default';
}
function isNotFoundError(error) {
    return error instanceof waha_service_1.WahaRequestError && error.status === 404;
}
function buildState(session, overrides) {
    return {
        session,
        status: 'DISCONNECTED',
        isConnected: false,
        needsQr: false,
        qr: null,
        account: null,
        message: 'WAHA session is disconnected.',
        lastCheckedAt: new Date().toISOString(),
        sessionExists: true,
        upstreamStatus: null,
        qrFormat: null,
        ...overrides,
    };
}
function normalizeAccount(info, me) {
    const source = me ?? info?.me;
    if (!source || typeof source !== 'object')
        return null;
    const account = {};
    for (const key of ['id', 'pushName', 'jid', 'lid']) {
        const value = source[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            account[key] = value.trim();
        }
    }
    return Object.keys(account).length > 0 ? account : null;
}
function toDataUrl(contentType, buffer) {
    const mimeType = normalizeOptionalString(contentType) || 'image/png';
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
}
function getErrorStatusCode(error) {
    if (error instanceof waha_service_1.WahaRequestError && typeof error.status === 'number') {
        return error.status >= 400 && error.status <= 599 ? error.status : 502;
    }
    return 502;
}
function getHumanErrorMessage(error) {
    if (error instanceof waha_service_1.WahaRequestError) {
        if (error.status === 401 || error.status === 403) {
            return 'WAHA rejected the request. Verify WAHA_API_KEY and session permissions.';
        }
        if (error.status === 404) {
            return 'The configured WAHA session was not found.';
        }
        if (error.status && error.status >= 500) {
            return 'WAHA is unavailable right now. Try again in a moment.';
        }
    }
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }
    return 'Unable to reach WAHA right now.';
}
async function loadSessionInfo(client, session) {
    try {
        const response = await client.getSessionInfo(session);
        return response.data;
    }
    catch (error) {
        if (isNotFoundError(error)) {
            return null;
        }
        throw error;
    }
}
async function loadConnectedAccount(client, session, info) {
    if (normalizeAccount(info)) {
        return normalizeAccount(info);
    }
    try {
        const me = await client.getSessionMe(session);
        return normalizeAccount(info, me.data);
    }
    catch {
        return normalizeAccount(info);
    }
}
async function loadQrData(client, session) {
    try {
        const response = await client.getAuthQRCode(session, { format: 'image' });
        if (Buffer.isBuffer(response.data)) {
            return {
                qr: toDataUrl(response.contentType, response.data),
                qrFormat: 'image',
            };
        }
    }
    catch {
        // Fall back to raw QR below.
    }
    try {
        const response = await client.getAuthQRCode(session, { format: 'raw' });
        const rawValue = response.data && typeof response.data === 'object'
            ? normalizeOptionalString(response.data.value)
            : null;
        return {
            qr: rawValue,
            qrFormat: rawValue ? 'raw' : null,
        };
    }
    catch {
        return {
            qr: null,
            qrFormat: null,
        };
    }
}
async function inspectSession(client, session, options) {
    const info = await loadSessionInfo(client, session);
    if (!info) {
        return buildState(session, {
            sessionExists: false,
            status: 'DISCONNECTED',
            message: `WAHA session "${session}" does not exist yet. Start the session to generate a QR code.`,
        });
    }
    const upstreamStatus = normalizeOptionalString(info.status);
    if (upstreamStatus === 'WORKING') {
        const account = await loadConnectedAccount(client, session, info);
        return buildState(session, {
            status: 'CONNECTED',
            isConnected: true,
            needsQr: false,
            account,
            message: 'WAHA session is connected.',
            upstreamStatus,
        });
    }
    if (upstreamStatus === 'STARTING') {
        return buildState(session, {
            status: 'STARTING',
            message: 'WAHA session is starting. A QR code will appear as soon as the device is ready.',
            upstreamStatus,
        });
    }
    if (upstreamStatus === 'SCAN_QR_CODE') {
        const qrData = options?.includeQr ? await loadQrData(client, session) : { qr: null, qrFormat: null };
        return buildState(session, {
            status: 'QR',
            needsQr: true,
            qr: qrData.qr,
            qrFormat: qrData.qrFormat,
            message: 'Scan this QR code with WhatsApp to connect the configured WAHA session.',
            upstreamStatus,
        });
    }
    if (upstreamStatus === 'STOPPED' || upstreamStatus === 'FAILED') {
        return buildState(session, {
            status: 'DISCONNECTED',
            message: upstreamStatus === 'FAILED'
                ? 'WAHA reported a failed session state. Restart the session to generate a fresh QR code.'
                : 'WAHA session is stopped. Start the session to generate a QR code.',
            upstreamStatus,
        });
    }
    return buildState(session, {
        status: 'ERROR',
        message: upstreamStatus
            ? `WAHA returned an unrecognized session status: ${upstreamStatus}.`
            : 'WAHA did not return a recognizable session status.',
        upstreamStatus,
    });
}
function buildSuccessResponse(state) {
    return new MensajeApi_1.MensajeApi({
        code: 200,
        error: false,
        message: state.message,
        data: state,
    });
}
function buildErrorResponse(session, error, fallbackMessage) {
    const message = getHumanErrorMessage(error) || fallbackMessage;
    return new MensajeApi_1.MensajeApi({
        code: getErrorStatusCode(error),
        error: true,
        message,
        technicalMessage: error instanceof Error ? error.message : undefined,
        data: buildState(session, {
            status: 'ERROR',
            sessionExists: true,
            message,
        }),
    });
}
function createWahaAdminService(client = waha_service_1.wahaClient) {
    const enforceProviderState = client === waha_service_1.wahaClient;
    function unavailableResponse(session) {
        if (!enforceProviderState)
            return null;
        const state = (0, waha_service_1.getWahaProviderState)();
        if (state.mode === 'remote' && state.configured)
            return null;
        const disabled = state.reason === 'PROVIDER_DISABLED';
        const message = disabled
            ? 'WAHA provider is disabled.'
            : 'WAHA provider is not configured.';
        return new MensajeApi_1.MensajeApi({
            code: disabled ? 200 : 503,
            error: !disabled,
            message,
            data: {
                ...buildState(session, {
                    status: 'DISCONNECTED',
                    message,
                }),
                deliveryStatus: disabled ? 'SKIPPED' : 'FAILED',
                reason: state.reason,
            },
        });
    }
    async function getSessionStatus() {
        const session = getConfiguredSession();
        const unavailable = unavailableResponse(session);
        if (unavailable)
            return unavailable;
        try {
            const state = await inspectSession(client, session, { includeQr: false });
            return buildSuccessResponse(state);
        }
        catch (error) {
            return buildErrorResponse(session, error, 'Unable to load WAHA session status.');
        }
    }
    async function getQRCode() {
        const session = getConfiguredSession();
        const unavailable = unavailableResponse(session);
        if (unavailable)
            return unavailable;
        try {
            const state = await inspectSession(client, session, { includeQr: true });
            return buildSuccessResponse(state);
        }
        catch (error) {
            return buildErrorResponse(session, error, 'Unable to load the WAHA QR code.');
        }
    }
    async function startSession() {
        const session = getConfiguredSession();
        const unavailable = unavailableResponse(session);
        if (unavailable)
            return unavailable;
        try {
            try {
                await client.startSession(session);
            }
            catch (error) {
                if (!isNotFoundError(error)) {
                    throw error;
                }
                await client.createSession(session, { start: true });
            }
            const state = await inspectSession(client, session, { includeQr: true });
            return buildSuccessResponse(state);
        }
        catch (error) {
            return buildErrorResponse(session, error, 'Unable to start the WAHA session.');
        }
    }
    async function restartSession() {
        const session = getConfiguredSession();
        const unavailable = unavailableResponse(session);
        if (unavailable)
            return unavailable;
        try {
            await client.restartSession(session);
            const state = await inspectSession(client, session, { includeQr: true });
            return buildSuccessResponse(state);
        }
        catch (error) {
            return buildErrorResponse(session, error, 'Unable to restart the WAHA session.');
        }
    }
    async function logoutSession() {
        const session = getConfiguredSession();
        const unavailable = unavailableResponse(session);
        if (unavailable)
            return unavailable;
        try {
            await client.logoutSession(session);
            const state = await inspectSession(client, session, { includeQr: true });
            return buildSuccessResponse(state);
        }
        catch (error) {
            return buildErrorResponse(session, error, 'Unable to log out the WAHA session.');
        }
    }
    return {
        getSessionStatus,
        getQRCode,
        startSession,
        restartSession,
        logoutSession,
    };
}
exports.wahaAdminService = createWahaAdminService();
const getSessionStatus = () => exports.wahaAdminService.getSessionStatus();
exports.getSessionStatus = getSessionStatus;
const getQRCode = () => exports.wahaAdminService.getQRCode();
exports.getQRCode = getQRCode;
const startSession = () => exports.wahaAdminService.startSession();
exports.startSession = startSession;
const restartSession = () => exports.wahaAdminService.restartSession();
exports.restartSession = restartSession;
const logoutSession = () => exports.wahaAdminService.logoutSession();
exports.logoutSession = logoutSession;
