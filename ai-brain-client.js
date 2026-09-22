/* GPT-Live client delegation 的大腦端：拼對話、問 GAS、把答案送回去唸。
   只在情境選了 Gemini 大腦時才會被建立；OpenAI 大腦完全不經過這裡。 */
(function (root) {
  'use strict';
  var MAX_TURNS = 40;
  // 字幕還在長就再等一下，避免拿半句話去問；但最多不讓它拖過 1.5 秒。
  var SETTLE_MS = 350, MAX_WAIT_MS = 1500;

  function BrainClient(ask, notify) {
    this.ask = ask; this.notify = notify || function () {};
    this.history = []; this.pending = null; this.busy = false;
    this.timer = null; this.deadline = 0; this.seq = 0; this.announced = false;
  }
  BrainClient.prototype.note = function (role, text, newLine) {
    if (typeof text !== 'string' || !text) return;
    var last = this.history[this.history.length - 1];
    if (last && last.role === role && !newLine) last.text += text;
    else this.history.push({ role: role, text: text });
    if (this.history.length > MAX_TURNS) this.history.splice(0, this.history.length - MAX_TURNS);
    if (this.pending) this.schedule();
  };
  BrainClient.prototype.request = function (delegationId, send) {
    if (typeof delegationId !== 'string' || !delegationId) return;
    // 使用者又開口時會有新的 delegation：舊的直接換掉，不要排隊唸過期的答案。
    this.pending = { id: delegationId, send: send };
    this.deadline = Date.now() + MAX_WAIT_MS;
    this.schedule();
  };
  BrainClient.prototype.schedule = function () {
    var self = this;
    clearTimeout(this.timer);
    this.timer = setTimeout(function () { self.flush(); }, Math.max(0, Math.min(SETTLE_MS, this.deadline - Date.now())));
  };
  BrainClient.prototype.flush = function () {
    var self = this, job = this.pending;
    // getTicket 只有一個等待槽，同時送兩個會互相蓋掉，所以一次只飛一個。
    if (!job || this.busy) return;
    var turns = [];
    this.history.forEach(function (t) { if (t.text.trim()) turns.push({ role: t.role, text: t.text.trim() }); });
    if (!turns.length || turns[turns.length - 1].role !== 'user') {
      // 字幕還沒把使用者那句收進來；等下一次 note 再觸發，逾時就放棄這輪。
      if (Date.now() < this.deadline) { this.schedule(); return; }
      this.pending = null; return;
    }
    this.pending = null; this.busy = true;
    this.ask({ action: 'brain', history: turns }).then(function (result) {
      var text = result && typeof result.text === 'string' ? result.text.trim() : '';
      if (!text) throw new Error('大腦沒有回覆內容');
      // 第一次接上報一次型號：不然使用者無法分辨是大腦回的還是語音層自己講的。
      if (!self.announced) {
        self.announced = true;
        var actual = result.model || '未知模型', asked = result.requested;
        self.notify('大腦已接上：' + actual + (asked && asked !== actual ? '（你選的是 ' + asked + '，Google 實際給的是前面那個）' : ''));
      }
      if (result.searched > 0) self.notify('大腦查了網路（' + result.searched + ' 次搜尋）');
      // 使用者已經又說話了，這個答案就過期了，不要硬唸。
      if (self.pending) return;
      job.send({ type: 'session.commentary.append', event_id: 'brain_' + (++self.seq) + '_' + Date.now(), delegation_id: job.id, content: text });
    }).catch(function (error) {
      // 靜默失敗會讓通話莫名安靜，一定要讓畫面說得出原因。
      self.notify('大腦沒有回覆：' + (error && error.message ? error.message : '未知錯誤'));
    }).then(function () {
      self.busy = false;
      if (self.pending) self.schedule();
    });
  };
  BrainClient.prototype.reset = function () {
    clearTimeout(this.timer);
    this.history = []; this.pending = null; this.busy = false; this.deadline = 0; this.announced = false;
  };
  root.DFBrainClient = BrainClient;
})(typeof window !== 'undefined' ? window : globalThis);
