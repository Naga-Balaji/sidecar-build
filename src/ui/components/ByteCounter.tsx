import React, {useEffect, useState} from 'react';
import {StyleSheet, View, Text} from 'react-native';
import {getBytes} from '../../bridge/networkGuard';

export function ByteCounter() {
  const [b, setB] = useState(getBytes());
  useEffect(() => {
    const t = setInterval(() => setB(getBytes()), 250);
    return () => clearInterval(t);
  }, []);
  const zero = b.bytesOut === 0;
  return (
    <View style={[styles.wrap, zero ? styles.ok : styles.bad]}>
      <View style={styles.dot} />
      <Text style={styles.text}>
        {zero ? 'On-device · 0 bytes out' : `Leaked · ${b.bytesOut}B out`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    zIndex: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 8,
  },
  ok: {backgroundColor: 'rgba(15,81,50,0.4)'},
  bad: {backgroundColor: 'rgba(132,32,41,0.4)'},
  dot: {width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ade80'},
  text: {color: '#fff', fontFamily: 'monospace', fontSize: 11, letterSpacing: 0.3},
});
