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
exports.floor = floor;
exports.alternatives = alternatives;
exports.relocate = relocate;
exports.tableStatus = tableStatus;
exports.listCombinations = listCombinations;
exports.createCombination = createCombination;
exports.deleteCombination = deleteCombination;
exports.releaseCombination = releaseCombination;
const FloorService = __importStar(require("../services/restaurant-floor.service"));
function companyId(req, res) { const value = req.companyID; if (!value) {
    res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    return null;
} return value; }
function actor(req, res) { const value = req.authUser?.id; if (!value) {
    res.status(401).json({ code: 401, error: true, message: 'Sesión no válida.' });
    return null;
} return value; }
function id(value) { const parsed = Number(Array.isArray(value) ? value[0] : value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; }
async function respond(res, result) { const payload = await result; return res.status(payload.code).json(payload); }
async function floor(req, res) { const cid = companyId(req, res); if (!cid)
    return; const query = req.validatedQuery || {}; return respond(res, FloorService.getFloor(cid, query.at, query.shiftId)); }
async function alternatives(req, res) { const cid = companyId(req, res), reservationId = id(req.params.id); if (!cid)
    return; if (!reservationId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de reserva inválido.' }); return respond(res, FloorService.alternatives(cid, reservationId, req.validatedQuery?.at)); }
async function relocate(req, res) { const cid = companyId(req, res), uid = actor(req, res), reservationId = id(req.params.id); if (!cid || !uid)
    return; if (!reservationId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de reserva inválido.' }); return respond(res, FloorService.relocate(cid, reservationId, uid, req.validated)); }
async function tableStatus(req, res) { const cid = companyId(req, res), uid = actor(req, res), tableId = id(req.params.id); if (!cid || !uid)
    return; if (!tableId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de mesa inválido.' }); const input = req.validated; return respond(res, FloorService.updateTableStatus(cid, tableId, uid, input.status, input.blocked_reason)); }
async function listCombinations(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, FloorService.listCombinations(cid)); }
async function createCombination(req, res) { const cid = companyId(req, res), uid = actor(req, res); if (cid && uid)
    return respond(res, FloorService.createCombination(cid, uid, req.validated)); }
async function deleteCombination(req, res) { const cid = companyId(req, res), uid = actor(req, res), combinationId = id(req.params.id); if (!cid || !uid)
    return; if (!combinationId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de combinación inválido.' }); return respond(res, FloorService.deleteCombination(cid, combinationId, uid)); }
async function releaseCombination(req, res) { const cid = companyId(req, res), uid = actor(req, res), sessionId = id(req.params.id); if (!cid || !uid)
    return; if (!sessionId)
    return res.status(400).json({ code: 400, error: true, message: 'ID de sesión inválido.' }); return respond(res, FloorService.releaseCombinationSession(cid, sessionId, uid)); }
