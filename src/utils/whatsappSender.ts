import { createWasender, RetryConfig, FetchImplementation, TextOnlyMessage } from "wasenderapi";
import { getUserByPhone } from "../repositories/user.repo";


const apiKey = process.env.WASENDER_API_KEY!;
const personalAccessToken = process.env.WASENDER_PERSONAL_ACCESS_TOKEN!;

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
    const result = await wasender.send(textPayload)
    return result
  }catch(error){
    return -1
  }
}
