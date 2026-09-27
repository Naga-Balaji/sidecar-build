import React from 'react';
import {StyleSheet, View, Text, TouchableOpacity} from 'react-native';

export type Tab = 'home' | 'chat';

export function TabBar({active, onChange}: {active: Tab; onChange: (t: Tab) => void}) {
  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.btn, active === 'home' && styles.on]}
        onPress={() => onChange('home')}>
        <Text style={styles.icon}>🏠</Text>
        <Text style={[styles.label, active === 'home' && styles.labelOn]}>Home</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.btn, active === 'chat' && styles.on]}
        onPress={() => onChange('chat')}>
        <Text style={styles.icon}>💬</Text>
        <Text style={[styles.label, active === 'chat' && styles.labelOn]}>Chat</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    padding: 6,
    zIndex: 100,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: 'rgba(15,23,48,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  on: {
    backgroundColor: '#4f8dff',
    borderColor: 'transparent',
  },
  icon: {fontSize: 14},
  label: {color: '#b7bccb', fontSize: 12, fontWeight: '600'},
  labelOn: {color: '#fff'},
});
