/* GAS UI 使用的音訊代理；不在沙盒開麥克風，也不傳登入憑證。 */
(function () {
  'use strict';
  const bridge = window.DFAIEmbedded;
  let client, sequence = 0;
  const devices = new Map();
  const sessionClosers = new Map();
  class ProxyClient {
    constructor(callbacks) { this.callbacks = callbacks; this.run = null; this.id = 0; this.boost = 1; client = this; }
    async start(getTicket, deviceId, settings) {
      this.stop();
      const id = ++sequence; this.id = id; this.getTicket = getTicket;
      if (getTicket && settings && settings.provider === 'openai') sessionClosers.set(id, getTicket);
      this.run = { ready: false, muted: false, testing: !getTicket, manualSpeaking: false };
      return new Promise(resolve => {
        this.resolveStart = resolve;
        this.startTimer = setTimeout(() => {
          if (this.id !== id) return;
          this.stop();
          if (this.callbacks.ended) this.callbacks.ended();
          if (this.callbacks.error) this.callbacks.error('App 收音服務未連上，請關閉 App 後重新開啟');
        }, 60000);
        bridge.audio({ command: 'start', runId: id, testing: !getTicket, deviceId, settings, inputBoost: this.boost });
      });
    }
    stop() {
      if (this.id) bridge.audio({ command: 'stop', runId: this.id });
      clearTimeout(this.startTimer);
      if (this.resolveStart) { this.resolveStart(false); this.resolveStart = null; }
      this.run = null; this.id = ++sequence;
    }
    prompt(text) { if (this.run) bridge.audio({ command: 'prompt', runId: this.id, text }); }
    mute(value) {
      if (!this.run) return;
      this.run.muted = value;
      if (value) this.run.manualSpeaking = false;
      bridge.audio({ command: 'mute', runId: this.id, value });
    }
    resumeAudio() { if (this.run) bridge.audio({ command: 'resumeAudio', runId: this.id }); }
    volume(value) { bridge.audio({ command: 'volume', runId: this.id, value }); }
    inputBoost(value) { this.boost = value; if (this.id) bridge.audio({ command: 'inputBoost', runId: this.id, value }); }
    manualTurn() {
      if (!this.run || !this.run.ready || this.run.muted) return false;
      this.run.manualSpeaking = !this.run.manualSpeaking;
      bridge.audio({ command: 'manualTurn', runId: this.id }); return true;
    }
  }
  bridge.onAudio(async m => {
    if (m.type === 'close-session') {
      const close = sessionClosers.get(m.runId);
      if (close) {
        sessionClosers.delete(m.runId);
        close({ action: 'close', sessionId: m.sessionId }).catch(() => {
          if (client && client.callbacks.error) client.callbacks.error('OpenAI 結束確認未完成；下次通話會先清理舊連線');
        });
      }
      return;
    }
    if (m.type === 'heartbeat') {
      const getTicket = sessionClosers.get(m.runId);
      if (getTicket) getTicket({ action: 'heartbeat', sessionId: m.sessionId }).catch(() => {});
      return;
    }
    if (m.type === 'devices') {
      const request = devices.get(m.requestId);
      if (request) { clearTimeout(request.timer); request.resolve(m.devices); devices.delete(m.requestId); }
      return;
    }
    // 錄音在掛斷後才打包好，那時 stop() 已把 client.id 換號；不能被下面的 runId 檢查擋掉。
    if (m.type === 'callback' && m.name === 'record') {
      if (client && client.callbacks.record) client.callbacks.record(m.value);
      return;
    }
    if (!client || m.runId !== client.id) return;
    if (m.type === 'need-ticket') {
      const id = client.id, getTicket = client.getTicket;
      try {
        const ticket = await getTicket(m.options);
        if (id === client.id) bridge.audio({ command: 'ticket', runId: id, ticket });
        else if (ticket && ticket.provider === 'openai') getTicket({ action: 'close', sessionId: ticket.sessionId }).catch(() => {});
      } catch (error) { if (id === client.id) bridge.audio({ command: 'ticket', runId: id, error: error.message }); }
      return;
    }
    if (Object.prototype.hasOwnProperty.call(m, 'run')) client.run = m.run;
    if (m.type === 'started') {
      clearTimeout(client.startTimer);
      if (client.resolveStart) { client.resolveStart(m.ok); client.resolveStart = null; }
    } else if (m.type === 'callback' && client.callbacks[m.name]) client.callbacks[m.name](m.value);
  });
  window.DFAIAudioDevices = () => new Promise(resolve => {
    const requestId = String(++sequence);
    const timer = setTimeout(() => { devices.delete(requestId); resolve([]); }, 5000);
    devices.set(requestId, { resolve, timer }); bridge.audio({ command: 'devices', requestId });
  });
  window.DFLiveClient = ProxyClient;
})();
