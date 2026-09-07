type WakeupHandler = () => void;

let wakeupHandler: WakeupHandler | null = null;

export function registerWhatsappWorkerWakeup(handler: WakeupHandler): () => void {
  wakeupHandler = handler;
  return () => {
    if (wakeupHandler === handler) wakeupHandler = null;
  };
}

export function wakeWhatsappWorker(): void {
  wakeupHandler?.();
}

