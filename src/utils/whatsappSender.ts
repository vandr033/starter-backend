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
  try{
    const textPayload: TextOnlyMessage = {
      messageType: "text",
      to: phone,
      text: `Tu codigo de verificacion es: ${code}`,
    }
    const result = await wasender.send(textPayload)
    return result
  }catch(error){
    return -1
  }
}