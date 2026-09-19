/* 只顯示即時振幅，不保存聲音；收音與實際播放各自一條訊號。 */
(function () {
  'use strict';
  const labels = {
    idle: '尚未開啟麥克風', connecting: '正在連線，請稍候', testing: '本機測試中 · 不傳送聲音',
    sending: '收音串流傳送中', muted: '已靜音', paused: '音訊已暫停，請按「恢復音訊」',
    blocked: '系統暫停了麥克風，請檢查麥克風權限或靜音鍵',
    stalled: '沒有收到音訊資料，請結束後重新測試麥克風',
    quiet: '目前幾乎無聲；若正在說話，請換麥克風或檢查靜音鍵'
  };
  class Feedback {
    constructor(mode) {
      this.element = document.createElement('div');
      this.element.className = 'audio-feedback';
      this.element.innerHTML = '<div class="audio-tools"><label for="mic-' + mode + '">麥克風</label>' +
        '<select id="mic-' + mode + '"><option value="">系統預設麥克風</option></select>' +
        '<button type="button" data-test-mic>測試麥克風</button><button type="button" data-resume hidden>恢復音訊</button>' +
        '<span class="mic-device">開始後會顯示實際使用的裝置</span></div>' +
        '<div class="audio-meters"><div class="meter meter-user"><div class="meter-head"><b>你的聲音</b><span data-input-label>等待聲音</span></div>' +
        '<div class="input-wave" aria-hidden="true">' + '<i></i>'.repeat(24) + '</div></div>' +
        '<div class="meter meter-ai"><div class="meter-head"><b>Gemini 的聲音</b><span data-output-label>等待回覆</span></div>' +
        '<svg class="output-wave" viewBox="0 0 300 64" preserveAspectRatio="none" aria-hidden="true"><path class="wave-fill"/><path class="wave-line"/></svg></div></div>' +
        '<p class="mic-health" role="status">尚未開啟麥克風</p>';
      this.select = this.element.querySelector('select');
      this.deviceLabel = this.element.querySelector('.mic-device');
      this.test = this.element.querySelector('[data-test-mic]');
      this.resume = this.element.querySelector('[data-resume]');
      this.bars = Array.from(this.element.querySelectorAll('.input-wave i'));
      this.inputLabel = this.element.querySelector('[data-input-label]');
      this.outputLabel = this.element.querySelector('[data-output-label]');
      this.health = this.element.querySelector('.mic-health');
      this.user = this.element.querySelector('.meter-user');
      this.ai = this.element.querySelector('.meter-ai');
      this.fill = this.element.querySelector('.wave-fill');
      this.line = this.element.querySelector('.wave-line');
      this.level('input', { level: 0, bands: [] });
      this.level('output', { level: 0, bands: [] });
    }
    async devices() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      try {
        const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput' && d.deviceId);
        const selected = this.select.value;
        this.select.replaceChildren(new Option('系統預設麥克風', ''));
        devices.forEach((d, i) => this.select.add(new Option(d.label || '麥克風 ' + (i + 1), d.deviceId)));
        if (devices.some(d => d.deviceId === selected)) this.select.value = selected;
      } catch (error) { /* 沒有裝置清單時，仍可透過預設裝置開啟權限。 */ }
    }
    device(info) {
      this.deviceLabel.textContent = '使用中：' + info.label;
      this.devices();
    }
    lock(active, testing) {
      this.element.classList.toggle('in-call', active && !testing);
      this.select.disabled = active;
      this.test.disabled = active && !testing;
      this.test.textContent = testing ? '結束麥克風測試' : '測試麥克風';
      if (active && !this.active) this.state(testing ? 'testing' : 'connecting');
      this.active = active;
      if (!active) this.state('idle');
    }
    state(state) {
      if (state === this.currentState) return;
      this.currentState = state;
      this.health.textContent = labels[state] || labels.idle;
      this.health.classList.toggle('warning', ['quiet', 'stalled', 'blocked', 'paused'].includes(state));
      this.resume.hidden = state !== 'paused';
      if (['idle', 'muted', 'paused', 'stalled', 'blocked'].includes(state)) this.level('input', { level: 0, bands: [] });
    }
    level(kind, event) {
      const active = event.level > 0.003;
      const strength = Math.min(1, Math.sqrt(event.level * 6));
      if (kind === 'input') {
        this.user.classList.toggle('speaking', active);
        this.inputLabel.textContent = active ? '收到聲音' : this.currentState === 'muted' ? '已靜音' : '等待聲音';
        this.bars.forEach((bar, i) => {
          const height = active ? Math.max(strength * 0.3, Math.min(1, Math.sqrt((event.bands[i] || 0) * 5))) : 0;
          bar.style.height = (4 + height * 48) + 'px';
        });
      } else {
        this.ai.classList.toggle('speaking', active);
        this.outputLabel.textContent = active ? '正在播放聲音' : '等待回覆';
        const heights = Array.from({ length: 24 }, (_, i) => active ? Math.min(1, Math.sqrt((event.bands[i] || 0) * 5)) * 27 : 0);
        const upper = heights.map((h, i) => [(i + 1) * 12, 32 - h]);
        const lower = heights.map((h, i) => [(i + 1) * 12, 32 + h]).reverse();
        function curve(points) {
          let path = 'M0 32', previous = [0, 32];
          points.concat([[300, 32]]).forEach(point => {
            const middle = (previous[0] + point[0]) / 2;
            path += ' C' + middle + ' ' + previous[1] + ' ' + middle + ' ' + point[1] + ' ' + point.join(' ');
            previous = point;
          });
          return path;
        }
        this.line.setAttribute('d', curve(upper));
        this.fill.setAttribute('d', curve(upper) + ' L300 32 ' + lower.map(p => 'L' + p.join(' ')).join(' ') + ' L0 32 Z');
      }
    }
  }
  window.DFAIFeedback = Feedback;
})();
