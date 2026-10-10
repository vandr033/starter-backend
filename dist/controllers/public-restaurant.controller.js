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
exports.restaurantDepositProofUpload = void 0;
exports.configuration = configuration;
exports.availability = availability;
exports.uploadReservationDepositProof = uploadReservationDepositProof;
exports.create = create;
exports.mine = mine;
exports.detail = detail;
exports.cancel = cancel;
const public_upload_controller_1 = require("./public-upload.controller");
const PublicRestaurant = __importStar(require("../services/public-restaurant.service"));
const public_restaurant_schema_1 = require("../schemas/public-restaurant.schema");
function slug(req, res) { const parsed = public_restaurant_schema_1.publicRestaurantSlugSchema.safeParse(req.params.slug); if (!parsed.success) {
    res.status(404).json({ code: 404, error: true, message: 'No encontramos la reserva o el restaurante solicitado.' });
    return null;
} return parsed.data; }
function code(req, res) { const parsed = public_restaurant_schema_1.publicRestaurantCodeSchema.safeParse(req.params.code); if (!parsed.success) {
    res.status(404).json({ code: 404, error: true, message: 'No encontramos la reserva o el restaurante solicitado.' });
    return null;
} return parsed.data; }
async function respond(res, result) { const value = await result; return res.status(value.code).json(value); }
exports.restaurantDepositProofUpload = public_upload_controller_1.uploadFileMiddleware;
async function configuration(req, res) { const value = slug(req, res); if (value)
    return respond(res, PublicRestaurant.getConfiguration(value)); }
async function availability(req, res) { const value = slug(req, res); if (!value)
    return; const parsed = public_restaurant_schema_1.publicRestaurantAvailabilitySchema.safeParse(req.query); if (!parsed.success)
    return res.status(400).json({ code: 400, error: true, message: 'Parámetros de disponibilidad inválidos.' }); return respond(res, PublicRestaurant.getAvailability(value, parsed.data)); }
async function uploadReservationDepositProof(req, res) { const shop = slug(req, res); const reservationCode = code(req, res); if (!shop || !reservationCode)
    return; return respond(res, PublicRestaurant.uploadReservationDepositProof(shop, reservationCode, req.file, typeof req.body?.uploadIntent === 'string' ? req.body.uploadIntent : null)); }
async function create(req, res) { const value = slug(req, res); if (!value)
    return; const parsed = public_restaurant_schema_1.createPublicRestaurantReservationSchema.safeParse(req.body); if (!parsed.success)
    return res.status(400).json({ code: 400, error: true, message: 'Datos de reserva inválidos.', errors: parsed.error.flatten() }); return respond(res, PublicRestaurant.createPublicReservation(value, parsed.data)); }
async function mine(req, res) { const value = slug(req, res); const userId = req.authUser?.id; if (!value || !userId)
    return; return respond(res, PublicRestaurant.getMyPublicReservations(value, userId)); }
async function detail(req, res) { const value = code(req, res); if (value)
    return respond(res, PublicRestaurant.getPublicReservation(value)); }
async function cancel(req, res) { const value = code(req, res); if (!value)
    return; const parsed = public_restaurant_schema_1.cancelPublicRestaurantReservationSchema.safeParse(req.body ?? {}); if (!parsed.success)
    return res.status(400).json({ code: 400, error: true, message: 'Motivo de cancelación inválido.' }); return respond(res, PublicRestaurant.cancelPublicReservation(value, parsed.data.reason)); }
