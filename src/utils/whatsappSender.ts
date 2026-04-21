import { createWasender, RetryConfig, TextOnlyMessage, ImageUrlMessage } from "wasenderapi";
import { logger } from "../config/logger";
import {
  appendCompanyContactLine,
  getCompanyNotificationBranding,
  mergeBranding,
  type NotificationBranding,
} from "./notificationBranding";


const apiKey = process.env.WASENDER_API_KEY!;
const personalAccessToken = process.env.WASENDER_PERSONAL_ACCESS_TOKEN!;
const configuredMinIntervalMs = Number(process.env.WASENDER_MIN_INTERVAL_MS || "5000");
const minIntervalMs = Math.max(5000, Number.isFinite(configuredMinIntervalMs) ? configuredMinIntervalMs : 5000);

const retryOptions: RetryConfig = {
  enabled: true,
  maxRetries: 3,
}

const wasender = createWasender(
  apiKey,
  personalAccessToken,
  undefined,
  undefined,
  retryOptions,
)

let lastSendAt = 0;
let sendQueue: Promise<unknown> = Promise.resolve();
let sendSequence = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimitWindow() {
  const elapsed = Date.now() - lastSendAt;
  const waitMs = Math.max(0, minIntervalMs - elapsed);
  if (waitMs > 0) {
    logger.debug(
      {
        event: "whatsapp_send_waiting_for_rate_limit",
        waitMs,
        minIntervalMs,
      },
      "Waiting before next WhatsApp send",
    );
    await sleep(waitMs);
  }
}

function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length <= 4) return trimmed;
  return `${trimmed.slice(0, 3)}***${trimmed.slice(-2)}`;
}

function buildErrorLog(error: unknown) {
  if (error instanceof Error) {
    const errorWithCause = error as Error & { cause?: unknown; code?: string | number; status?: number };
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: errorWithCause.code,
      status: errorWithCause.status,
      cause: errorWithCause.cause,
    };
  }

  return {
    message: typeof error === "string" ? error : "Unknown WhatsApp sender error",
    raw: error,
  };
}

function enqueueWhatsappSend<T>(
  task: () => Promise<T>,
  meta: { phone: string; messageType: "text" | "image" },
): Promise<T> {
  const sendId = ++sendSequence;
  const nextTask = sendQueue.then(async () => {
    logger.info(
      {
        event: "whatsapp_send_started",
        sendId,
        phone: maskPhone(meta.phone),
        messageType: meta.messageType,
      },
      "Starting WhatsApp send",
    );
    await waitForRateLimitWindow();
    const attemptStartedAt = Date.now();
    try {
      const result = await task();
      lastSendAt = Date.now();
      logger.info(
        {
          event: "whatsapp_send_succeeded",
          sendId,
          phone: maskPhone(meta.phone),
          messageType: meta.messageType,
          minIntervalMs,
          elapsedMs: lastSendAt - attemptStartedAt,
        },
        "WhatsApp send succeeded",
      );
      return result;
    } catch (error) {
      lastSendAt = Date.now();
      logger.error(
        {
          event: "whatsapp_send_failed",
          sendId,
          phone: maskPhone(meta.phone),
          messageType: meta.messageType,
          minIntervalMs,
          elapsedMs: lastSendAt - attemptStartedAt,
          error: buildErrorLog(error),
        },
        "WhatsApp send failed",
      );
      throw error;
    }
  });

  sendQueue = nextTask.catch(() => undefined);
  return nextTask;
}

export const sendWhatsappCode = async (phone: string, code: string) => {
  return sendWhatsappText(phone, `Priconpri\n\nTu codigo de verificacion es: ${code}`)
}

export const sendWhatsappText = async (
  phone: string,
  text: string,
  options?: { companyId?: number; branding?: NotificationBranding | null },
) => {
  try{
    const companyBranding = options?.companyId
      ? await getCompanyNotificationBranding(options.companyId)
      : null;
    const branding = mergeBranding(companyBranding, options?.branding);
    const brandedText = branding
      ? appendCompanyContactLine(text, branding)
      : text.includes("Priconpri")
        ? text
        : `${text.trim()}\n\nPriconpri`;
    const textPayload: TextOnlyMessage = {
      messageType: "text",
      to: phone,
      text: brandedText,
    }
    const result = await enqueueWhatsappSend(() => wasender.send(textPayload), {
      phone,
      messageType: "text",
    })
    return result
  }catch(error){
    logger.error(
      {
        event: "whatsapp_text_send_failed",
        phone: maskPhone(phone),
        error: buildErrorLog(error),
      },
      "sendWhatsappText returned failure",
    );
    return -1
  }
}

export const createWhatsappGroup = async (name: string, participantPhones: string[]): Promise<{ jid: string; name: string } | null> => {
  const participants = participantPhones.map((p) => `${p.replace(/\D/g, "")}@c.us`);
  try {
    const res = await fetch("https://www.wasenderapi.com/api/groups", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ name, participants }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.error({ event: "whatsapp_create_group_failed", status: res.status, body }, "WhatsApp group creation failed");
      return null;
    }
    const data = (await res.json()) as { data?: { id?: string } };
    const jid = data?.data?.id ?? null;
    if (!jid) return null;
    return { jid, name };
  } catch (error) {
    logger.error({ event: "whatsapp_create_group_error", error: buildErrorLog(error) }, "createWhatsappGroup threw");
    return null;
  }
};

export const sendWhatsappGroupMessage = async (groupJid: string, text: string) => {
  return sendWhatsappText(groupJid, text);
};

export const sendWhatsappImage = async (
  phone: string,
  imageUrl: string,
  caption?: string,
  options?: { companyId?: number; branding?: NotificationBranding | null },
) => {
  try {
    const companyBranding = options?.companyId
      ? await getCompanyNotificationBranding(options.companyId)
      : null;
    const branding = mergeBranding(companyBranding, options?.branding);
    const brandedCaption = caption
      ? branding
        ? appendCompanyContactLine(caption, branding)
        : caption.includes("Priconpri")
          ? caption
          : `${caption.trim()}\n\nPriconpri`
      : caption;
    const imagePayload: ImageUrlMessage = {
      messageType: "image",
      to: phone,
      imageUrl,
      text: brandedCaption,
    }
    const result = await enqueueWhatsappSend(() => wasender.send(imagePayload), {
      phone,
      messageType: "image",
    })
    return result
  } catch (error) {
    logger.error(
      {
        event: "whatsapp_image_send_failed",
        phone: maskPhone(phone),
        imageUrl,
        error: buildErrorLog(error),
      },
      "sendWhatsappImage returned failure",
    );
    return -1
  }
}
