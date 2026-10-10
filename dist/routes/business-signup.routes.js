"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const business_signup_controller_1 = require("../controllers/business-signup.controller");
const router = (0, express_1.Router)();
router.get('/options', business_signup_controller_1.listBusinessSignupOptions);
router.post('/', business_signup_controller_1.createBusinessSignup);
exports.default = router;
