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
exports.getAccess = getAccess;
exports.updateAccess = updateAccess;
exports.getSettings = getSettings;
exports.updateSettings = updateSettings;
exports.listAreas = listAreas;
exports.createArea = createArea;
exports.updateArea = updateArea;
exports.deleteArea = deleteArea;
exports.listTables = listTables;
exports.createTable = createTable;
exports.updateTable = updateTable;
exports.deleteTable = deleteTable;
exports.listPeriods = listPeriods;
exports.createPeriod = createPeriod;
exports.updatePeriod = updatePeriod;
exports.deletePeriod = deletePeriod;
const RestaurantService = __importStar(require("../services/restaurant.service"));
function companyId(req, res) {
    const id = req.companyID;
    if (!id) {
        res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
        return null;
    }
    return id;
}
function id(value) {
    const parsed = Number(Array.isArray(value) ? value[0] : value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
function optionalNumber(value, min, max) {
    if (value === undefined)
        return undefined;
    const parsed = Number(Array.isArray(value) ? value[0] : value);
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}
async function respond(res, result) { const payload = await result; return res.status(payload.code).json(payload); }
async function getAccess(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, RestaurantService.getAccess(cid)); }
async function updateAccess(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, RestaurantService.setAccess(cid, req.validated.enabled)); }
async function getSettings(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, RestaurantService.getSettings(cid)); }
async function updateSettings(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, RestaurantService.updateSettings(cid, req.validated)); }
async function listAreas(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, RestaurantService.listAreas(cid)); }
async function createArea(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, RestaurantService.createArea(cid, req.validated)); }
async function updateArea(req, res) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, RestaurantService.updateArea(cid, recordId, req.validated)); }
async function deleteArea(req, res) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, RestaurantService.deleteArea(cid, recordId)); }
async function listTables(req, res) { const cid = companyId(req, res), areaId = optionalNumber(req.query.diningAreaId, 1, Number.MAX_SAFE_INTEGER); if (!cid)
    return; if (areaId === null)
    return res.status(400).json({ code: 400, error: true, message: 'diningAreaId inválido.' }); return respond(res, RestaurantService.listTables(cid, areaId)); }
async function createTable(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, RestaurantService.createTable(cid, req.validated)); }
async function updateTable(req, res) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, RestaurantService.updateTable(cid, recordId, req.validated)); }
async function deleteTable(req, res) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, RestaurantService.deleteTable(cid, recordId)); }
async function listPeriods(req, res) { const cid = companyId(req, res), day = optionalNumber(req.query.dayOfWeek, 0, 6); if (!cid)
    return; if (day === null)
    return res.status(400).json({ code: 400, error: true, message: 'dayOfWeek inválido. Usá 0 (domingo) a 6 (sábado).' }); return respond(res, RestaurantService.listPeriods(cid, day)); }
async function createPeriod(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, RestaurantService.createPeriod(cid, req.validated)); }
async function updatePeriod(req, res) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, RestaurantService.updatePeriod(cid, recordId, req.validated)); }
async function deletePeriod(req, res) { const cid = companyId(req, res), recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, RestaurantService.deletePeriod(cid, recordId)); }
