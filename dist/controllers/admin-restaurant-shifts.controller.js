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
exports.get = get;
exports.create = create;
exports.update = update;
exports.remove = remove;
exports.open = open;
exports.close = close;
exports.cancel = cancel;
exports.members = members;
exports.areas = areas;
exports.assignments = assignments;
exports.setup = setup;
exports.copy = copy;
exports.saveTemplate = saveTemplate;
exports.listTemplates = listTemplates;
exports.useTemplate = useTemplate;
exports.mine = mine;
const ShiftService = __importStar(require("../services/restaurant-shift.service"));
function companyId(req, res) {
    const value = req.companyID;
    if (!value) {
        res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
        return null;
    }
    return value;
}
function actor(req, res) {
    const value = req.authUser?.id;
    if (!value) {
        res.status(401).json({ code: 401, error: true, message: 'Sesión no válida.' });
        return null;
    }
    return value;
}
function recordId(value) { const parsed = Number(Array.isArray(value) ? value[0] : value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; }
async function respond(res, result) { const payload = await result; return res.status(payload.code).json(payload); }
async function list(req, res) { const cid = companyId(req, res); if (!cid)
    return; return respond(res, ShiftService.listShifts(cid, req.validatedQuery || {})); }
async function get(req, res) { const cid = companyId(req, res), id = recordId(req.params.id); if (!cid)
    return; if (!id)
    return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, ShiftService.getShift(cid, id)); }
async function create(req, res) { const cid = companyId(req, res), uid = actor(req, res); if (!cid || !uid)
    return; return respond(res, ShiftService.createShift(cid, uid, req.validated)); }
async function update(req, res) { const cid = companyId(req, res), uid = actor(req, res), id = recordId(req.params.id); if (!cid || !uid)
    return; if (!id)
    return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, ShiftService.updateShift(cid, id, uid, req.validated)); }
async function remove(req, res) { const cid = companyId(req, res), uid = actor(req, res), id = recordId(req.params.id); if (!cid || !uid)
    return; if (!id)
    return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, ShiftService.deleteDraftShift(cid, id, uid)); }
async function open(req, res) { return changeStatus(req, res, ShiftService.openShift); }
async function close(req, res) { return changeStatus(req, res, ShiftService.closeShift); }
async function cancel(req, res) { return changeStatus(req, res, ShiftService.cancelShift); }
async function changeStatus(req, res, operation) { const cid = companyId(req, res), uid = actor(req, res), id = recordId(req.params.id); if (!cid || !uid)
    return; if (!id)
    return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, operation(cid, id, uid)); }
async function members(req, res) { const cid = companyId(req, res), uid = actor(req, res), id = recordId(req.params.id); if (!cid || !uid)
    return; if (!id)
    return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, ShiftService.replaceMembers(cid, id, uid, req.validated.members)); }
async function areas(req, res) { const cid = companyId(req, res), uid = actor(req, res), id = recordId(req.params.id); if (!cid || !uid)
    return; if (!id)
    return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, ShiftService.replaceDiningAreas(cid, id, uid, req.validated.dining_area_ids)); }
async function assignments(req, res) { const cid = companyId(req, res), uid = actor(req, res), id = recordId(req.params.id); if (!cid || !uid)
    return; if (!id)
    return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, ShiftService.replaceAssignments(cid, id, uid, req.validated.assignments)); }
async function setup(req, res) { const cid = companyId(req, res), uid = actor(req, res), id = recordId(req.params.id); if (!cid || !uid)
    return; if (!id)
    return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); const input = req.validated; return respond(res, ShiftService.replaceSetup(cid, id, uid, input)); }
async function copy(req, res) { const cid = companyId(req, res), uid = actor(req, res), id = recordId(req.params.id); if (!cid || !uid)
    return; if (!id)
    return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, ShiftService.copyShift(cid, id, uid, req.validated)); }
async function saveTemplate(req, res) { const cid = companyId(req, res), uid = actor(req, res), id = recordId(req.params.id); if (!cid || !uid)
    return; if (!id)
    return res.status(400).json({ code: 400, error: true, message: 'ID de turno inválido.' }); return respond(res, ShiftService.saveTemplate(cid, id, uid, req.validated.name)); }
async function listTemplates(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, ShiftService.listTemplates(cid)); }
async function useTemplate(req, res) { const cid = companyId(req, res), uid = actor(req, res); if (cid && uid)
    return respond(res, ShiftService.useTemplate(cid, uid, req.validated)); }
async function mine(req, res) { const cid = companyId(req, res), uid = actor(req, res); if (cid && uid)
    return respond(res, ShiftService.myShifts(cid, uid)); }
