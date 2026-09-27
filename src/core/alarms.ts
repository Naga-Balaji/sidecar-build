import notifee, {AndroidImportance, TriggerType, TimestampTrigger} from '@notifee/react-native';
import {router} from './router';
import type {LlmMessage} from './llm';

export type Alarm = {
  date: string;
  time?: string;
  event: string;
};

const SYSTEM = `You extract upcoming dates and events from a passage. Return ONLY a valid JSON array.
Format each entry: {"date":"YYYY-MM-DD","time":"HH:MM","event":"short description"}.
- If time is not given, omit the "time" field.
- If year is missing, use the current year unless context implies otherwise.
- If no dates are present, return [].
- No prose, no markdown, no code fences — pure JSON.`;

export async function extractAlarms(text: string): Promise<Alarm[]> {
  const messages: LlmMessage[] = [
    {role: 'system', content: SYSTEM},
    {role: 'user', content: text.slice(0, 4000)},
  ];
  const raw = await router.complete(messages);
  return parseAlarms(raw);
}

function parseAlarms(raw: string): Alarm[] {
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();

  // First try: proper JSON array in the response
  const jsonAlarms = tryJsonArray(cleaned);
  if (jsonAlarms.length > 0) return jsonAlarms;

  // Second try: line-based extraction for models that ignored the JSON rule
  return regexAlarms(raw);
}

function tryJsonArray(text: string): Alarm[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x: any) =>
          x &&
          typeof x.date === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(x.date) &&
          typeof x.event === 'string',
      )
      .map((x: any) => ({
        date: x.date,
        time:
          typeof x.time === 'string' && /^\d{1,2}:\d{2}$/.test(x.time)
            ? padTime(x.time)
            : undefined,
        event: x.event.slice(0, 240),
      }));
  } catch {
    return [];
  }
}

/**
 * Fallback: sweep the raw text for date-like patterns and grab a nearby
 * event phrase. Handles the case where a small model writes prose like
 * "The hearing is on 2026-09-28 at 15:00" instead of JSON.
 */
function regexAlarms(text: string): Alarm[] {
  const out: Alarm[] = [];
  const seen = new Set<string>();
  // ISO date + optional time
  const iso = /(\d{4})-(\d{2})-(\d{2})(?:[T\s]+(\d{1,2}):(\d{2}))?/g;
  let m: RegExpExecArray | null;
  while ((m = iso.exec(text))) {
    const date = `${m[1]}-${m[2]}-${m[3]}`;
    const time = m[4] && m[5] ? padTime(`${m[4]}:${m[5]}`) : undefined;
    // Grab up to 80 chars of context around the match as the event.
    const start = Math.max(0, m.index - 60);
    const end = Math.min(text.length, m.index + m[0].length + 60);
    const ctx = text.slice(start, end).replace(/\s+/g, ' ').trim();
    const key = `${date}|${time ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({date, time, event: ctx.slice(0, 200)});
  }
  return out;
}

function padTime(hhmm: string): string {
  const [h, m] = hhmm.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

let channelReady = false;
async function ensureChannel(): Promise<string> {
  await notifee.requestPermission();
  if (!channelReady) {
    await notifee.createChannel({
      id: 'sidecar-alarms',
      name: 'Sidecar Alarms',
      importance: AndroidImportance.HIGH,
    });
    channelReady = true;
  }
  return 'sidecar-alarms';
}

/**
 * Fires a real Android notification at `event time - 30 min` via
 * @notifee/react-native, which uses AlarmManager under the hood. Survives
 * app close, reboot (on most Android versions), and battery-saver.
 */
export async function schedulePhoneAlarm(
  alarm: Alarm,
): Promise<{ok: true; firesAt: number} | {ok: false; reason: string}> {
  const channelId = await ensureChannel();
  const at = alarmTimestamp(alarm);
  const now = Date.now();
  const fireAt = at - 30 * 60 * 1000;
  if (fireAt <= now) {
    return {ok: false, reason: `Event ${alarm.date} ${alarm.time ?? '09:00'} is in the past.`};
  }
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: fireAt,
    alarmManager: {allowWhileIdle: true},
  };
  try {
    await notifee.createTriggerNotification(
      {
        title: `⏰ ${alarm.event}`,
        body: `In 30 min · ${alarm.date} at ${alarm.time ?? '09:00'}`,
        android: {
          channelId,
          smallIcon: 'ic_launcher',
          pressAction: {id: 'default'},
        },
      },
      trigger,
    );
    return {ok: true, firesAt: fireAt};
  } catch (e: any) {
    return {ok: false, reason: `Failed to schedule: ${e?.message ?? e}`};
  }
}

function alarmTimestamp(a: Alarm): number {
  const [Y, M, D] = a.date.split('-').map(Number);
  const [h, m] = (a.time ?? '09:00').split(':').map(Number);
  return new Date(Y, M - 1, D, h, m, 0).getTime();
}

export function googleCalendarUrl(a: Alarm): string {
  const start = icsDateTime(a.date, a.time ?? '09:00');
  const end = icsDateTime(a.date, addOneHour(a.time ?? '09:00'));
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
    a.event,
  )}&dates=${start}/${end}&details=Extracted+by+Sidecar`;
}

function icsDateTime(date: string, time: string): string {
  const [Y, M, D] = date.split('-');
  const [h, m] = time.split(':');
  return `${Y}${M}${D}T${h.padStart(2, '0')}${m.padStart(2, '0')}00`;
}

function addOneHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const nh = (h + 1) % 24;
  return `${String(nh).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
