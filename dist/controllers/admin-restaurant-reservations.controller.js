"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.list = list;
exports.create = create;
exports.get = get;
exports.update = update;
exports.status = status;
exports.assignTable = assignTable;
exports.dashboard = dashboard;
exports.resendConfirmation = resendConfirmation;
exports.notificationHistory = notificationHistory;
exports.metrics = metrics;
const Reservations = __importStar(require("../services/restaurant-reservation.service"));
const Operations = __importStar(require("../services/restaurant-operations.service"));
const Notifications = __importStar(require("../services/restaurant-notification.service"));
const Metrics = __importStar(require("../services/restaurant-metrics.service"));
function companyId(req, res) { const id = req.companyID; if (!id) {
    res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    return null;
} return id; }
function id(value) { const parsed = Number(Array.isArray(value) ? value[0] : value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; }
async function respond(res, work) { const result = await work; return res.status(result.code).json(result); }
async function list(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, Reservations.listReservations(cid, req.validatedQuery)); }
async function create(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, Reservations.createReservation(cid, req.authUser.id, req.validated)); }
async function get(req, res) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, Reservations.getReservation(cid, recordId)); }
async function update(req, res) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, Reservations.updateReservation(cid, recordId, req.validated, req.authUser.id)); }
async function status(req, res) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); const input = req.validated; return respond(res, Reservations.changeStatus(cid, recordId, input.status, input.reason, req.authUser.id)); }
async function assignTable(req, res) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, Reservations.assignTable(cid, recordId, req.validated, req.authUser.id)); }
async function dashboard(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, Operations.dashboard(cid)); }
async function resendConfirmation(req, res) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, Notifications.resendRestaurantReservationConfirmation(cid, recordId)); }
async function notificationHistory(req, res) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, Notifications.listRestaurantNotificationHistory(cid, recordId)); }
async function metrics(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, Metrics.restaurantMetrics(cid, req.validatedQuery)); }
