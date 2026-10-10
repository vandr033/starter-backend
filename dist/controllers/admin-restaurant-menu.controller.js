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
exports.listCategories = listCategories;
exports.createCategory = createCategory;
exports.getCategory = getCategory;
exports.updateCategory = updateCategory;
exports.deleteCategory = deleteCategory;
exports.reorderCategories = reorderCategories;
exports.listItems = listItems;
exports.createItem = createItem;
exports.getItem = getItem;
exports.updateItem = updateItem;
exports.deleteItem = deleteItem;
exports.reorderItems = reorderItems;
const Menu = __importStar(require("../services/restaurant-menu.service"));
const companyId = (req, res) => {
    const value = Number(req.companyID);
    if (!Number.isInteger(value) || value <= 0) {
        res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
        return null;
    }
    return value;
};
const id = (value) => { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; };
const respond = async (res, result) => { const payload = await result; return res.status(payload.code).json(payload); };
const bool = (value) => value === undefined ? undefined : String(value) === 'true';
async function listCategories(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, Menu.listCategories(cid)); }
async function createCategory(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, Menu.createCategory(cid, req.validated)); }
async function getCategory(req, res) { const cid = companyId(req, res); const recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, Menu.getCategory(cid, recordId)); }
async function updateCategory(req, res) { const cid = companyId(req, res); const recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, Menu.updateCategory(cid, recordId, req.validated)); }
async function deleteCategory(req, res) { const cid = companyId(req, res); const recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, Menu.deleteCategory(cid, recordId)); }
async function reorderCategories(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, Menu.reorderCategories(cid, req.validated.items)); }
async function listItems(req, res) { const cid = companyId(req, res); if (!cid)
    return; const categoryId = req.query.categoryId === undefined ? undefined : id(req.query.categoryId); if (categoryId === null)
    return res.status(400).json({ code: 400, error: true, message: 'categoryId inválido.' }); return respond(res, Menu.listItems(cid, { categoryId, isActive: bool(req.query.isActive), isAvailable: bool(req.query.isAvailable), isFeatured: bool(req.query.isFeatured), search: typeof req.query.search === 'string' ? req.query.search.trim() || undefined : undefined, page: id(req.query.page) || 1, limit: id(req.query.limit) || 50 })); }
async function createItem(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, Menu.createItem(cid, req.validated)); }
async function getItem(req, res) { const cid = companyId(req, res); const recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, Menu.getItem(cid, recordId)); }
async function updateItem(req, res) { const cid = companyId(req, res); const recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, Menu.updateItem(cid, recordId, req.validated)); }
async function deleteItem(req, res) { const cid = companyId(req, res); const recordId = id(req.params.id); if (!cid)
    return; if (!recordId)
    return res.status(400).json({ code: 400, error: true, message: 'ID inválido.' }); return respond(res, Menu.deleteItem(cid, recordId)); }
async function reorderItems(req, res) { const cid = companyId(req, res); if (cid)
    return respond(res, Menu.reorderItems(cid, req.validated.items)); }
