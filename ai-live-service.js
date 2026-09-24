/* 外殼只代辦收音與播放；主系統內的 AI 分頁沿用真正的側邊欄。 */
(function () {
  'use strict';
  const assets = new URL('.', document.currentScript.src);
  let peer, origin, nonce, client, runId = 0, ticketWait = null, recorder = null;
  function finalizeRecording(id, bindNonce) {
    if (!recorder) return;
    const rec = recorder; recorder = null;
    // 沒錄到音也照送逐字稿與時長；任何一步失敗都帶原因送回，不再安靜丟掉。
    rec.finish().then(result => {
      if (!result.blob) return result;
      return window.DFCallRecorderEncode(result.blob).then(base64 => Object.assign(result, { audio: base64 }),
        error => Object.assign(result, { audioWhy: error.message }));
    }).then(result => {
      delete result.blob;
      if (nonce === bindNonce) send('callback', { runId: id, name: 'record', value: result });
    }).catch(error => {
      if (nonce === bindNonce) send('callback', { runId: id, name: 'record', value: { failed: '外殼打包失敗：' + (error && error.message || error) } });
    });
  }
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
    finalizeRecording(runId, nonce);
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
    // 播放音量／收音放大記在外殼：GAS 內嵌頁的儲存在 iPhone 上會被隔離或清掉。
    if (m.command === 'prefs') {
      const prefs = {};
      try {
        ['volume', 'inputBoost'].forEach(name => {
          const value = localStorage.getItem('defang.ai.' + name);
          if (value !== null && Number.isFinite(Number(value))) prefs[name] = Number(value);
        });
      } catch (error) {}
      send('prefs', { requestId: m.requestId, prefs });
      return;
    }
    if (m.command === 'prefs-save') {
      if ((m.name === 'volume' || m.name === 'inputBoost') && Number.isFinite(Number(m.value))) {
        try { localStorage.setItem('defang.ai.' + m.name, String(Number(m.value))); } catch (error) {}
      }
      return;
    }
    if (m.command === 'start') {
      stop(); runId = m.runId;
      const id = runId, bindNonce = nonce;
      let begun = false;
      const model = (m.settings && m.settings.model) || '';
      const callbacks = {};
      ['state', 'device', 'inputLevel', 'inputPCM', 'outputLevel', 'inputState', 'ready', 'ended', 'error', 'text', 'turn', 'activity'].forEach(name => {
        callbacks[name] = value => {
          if (name === 'ended' && !begun) return;
          if (name === 'state') begun = true;
          // 斷線續接會再收到 ready；已經在錄就沿用同一份，不能換新把前面的丟掉。
          if (name === 'ready' && !recorder && !m.testing && window.DFCallRecorder && id === runId && bindNonce === nonce) {
            const run = client && client.run;
            recorder = new window.DFCallRecorder(model);
            // 錄 AI 實際經手的聲音：你的聲音取放大＋限幅之後，AI 的聲音取播放音量之前（不受滑桿與 iPhone 靜音 WebAudio 影響）。
            if (!run || !run.context || !run.input || !run.output) recorder.audioWhy = '找不到通話音訊節點';
            else recorder.attach(run.context, run.boost ? run.boost.output : run.input, run.output);
          }
          if (name === 'text' && recorder) recorder.text(value);
          if (name === 'outputLevel' && recorder) recorder.outputLevel(value.level);
          if (id === runId && nonce === bindNonce) send('callback', { runId: id, name, value, run: snapshot() });
          if (name === 'ended') finalizeRecording(id, bindNonce);
        };
      });
      const Client = !m.testing && m.settings && m.settings.provider === 'openai' ? window.DFOpenAILiveClient : window.DFLiveClient;
      client = new Client(callbacks, new URL('ai-live-processor.js?v=20260919-1', assets).href);
      if (m.inputBoost != null && client.inputBoost) client.inputBoost(m.inputBoost);
      const getTicket = m.testing ? null : options => new Promise((resolve, reject) => {
        if (options && options.action === 'close') {
          send('close-session', { runId: id, sessionId: options.sessionId }); resolve({ closed: true }); return;
        }
        // 心跳跟 close 一樣不占 ticketWait 這個單一等待槽，免得跟同時在飛的 create／大腦請求互相蓋掉。
        if (options && options.action === 'heartbeat') {
          send('heartbeat', { runId: id, sessionId: options.sessionId }); resolve({ ok: true }); return;
        }
        ticketWait = { resolve, reject, runId: id, timer: setTimeout(() => {
          if (ticketWait && ticketWait.runId === id) { ticketWait = null; reject(new Error('系統連線逾時，請重新登入後再試')); }
        }, 45000) };
        send('need-ticket', { runId: id, options });
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
    else if (m.command === 'mute') { client.mute(!!m.value); if (recorder) recorder.mute(!!m.value); send('run', { runId, run: snapshot() }); }
    else if (m.command === 'prompt' && typeof m.text === 'string') client.prompt(m.text);
    else if (m.command === 'resumeAudio') client.resumeAudio();
    else if (m.command === 'volume' && client.volume) client.volume(m.value);
    else if (m.command === 'inputBoost' && client.inputBoost) client.inputBoost(m.value);
    else if (m.command === 'manualTurn') { client.manualTurn(); send('run', { runId, run: snapshot() }); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', reset);
  const frame = document.querySelector('#appFrameViewport > iframe');
  if (frame) frame.addEventListener('load', reset);
})();
