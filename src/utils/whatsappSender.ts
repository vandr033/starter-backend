import { createWasender, RetryConfig, TextOnlyMessage, ImageUrlMessage } from "wasenderapi";


const apiKey = process.env.WASENDER_API_KEY!;
const personalAccessToken = process.env.WASENDER_PERSONAL_ACCESS_TOKEN!;
const minIntervalMs = Math.max(0, Number(process.env.WASENDER_MIN_INTERVAL_MS || "1500"));

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimitWindow() {
  const elapsed = Date.now() - lastSendAt;
  const waitMs = Math.max(0, minIntervalMs - elapsed);
  if (waitMs > 0) {
    await sleep(waitMs);
  }
}

function enqueueWhatsappSend<T>(task: () => Promise<T>): Promise<T> {
  const nextTask = sendQueue.then(async () => {
    await waitForRateLimitWindow();
    const result = await task();
    lastSendAt = Date.now();
    return result;
  });

  sendQueue = nextTask.catch(() => undefined);
  return nextTask;
}

export const sendWhatsappCode = async (phone: string, code: string) => {
  return sendWhatsappText(phone, `Tu codigo de verificacion es: ${code}`)
}

export const sendWhatsappText = async (phone: string, text: string) => {
  try{
    const textPayload: TextOnlyMessage = {
      messageType: "text",
      to: phone,
      text,
    }
    const result = await enqueueWhatsappSend(() => wasender.send(textPayload))
    return result
  }catch(error){
    return -1
  }
}

export const sendWhatsappImage = async (phone: string, imageUrl: string, caption?: string) => {
  try {
    const imagePayload: ImageUrlMessage = {
      messageType: "image",
      to: phone,
      imageUrl,
      text: caption,
    }
    const result = await enqueueWhatsappSend(() => wasender.send(imagePayload))
    return result
  } catch (error) {
    return -1
  }
}
