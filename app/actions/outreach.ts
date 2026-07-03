'use server';

import { sendOutreachEmail } from '../../lib/mailer';
import { prisma } from '../../lib/db';
import { revalidatePath } from 'next/cache';

export async function sendSingleEmailAction(data: {
  senderEmail: string;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  body: string;
}) {
  const result = await sendOutreachEmail(data);
  revalidatePath('/');
  return result;
}

export async function getEmailLogsAction() {
  try {
    const logs = await prisma.emailLog.findMany({
      orderBy: {
        sentAt: 'desc',
      },
    });
    return { success: true, logs };
  } catch (error: any) {
    console.error('Failed to fetch logs:', error);
    return { success: false, error: error.message || String(error), logs: [] };
  }
}

export async function clearEmailLogsAction() {
  try {
    await prisma.emailLog.deleteMany({});
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Failed to clear logs:', error);
    return { success: false, error: error.message || String(error) };
  }
}
