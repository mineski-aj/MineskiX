// html/js/relay-client.js — shared client for dashboard.html's consolidated
// live-data relay. Match Board, Map Selection, and Standings used to each
// open their own persistent EventSource, permanently, for the life of the
// dashboard tab (these iframes are never torn down) — every such connection
// eats into the browser's ~6-connections-per-host cap alongside whatever
// Control/Edit tab currently holds, and adding a new always-mounted tab's
// own connection is exactly what caused a dashboard-wide lockup once
// (fixed, then addressed at the root here — see CLAUDE.md).
//
// Now only the parent (dashboard.html) holds the real EventSource per
// backend channel; it relays data down to whichever iframe(s) care via
// postMessage. This file is the iframe side of that relay.
//
// connectRelay(channel, onData, onStatus) — channel is 'match' |
// 'mapselection' | 'standings' (must match one of dashboard.html's
// relayIframeIds keys). onData(data) fires with the parsed JSON payload
// whenever the parent has fresh data (including once immediately after
// calling this, via a request/response bootstrap so the iframe doesn't
// have to wait for the next live change to get its first snapshot).
// onStatus(ok) is optional, mirrors the old EventSource onmessage/onerror
// distinction for a sync-dot indicator.
function connectRelay(channel, onData, onStatus) {
  window.addEventListener('message', function (e) {
    if (e.origin !== window.location.origin) return;
    var msg = e.data;
    if (!msg || msg.type !== 'relay-data' || msg.channel !== channel) return;
    if (msg.ok && msg.data != null) onData(msg.data);
    if (onStatus) onStatus(!!msg.ok);
  });
  window.parent.postMessage({ type: 'relay-request', channel: channel }, window.location.origin);
}
