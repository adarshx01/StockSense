import { randomInt } from 'crypto';
import nodemailer from 'nodemailer';

const SMTP_ERROR = 'Could not send the reset email. Check SMTP settings.';

export function generateOTP(): string {
  return randomInt(0, 1000000).toString().padStart(6, '0');
}

export async function sendOtpEmail(
  to: string,
  otp: string,
): Promise<{ delivered: boolean; error?: string }> {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!user || !pass) {
    return { delivered: false, error: SMTP_ERROR };
  }

  const host = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = (process.env.SMTP_SECURE || 'false').trim().toLowerCase() === 'true';
  const from = process.env.SMTP_FROM?.trim() || user;

  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
    await transport.sendMail({
      from,
      to,
      subject: 'StockSense password reset',
      text: `Your StockSense password reset code is ${otp}. It expires in 10 minutes.`,
    });
    return { delivered: true };
  } catch (err) {
    console.error('SMTP send failed', err instanceof Error ? err.name : 'error');
    return { delivered: false, error: SMTP_ERROR };
  }
}
