import React, {useEffect, useState} from 'react';
import {StyleSheet, View, Text, TouchableOpacity, TextInput} from 'react-native';
import {getMode, onModeChange, setMode} from '../../core/mode';
import type {Mode} from '../../core/mode';
import {getPersona, onPersonaChange, setPersona} from '../../core/persona';
import type {Persona} from '../../core/persona';
import {cloudKey, OR_MODEL} from '../../core/cloud';
import {
  getClipboardWatch,
  setClipboardWatch,
  onClipboardWatchChange,
} from '../../core/clipboardWatch';

export function ModeToggle({localReady}: {localReady: boolean}) {
  const [mode, setLocalMode] = useState<Mode>(getMode());
  const [persona, setLocalPersona] = useState<Persona>(getPersona());
  const [hasKey, setHasKey] = useState(cloudKey.has());
  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [clipWatch, setClipWatch] = useState<boolean>(getClipboardWatch());

  useEffect(() => onModeChange(setLocalMode), []);
  useEffect(() => onPersonaChange(setLocalPersona), []);
  useEffect(() => onClipboardWatchChange(setClipWatch), []);
  useEffect(() => {
    // cloudKey hydrates from AsyncStorage asynchronously
    const t = setInterval(() => setHasKey(cloudKey.has()), 400);
    return () => clearInterval(t);
  }, []);

  const status =
    mode === 'local'
      ? localReady
        ? 'ready · on device'
        : 'load a .gguf'
      : hasKey
        ? OR_MODEL
        : 'add an API key';

  const pickMode = (m: Mode) => {
    if (persona === 'legal' && m === 'cloud') return;
    if (m === 'cloud' && !cloudKey.has()) setShowKey(true);
    setMode(m);
  };
  const saveKey = async () => {
    await cloudKey.set(keyInput);
    setHasKey(cloudKey.has());
    setKeyInput('');
    setShowKey(false);
  };

  return (
    <View style={[styles.wrap, persona === 'legal' && styles.wrapLegal]}>
      <View style={styles.head}>
        <Text style={styles.label}>Inference · {status}</Text>
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.pill, persona === 'legal' && styles.pillOn]}
            onPress={() => setPersona(persona === 'legal' ? 'general' : 'legal')}
          >
            <Text style={[styles.pillText, persona === 'legal' && styles.pillTextOn]}>
              ⚖ Legal
            </Text>
          </TouchableOpacity>
          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'local' && styles.toggleOn]}
              onPress={() => pickMode('local')}
            >
              <Text style={[styles.toggleText, mode === 'local' && styles.toggleTextOn]}>Local</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={persona === 'legal'}
              style={[
                styles.toggleBtn,
                mode === 'cloud' && styles.toggleOn,
                persona === 'legal' && styles.toggleDisabled,
              ]}
              onPress={() => pickMode('cloud')}
            >
              <Text style={[styles.toggleText, mode === 'cloud' && styles.toggleTextOn]}>Cloud</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {persona === 'legal' ? (
        <Text style={styles.legalNote}>
          Legal mode · always runs on-device. Cloud disabled while active.
        </Text>
      ) : null}

      <View style={styles.clipRow}>
        <Text style={styles.clipLabel}>
          Clipboard auto-reviewer · {clipWatch ? 'on' : 'off'}
        </Text>
        <TouchableOpacity
          style={[styles.clipToggle, clipWatch && styles.clipToggleOn]}
          onPress={() => setClipboardWatch(!clipWatch)}>
          <Text style={[styles.clipToggleText, clipWatch && styles.clipToggleTextOn]}>
            {clipWatch ? 'Turn off' : 'Turn on'}
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'cloud' && (!hasKey || showKey) ? (
        <View style={styles.keyrow}>
          <TextInput
            style={styles.keyInput}
            value={keyInput}
            onChangeText={setKeyInput}
            placeholder="sk-or-v1-…"
            placeholderTextColor="#6a7085"
            secureTextEntry
          />
          <TouchableOpacity style={styles.keySave} onPress={saveKey} disabled={!keyInput.trim()}>
            <Text style={styles.keySaveText}>Save</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#0f1730',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 10,
  },
  wrapLegal: {borderColor: 'rgba(245,158,11,0.4)', backgroundColor: 'rgba(245,158,11,0.05)'},
  head: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap'},
  label: {color: '#b7bccb', fontSize: 11, fontFamily: 'monospace', flex: 1},
  controls: {flexDirection: 'row', alignItems: 'center', gap: 8},
  pill: {paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)'},
  pillOn: {backgroundColor: '#f59e0b', borderColor: 'transparent'},
  pillText: {color: '#6a7085', fontFamily: 'monospace', fontSize: 11, fontWeight: '700'},
  pillTextOn: {color: '#fff'},
  toggle: {flexDirection: 'row', backgroundColor: '#0a1024', borderRadius: 999, padding: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)'},
  toggleBtn: {paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999},
  toggleOn: {backgroundColor: '#4f8dff'},
  toggleDisabled: {opacity: 0.35},
  toggleText: {color: '#6a7085', fontFamily: 'monospace', fontSize: 11, fontWeight: '700'},
  toggleTextOn: {color: '#fff'},
  legalNote: {color: '#fbbf24', fontSize: 11, fontFamily: 'monospace'},
  keyrow: {flexDirection: 'row', gap: 8},
  keyInput: {
    flex: 1,
    backgroundColor: '#0a1024',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    color: '#f5f7ff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  keySave: {backgroundColor: '#4f8dff', paddingHorizontal: 14, borderRadius: 8, justifyContent: 'center'},
  keySaveText: {color: '#fff', fontWeight: '700', fontSize: 12},
  clipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  clipLabel: {color: '#b7bccb', fontSize: 11, fontFamily: 'monospace', flex: 1},
  clipToggle: {paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)'},
  clipToggleOn: {backgroundColor: 'rgba(52,211,153,0.15)', borderColor: 'rgba(52,211,153,0.4)'},
  clipToggleText: {color: '#6a7085', fontFamily: 'monospace', fontSize: 11, fontWeight: '700'},
  clipToggleTextOn: {color: '#34d399'},
});
