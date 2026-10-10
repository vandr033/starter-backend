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
const express_1 = require("express");
const Controller = __importStar(require("../controllers/public-restaurant.controller"));
const MenuController = __importStar(require("../controllers/public-restaurant-menu.controller"));
const requireAuth_1 = require("../middlewares/requireAuth");
const demo_session_middleware_1 = require("../middlewares/demo-session.middleware");
const demo_session_middleware_2 = require("../middlewares/demo-session.middleware");
const router = (0, express_1.Router)();
router.use('/:slug', demo_session_middleware_1.demoCompanySlugWriteGuard);
router.get('/:slug', Controller.configuration);
router.get('/:slug/menu', MenuController.menu);
router.get('/:slug/availability', Controller.availability);
router.post('/:slug/reservations/:code/deposit-proof', Controller.restaurantDepositProofUpload, Controller.uploadReservationDepositProof);
router.post('/:slug/reservations', Controller.create);
router.get('/:slug/my-reservations', requireAuth_1.requireAuth, Controller.mine);
router.get('/reservations/:code', Controller.detail);
router.post('/reservations/:code/cancel', demo_session_middleware_2.demoRestaurantReservationWriteGuard, Controller.cancel);
exports.default = router;
