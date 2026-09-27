import React, {useEffect, useState} from 'react';
import {SafeAreaView, ScrollView, StatusBar, StyleSheet, View, Text} from 'react-native';
import {Conversation} from './components/Conversation';
import {ModeToggle} from './components/ModeToggle';
import {ByteCounter} from './components/ByteCounter';
import {ModelCard} from './components/ModelCard';
import {TabBar, Tab} from './components/TabBar';
import {startClipboardFlow, FlowEvent} from '../flows/clipboardFlow';
import {getLlm, LlmProgress} from '../core/llm';
import {pickGguf} from '../bridge/files';
import {getLastLoadedPath, existsAt} from '../core/modelCatalog';

export function HomeScreen() {
  const [tab, setTab] = useState<Tab>('home');
  const [modelProg, setModelProg] = useState<LlmProgress | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [clipHint, setClipHint] = useState<string>('');

  useEffect(() => {
    (async () => {
      const last = await getLastLoadedPath();
      if (last && (await existsAt(last))) {
        const ok = await getLlm().loadFromPath(last, p => setModelProg(p));
        setModelReady(ok);
        return;
      }
      const ok = await getLlm().ready(p => setModelProg(p));
      setModelReady(ok);
    })();
    const stop = startClipboardFlow((e: FlowEvent) => {
      if (e.kind === 'input') setClipHint(`Clipboard analysing (${e.text.length} chars)…`);
      if (e.kind === 'answer') setClipHint(`Clipboard reply written · ${e.latencyMs} ms`);
      if (e.kind === 'error') setClipHint(`Clipboard error: ${e.error}`);
    });
    return stop;
  }, []);

  const onPickModel = async () => {
    const f = await pickGguf();
    if (!f) return;
    const ok = await getLlm().loadFromPath(f.uri, p => setModelProg(p), f.name);
    setModelReady(ok);
  };

  const loadPath = async (path: string) => {
    const ok = await getLlm().loadFromPath(path, p => setModelProg(p));
    setModelReady(ok);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#050815" />
      <ByteCounter />

      {tab === 'home' ? (
        <ScrollView
          style={styles.wrap}
          contentContainerStyle={styles.homeContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <View style={styles.brandGlyph}>
              <Text style={styles.brandGlyphText}>✦</Text>
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.brand}>
                Side<Text style={styles.brandAccent}>car</Text>
              </Text>
              <Text style={styles.tag}>Native · Private on-device co-processor</Text>
            </View>
          </View>

          <ModelCard
            ready={modelReady}
            progress={modelProg}
            onLoadPath={loadPath}
            onPickFile={onPickModel}
          />

          <ModeToggle localReady={modelReady} />

          {clipHint ? (
            <View style={styles.clipHint}>
              <Text style={styles.clipHintText}>{clipHint}</Text>
            </View>
          ) : null}

          <View style={styles.tapForChat}>
            <Text style={styles.tapForChatText}>
              Tap the 💬 Chat tab below for the full-screen conversation
            </Text>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.chatWrap}>
          <Conversation localReady={modelReady} />
        </View>
      )}

      <TabBar active={tab} onChange={setTab} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#050815'},
  wrap: {flex: 1},
  homeContent: {padding: 16, paddingTop: 40, paddingBottom: 100},
  chatWrap: {flex: 1, padding: 12, paddingTop: 40, paddingBottom: 76},
  brandRow: {flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12},
  brandGlyph: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#4f8dff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandGlyphText: {color: '#fff', fontSize: 22, fontWeight: '800'},
  brand: {color: '#f5f7ff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5},
  brandAccent: {color: '#4f8dff'},
  tag: {color: '#b7bccb', fontSize: 12, marginTop: 2},
  clipHint: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(79,141,255,0.3)',
    backgroundColor: 'rgba(79,141,255,0.08)',
  },
  clipHintText: {color: '#4f8dff', fontSize: 11, fontFamily: 'monospace'},
  tapForChat: {
    marginTop: 20,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0f1730',
    alignItems: 'center',
  },
  tapForChatText: {color: '#6a7085', fontSize: 12},
});
