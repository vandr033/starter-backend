import { Request, Response } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import * as AuthService from '../services/auth.service';
import { parsePreRegToken } from '../utils/verification';
let mensaje:MensajeApi;
// export async function sendVerificationCodePhone(req: Request, res: Response){
//     const {phone, phone_prefix} = req.body;
//     if(!phone || !phone_prefix){
//         mensaje={
//             code:400,
//             message:"Faltan datos",
//             error:true
//         }
//     }
//     const result = await AuthService.sendVerificationCodePhone(phone, phone_prefix);
//     if(result.code === 200){
//         mensaje={
//             code:200,
//             message:"Codigo de verificacion enviado",
//             error:false
//         }
//     }
//     res.status(mensaje.code).json(mensaje)
//   }

//   export async function verifyVerificationCodePhone(req: Request, res: Response){
//     const {phone, phone_prefix, code} = req.body;
//     if(!phone || !phone_prefix || !code){
//         mensaje={
//             code:400,
//             message:"Faltan datos",
//             error:true
//         }
//     }
//     const result = await AuthService.verifyVerificationCodePhone(phone, phone_prefix, code);
//     if(result.code === 200){
//         mensaje={
//             code:200,
//             message:"Codigo de verificacion verificado",
//             error:false
//         }
//     }
//     res.status(mensaje.code).json(mensaje)
//   }


  export async function sendVerificationCodeEmail(req: Request, res: Response){
    const {email} = req.body;
    if(!email){
        mensaje={
            code:400,
            message:"Faltan datos",
            error:true
        }
    }
    const result = await AuthService.sendVerificationCodeEmail(email);
    if(result.code === 200){
        mensaje={
            code:200,
            message:"Codigo de verificacion enviado",
            error:false
        }
    }
    res.status(mensaje.code).json(mensaje)
  }

  export async function verifyVerificationCodeEmail(req: Request, res: Response){
    const {email, code} = req.body;
    if(!email || !code){
        mensaje={
            code:400,
            message:"Faltan datos",
            error:true
        }
    }
    const result = await AuthService.verifyVerificationCodeEmail(email, code);
    return res.status(result.code).json(result)
  }

export async function completeCustomerRegistrationEmail(req: Request, res: Response) {
  const {
    preRegToken,
    email,
    password,
    first_name,
    last_name,
  } = req.body as {
    preRegToken?: string;
    email?: string;
    password?: string;
    first_name?: string;
    last_name?: string;
  };

  // Basic validation
  if (!preRegToken || !password || !first_name || !email) {
    mensaje = {
      code: 400,
      message: "Faltan datos",
      error: true,
    };
    return res.status(mensaje.code).json(mensaje);
  }

  // Validate token + channel = EMAIL
  const prereg = parsePreRegToken(preRegToken);
  if (!prereg || prereg.channel !== "EMAIL") {
    mensaje = {
      code: 400,
      message: "Token de preregistro inválido o no corresponde a email",
      error: true,
    };
    return res.status(mensaje.code).json(mensaje);
  }

  // Email must match verified identifier
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail !== prereg.identifier) {
    mensaje = {
      code: 400,
      message: "El correo no coincide con el verificado",
      error: true,
    };
    return res.status(mensaje.code).json(mensaje);
  }

  const result = await AuthService.completeCustomerRegistrationEmail(
    preRegToken,
    email,
    password,
    first_name,
    last_name,
    req.headers
  );

  return res.status(result.code).json(result);
}