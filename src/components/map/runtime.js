/* Runs inside the bundled map document, independently of React Native's JS thread. */
(function () {
  'use strict';
  var map;
  var layer;
  var route;
  var attribution;
  var lastPayload;
  var pendingCamera;
  var pendingCameraScheduled = false;
  var markers = new Map();
  var interacting = false;
  var gestureMoved = false;
  var programmatic = false;
  var cameraRevision = 0;
  var lastReportedRevision = 0;
  var failedTiles = 0;
  var loadedTiles = 0;
  var errorBox = document.getElementById('tile-error');
  var container = document.getElementById('map');

  function send(data) {
    var text = typeof data === 'string' ? data : JSON.stringify(data);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text);
    else window.parent.postMessage({ source: 'cebspot-map', data: text }, '*');
  }

  function validCoordinate(point) {
    return point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
  }

  function latLng(point) {
    return L.latLng(Math.max(-85.05112878, Math.min(85.05112878, point.latitude)), point.longitude);
  }

  function sameCenter(a, b) {
    return a && b && Math.abs(a.latitude - b.latitude) < 1e-7 && Math.abs(a.longitude - b.longitude) < 1e-7;
  }

  function reportViewport() {
    if (programmatic || !gestureMoved) return;
    var center = map.getCenter().wrap();
    send({ type: 'viewport', center: { latitude: center.lat, longitude: center.lng }, zoom: map.getZoom(), transitionKey: lastPayload.transitionKey });
    lastReportedRevision = cameraRevision;
    gestureMoved = false;
  }

  function endInteraction() {
    if (!interacting) return;
    interacting = false;
    send({ type: 'interactionEnd' });
  }

  function startInteraction() {
    if (!map || interacting) return;
    // Stop a carousel flight at the visible position as soon as a finger touches it.
    map.stop();
    programmatic = false;
    interacting = true;
    send({ type: 'interactionStart' });
  }

  function schedulePendingCamera() {
    if (!pendingCamera || pendingCameraScheduled) return;
    pendingCameraScheduled = true;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        pendingCameraScheduled = false;
        if (!pendingCamera || !container.clientWidth || !container.clientHeight) return;
        var pending = pendingCamera;
        pendingCamera = null;
        // A retained navigation screen can briefly report an intermediate size
        // while becoming visible. Re-measure before applying its queued camera.
        map.invalidateSize({ pan: false, animate: false });
        map.setView(latLng(pending.center), pending.zoom, { animate: false });
      });
    });
  }

  var paths = {
    coffee: '<path d="M18 8h1a3 3 0 1 1 0 6h-1M3 8h15v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM6 2v2M10 2v2M14 2v2"/>',
    night: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M7 7a7 7 0 0 1 5-2M17 17a7 7 0 0 1-5 2"/>',
    bar: '<path d="M3 3h18l-9 10zM12 13v8M7 21h10"/>',
    outdoor: '<path d="m12 2-7 10h3l-4 6h16l-4-6h3zM12 18v4"/>',
    person: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
    dining: '<path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v19M20 3c-4 2-4 8 0 9V3zM20 12v10"/>'
  };

  function categoryInfo(marker) {
    var category = (marker.category || marker.label || '').toLowerCase();
    if (/friend|person|user|location/.test(category)) return { color: '#2563eb', icon: paths.person };
    if (/coffee|cafe/.test(category)) return { color: '#D4A373', icon: paths.coffee };
    if (/club|pulse|night/.test(category)) return { color: '#EC4899', icon: paths.night };
    if (/bar|chill/.test(category)) return { color: '#3B82F6', icon: paths.bar };
    if (/outdoor|garden|park/.test(category)) return { color: '#10B981', icon: paths.outdoor };
    return { color: '#10B981', icon: paths.dining };
  }

  function appearanceKey(marker) {
    return JSON.stringify([marker.category, marker.imageUrl, marker.variant, marker.size, marker.showIcon]);
  }

  function markerContent(marker) {
    var shell = document.createElement('div');
    shell.className = 'spot-shell';
    var halo = document.createElement('span');
    halo.className = 'spot-halo';
    var face = document.createElement('span');
    face.className = 'spot-face';
    // Only our constant SVG paths are HTML. Labels and image URLs never become markup.
    if (marker.showIcon === true || (marker.showIcon !== false && marker.variant !== 'circle')) {
      face.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + categoryInfo(marker).icon + '</svg>';
    }
    if (marker.imageUrl && /^https:\/\//i.test(marker.imageUrl)) {
      var image = document.createElement('img');
      image.alt = '';
      image.decoding = 'async';
      image.src = marker.imageUrl;
      image.onerror = function () { image.remove(); shell.classList.remove('has-photo'); };
      face.appendChild(image);
      shell.classList.add('has-photo');
    }
    shell.appendChild(halo);
    shell.appendChild(face);
    shell.classList.toggle('is-small', marker.size === 'small');
    shell.classList.toggle('is-pin', marker.variant === 'pin');
    return shell;
  }

  function updateMarkers(nextMarkers) {
    var visibleIds = new Set();
    nextMarkers.forEach(function (data) {
      if (!validCoordinate(data) || typeof data.id !== 'string') return;
      visibleIds.add(data.id);
      var entry = markers.get(data.id);
      var appearance = appearanceKey(data);
      if (!entry) {
        var marker = L.marker(latLng(data), {
          icon: L.divIcon({ className: 'spot-marker', html: markerContent(data), iconSize: [44, 44], iconAnchor: [22, 22] }),
          keyboard: true,
          bubblingMouseEvents: false
        }).addTo(map);
        marker.on('click', function () { send({ type: 'markerPress', id: data.id }); });
        entry = { marker: marker, appearance: appearance };
        markers.set(data.id, entry);
      } else {
        if (!entry.marker.getLatLng().equals(latLng(data))) entry.marker.setLatLng(latLng(data));
        if (entry.appearance !== appearance) {
          entry.marker.setIcon(L.divIcon({ className: 'spot-marker', html: markerContent(data), iconSize: [44, 44], iconAnchor: [22, 22] }));
          entry.appearance = appearance;
        }
      }
      var element = entry.marker.getElement();
      var shell = element.firstChild;
      shell.style.setProperty('--spot-color', data.color || categoryInfo(data).color);
      // Reuse DOM nodes so selection animates between states instead of remounting pins.
      shell.classList.toggle('is-selected', Boolean(data.selected));
      element.setAttribute('aria-label', data.label || data.category || 'Map location');
      element.setAttribute('aria-pressed', String(Boolean(data.selected)));
      entry.marker.setZIndexOffset(data.selected ? 1000 : 0);
    });
    markers.forEach(function (entry, id) {
      if (!visibleIds.has(id)) { entry.marker.remove(); markers.delete(id); }
    });
  }

  function makeLayer(payload) {
    if (layer) layer.remove();
    failedTiles = 0;
    loadedTiles = 0;
    errorBox.hidden = true;
    layer = L.tileLayer(payload.tileUrl, {
      minZoom: 11,
      maxZoom: 18,
      // Load only the viewport as it moves. Keep already-seen neighbors for a return pan.
      updateWhenIdle: false,
      updateInterval: 100,
      updateWhenZooming: false,
      keepBuffer: 3,
      detectRetina: false,
      crossOrigin: false
    });
    layer.on('loading', function () { failedTiles = 0; loadedTiles = 0; });
    layer.on('tileload', function () { loadedTiles += 1; errorBox.hidden = true; });
    layer.on('tileerror', function (event) {
      var image = event.tile;
      // Try a different provider once. Never loop back to the URL that just failed.
      if (payload.fallbackTileUrl && payload.fallbackTileUrl !== payload.tileUrl && !image.dataset.fallback) {
        image.dataset.fallback = 'true';
        image.src = L.Util.template(payload.fallbackTileUrl, event.coords);
      } else {
        failedTiles += 1;
        if (failedTiles >= 2 && loadedTiles === 0) errorBox.hidden = false;
      }
    });
    layer.addTo(map);
  }

  function createMap(payload) {
    map = L.map(container, {
      center: latLng(payload.center), zoom: payload.zoom, minZoom: 11, maxZoom: 18,
      zoomControl: false, attributionControl: false, inertia: true,
      inertiaDeceleration: 2500, inertiaMaxSpeed: 1400,
      zoomAnimation: true, fadeAnimation: true, markerZoomAnimation: true,
      tapHold: false, worldCopyJump: true, preferCanvas: true
    });
    makeLayer(payload);
    route = L.polyline([], { color: payload.routeLineColor || '#16a36a', weight: 4, opacity: .85, interactive: false, smoothFactor: 1.5 }).addTo(map);
    attribution = L.control.attribution({ position: payload.attributionPosition, prefix: false });
    map.on('dragstart zoomstart', function () { if (!programmatic) gestureMoved = true; });
    map.on('moveend', function () { reportViewport(); });
    map.on('click', function (event) {
      send({ type: 'coordinatePress', center: { latitude: event.latlng.lat, longitude: event.latlng.wrap().lng } });
    });
    // Native onTouchStart also blocks the enclosing ScrollView before the bridge round trip.
    container.addEventListener('pointerdown', startInteraction, { passive: true });
    container.addEventListener('touchstart', startInteraction, { passive: true });
    window.addEventListener('pointerup', endInteraction, { passive: true });
    window.addEventListener('pointercancel', endInteraction, { passive: true });
    window.addEventListener('touchend', function (event) { if (!event.touches.length) endInteraction(); }, { passive: true });
    window.addEventListener('touchcancel', endInteraction, { passive: true });
    window.addEventListener('blur', endInteraction);
    container.addEventListener('wheel', function () { startInteraction(); endInteraction(); }, { passive: true, capture: true });
    container.addEventListener('keydown', function () { startInteraction(); endInteraction(); }, true);
    new ResizeObserver(function () {
      // Stack navigation can retain this document with a zero-sized viewport.
      if (!container.clientWidth || !container.clientHeight) { map.stop(); return; }
      map.invalidateSize({ pan: false, debounceMoveend: true });
      schedulePendingCamera();
    }).observe(container);
    document.getElementById('retry').onclick = function () { makeLayer(lastPayload); };
    window.addEventListener('online', function () { if (!errorBox.hidden) makeLayer(lastPayload); });
  }

  function updateCamera(payload, previous) {
    var centerChanged = !sameCenter(payload.center, previous.center);
    var zoomChanged = payload.zoom !== previous.zoom;
    var transitionChanged = payload.transitionKey !== previous.transitionKey;
    if (!centerChanged && !zoomChanged && !transitionChanged) return;
    var current = map.getCenter().wrap();
    var targetZoom = zoomChanged || transitionChanged ? payload.zoom : map.getZoom();
    // A React echo of the completed gesture must not snap/cancel the next drag.
    if (!transitionChanged && sameCenter(payload.center, { latitude: current.lat, longitude: current.lng }) && Math.abs(targetZoom - map.getZoom()) < .001) return;
    // Ignore a delayed viewport echo if the user has already begun another gesture.
    if (interacting && !transitionChanged && lastReportedRevision === cameraRevision) return;
    programmatic = true;
    map.stop();
    cameraRevision += 1;
    if (!container.clientWidth || !container.clientHeight) {
      pendingCamera = { center: payload.center, zoom: targetZoom };
      return;
    }
    pendingCamera = null;
    if (!map.getSize().x || !map.getSize().y) map.invalidateSize({ pan: false });
    var target = latLng(payload.center);
    var delta = map.project(target).distanceTo(map.project(map.getCenter()));
    var reduceMotion = payload.reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || (delta < 1 && targetZoom === map.getZoom())) {
      map.setView(target, targetZoom, { animate: false });
    } else if (targetZoom === map.getZoom() && delta < Math.max(map.getSize().x, map.getSize().y)) {
      map.panTo(target, { animate: true, duration: .55, easeLinearity: .25 });
    } else {
      map.flyTo(target, targetZoom, { animate: true, duration: .8 });
    }
  }

  window.cebspotMapUpdate = function (payload) {
    if (!payload || !validCoordinate(payload.center) || !Number.isFinite(payload.zoom)) return;
    payload.zoom = Math.max(11, Math.min(18, payload.zoom));
    var previous = lastPayload;
    lastPayload = payload;
    document.body.classList.toggle('reduce-motion', payload.reduceMotion);
    document.documentElement.style.setProperty('--attribution-inset', Math.max(0, payload.attributionInset || 10) + 'px');
    document.documentElement.style.setProperty('--map-error-inset', payload.attributionPosition.startsWith('top') ? (payload.attributionInset + 30) + 'px' : '12px');
    if (!map) createMap(payload);
    else if (payload.tileUrl !== previous.tileUrl || payload.fallbackTileUrl !== previous.fallbackTileUrl) makeLayer(payload);
    if (!previous || JSON.stringify(payload.markers) !== JSON.stringify(previous.markers)) updateMarkers(payload.markers || []);
    if (!previous || JSON.stringify(payload.routeLine) !== JSON.stringify(previous.routeLine)) {
      route.setLatLngs((payload.routeLine || []).filter(validCoordinate).map(latLng));
    }
    if (!previous || payload.routeLineColor !== previous.routeLineColor) {
      route.setStyle({ color: payload.routeLineColor || '#16a36a' });
    }
    if (!previous || payload.showAttribution !== previous.showAttribution || payload.attributionPosition !== previous.attributionPosition || payload.attribution !== previous.attribution) {
      attribution.remove();
      attribution = L.control.attribution({ position: payload.attributionPosition, prefix: false });
      attribution.addAttribution(payload.attribution);
      if (payload.showAttribution) attribution.addTo(map);
    }
    if (previous) updateCamera(payload, previous);
  };

  window.addEventListener('message', function (event) {
    if (event.source === window.parent && event.data && event.data.source === 'cebspot-host') window.cebspotMapUpdate(event.data.payload);
  });
  send('ready');
})();
