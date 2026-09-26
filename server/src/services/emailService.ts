import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { randomInt } from 'crypto';

export function generateOTP(): string {
  return randomInt(0, 1000000).toString().padStart(6, '0');
}

export async function sendOtpEmail(
  to: string,
  otp: string,
): Promise<{ delivered: boolean; error?: string }> {
  const from = process.env.SES_FROM_EMAIL?.trim();
  if (!from) {
    console.info(`OTP for ${to}: ${otp} (SES_FROM_EMAIL is not configured)`);
    return { delivered: false, error: 'SES_FROM_EMAIL is not configured' };
  }

  try {
    const ses = new SESClient({ region: process.env.AWS_REGION || 'ap-south-1' });
    await ses.send(
      new SendEmailCommand({
        Source: from,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: 'StockSense password reset', Charset: 'UTF-8' },
          Body: {
            Text: {
              Data: `Your StockSense password reset code is ${otp}. It expires in 10 minutes.`,
              Charset: 'UTF-8',
            },
          },
        },
      }),
    );
    return { delivered: true };
  } catch (err) {
    console.info(`OTP for ${to}: ${otp} (SES send failed)`);
    console.error('SES send failed', err instanceof Error ? err.name : 'error');
    return { delivered: false, error: 'Failed to send password reset email' };
  }
}
