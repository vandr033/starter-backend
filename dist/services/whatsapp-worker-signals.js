"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWhatsappWorkerWakeup = registerWhatsappWorkerWakeup;
exports.wakeWhatsappWorker = wakeWhatsappWorker;
let wakeupHandler = null;
function registerWhatsappWorkerWakeup(handler) {
    wakeupHandler = handler;
    return () => {
        if (wakeupHandler === handler)
            wakeupHandler = null;
    };
}
function wakeWhatsappWorker() {
    wakeupHandler?.();
}
