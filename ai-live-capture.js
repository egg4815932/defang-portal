/* 手動取樣最後的 16 kHz PCM；只加 WAV 標頭，不重錄、不正規化音量。 */
(function (root) {
  'use strict';
  const MAX_BYTES = 16000 * 2 * 15;
  function wav(chunks, size) {
    const header = new ArrayBuffer(44), view = new DataView(header);
    function text(offset, value) { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); }
    text(0, 'RIFF'); view.setUint32(4, 36 + size, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true); view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, size, true);
    return new Blob([header].concat(chunks), { type: 'audio/wav' });
  }
  class Capture {
    constructor(start, done) {
      this.done = done;
      this.element = document.createElement('details');
      this.element.className = 'audio-review';
      this.element.innerHTML = '<summary>送出音訊檢查</summary><div class="review-body">' +
        '<p class="note">手動取樣最多 15 秒，只暫存在此頁；關閉、換模型或登出即清除。</p>' +
        '<div class="review-buttons"><button type="button" data-record>錄下 15 秒供試聽</button>' +
        '<button type="button" data-finish hidden>停止取樣</button><button type="button" data-clear hidden>清除音檔</button></div>' +
        '<p class="review-status" role="status" aria-live="polite">通話前可做本機試錄；通話中可取樣實際送出的聲音。</p>' +
        '<audio controls preload="metadata" aria-label="送出前音訊試聽" hidden></audio>' +
        '<p class="note">音檔不另外放大；播放時的喇叭音量仍會影響聽感。</p></div>';
      this.record = this.element.querySelector('[data-record]');
      this.finishButton = this.element.querySelector('[data-finish]');
      this.clearButton = this.element.querySelector('[data-clear]');
      this.status = this.element.querySelector('.review-status');
      this.audio = this.element.querySelector('audio');
      this.record.onclick = start;
      this.finishButton.onclick = () => this.finish();
      this.clearButton.onclick = () => this.clear();
      this.audio.onplay = () => { if (this.busy) this.audio.pause(); };
      this.chunks = []; this.size = 0;
    }
    lock(busy, available) {
      this.busy = busy;
      this.record.disabled = busy && !available;
      if (busy) this.audio.pause();
      this.audio.hidden = busy || !this.url;
      if (this.url && !this.active) this.status.textContent = this.result + (busy ? '；結束通話或測試後即可播放。' : '；按播放聽看看。');
    }
    start(sent) {
      this.clear();
      this.sent = sent; this.active = true;
      this.record.hidden = true; this.finishButton.hidden = false;
      this.status.textContent = sent ? '取樣中：保留實際送出的聲音，通話照常進行。' : '本機試錄中：與通話相同的收音處理，不傳送給 Gemini。';
      this.timer = setTimeout(() => this.finish(), 15000);
    }
    add(event) {
      if (!this.active || event.sent !== this.sent) return;
      const copy = event.buffer.slice(0, MAX_BYTES - this.size);
      this.chunks.push(copy); this.size += copy.byteLength;
      if (this.size >= MAX_BYTES) this.finish();
    }
    finish() {
      if (!this.active) return;
      this.active = false; clearTimeout(this.timer);
      this.record.hidden = false; this.finishButton.hidden = true;
      if (this.size) {
        this.url = URL.createObjectURL(wav(this.chunks, this.size));
        this.audio.src = this.url;
        this.audio.volume = 1; this.audio.playbackRate = 1;
        this.clearButton.hidden = false;
        this.result = (this.sent ? '實際送出取樣' : '本機處理後音訊（未送出）') + ' ' + (this.size / 32000).toFixed(1) + ' 秒';
        this.lock(this.busy, !this.record.disabled);
      } else this.status.textContent = '沒有收到可取樣的音訊，請先確認麥克風再試一次。';
      this.chunks = [];
      this.done();
    }
    clear() {
      this.active = false; clearTimeout(this.timer);
      this.chunks = []; this.size = 0;
      this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); this.audio.hidden = true;
      if (this.url) URL.revokeObjectURL(this.url);
      this.url = ''; this.result = '';
      this.record.hidden = false; this.finishButton.hidden = true; this.clearButton.hidden = true;
      this.status.textContent = '通話前可做本機試錄；通話中可取樣實際送出的聲音。';
    }
  }
  root.DFAICapture = Capture;
  if (typeof module !== 'undefined' && module.exports) module.exports = { wav: wav };
})(typeof window !== 'undefined' ? window : globalThis);
