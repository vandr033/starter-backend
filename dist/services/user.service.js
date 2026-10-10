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
exports.getUserById = getUserById;
exports.getUserByEmail = getUserByEmail;
const MensajeApi_1 = require("../types/MensajeApi");
const UserRepo = __importStar(require("../repositories/user.repo"));
async function getUserById(id) {
    try {
        const mensaje = new MensajeApi_1.MensajeApi();
        const user = await UserRepo.getUserById(id);
        if (!user) {
            mensaje.code = 400;
            mensaje.error = true;
            mensaje.message = 'Usuario no encontrado';
            return mensaje;
        }
        mensaje.code = 200;
        mensaje.error = false;
        mensaje.message = 'Usuario encontrado';
        mensaje.data = user;
        return mensaje;
    }
    catch (error) {
        const mensaje = new MensajeApi_1.MensajeApi();
        mensaje.code = 500;
        mensaje.error = true;
        mensaje.message = 'Error al obtener el usuario';
        mensaje.technicalMessage = error instanceof Error ? error.message : 'Error desconocido';
        return mensaje;
    }
}
async function getUserByEmail(email) {
    try {
        const mensaje = new MensajeApi_1.MensajeApi();
        const user = await UserRepo.getUserByEmail(email);
        if (!user) {
            mensaje.code = 400;
            mensaje.error = true;
            mensaje.message = 'Usuario no encontrado';
            return mensaje;
        }
        mensaje.code = 200;
        mensaje.error = false;
        mensaje.message = 'Usuario encontrado';
        mensaje.data = user;
        return mensaje;
    }
    catch (error) {
        const mensaje = new MensajeApi_1.MensajeApi();
        mensaje.code = 500;
        mensaje.error = true;
        mensaje.message = 'Error al obtener el usuario';
        mensaje.technicalMessage = error instanceof Error ? error.message : 'Error desconocido';
        return mensaje;
    }
}
