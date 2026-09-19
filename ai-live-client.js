/* 共用傳輸層；兩個獨立介面各自持有一個 client，不保存 Key、教材或錄音。 */
(function (root) {
  'use strict';
  const ENDPOINT = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=';
  function encode(buffer) {
    const bytes = new Uint8Array(buffer);
    let text = '';
    for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
    return btoa(text);
  }
  function decode(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const view = new DataView(bytes.buffer);
    const samples = new Float32Array(Math.floor(bytes.length / 2));
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
    return samples;
  }
  class LiveClient {
    constructor(callbacks, processorUrl) {
      this.callbacks = callbacks;
      this.processorUrl = processorUrl;
      this.run = null;
    }
    emit(name, value) { if (this.callbacks[name]) this.callbacks[name](value); }
    async start(getTicket) {
      this.stop();
      const run = { sources: new Set(), ready: false, muted: false, nextTime: 0, reconnects: 0 };
      this.run = run;
      const current = () => this.run === run;
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('此瀏覽器無法使用麥克風，請用最新版 Safari 或 Chrome 開啟德芳 App');
        }
        this.emit('state', '正在開啟麥克風…');
        const Context = root.AudioContext || root.webkitAudioContext;
        if (!Context) throw new Error('此瀏覽器不支援即時音訊');
        run.context = new Context();
        await run.context.resume();
        if (!current()) return false;
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        if (!current()) { stream.getTracks().forEach(track => track.stop()); return false; }
        run.stream = stream;
        if (!run.context.audioWorklet) throw new Error('此瀏覽器不支援即時收音，請更新 Safari 或 Chrome');
        await run.context.audioWorklet.addModule(this.processorUrl);
        if (!current()) return false;
        run.input = run.context.createMediaStreamSource(stream);
        run.processor = new AudioWorkletNode(run.context, 'defang-pcm');
        run.processor.port.onmessage = event => {
          if (!current() || !run.ready || run.muted) return;
          if (run.socket.bufferedAmount > 128000) {
            this.fail(run, '網路太慢，已停止通話；請換穩定的網路再開始');
            return;
          }
          this.send(run, { realtimeInput: { audio: { data: encode(event.data), mimeType: 'audio/pcm;rate=16000' } } });
        };
        run.input.connect(run.processor);
        run.processor.connect(run.context.destination);
        stream.getAudioTracks().forEach(track => {
          track.onended = () => { if (current()) this.fail(run, '麥克風已中斷，請重新開始'); };
        });
        this.emit('state', '正在連接 Gemini…');
        const ticket = await getTicket();
        if (!current()) return false;
        run.ticket = ticket;
        run.expiry = setTimeout(() => this.fail(run, '本次通話已滿 30 分鐘，請按開始建立新對話'),
          Math.max(0, ticket.expiresAt - Date.now()));
        this.connect(run, false);
        return true;
      } catch (error) {
        if (!current()) return false;
        const message = error.name === 'NotAllowedError' ? '麥克風未開放，請在瀏覽器允許後重新開始' :
          error.name === 'NotFoundError' ? '找不到麥克風，請確認裝置已連接' : error.message;
        this.fail(run, message || '連線失敗，請稍後再試');
        return false;
      }
    }
    connect(run, resume) {
      if (this.run !== run) return;
      run.ready = false;
      if (run.socket) {
        run.socket.onclose = null;
        run.socket.onmessage = null;
        run.socket.onerror = null;
        run.socket.close();
      }
      const socket = new WebSocket(ENDPOINT + encodeURIComponent(run.ticket.token));
      run.socket = socket;
      let messages = Promise.resolve();
      run.timeout = setTimeout(() => this.fail(run, '連線逾時，請稍後再試'), 20000);
      socket.onopen = () => {
        if (this.run !== run || run.socket !== socket) return;
        const setup = JSON.parse(JSON.stringify(run.ticket.setup));
        if (resume) setup.sessionResumption = { handle: run.resumeHandle };
        socket.send(JSON.stringify({ setup: setup }));
      };
      socket.onmessage = event => {
        messages = messages.then(async () => {
          if (this.run !== run || run.socket !== socket) return;
          const raw = typeof event.data === 'string' ? event.data : await event.data.text();
          if (this.run === run && run.socket === socket) this.receive(run, JSON.parse(raw), resume);
        }).catch(() => { if (this.run === run && run.socket === socket) this.fail(run, '音訊處理失敗，請重新開始'); });
      };
      socket.onerror = () => { if (this.run === run && run.socket === socket) this.fail(run, '無法連接 Gemini，請檢查網路後重試'); };
      socket.onclose = event => {
        if (this.run !== run || run.socket !== socket) return;
        if ((event.code === 1006 || event.code === 1011) && this.resume(run)) return;
        const text = event.code === 1008 ? 'Gemini 拒絕本次連線，請確認模型權限、API 設定與額度' : '通話已中斷，請按開始重新連線';
        this.fail(run, text);
      };
    }
    resume(run) {
      if (!run.resumeHandle || run.reconnects >= 2 || run.ticket.expiresAt - Date.now() < 10000) return false;
      run.reconnects++;
      clearTimeout(run.timeout);
      this.clearAudio(run);
      this.emit('state', '正在接回原本的對話…');
      this.connect(run, true);
      return true;
    }
    receive(run, message, resumed) {
      if (message.error) { this.fail(run, 'Gemini 無法完成本次連線，請檢查模型設定與額度'); return; }
      if (message.setupComplete) {
        clearTimeout(run.timeout);
        run.ready = true;
        this.emit('ready', { resumed: resumed });
        this.emit('state', run.muted ? '麥克風已靜音' : '已連線，可以開始說話');
      }
      if (message.sessionResumptionUpdate) {
        const update = message.sessionResumptionUpdate;
        run.resumeHandle = update.resumable ? update.newHandle : '';
      }
      const content = message.serverContent || {};
      if (content.interrupted) { this.clearAudio(run); this.emit('turn'); }
      if (content.inputTranscription && content.inputTranscription.text) {
        this.emit('text', { role: 'user', text: content.inputTranscription.text });
        this.emit('activity');
      }
      if (content.outputTranscription && content.outputTranscription.text) {
        this.emit('text', { role: 'model', text: content.outputTranscription.text });
      }
      for (const part of (content.modelTurn && content.modelTurn.parts) || []) {
        if (part.inlineData && /^audio\/pcm/.test(part.inlineData.mimeType || '')) this.play(run, part.inlineData);
      }
      const status = message.interactionStatus || content.interactionStatus;
      if (status === 'IN_PROGRESS') this.emit('state', 'AI 正在思考…你仍然可以說話');
      if (status === 'IDLE' || (content.turnComplete && run.ticket.model === 'gemini-3.8-live')) {
        this.emit('state', run.muted ? '麥克風已靜音' : '已連線，可以繼續說話');
      }
      if (content.turnComplete) this.emit('turn');
      if (message.goAway && !this.resume(run)) this.fail(run, '本次連線即將結束，請按開始建立新對話');
    }
    play(run, data) {
      const rateMatch = /rate=(\d+)/.exec(data.mimeType || '');
      const rate = rateMatch ? Number(rateMatch[1]) : 24000;
      const samples = decode(data.data);
      if (!samples.length || rate < 8000 || rate > 96000) return;
      if (run.nextTime - run.context.currentTime > 30) throw new Error('音訊累積過多');
      const buffer = run.context.createBuffer(1, samples.length, rate);
      buffer.copyToChannel(samples, 0);
      const source = run.context.createBufferSource();
      source.buffer = buffer;
      source.connect(run.context.destination);
      run.sources.add(source);
      source.onended = () => { run.sources.delete(source); source.disconnect(); };
      const when = Math.max(run.context.currentTime + 0.02, run.nextTime);
      source.start(when);
      run.nextTime = when + buffer.duration;
    }
    send(run, value) {
      if (this.run === run && run.ready && run.socket.readyState === 1) run.socket.send(JSON.stringify(value));
    }
    prompt(text) { if (this.run) this.send(this.run, { realtimeInput: { text: text } }); }
    mute(value) {
      const run = this.run;
      if (!run) return;
      run.muted = value;
      if (run.stream) run.stream.getAudioTracks().forEach(track => { track.enabled = !value; });
      if (value) this.send(run, { realtimeInput: { audioStreamEnd: true } });
      this.emit('state', value ? '麥克風已靜音' : '已連線，可以繼續說話');
    }
    clearAudio(run) {
      run.sources.forEach(source => { try { source.stop(); source.disconnect(); } catch (error) {} });
      run.sources.clear();
      run.nextTime = 0;
    }
    fail(run, message) {
      if (this.run !== run) return;
      this.stop();
      this.emit('error', message);
    }
    stop() {
      const run = this.run;
      this.run = null;
      if (!run) return;
      clearTimeout(run.timeout);
      clearTimeout(run.expiry);
      if (run.socket) {
        run.socket.onclose = null; run.socket.onerror = null; run.socket.onmessage = null;
        run.socket.close();
      }
      if (run.stream) run.stream.getTracks().forEach(track => { track.onended = null; track.stop(); });
      if (run.processor) { run.processor.port.onmessage = null; run.processor.disconnect(); }
      if (run.input) run.input.disconnect();
      this.clearAudio(run);
      if (run.context && run.context.state !== 'closed') run.context.close().catch(function () {});
      this.emit('ended');
    }
  }
  root.DFLiveClient = LiveClient;
  if (typeof module !== 'undefined' && module.exports) module.exports = { LiveClient: LiveClient, decode: decode, encode: encode };
})(typeof window !== 'undefined' ? window : globalThis);
