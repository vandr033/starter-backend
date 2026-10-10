"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MensajeApi = void 0;
class MensajeApi {
    constructor(init) {
        this.code = init?.code ?? 200;
        this.error = init?.error ?? false;
        this.message = init?.message ?? '';
        this.technicalMessage = init?.technicalMessage ?? undefined;
        this.data = init?.data;
    }
}
exports.MensajeApi = MensajeApi;
