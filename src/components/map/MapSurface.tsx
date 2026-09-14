import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import { WebView } from 'react-native-webview';
import { mapHtml } from './mapDocument.generated';
import type { MapSurfaceProps } from './types';

// Stable source identity is essential: changing props must not reload the document/cache.
const source = { html: mapHtml };
const userAgent = `CebSpot/${Constants.expoConfig?.version ?? '1.0.2'}`;
const attributionLinks = new Set([
  'https://www.openstreetmap.org/copyright',
  'https://carto.com/attributions',
  'https://www.maptiler.com/copyright/',
]);

function openAttribution(url: string) {
  if (attributionLinks.has(url)) void Linking.openURL(url).catch(() => undefined);
}

export function MapSurface({ payload, onMessage, onTouchStart, onTouchEnd }: MapSurfaceProps) {
  const ref = useRef<WebView>(null);
  const [generation, setGeneration] = useState(0);
  const send = useCallback(() => {
    const json = JSON.stringify(payload).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    ref.current?.injectJavaScript(`window.cebspotMapUpdate && window.cebspotMapUpdate(${json}); true;`);
  }, [payload]);

  useEffect(() => {
    if (generation) send();
  }, [generation, send]);

  return (
    <WebView
      ref={ref}
      source={source}
      style={styles.surface}
      originWhitelist={['*']}
      userAgent={userAgent}
      cacheEnabled
      cacheMode="LOAD_DEFAULT"
      javaScriptEnabled
      scrollEnabled={false}
      nestedScrollEnabled
      bounces={false}
      overScrollMode="never"
      setSupportMultipleWindows={false}
      textZoom={100}
      androidLayerType="hardware"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onMessage={(event) => {
        if (event.nativeEvent.data === 'ready') setGeneration((value) => value + 1);
        else onMessage(event.nativeEvent.data);
      }}
      onShouldStartLoadWithRequest={(request) => {
        if (request.url === 'about:blank' || request.url.startsWith('about:blank#')) return true;
        openAttribution(request.url);
        return false;
      }}
      onOpenWindow={(event) => openAttribution(event.nativeEvent.targetUrl)}
      onContentProcessDidTerminate={() => ref.current?.reload()}
      onRenderProcessGone={() => ref.current?.reload()}
    />
  );
}

const styles = StyleSheet.create({ surface: { flex: 1, backgroundColor: '#eeeae2' } });
