"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const business_pricing_controller_1 = require("../controllers/business-pricing.controller");
const router = (0, express_1.Router)();
router.get('/', business_pricing_controller_1.getPublicPricing);
exports.default = router;
