/* GPT-Live 獨立 WebRTC 模組；不碰 Gemini 的 PCM／播放管線。 */
(function (root) {
  'use strict';
  function level(analyser) {
    const samples = new Float32Array(analyser.fftSize), bands = new Array(24).fill(0);
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    samples.forEach((v, i) => { sum += v * v; const b = Math.min(23, Math.floor(i * 24 / samples.length)); bands[b] = Math.max(bands[b], Math.abs(v)); });
    return { level: Math.sqrt(sum / samples.length), bands };
  }
  class OpenAILiveClient {
    constructor(callbacks) { this.callbacks = callbacks; this.run = null; }
    emit(name, value) { if (this.callbacks[name]) this.callbacks[name](value); }
    async start(getTicket, deviceId, settings) {
      this.stop();
      const run = { ready: false, muted: false, testing: false, manualSpeaking: false, settings, getTicket, times: {} };
      this.run = run;
      const current = () => this.run === run;
      try {
        this.emit('state', '正在開啟麥克風…');
        const Context = root.AudioContext || root.webkitAudioContext;
        if (!Context || !root.RTCPeerConnection) throw new Error('此瀏覽器不支援 GPT-Live 語音，請更新瀏覽器');
        run.context = new Context(); run.context.resume().catch(() => {});
        const audio = Object.assign({
          channelCount: 1, echoCancellation: settings.echo !== 'off', noiseSuppression: settings.noiseSuppression !== 'off', autoGainControl: settings.autoGainControl !== 'off'
        }, { deviceId: { exact: deviceId || 'default' } });
        let stream;
        try { stream = await navigator.mediaDevices.getUserMedia({ audio }); }
        catch (error) {
          // 部分瀏覽器沒有 default 別名；僅此情況退回瀏覽器預設，手選裝置不可偷偷替換。
          if (deviceId || error.name !== 'OverconstrainedError' || error.constraint !== 'deviceId') throw error;
          if (!current()) return false;
          delete audio.deviceId;
          stream = await navigator.mediaDevices.getUserMedia({ audio });
        }
        if (!current()) { stream.getTracks().forEach(t => t.stop()); return false; }
        run.stream = stream;
        run.context.resume().catch(() => {});
        const track = stream.getAudioTracks()[0];
        this.emit('device', { label: track.label || '系統預設麥克風', id: track.getSettings ? track.getSettings().deviceId : '' });
        track.onended = () => { if (current()) this.fail(run, '麥克風已中斷，請重新開始'); };
        run.input = run.context.createMediaStreamSource(stream);
        run.meter = run.context.createAnalyser(); run.meter.fftSize = 1024; run.input.connect(run.meter);
        run.output = run.context.createAnalyser(); run.output.fftSize = 1024; run.output.connect(run.context.destination);
        const pc = run.pc = new RTCPeerConnection();
        pc.ontrack = event => {
          if (!current()) return;
          if (run.remote) run.remote.disconnect();
          run.remote = run.context.createMediaStreamSource(event.streams[0] || new MediaStream([event.track]));
          run.remote.connect(run.output); run.context.resume().catch(() => {});
        };
        pc.onconnectionstatechange = () => {
          if (!current()) return;
          if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.fail(run, 'GPT-Live 連線已中斷，請重新開始');
          if (pc.connectionState === 'disconnected') {
            clearTimeout(run.disconnectTimer);
            run.disconnectTimer = setTimeout(() => { if (current() && pc.connectionState === 'disconnected') this.fail(run, 'GPT-Live 網路中斷，已停止通話'); }, 5000);
          } else clearTimeout(run.disconnectTimer);
        };
        // 等 session.started 才放行收音；不使用 Gemini 的音量截音或手動分段。
        track.enabled = false;
        pc.addTrack(track, stream);
        const dc = run.channel = pc.createDataChannel('oai-events');
        dc.onmessage = event => {
          let data;
          try { data = JSON.parse(event.data); } catch (error) { return; }
          if (data.type === 'session.closed') {
            run.finalized = true;
            if (run.cleanupTransport) run.cleanupTransport();
            if (current()) { this.stop(); this.emit('ended'); this.emit('state', 'GPT-Live 通話已結束'); }
            return;
          }
          if (!current()) return;
          if (data.type === 'session.started' && !run.ready) {
            clearTimeout(run.timeout); run.ready = true; track.enabled = !run.muted;
            run.lastSound = Date.now(); run.context.resume().catch(() => {});
            this.emit('state', 'GPT-Live 已連線，可以開始說話'); this.emit('ready', { resumed: false });
          } else if (/^session\.(input|output)_transcript\.delta$/.test(data.type) && typeof data.delta === 'string') {
            const role = data.type.includes('input_') ? 'user' : 'model';
            const newLine = Number.isFinite(run.times[role]) && data.start_ms - run.times[role] > 1800;
            run.times[role] = data.end_ms;
            this.emit('text', { role, text: data.delta, newLine }); this.emit('activity');
          } else if (data.type === 'error') {
            const code = data.error && data.error.code;
            this.fail(run, 'GPT-Live 回報錯誤' + (typeof code === 'string' && /^[a-z_]{3,80}$/.test(code) ? '：' + code : '，請重新開始'));
          }
        };
        dc.onclose = () => { if (current()) this.fail(run, 'GPT-Live 通話通道已關閉'); };
        run.timeout = setTimeout(() => this.fail(run, 'GPT-Live 連線逾時，已停止收音'), 60000);
        run.monitor = setInterval(() => {
          if (!current()) return;
          const running = run.context.state === 'running';
          const input = running && run.ready && !run.muted ? level(run.meter) : { level: 0, bands: [] };
          if (input.level > 0.003) run.lastSound = Date.now();
          this.emit('inputLevel', input);
          this.emit('outputLevel', running ? level(run.output) : { level: 0, bands: [] });
          const state = run.muted ? 'muted' : !running ? 'paused' : track.muted ? 'blocked' : !run.ready ? 'connecting' : Date.now() - run.lastSound > 8000 ? 'quiet' : 'sending';
          this.emit('inputState', state);
          if (run.ready && state !== run.audioState) {
            run.audioState = state;
            this.emit('state', state === 'paused' ? '音訊已暫停，請開啟「收音與試聽」恢復音訊' :
              state === 'blocked' ? '麥克風被系統暫停，請檢查裝置或靜音鍵' :
              state === 'quiet' ? '目前沒有收到你的聲音；若正在說話，請在「收音與試聽」更換麥克風' :
              state === 'muted' ? '麥克風已靜音' : 'GPT-Live 已連線，可以開始說話');
          }
        }, 80);
        this.emit('state', '正在連接 GPT-Live…');
        await pc.setLocalDescription(await pc.createOffer());
        if (!current()) return false;
        if (pc.iceGatheringState !== 'complete') await new Promise((resolve, reject) => {
          const timer = setTimeout(() => { pc.removeEventListener('icegatheringstatechange', check); reject(new Error('網路連線準備逾時')); }, 10000);
          function check() { if (pc.iceGatheringState === 'complete') { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', check); resolve(); } }
          pc.addEventListener('icegatheringstatechange', check); check();
        });
        if (!current()) return false;
        const result = await getTicket({ action: 'create', sdp: pc.localDescription.sdp });
        if (!current()) { if (result && result.sessionId) getTicket({ action: 'close', sessionId: result.sessionId }).catch(() => {}); return false; }
        run.ticket = result;
        run.expiry = setTimeout(() => this.fail(run, '本次 GPT-Live 通話已達設定期限'), Math.max(0, result.expiresAt - Date.now()));
        await pc.setRemoteDescription({ type: 'answer', sdp: result.sdp });
        return current();
      } catch (error) {
        if (current()) this.fail(run, error.name === 'NotAllowedError' ? '麥克風未開放，請允許後重新開始' : error.message || 'GPT-Live 連線失敗');
        return false;
      }
    }
    mute(value) {
      const run = this.run; if (!run) return;
      run.muted = value;
      run.lastSound = Date.now();
      if (!value) this.resumeAudio();
      if (run.stream) run.stream.getAudioTracks().forEach(t => { t.enabled = run.ready && !value; });
      if (run.channel && run.channel.readyState === 'open') run.channel.send(JSON.stringify({ type: value ? 'session.input_audio.mute' : 'session.input_audio.unmute' }));
    }
    resumeAudio() { if (this.run) this.run.context.resume().catch(() => {}); }
    prompt() { /* 開場只由後端已驗證情境設定一次，前端不能追加系統指令。 */ }
    manualTurn() { return false; }
    fail(run, message) { if (this.run !== run) return; this.stop(); this.emit('ended'); this.emit('error', message); }
    stop() {
      const run = this.run; if (!run) return;
      this.run = null;
      clearInterval(run.monitor); clearTimeout(run.timeout); clearTimeout(run.expiry); clearTimeout(run.disconnectTimer);
      if (run.stream) run.stream.getTracks().forEach(t => { t.onended = null; t.stop(); });
      [run.input, run.meter, run.remote, run.output].forEach(n => { if (n) n.disconnect(); });
      if (run.context) run.context.close().catch(() => {});
      this.emit('inputLevel', { level: 0, bands: [] }); this.emit('outputLevel', { level: 0, bands: [] }); this.emit('inputState', 'idle');
      run.cleanupTransport = () => {
        clearTimeout(run.closeTimer);
        if (run.channel) { run.channel.onclose = null; run.channel.close(); }
        if (run.pc) { run.pc.onconnectionstatechange = null; run.pc.close(); }
      };
      if (!run.finalized && run.channel && run.channel.readyState === 'open') {
        run.channel.send(JSON.stringify({ type: 'session.close' }));
        run.closeTimer = setTimeout(run.cleanupTransport, 2000);
      } else run.cleanupTransport();
      if (run.ticket) run.getTicket({ action: 'close', sessionId: run.ticket.sessionId }).catch(() => {
        this.emit('error', 'OpenAI 結束確認未完成；下次通話會先清理舊連線');
      });
    }
  }
  root.DFOpenAILiveClient = OpenAILiveClient;
})(typeof window !== 'undefined' ? window : globalThis);
