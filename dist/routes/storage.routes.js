"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const storage_controller_1 = require("../controllers/storage.controller");
const router = (0, express_1.Router)();
// GET /api/storage/* - Serve uploaded files
router.use((req, res, next) => {
    // Re-route to serveFile with the full path
    req.params.filePath = req.path.substring(1); // Remove leading slash
    (0, storage_controller_1.serveFile)(req, res);
});
exports.default = router;
