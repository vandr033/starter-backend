// src/services/emailSender.ts
import nodemailer from "nodemailer";
import { User } from "better-auth/*";
const transporter = nodemailer.createTransport({
    service:'gmail',
    auth:{
        user:process.env.MAIL_USER,
        pass:process.env.MAIL_PASS
    }
});

export async function sendEmailCode(
  email: string,
  code: string
) {
  try {
    transporter.sendMail({
      to: email,
      from: process.env.MAIL_FROM!,
      subject: "Código de verificación",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Código de verificación</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f4f4f4;
            }
            .container {
              background-color: #ffffff;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #007bff;
            }
            .code-box {
              background-color: #f8f9fa;
              border: 2px dashed #007bff;
              padding: 20px;
              text-align: center;
              margin: 20px 0;
              border-radius: 5px;
            }
            .code {
              font-size: 32px;
              font-weight: bold;
              letter-spacing: 5px;
              color: #007bff;
              font-family: monospace;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              font-size: 12px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">Verificación de Cuenta</div>
            </div>
            
            <h2>¡Hola!</h2>
            <p>Gracias por usar nuestro servicio. Para completar tu verificación, por favor utiliza el siguiente código:</p>
            
            <div class="code-box">
              <div class="code">${code}</div>
            </div>
            
            <p><strong>Importante:</strong> Este código expirará en 15 minutos por razones de seguridad.</p>
            <p>Si no solicitaste este código, puedes ignorar este correo de forma segura.</p>
            
            <div class="footer">
              <p> 2025 Tu Empresa. Todos los derechos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });  
    return 1;
    } catch (error) {
      return -1;
    }
}


export async function sendResetPasswordEmail(user: User, url: string){
    try {
        transporter.sendMail({
            to: user.email,
            from: process.env.MAIL_FROM!,
            subject: "Restablecimiento de contraseña",
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Restablecimiento de contraseña</title>
                <style>
                  body {
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f4f4f4;
                  }
                  .container {
                    background-color: #ffffff;
                    padding: 30px;
                    border-radius: 10px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                  }
                  .header {
                    text-align: center;
                    margin-bottom: 30px;
                  }
                  .logo {
                    font-size: 24px;
                    font-weight: bold;
                    color: #dc3545;
                  }
                  .reset-button {
                    display: inline-block;
                    background-color: #dc3545;
                    color: white;
                    padding: 15px 30px;
                    text-decoration: none;
                    border-radius: 5px;
                    font-weight: bold;
                    margin: 20px 0;
                    text-align: center;
                  }
                  .reset-button:hover {
                    background-color: #c82333;
                  }
                  .warning {
                    background-color: #fff3cd;
                    border: 1px solid #ffeaa7;
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 5px;
                    color: #856404;
                  }
                  .footer {
                    text-align: center;
                    margin-top: 30px;
                    font-size: 12px;
                    color: #666;
                  }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <div class="logo">Restablecimiento de Contraseña</div>
                  </div>
                  
                  <h2>¡Hola ${user.name}!</h2>
                  <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta. Si no realizaste esta solicitud, puedes ignorar este correo de forma segura.</p>
                  
                  <p>Para restablecer tu contraseña, haz clic en el siguiente botón:</p>
                  
                  <div style="text-align: center;">
                    <a href="${url}" class="reset-button">Restablecer Contraseña</a>
                  </div>
                  
                  <p>Si el botón no funciona, puedes copiar y pegar el siguiente enlace en tu navegador:</p>
                  <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 5px; font-family: monospace;">${url}</p>
                  
                  <div class="warning">
                    <strong>Importante:</strong> Este enlace expirará en 1 hora por razones de seguridad. Si no lo usas en ese tiempo, deberás solicitar un nuevo restablecimiento de contraseña.
                  </div>
                  
                  <p>Si tienes alguna pregunta o necesitas ayuda, no dudes en contactarnos.</p>
                  
                  <div class="footer">
                    <p> 2025 Tu Empresa. Todos los derechos reservados.</p>
                  </div>
                </div>
              </body>
              </html>
            `
          });  
          return 1;
          } catch (error) {
            return -1;
          }
}