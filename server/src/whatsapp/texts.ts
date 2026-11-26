import { env } from '../env.ts'

// The WhatsApp messages, in Hebrew: short, friendly, one clear next step, and a link.

const link = (path: string) => (env.APP_URL ? `\n${env.APP_URL.replace(/\/+$/, '')}${path}` : '')
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name
const lines = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join('\n')

export const texts = {
  welcome: (name: string, email: string) =>
    lines(
      `היי ${firstName(name)}! 👋`,
      'כאן ירין ואורן מסקיל אורגני. החשבון שלך בסימולטור מוכן.',
      `נכנסים עם המייל ${email} והסיסמה שקיבלת מאיתנו.`,
      'בכל רגע מחכה לך משימה אחת ברורה, ואנחנו איתך בכל שלב.',
    ) + link('/login'),

  approved: (name: string, task: string, note: string, by: string) =>
    lines(`${firstName(name)}, העבודה שלך ב„${task}” אושרה ✅`, note && `\n${note}`, `— ${by}`) + link('/map'),

  returned: (name: string, task: string, note: string, by: string) =>
    lines(`${firstName(name)}, יש הערות על העבודה שלך ב„${task}” ✍️`, '', note, `— ${by}`, '', 'תיקון קטן, והמשימה עוברת.') + link('/map'),

  note: (name: string, task: string, note: string, by: string) => lines(`${firstName(name)}, הערה חדשה על „${task}”:`, '', note, `— ${by}`) + link('/map'),

  reminder: (name: string, task: string, minutes: number, second: boolean) =>
    (second
      ? lines(`${firstName(name)}, מתגעגעים 🙂`, `העסק שלך מחכה להמשך: „${task}”.`, 'אם משהו תקוע, כתבו לנו ונעזור.')
      : lines(`היי ${firstName(name)}, המשימה הבאה שלך מחכה: „${task}”${minutes > 0 ? ` (בערך ${minutes} דק')` : ''}.`, 'כמה דקות היום עדיפות על שעה בעוד שבוע 💪')) + link('/map'),

  monthly: (name: string, month: string) =>
    lines(`היי ${firstName(name)}, חודש חדש! 📊`, `עדכון המספרים של ${month} (לידים, שיחות, לקוחות והכנסות) לוקח דקה, ואז רואים את העסק גדל.`) + link('/business'),

  adminRequest: (customer: string, task: string, request: string) =>
    lines(`🔔 ${customer} מבקש/ת בדיקה אישית שלכם`, `משימה: „${task}”`, request && `„${request}”`) + link('/admin/works'),

  adminLead: (lead: string, phone: string, referrer: string, note: string) =>
    lines('⭐ ליד חדש מחבר מביא חבר', `${lead} · ${phone}`, `הביא/ה: ${referrer}`, note && `„${note}”`) + link('/admin/leads'),

  adminDigest: (open: number, requested: number, leads: number, idle: string[]) =>
    lines(
      '☀️ בוקר טוב! מה מחכה לכם בסימולטור:',
      open > 0 && `• ${open} עבודות לבדיקה${requested > 0 ? ` (${requested} ביקשו בדיקה אישית)` : ''}`,
      leads > 0 && `• ${leads} לידים חדשים מחבר מביא חבר`,
      idle.length > 0 && `• בלי פעילות שבוע או יותר: ${idle.slice(0, 6).join(', ')}${idle.length > 6 ? ` ועוד ${idle.length - 6}` : ''}`,
    ) + link('/admin/works'),

  aiDown: (reason: string | null) =>
    lines(
      `⚠️ הבינה המלאכותית נעצרה${reason === 'credit' ? ': נגמר הקרדיט ב-Anthropic' : reason === 'key' ? ': המפתח של Anthropic לא עובד' : ''}.`,
      'המאמנים והבוחן מושהים, ועבודות של לקוחות מגיעות אליכם לבדיקה.',
      reason === 'credit' && 'טעינה כאן, ואז הכול חוזר לבד תוך כמה דקות:\nhttps://console.anthropic.com/settings/billing',
    ),

  aiUp: () => '✅ הבינה המלאכותית חזרה לעבוד. המאמנים והבוחן פתוחים שוב ללקוחות.',

  test: (by: string) => lines('🧪 הודעת בדיקה מסקיל אורגני.', `שלח/ה: ${by}. אם היא הגיעה, ההודעות בוואטסאפ עובדות.`),
}
