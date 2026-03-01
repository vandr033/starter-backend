// src/services/emailSender.ts
import nodemailer from "nodemailer";
import { User } from "better-auth/*";
import { logger } from "../config/logger";
export const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.MAIL_USER!,
    pass: process.env.MAIL_PASS!,
  },
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 30000,
  logger: true,
  debug: true,
});

const maskEmail = (email: string) => {
    const [local, domain] = email.split("@");
    if (!local || !domain) return email;
    if (local.length <= 2) return `${local[0] ?? "*"}*@${domain}`;
    return `${local.slice(0, 2)}***@${domain}`;
};

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

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


export async function sendStaffInviteEmail(
    email: string,
    otp: string,
    inviteLink: string,
    companyName: string
) {
    try {
        transporter.sendMail({
            to: email,
            from: process.env.MAIL_FROM!,
            subject: `You've been invited to join ${companyName}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Staff Invitation</title>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4; }
                        .container { background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                        .header { text-align: center; margin-bottom: 30px; }
                        .logo { font-size: 24px; font-weight: bold; color: #007bff; }
                        .code-box { background-color: #f8f9fa; border: 2px dashed #007bff; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px; }
                        .code { font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #007bff; font-family: monospace; }
                        .invite-button { display: inline-block; background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
                        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <div class="logo">Staff Invitation</div>
                        </div>
                        <h2>You've been invited to join ${companyName}!</h2>
                        <p>An administrator has invited you to join their team. To accept the invitation, click the button below and use this verification code:</p>
                        <div class="code-box">
                            <div class="code">${otp}</div>
                        </div>
                        <div style="text-align: center;">
                            <a href="${inviteLink}" class="invite-button">Accept Invitation</a>
                        </div>
                        <p>Or copy this link into your browser:</p>
                        <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 12px;">${inviteLink}</p>
                        <p><strong>Important:</strong> This invitation expires in 24 hours.</p>
                        <div class="footer">
                            <p>If you did not expect this invitation, you can safely ignore this email.</p>
                        </div>
                    </div>
                </body>
                </html>
            `,
        });
        return 1;
    } catch (error) {
        console.error('Error sending staff invite email:', error);
        return -1;
    }
}

export async function sendAdminTempPasswordInviteEmail(params: {
    email: string;
    temporaryPassword: string;
    companyName: string;
    loginUrl?: string;
}) {
    const { email, temporaryPassword, companyName, loginUrl } = params;
    const safeLoginUrl = loginUrl || `${process.env.FRONTEND_URL || "http://localhost:3000"}/admin/login`;

    try {
        const info = await transporter.sendMail({
            to: email,
            from: process.env.MAIL_FROM!,
            subject: `Acceso temporal a ${companyName}`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 620px; margin: 0 auto; padding: 20px; background: #f8fafc;">
                    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
                        <h2 style="margin-top: 0;">Invitación al panel</h2>
                        <p>Se creó un acceso para <strong>${companyName}</strong>.</p>
                        <p>Usa estas credenciales temporales:</p>
                        <ul>
                            <li><strong>Email:</strong> ${email}</li>
                            <li><strong>Contraseña temporal:</strong> ${temporaryPassword}</li>
                        </ul>
                        <p>Al iniciar sesión, deberás cambiar la contraseña antes de poder usar el panel.</p>
                        <p>
                            <a href="${safeLoginUrl}" target="_blank" rel="noopener noreferrer">Ir al login</a>
                        </p>
                    </div>
                </div>
            `,
        });
        logger.info(
            {
                event: "admin_temp_password_invite_sent",
                to: maskEmail(email),
                companyName,
                loginUrl: safeLoginUrl,
                tempPasswordLength: temporaryPassword.length,
                messageId: info.messageId,
                accepted: info.accepted,
                rejected: info.rejected,
                response: info.response,
            },
            "Admin temp password invite email sent",
        );
        return 1;
    } catch (error) {
        logger.error(
            {
                event: "admin_temp_password_invite_failed",
                to: maskEmail(email),
                companyName,
                loginUrl: safeLoginUrl,
                err: error,
            },
            "Error sending admin temp password invite email",
        );
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

export async function sendStaffTimeOffRequestEmail(params: {
    ownerEmail: string;
    ownerName: string;
    companyName: string;
    staffName: string;
    startsAt: Date;
    endsAt: Date;
    reason?: string | null;
    dashboardUrl: string;
}) {
    const {
        ownerEmail,
        ownerName,
        companyName,
        staffName,
        startsAt,
        endsAt,
        reason,
        dashboardUrl,
    } = params;

    const startsAtLabel = startsAt.toLocaleString('es-BO', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
    const endsAtLabel = endsAt.toLocaleString('es-BO', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });

    try {
        await transporter.sendMail({
            to: ownerEmail,
            from: process.env.MAIL_FROM!,
            subject: `Nueva solicitud de tiempo libre - ${companyName}`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
                    <h2>Solicitud de tiempo libre</h2>
                    <p>Hola ${ownerName},</p>
                    <p><strong>${staffName}</strong> solicitó tiempo libre en <strong>${companyName}</strong>.</p>
                    <ul>
                        <li><strong>Desde:</strong> ${startsAtLabel}</li>
                        <li><strong>Hasta:</strong> ${endsAtLabel}</li>
                        <li><strong>Motivo:</strong> ${reason ? reason : 'No especificado'}</li>
                    </ul>
                    <p>Puedes revisarlo en el panel:</p>
                    <p><a href="${dashboardUrl}" target="_blank" rel="noopener noreferrer">${dashboardUrl}</a></p>
                </div>
            `,
        });
        return 1;
    } catch (error) {
        console.error('Error sending staff time-off request email:', error);
        return -1;
    }
}

export async function sendCustomerMassMessageEmail(params: {
    email: string;
    companyName: string;
    message: string;
    locale?: 'es' | 'en';
}) {
    const locale = params.locale === 'en' ? 'en' : 'es';
    const subject =
        locale === 'en'
            ? `Message from ${params.companyName}`
            : `Mensaje de ${params.companyName}`;
    const title = locale === 'en' ? 'New message for you' : 'Nuevo mensaje para ti';
    const intro =
        locale === 'en'
            ? `You received a message from ${params.companyName}:`
            : `Recibiste un mensaje de ${params.companyName}:`;
    const messageHtml = escapeHtml(params.message).replace(/\r?\n/g, '<br/>');

    try {
        await transporter.sendMail({
            to: params.email,
            from: process.env.MAIL_FROM!,
            subject,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 620px; margin: 0 auto; padding: 20px; background: #f8fafc;">
                    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
                        <h2 style="margin-top: 0;">${title}</h2>
                        <p>${intro}</p>
                        <div style="margin-top: 16px; background: #f8fafc; border-radius: 8px; padding: 14px;">${messageHtml}</div>
                    </div>
                </div>
            `,
        });

        return 1;
    } catch (error) {
        logger.error(
            {
                event: 'customer_mass_message_email_failed',
                to: maskEmail(params.email),
                companyName: params.companyName,
                err: error,
            },
            'Error sending customer mass message email',
        );
        return -1;
    }
}
