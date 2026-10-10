"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runWithDemoRequestContext = runWithDemoRequestContext;
exports.getDemoRequestContext = getDemoRequestContext;
exports.isDemoRequest = isDemoRequest;
const node_async_hooks_1 = require("node:async_hooks");
const demoRequestContext = new node_async_hooks_1.AsyncLocalStorage();
function runWithDemoRequestContext(context, callback) {
    return demoRequestContext.run(context, callback);
}
function getDemoRequestContext() {
    return demoRequestContext.getStore();
}
function isDemoRequest() {
    return Boolean(demoRequestContext.getStore());
}
