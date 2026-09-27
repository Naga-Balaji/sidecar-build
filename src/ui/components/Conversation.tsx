import React, {useEffect, useRef, useState} from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Linking,
} from 'react-native';
import {router} from '../../core/router';
import type {LlmMessage} from '../../core/llm';
import {chatSystem} from '../../prompts/systemPrompts';
import {getMode, onModeChange} from '../../core/mode';
import type {Mode} from '../../core/mode';
import {getPersona, onPersonaChange} from '../../core/persona';
import type {Persona} from '../../core/persona';
import {cloudKey} from '../../core/cloud';
import {getOcr} from '../../core/ocr';
import {pickAnyFile, snapCamera, pickImage, isImage, isPdf} from '../../bridge/files';
import type {PickedFile} from '../../bridge/files';
import {extractAlarms, schedulePhoneAlarm, googleCalendarUrl} from '../../core/alarms';
import type {Alarm} from '../../core/alarms';
import {extractPdfText} from '../../core/pdfExtract';

type Attach = {id: string; file: PickedFile};

type Msg =
  | {kind: 'user'; text: string; attachments: Attach[]}
  | {kind: 'assistant'; text: string; streaming?: boolean; mode: string}
  | {kind: 'error'; text: string; mode: string}
  | {kind: 'alarms'; alarms: Alarm[]}
  | {kind: 'system'; text: string};

export function Conversation({localReady}: {localReady: boolean}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attach[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>(getMode());
  const [persona, setPersona] = useState<Persona>(getPersona());
  const [alarmPings, setAlarmPings] = useState<Record<string, string>>({});
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => onModeChange(setMode), []);
  useEffect(() => onPersonaChange(setPersona), []);
  useEffect(() => {
    scrollRef.current?.scrollToEnd({animated: true});
  }, [messages]);

  const effective: 'local' | 'cloud' = persona === 'legal' ? 'local' : mode;
  const backendReady = effective === 'local' ? localReady : cloudKey.has();
  const canSend = !busy && (input.trim().length > 0 || attachments.length > 0);

  const pushSystem = (text: string) =>
    setMessages(m => [...m, {kind: 'system', text}]);

  const onAttach = async () => {
    const files = await pickAnyFile();
    if (!files.length) return;
    setAttachments(a => [
      ...a,
      ...files.map(f => ({id: `${Date.now()}-${Math.random()}`, file: f})),
    ]);
  };
  const onCamera = async () => {
    const f = await snapCamera();
    if (!f) return;
    setAttachments(a => [...a, {id: `${Date.now()}-cam`, file: f}]);
  };
  const onGallery = async () => {
    const f = await pickImage();
    if (!f) return;
    setAttachments(a => [...a, {id: `${Date.now()}-gal`, file: f}]);
  };
  const removeAttach = (id: string) => setAttachments(a => a.filter(x => x.id !== id));

  const send = async () => {
    if (!canSend) return;
    if (!backendReady) {
      pushSystem(
        effective === 'local'
          ? 'Load a .gguf model above to send.'
          : 'Add an OpenRouter key above to use cloud mode.',
      );
      return;
    }
    const outgoing = input.trim();
    const outgoingAttach = attachments;
    setInput('');
    setAttachments([]);
    setBusy(true);
    setMessages(m => [...m, {kind: 'user', text: outgoing, attachments: outgoingAttach}]);

    // extract text from each attachment
    const parts: string[] = [];
    for (const a of outgoingAttach) {
      try {
        if (isImage(a.file)) {
          pushSystem(`OCR: ${a.file.name}…`);
          const text = await getOcr().recognize(a.file.uri);
          parts.push(`## ${a.file.name}\n${clip(text, 4000)}`);
        } else if (isPdf(a.file)) {
          pushSystem(`Extracting text: ${a.file.name}…`);
          const text = await extractPdfText(a.file.uri);
          if (!text.trim()) {
            pushSystem(`No text layer in ${a.file.name}. Try snapping it as an image so OCR runs.`);
          } else {
            parts.push(`## ${a.file.name}\n${clip(text, 4000)}`);
          }
        } else {
          try {
            const {readFile} = require('react-native-fs');
            const p = a.file.uri.startsWith('file://') ? a.file.uri.slice(7) : a.file.uri;
            const text = await readFile(p, 'utf8');
            parts.push(`## ${a.file.name}\n${clip(text, 4000)}`);
          } catch {
            pushSystem(`Skipping ${a.file.name} — unsupported type.`);
          }
        }
      } catch (e: any) {
        pushSystem(`Failed to read ${a.file.name}: ${e?.message ?? e}`);
      }
    }

    const composed =
      parts.length > 0
        ? `${outgoing || 'Analyse the attached content.'}\n\n---\n${parts.join('\n\n---\n')}`
        : outgoing;

    const history: LlmMessage[] = [
      {role: 'system', content: chatSystem()},
      ...messages
        .filter(m => m.kind === 'user' || m.kind === 'assistant')
        .map(m => ({
          role: (m.kind === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content:
            m.kind === 'user'
              ? m.text + (m.attachments.length ? ` [${m.attachments.length} attachment(s)]` : '')
              : (m as any).text,
        })),
      {role: 'user', content: composed},
    ];

    // placeholder streaming bubble
    setMessages(m => [...m, {kind: 'assistant', text: '', streaming: true, mode: effective}]);

    try {
      const full = await router.stream(history, tok => {
        setMessages(m => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (last?.kind === 'assistant' && last.streaming) {
            copy[copy.length - 1] = {...last, text: last.text + tok};
          }
          return copy;
        });
      });
      setMessages(m => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last?.kind === 'assistant') copy[copy.length - 1] = {...last, text: full, streaming: false};
        return copy;
      });

      // Always auto-scan for dates once the assistant reply lands. Cheap on
      // the model (short prompt) and users kept missing it because the old
      // gate was too strict. Silent when zero dates found.
      pushSystem('🔍 Scanning for upcoming dates…');
      try {
        // Scan the FULL assistant answer + attachments + user question so
        // dates mentioned in the reply itself get caught.
        const scanSource = [composed, full].filter(Boolean).join('\n\n');
        const found = await extractAlarms(scanSource);
        if (found.length > 0) {
          setMessages(m => [...m, {kind: 'alarms', alarms: found}]);
        }
      } catch (e) {
        console.warn('[alarms] auto-scan failed', e);
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      // Replace the streaming placeholder with an explicit error bubble so it
      // reads distinctly (red) instead of pretending to be a normal reply.
      setMessages(m => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last?.kind === 'assistant' && last.streaming) copy.pop();
        copy.push({kind: 'error', text: msg, mode: effective});
        return copy;
      });
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    if (busy) return;
    setMessages([]);
    setAttachments([]);
    setAlarmPings({});
  };

  const setPhoneAlarm = async (a: Alarm) => {
    setAlarmPings(p => ({...p, [alarmKey(a)]: '…scheduling'}));
    const res = await schedulePhoneAlarm(a);
    if (res.ok) {
      setAlarmPings(p => ({
        ...p,
        [alarmKey(a)]: `🔔 alarm set for ${new Date(res.firesAt).toLocaleString()}`,
      }));
    } else {
      setAlarmPings(p => ({...p, [alarmKey(a)]: `⚠ ${res.reason}`}));
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>
          Sidecar <Text style={styles.mode}>· {effective}{persona === 'legal' ? ' · legal' : ''}</Text>
        </Text>
        <TouchableOpacity onPress={clear} disabled={busy || messages.length === 0}>
          <Text style={styles.clear}>Clear</Text>
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} style={styles.log} contentContainerStyle={styles.logContent}>
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Ask, attach, or snap.</Text>
            <Text style={styles.emptyBody}>Everything runs on your device via llama.rn.</Text>
          </View>
        ) : (
          messages.map((m, i) => (
            <MessageView key={i} m={m} pings={alarmPings} onSetPhone={setPhoneAlarm} />
          ))
        )}
      </ScrollView>

      {attachments.length > 0 ? (
        <View style={styles.chips}>
          {attachments.map(a => (
            <View key={a.id} style={styles.chip}>
              <Text style={styles.chipName} numberOfLines={1}>{a.file.name}</Text>
              <TouchableOpacity onPress={() => removeAttach(a.id)}>
                <Text style={styles.chipX}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={backendReady ? 'Message Sidecar…' : 'load a model or add a key…'}
          placeholderTextColor="#6a7085"
          multiline
        />
        <View style={styles.tools}>
          <TouchableOpacity style={styles.tool} onPress={onAttach}><Text style={styles.toolIcon}>📎</Text></TouchableOpacity>
          <TouchableOpacity style={styles.tool} onPress={onCamera}><Text style={styles.toolIcon}>📷</Text></TouchableOpacity>
          <TouchableOpacity style={styles.tool} onPress={onGallery}><Text style={styles.toolIcon}>🖼️</Text></TouchableOpacity>
          <View style={{flex: 1}} />
          <TouchableOpacity
            style={[styles.send, !canSend && styles.sendOff]}
            onPress={send}
            disabled={!canSend}
          >
            <Text style={styles.sendText}>{busy ? '…' : '➤'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function MessageView({
  m,
  pings,
  onSetPhone,
}: {
  m: Msg;
  pings: Record<string, string>;
  onSetPhone: (a: Alarm) => void;
}) {
  if (m.kind === 'user') {
    return (
      <View style={styles.msgUser}>
        {m.attachments.length > 0 ? (
          <View style={styles.attachRow}>
            {m.attachments.map(a => (
              <View key={a.id} style={styles.attachBadge}>
                <Text style={styles.attachName} numberOfLines={1}>{a.file.name}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {m.text ? <Text style={styles.userBubble}>{m.text}</Text> : null}
      </View>
    );
  }
  if (m.kind === 'assistant') {
    return (
      <View style={styles.msgAssistant}>
        <Text style={styles.role}>assistant · {m.mode}</Text>
        <Text style={styles.assistantBubble}>{m.text || (m.streaming ? '▍' : '')}</Text>
      </View>
    );
  }
  if (m.kind === 'error') {
    return (
      <View style={styles.msgAssistant}>
        <Text style={[styles.role, {color: '#f87171'}]}>⚠ error · {m.mode}</Text>
        <View style={styles.errorBubble}>
          <Text style={styles.errorText}>{m.text}</Text>
        </View>
      </View>
    );
  }
  if (m.kind === 'alarms') {
    return (
      <View style={styles.msgAssistant}>
        <Text style={styles.role}>⏰ upcoming events found</Text>
        <View style={styles.alarmsCard}>
          {m.alarms.map((a, i) => {
            const key = alarmKey(a);
            return (
              <View key={i} style={styles.alarmRow}>
                <View style={styles.alarmInfo}>
                  <Text style={styles.alarmDate} numberOfLines={1}>
                    {a.date} · {a.time ?? '09:00'}
                  </Text>
                  <Text style={styles.alarmEvent} numberOfLines={3}>
                    {a.event}
                  </Text>
                  {pings[key] ? (
                    <Text style={styles.alarmPing} numberOfLines={2}>
                      {pings[key]}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.alarmActions}>
                  <TouchableOpacity
                    style={styles.alarmCal}
                    onPress={() => Linking.openURL(googleCalendarUrl(a))}>
                    <Text style={styles.alarmCalText}>+Cal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.alarmBell}
                    onPress={() => onSetPhone(a)}>
                    <Text style={styles.alarmBellText}>🔔</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.msgSystem}>
      <Text style={styles.systemText}>{m.text}</Text>
    </View>
  );
}

function alarmKey(a: Alarm): string {
  return `${a.date}-${a.time ?? '09:00'}-${a.event.slice(0, 12)}`;
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + `\n\n[…trimmed ${s.length - max} more chars…]`;
}

const styles = StyleSheet.create({
  wrap: {flex: 1, marginTop: 16, borderRadius: 20, backgroundColor: '#0f1730', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', overflow: 'hidden'},
  head: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', backgroundColor: '#172142'},
  title: {color: '#f5f7ff', fontSize: 14, fontWeight: '700'},
  mode: {color: '#6a7085', fontFamily: 'monospace', fontWeight: '400', fontSize: 11},
  clear: {color: '#b7bccb', fontSize: 11},
  log: {flex: 1},
  logContent: {padding: 14, gap: 14},
  empty: {alignItems: 'center', padding: 40},
  emptyTitle: {color: '#f5f7ff', fontSize: 16, fontWeight: '600', marginBottom: 8},
  emptyBody: {color: '#6a7085', fontSize: 12, textAlign: 'center'},
  msgUser: {alignSelf: 'flex-end', maxWidth: '88%', alignItems: 'flex-end', gap: 6, marginBottom: 6},
  msgAssistant: {alignSelf: 'flex-start', maxWidth: '95%', gap: 4, marginBottom: 6},
  msgAlarms: {alignSelf: 'stretch', width: '100%', gap: 4, marginBottom: 6},
  msgSystem: {alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)'},
  systemText: {color: '#6a7085', fontSize: 11, fontFamily: 'monospace'},
  role: {color: '#6a7085', fontSize: 10, fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2},
  userBubble: {backgroundColor: '#4f8dff', color: '#fff', padding: 12, borderRadius: 18, borderBottomRightRadius: 4, fontSize: 14, lineHeight: 20},
  assistantBubble: {backgroundColor: '#0a1024', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', color: '#f5f7ff', padding: 12, borderRadius: 18, borderBottomLeftRadius: 4, fontSize: 14, lineHeight: 20},
  errorBubble: {backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', padding: 12, borderRadius: 18, borderBottomLeftRadius: 4},
  errorText: {color: '#fca5a5', fontSize: 13, lineHeight: 19},
  attachRow: {flexDirection: 'row', gap: 6, flexWrap: 'wrap'},
  attachBadge: {backgroundColor: '#172142', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, maxWidth: 180, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)'},
  attachName: {color: '#b7bccb', fontSize: 11},
  chips: {flexDirection: 'row', gap: 6, padding: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', backgroundColor: '#0f1730', flexWrap: 'wrap'},
  chip: {flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0a1024', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, maxWidth: 180, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)'},
  chipName: {color: '#f5f7ff', fontSize: 11, maxWidth: 120},
  chipX: {color: '#6a7085', fontSize: 12, paddingHorizontal: 4},
  composer: {padding: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', backgroundColor: '#0f1730', gap: 8},
  input: {backgroundColor: '#0a1024', color: '#f5f7ff', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, minHeight: 44, maxHeight: 120},
  tools: {flexDirection: 'row', alignItems: 'center', gap: 6},
  tool: {width: 40, height: 40, borderRadius: 10, backgroundColor: '#0a1024', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center'},
  toolIcon: {fontSize: 18},
  send: {width: 44, height: 44, borderRadius: 12, backgroundColor: '#4f8dff', alignItems: 'center', justifyContent: 'center'},
  sendOff: {opacity: 0.35},
  sendText: {color: '#fff', fontSize: 18, fontWeight: '700'},
  alarmsCard: {padding: 10, borderRadius: 14, backgroundColor: 'rgba(251,191,36,0.06)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)', gap: 8},
  alarmRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.15)',
  },
  alarmInfo: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  alarmDate: {color: '#fbbf24', fontFamily: 'monospace', fontSize: 12, fontWeight: '700'},
  alarmEvent: {color: '#f5f7ff', fontSize: 13, marginTop: 3, lineHeight: 18},
  alarmPing: {color: '#fbbf24', fontFamily: 'monospace', fontSize: 10, marginTop: 4},
  alarmActions: {
    flexDirection: 'column',
    gap: 6,
    flexShrink: 0,
    alignItems: 'stretch',
  },
  alarmCal: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#4f8dff',
    alignItems: 'center',
    minWidth: 62,
  },
  alarmCalText: {color: '#fff', fontSize: 12, fontWeight: '700'},
  alarmBell: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.4)',
    backgroundColor: 'rgba(251,191,36,0.15)',
    alignItems: 'center',
    minWidth: 62,
  },
  alarmBellText: {fontSize: 14},
});
