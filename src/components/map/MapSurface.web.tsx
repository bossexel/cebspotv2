import React, { useEffect, useRef, useState } from 'react';
import { mapHtml } from './mapDocument.generated';
import type { MapSurfaceProps } from './types';

export function MapSurface({ payload, onMessage }: MapSurfaceProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.source !== 'cebspot-map') return;
      if (event.data.data === 'ready') setGeneration((value) => value + 1);
      else if (typeof event.data.data === 'string') onMessage(event.data.data);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onMessage]);

  useEffect(() => {
    if (generation) frame.current?.contentWindow?.postMessage({ source: 'cebspot-host', payload }, '*');
  }, [generation, payload]);

  return React.createElement('iframe', {
    ref: frame,
    title: 'Interactive map of nearby spots',
    srcDoc: mapHtml,
    onLoad: () => setGeneration((value) => value + 1),
    sandbox: 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox',
    style: { border: 0, width: '100%', height: '100%', display: 'block', flex: 1 },
  });
}
