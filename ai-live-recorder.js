/* 全通話錄音、逐字稿與用量估算；只在外殼執行，失敗不影響通話本身。 */
(function (root) {
  'use strict';
  function pickMime() {
    if (!root.MediaRecorder) return '';
    var list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    for (var i = 0; i < list.length; i++) {
      try { if (MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (error) {}
    }
    return '';
  }
  function CallRecorder(model) {
    this.model = model;
    this.transcript = [];
    this.chunks = [];
    this.recorder = null;
    this.mime = '';
    this.startedAt = Date.now();
    this.audioWhy = '';
    this.mutedAt = 0;
    this.mutedMs = 0;
    this.outputOn = false;
    this.outputSince = 0;
    this.outputMs = 0;
  }
  CallRecorder.prototype.attach = function (context, inputNode, outputNode) {
    try {
      this.mime = pickMime();
      if (!this.mime) { this.audioWhy = '此瀏覽器不支援錄音'; return false; }
      var dest = context.createMediaStreamDestination();
      var inputGain = context.createGain(); inputGain.gain.value = 1;
      var outputGain = context.createGain(); outputGain.gain.value = 1;
      inputNode.connect(inputGain); inputGain.connect(dest);
      outputNode.connect(outputGain); outputGain.connect(dest);
      this.recorder = new MediaRecorder(dest.stream, { mimeType: this.mime });
      var self = this;
      this.recorder.ondataavailable = function (event) { if (event.data && event.data.size) self.chunks.push(event.data); };
      this.recorder.start(1000);
      return true;
    } catch (error) { this.recorder = null; this.audioWhy = '錄音啟動失敗：' + (error && error.message || error); return false; }
  };
  CallRecorder.prototype.text = function (event) {
    var role = event.role === 'model' ? 'model' : 'user';
    var last = this.transcript[this.transcript.length - 1];
    if (!event.newLine && last && last.role === role) last.text += event.text;
    else this.transcript.push({ role: role, text: String(event.text || '') });
  };
  CallRecorder.prototype.mute = function (value) {
    var now = Date.now();
    if (value && !this.mutedAt) this.mutedAt = now;
    else if (!value && this.mutedAt) { this.mutedMs += now - this.mutedAt; this.mutedAt = 0; }
  };
  CallRecorder.prototype.outputLevel = function (level) {
    var now = Date.now();
    var on = level > 0.0008;
    if (on && !this.outputOn) { this.outputOn = true; this.outputSince = now; }
    else if (!on && this.outputOn) { this.outputOn = false; this.outputMs += now - this.outputSince; }
  };
  CallRecorder.prototype.finish = function () {
    var self = this;
    var now = Date.now();
    if (this.mutedAt) { this.mutedMs += now - this.mutedAt; this.mutedAt = 0; }
    if (this.outputOn) { this.outputMs += now - this.outputSince; this.outputOn = false; }
    var durationMs = Math.max(0, now - (this.startedAt || now));
    var inputMs = Math.max(0, durationMs - this.mutedMs);
    var stop = new Promise(function (resolve) {
      if (!self.recorder || self.recorder.state === 'inactive') { resolve(); return; }
      self.recorder.onstop = function () { resolve(); };
      setTimeout(resolve, 5000); // onstop 沒來也不能卡住整筆紀錄
      try { self.recorder.stop(); } catch (error) { resolve(); }
    });
    return stop.then(function () {
      var blob = self.chunks.length ? new Blob(self.chunks, { type: self.mime }) : null;
      return {
        model: self.model,
        transcript: self.transcript,
        durationSec: Math.round(durationMs / 1000),
        inputSec: Math.round(inputMs / 1000),
        outputSec: Math.round(self.outputMs / 1000),
        startedAt: self.startedAt ? new Date(self.startedAt).toISOString() : '',
        endedAt: new Date(now).toISOString(),
        blob: blob, mime: self.mime,
        audioWhy: blob ? '' : (self.audioWhy || '沒有錄到聲音資料')
      };
    });
  };
  function toBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(',')[1] || ''); };
      reader.onerror = function () { reject(new Error('錄音轉檔失敗')); };
      reader.readAsDataURL(blob);
    });
  }
  root.DFCallRecorder = CallRecorder;
  root.DFCallRecorderEncode = toBase64;
})(typeof window !== 'undefined' ? window : globalThis);
