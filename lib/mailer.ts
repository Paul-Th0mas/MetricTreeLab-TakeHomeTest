import nodemailer from 'nodemailer';
import { prisma } from './db';

// Create a reusable transporter using SMTP settings
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '1025', 10),
  secure: false, // true for 465, false for other ports (like Mailpit 1025)
  tls: {
    // Do not fail on invalid certificates (useful for development sandboxes)
    rejectUnauthorized: false,
  },
});

interface SendEmailOptions {
  senderEmail: string;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  body: string;
}

export async function sendOutreachEmail({
  senderEmail,
  recipientEmail,
  recipientName,
  subject,
  body,
}: SendEmailOptions) {
  try {
    // Send mail via nodemailer
    const info = await transporter.sendMail({
      from: senderEmail,
      to: recipientEmail,
      subject: subject,
      text: body, // plain text body
      // We can also support HTML rendering if needed, but text is safe for MVP
      html: body.replace(/\n/g, '<br />'), 
    });

    // Save success log to DB
    const log = await prisma.emailLog.create({
      data: {
        senderEmail,
        recipientEmail,
        recipientName: recipientName || null,
        subject,
        body,
        status: 'SENT',
      },
    });

    return { success: true, log };
  } catch (error: any) {
    console.error('SMTP sending error:', error);
    
    // Save failure log to DB
    const log = await prisma.emailLog.create({
      data: {
        senderEmail,
        recipientEmail,
        recipientName: recipientName || null,
        subject,
        body,
        status: 'FAILED',
        errorMessage: error.message || String(error),
      },
    });

    return { success: false, error: error.message || String(error), log };
  }
}
