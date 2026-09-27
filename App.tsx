import React, {useEffect} from 'react';
import {HomeScreen} from './src/ui/HomeScreen';
import {armGuard} from './src/bridge/networkGuard';
import {CONFIG} from './src/config';

export default function App() {
  useEffect(() => {
    if (CONFIG.demo.airplaneOnly) armGuard();
  }, []);
  return <HomeScreen />;
}
