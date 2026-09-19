/* 外殼只代辦收音與播放；主系統內的 AI 分頁沿用真正的側邊欄。 */
(function () {
  'use strict';
  const assets = new URL('.', document.currentScript.src);
  let peer, origin, nonce, client, runId = 0, ticketWait = null;
  function trusted(event) {
    const frame = document.querySelector('#appFrameViewport > iframe');
    if (!frame || !/^https:\/\/(?:[a-z0-9-]+-)?script\.googleusercontent\.com$/.test(event.origin)) return false;
    try {
      let source = event.source;
      for (let i = 0; source && i < 4; i++) {
        if (source === frame.contentWindow) return true;
        if (source === source.parent) break;
        source = source.parent;
      }
    } catch (error) {}
    return false;
  }
  function send(type, extra) {
    if (peer) peer.postMessage(Object.assign({ defang: 'ai-audio-event', type, nonce }, extra || {}), origin);
  }
  function snapshot() {
    const run = client && client.run;
    return run ? { ready: run.ready, muted: run.muted, testing: run.testing, manualSpeaking: run.manualSpeaking } : null;
  }
  function stop() {
    if (ticketWait) { clearTimeout(ticketWait.timer); ticketWait.reject(new Error('連線已取消')); ticketWait = null; }
    if (client) client.stop();
  }
  function reset() { stop(); peer = null; origin = ''; nonce = ''; client = null; }
  window.addEventListener('message', async event => {
    const m = event.data;
    if (!m || !trusted(event)) return;
    if (m.defang === 'ai-audio-bind') {
      if (typeof m.nonce !== 'string' || m.nonce.length < 16) return;
      if (peer !== event.source || nonce !== m.nonce) reset();
      peer = event.source; origin = event.origin; nonce = m.nonce;
      send('bound'); return;
    }
    if (m.defang !== 'ai-audio-command' || event.source !== peer || event.origin !== origin || m.nonce !== nonce) return;
    if (m.command === 'reset') { reset(); return; }
    if (m.command === 'devices') {
      const requestNonce = nonce;
      try {
        const devices = navigator.mediaDevices && navigator.mediaDevices.enumerateDevices ? await navigator.mediaDevices.enumerateDevices() : [];
        if (nonce === requestNonce) send('devices', { requestId: m.requestId, devices: devices.filter(d => d.kind === 'audioinput').map(d => ({ kind: d.kind, label: d.label, deviceId: d.deviceId })) });
      } catch (error) { if (nonce === requestNonce) send('devices', { requestId: m.requestId, devices: [] }); }
      return;
    }
    if (m.command === 'start') {
      stop(); runId = m.runId;
      const id = runId, bindNonce = nonce;
      let begun = false;
      const callbacks = {};
      ['state', 'device', 'inputLevel', 'inputPCM', 'outputLevel', 'inputState', 'ready', 'ended', 'error', 'text', 'turn', 'activity'].forEach(name => {
        callbacks[name] = value => {
          if (name === 'ended' && !begun) return;
          if (name === 'state') begun = true;
          if (id === runId && nonce === bindNonce) send('callback', { runId: id, name, value, run: snapshot() });
        };
      });
      client = new window.DFLiveClient(callbacks, new URL('ai-live-processor.js?v=20260919-1', assets).href);
      const getTicket = m.testing ? null : () => new Promise((resolve, reject) => {
        ticketWait = { resolve, reject, runId: id, timer: setTimeout(() => {
          if (ticketWait && ticketWait.runId === id) { ticketWait = null; reject(new Error('系統連線逾時，請重新登入後再試')); }
        }, 45000) };
        send('need-ticket', { runId: id });
      });
      const ok = await client.start(getTicket, m.deviceId, m.settings);
      if (id === runId && nonce === bindNonce) send('started', { runId: id, ok, run: snapshot() });
      return;
    }
    if (m.runId !== runId || !client) return;
    if (m.command === 'ticket' && ticketWait && ticketWait.runId === runId) {
      const waiting = ticketWait; ticketWait = null; clearTimeout(waiting.timer);
      if (m.error) waiting.reject(new Error(m.error)); else waiting.resolve(m.ticket);
    } else if (m.command === 'stop') stop();
    else if (m.command === 'mute') { client.mute(!!m.value); send('run', { runId, run: snapshot() }); }
    else if (m.command === 'prompt' && typeof m.text === 'string') client.prompt(m.text);
    else if (m.command === 'resumeAudio') client.resumeAudio();
    else if (m.command === 'manualTurn') { client.manualTurn(); send('run', { runId, run: snapshot() }); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', reset);
  const frame = document.querySelector('#appFrameViewport > iframe');
  if (frame) frame.addEventListener('load', reset);
})();
