/* 台灣中文串流檢查：以 AI 回覆轉錄判斷，不把文字檢查宣稱為聲音語言辨識。 */
(function (root) {
  'use strict';
  class LanguageGuard {
    constructor() { this.reset(); }
    reset() {
      this.text = ''; this.pendingText = ''; this.audio = []; this.bytes = 0;
      this.approved = false; this.blocked = false;
    }
    consume(content) {
      if (content.interrupted) { this.reset(); return { text: '', audio: [] }; }
      const done = !!content.turnComplete;
      const text = content.outputTranscription && content.outputTranscription.text || '';
      const audio = ((content.modelTurn && content.modelTurn.parts) || [])
        .filter(part => part.inlineData && /^audio\/pcm/.test(part.inlineData.mimeType || '')).map(part => part.inlineData);
      let rejected = false;
      if (!this.blocked) {
        this.text = (this.text + text).slice(-20000);
        this.pendingText += text;
        this.audio.push(...audio);
        this.bytes += audio.reduce((n, part) => n + part.data.length * 0.75, 0);
        const han = (this.text.match(/\p{Script=Han}/gu) || []).length;
        const foreign = this.text.replace(/[\p{Script=Han}\p{Script=Latin}]/gu, '').match(/\p{L}/gu) || [];
        const latinRuns = this.text.split(/\p{Script=Han}/u);
        const longForeignPhrase = latinRuns.some(run => run.length >= 48 && (run.match(/[A-Za-z]+/g) || []).length >= 8);
        const numeric = done && /\d/.test(this.text) && !/\p{L}/u.test(this.text);
        // 允許中文中的 Gemini、API 等短詞；未看見中文前暫不播放音訊。
        if (foreign.length >= 2 || longForeignPhrase || this.bytes > 480000 ||
            (done && !han && !numeric && (this.audio.length || this.text.trim()))) {
          this.blocked = true; rejected = true; this.audio = []; this.pendingText = ''; this.bytes = 0;
        } else if (han >= 2 || (done && han) || numeric) this.approved = true;
      }
      const result = { text: '', audio: [], rejected, blocked: this.blocked,
        retry: done && this.blocked, waiting: !this.approved && this.audio.length > 0 };
      if (this.approved && !this.blocked) {
        result.text = this.pendingText; result.audio = this.audio;
        this.pendingText = ''; this.audio = []; this.bytes = 0;
      }
      if (done) this.reset();
      return result;
    }
  }
  root.DFLanguageGuard = LanguageGuard;
  if (typeof module !== 'undefined' && module.exports) module.exports = LanguageGuard;
})(typeof window !== 'undefined' ? window : globalThis);
