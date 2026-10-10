import { AsyncLocalStorage } from 'node:async_hooks';

export type DemoRequestContext = {
    isDemo: true;
    sessionId: string;
    profileKey: string;
    companyId: number;
};

const demoRequestContext = new AsyncLocalStorage<DemoRequestContext>();

export function runWithDemoRequestContext<T>(context: DemoRequestContext, callback: () => T): T {
    return demoRequestContext.run(context, callback);
}

export function getDemoRequestContext(): DemoRequestContext | undefined {
    return demoRequestContext.getStore();
}

export function isDemoRequest(): boolean {
    return Boolean(demoRequestContext.getStore());
}
