import React, {useEffect, useState} from 'react';
import {StyleSheet, View, Text, TouchableOpacity, ActivityIndicator} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import type {LlmProgress} from '../../core/llm';
import {
  MODEL_CATALOG,
  ModelEntry,
  DownloadProgress,
  downloadModel,
  isDownloaded,
  listDownloaded,
  modelPath,
  deleteModel,
} from '../../core/modelCatalog';

export function ModelCard({
  ready,
  progress,
  onLoadPath,
  onPickFile,
}: {
  ready: boolean;
  progress: LlmProgress | null;
  onLoadPath: (path: string) => void;
  onPickFile: () => void;
}) {
  // Default to open when no model is loaded — the suggested-download list is
  // the primary action there, and users kept missing the collapsed ▼.
  const [expanded, setExpanded] = useState(!ready);
  const [downloadedList, setDownloadedList] = useState<
    {entry: ModelEntry; sizeBytes: number}[]
  >([]);
  const [dlBusy, setDlBusy] = useState<string | null>(null);
  const [dlProgress, setDlProgress] = useState<Record<string, DownloadProgress>>({});
  const [presence, setPresence] = useState<Record<string, boolean>>({});

  const refresh = async () => {
    const list = await listDownloaded();
    setDownloadedList(list);
    const map: Record<string, boolean> = {};
    for (const m of MODEL_CATALOG) map[m.id] = await isDownloaded(m);
    setPresence(map);
  };

  useEffect(() => {
    refresh();
  }, [ready]);

  // Collapse when the model becomes ready (no need to stay open).
  useEffect(() => {
    if (ready) setExpanded(false);
  }, [ready]);

  const startDownload = async (entry: ModelEntry) => {
    setDlBusy(entry.id);
    setDlProgress(p => ({...p, [entry.id]: {bytesWritten: 0, contentLength: entry.bytes, percent: 0}}));
    try {
      const path = await downloadModel(entry, p => {
        setDlProgress(prev => ({...prev, [entry.id]: p}));
      });
      await refresh();
      // Auto-attach after successful download
      onLoadPath(path);
    } catch (e: any) {
      console.warn('[model] download failed', e);
      setDlProgress(prev => ({
        ...prev,
        [entry.id]: {bytesWritten: 0, contentLength: entry.bytes, percent: 0},
      }));
    } finally {
      setDlBusy(null);
    }
  };

  const reloadExisting = (entry: ModelEntry) => {
    onLoadPath(modelPath(entry));
  };

  const remove = async (entry: ModelEntry) => {
    await deleteModel(entry);
    await refresh();
  };

  const loadPct = progress?.loaded ? progress.loaded * 100 : 0;
  const isError = !!progress?.text?.toLowerCase().startsWith('failed:');
  const badge = isError
    ? 'Error'
    : ready
      ? 'Ready'
      : loadPct > 0 && loadPct < 100
        ? 'Loading'
        : 'None';
  const [copied, setCopied] = useState(false);
  const copyError = () => {
    if (!progress?.text) return;
    Clipboard.setString(progress.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={[styles.card, ready && styles.cardReady]}>
      <TouchableOpacity style={styles.head} onPress={() => setExpanded(v => !v)} activeOpacity={0.85}>
        <View style={styles.icon}><Text style={styles.iconText}>◉</Text></View>
        <View style={{flex: 1}}>
          <Text style={styles.label}>Local AI Model</Text>
          <View style={styles.row}>
            <Text style={styles.name}>
              {ready ? 'llama.rn (native)' : 'No model loaded'}
            </Text>
            <View
              style={[
                styles.badge,
                isError
                  ? styles.err
                  : ready
                    ? styles.ok
                    : loadPct > 0
                      ? styles.load
                      : styles.empty,
              ]}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          </View>
          {isError ? null : (
            <Text style={styles.detail} numberOfLines={1}>
              {ready
                ? 'Native llama.cpp · on-device · no cloud'
                : progress?.text ?? 'Tap ▼ to download a model or pick one from storage'}
            </Text>
          )}
          {loadPct > 0 && loadPct < 100 ? (
            <View style={styles.bar}><View style={[styles.barFill, {width: `${loadPct}%`}]} /></View>
          ) : null}
        </View>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {isError && progress?.text ? (
        <View style={styles.errBox}>
          <Text style={styles.errTitle}>⚠ Load failed</Text>
          <Text style={styles.errText} selectable>
            {progress.text}
          </Text>
          <View style={styles.errActions}>
            <TouchableOpacity style={styles.errBtn} onPress={copyError}>
              <Text style={styles.errBtnText}>
                {copied ? '✓ copied' : 'Copy error'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {expanded ? (
        <View style={styles.body}>
          {downloadedList.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Downloaded on this device</Text>
              {downloadedList.map(({entry, sizeBytes}) => (
                <View key={entry.id} style={styles.dlRow}>
                  <View style={{flex: 1}}>
                    <Text style={styles.dlName}>{entry.name}</Text>
                    <Text style={styles.dlMeta}>{prettyBytes(sizeBytes)} · on device</Text>
                  </View>
                  <TouchableOpacity style={styles.btnPrimary} onPress={() => reloadExisting(entry)}>
                    <Text style={styles.btnPrimaryText}>Load</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnGhost} onPress={() => remove(entry)}>
                    <Text style={styles.btnGhostText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Suggested models — one-tap download</Text>
            {MODEL_CATALOG.map(entry => {
              const already = presence[entry.id];
              const dl = dlProgress[entry.id];
              const busy = dlBusy === entry.id;
              return (
                <View key={entry.id} style={styles.dlRow}>
                  <View style={{flex: 1}}>
                    <Text style={styles.dlName}>{entry.name}</Text>
                    <Text style={styles.dlMeta}>
                      {entry.size} · {entry.notes}
                    </Text>
                    {busy && dl ? (
                      <View style={{marginTop: 6}}>
                        <View style={styles.bar}>
                          <View style={[styles.barFill, {width: `${dl.percent * 100}%`}]} />
                        </View>
                        <Text style={styles.dlProg}>
                          {prettyBytes(dl.bytesWritten)} / {prettyBytes(dl.contentLength || entry.bytes)}
                          {' · '}
                          {(dl.percent * 100).toFixed(1)}%
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {already ? (
                    <TouchableOpacity style={styles.btnPrimary} onPress={() => reloadExisting(entry)}>
                      <Text style={styles.btnPrimaryText}>Load</Text>
                    </TouchableOpacity>
                  ) : busy ? (
                    <ActivityIndicator color="#4f8dff" />
                  ) : (
                    <TouchableOpacity
                      style={styles.btnPrimary}
                      onPress={() => startDownload(entry)}
                      disabled={dlBusy !== null}>
                      <Text style={styles.btnPrimaryText}>Download</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>

          <View style={styles.section}>
            <TouchableOpacity style={styles.btnGhostFull} onPress={onPickFile}>
              <Text style={styles.btnGhostText}>Or pick a .gguf from phone storage</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: '#0f1730',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  cardReady: {borderColor: 'rgba(52,211,153,0.35)'},
  head: {padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12},
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#4c1d95',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {color: '#fff', fontSize: 20},
  label: {color: '#b7bccb', fontSize: 11, fontWeight: '600'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2},
  name: {color: '#f5f7ff', fontSize: 15, fontWeight: '700'},
  detail: {color: '#6a7085', fontSize: 11, marginTop: 4},
  chevron: {color: '#6a7085', fontSize: 13, marginLeft: 8},
  badge: {paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999},
  badgeText: {color: '#fff', fontFamily: 'monospace', fontSize: 10, fontWeight: '700'},
  ok: {backgroundColor: 'rgba(52,211,153,0.2)'},
  load: {backgroundColor: 'rgba(251,191,36,0.2)'},
  err: {backgroundColor: 'rgba(239,68,68,0.2)'},
  empty: {backgroundColor: '#172142'},
  errBox: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(239,68,68,0.35)',
    padding: 14,
    backgroundColor: 'rgba(239,68,68,0.08)',
    gap: 8,
  },
  errTitle: {color: '#fca5a5', fontSize: 12, fontWeight: '700', fontFamily: 'monospace', letterSpacing: 0.4},
  errText: {color: '#f5f7ff', fontSize: 13, lineHeight: 19, fontFamily: 'monospace'},
  errActions: {flexDirection: 'row', gap: 8, marginTop: 2},
  errBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.5)',
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  errBtnText: {color: '#fca5a5', fontSize: 11, fontWeight: '700'},
  bar: {height: 4, backgroundColor: '#172142', borderRadius: 999, marginTop: 6, overflow: 'hidden'},
  barFill: {height: '100%', backgroundColor: '#4f8dff'},

  body: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    padding: 12,
    gap: 10,
  },
  section: {gap: 8},
  sectionLabel: {
    color: '#6a7085',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
  },
  dlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#0a1024',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  dlName: {color: '#f5f7ff', fontSize: 13, fontWeight: '600'},
  dlMeta: {color: '#6a7085', fontSize: 11, marginTop: 2},
  dlProg: {
    color: '#4f8dff',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  btnPrimary: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#4f8dff',
  },
  btnPrimaryText: {color: '#fff', fontSize: 12, fontWeight: '700'},
  btnGhost: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  btnGhostFull: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
  },
  btnGhostText: {color: '#b7bccb', fontSize: 12, fontWeight: '600'},
});
