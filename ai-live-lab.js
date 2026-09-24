/* GPT-Live 實驗面板：情境打勾才出現，手動試通話中的背景管道；不碰收音、播放與設定管線。 */
(function () {
  'use strict';
  const channels = [
    ['rule', '加規則', 'session.instructions.append：在說明書後面加一條，AI 自己決定怎麼講'],
    ['quiet', '安靜補資料', 'session.thinking.append：AI 參考用，不會說出來'],
    ['say', '給它講', 'session.commentary.append：AI 會改寫後說出來，不是照念'],
    ['ask', '偷問大腦', 'response.item.create＋response.create：塞一句話給大腦，大腦回答後 AI 說出來']
  ];
  const css = '.lab-dialog textarea{width:100%;min-height:84px;box-sizing:border-box;font:inherit;padding:10px;border:1px solid #c5ddce;border-radius:12px;resize:vertical}' +
    '.lab-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.lab-actions button{padding:10px 8px;border-radius:12px}' +
    '.lab-actions small{display:block;font-size:11px;opacity:.75;font-weight:400;margin-top:2px}' +
    '.lab-usage{font-size:13px;margin:6px 0}.lab-log{list-style:none;margin:0;padding:0;font-size:12px;max-height:40vh;overflow:auto}' +
    '.lab-log li{padding:6px 0;border-top:1px solid #dbe9df;word-break:break-word}.lab-log .bad{color:#b3261e}.lab-log .good{color:#1f7a3a}' +
    '[data-lab-open].lab-on{font-weight:700}';
  window.DFAILab = function (view) {
    const page = view.page, header = page.querySelector('header');
    const style = document.createElement('style'); style.textContent = css; page.append(style);
    const dialog = document.createElement('dialog'); dialog.className = 'utility-dialog lab-dialog'; dialog.setAttribute('aria-label', '實驗面板');
    dialog.innerHTML = '<div class="settings-head"><h2>實驗面板</h2><button type="button" data-panel-close aria-label="關閉實驗面板">✕</button></div>' +
      '<div class="utility-content"><textarea maxlength="400" placeholder="要送的文字（單則上限 500 token，這裡限 400 字）"></textarea>' +
      '<div class="lab-actions"></div><p class="lab-usage">上下文用量：通話中約每分鐘更新一次</p>' +
      '<p class="note">「偷問大腦」OpenAI 不會回傳收到通知，成功與否要聽 AI 有沒有回答。</p><ol class="lab-log" aria-live="polite"></ol></div>';
    const text = dialog.querySelector('textarea'), log = dialog.querySelector('.lab-log'), usage = dialog.querySelector('.lab-usage');
    const buttons = {};
    channels.forEach(([kind, label, hint]) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.lab = kind;
      b.innerHTML = label + '<small></small>'; b.querySelector('small').textContent = hint.split('：')[1]; b.title = hint;
      b.onclick = () => { if (view.client.lab) view.client.lab(kind, text.value); else line('這個模型沒有實驗面板', 'bad'); };
      buttons[kind] = b; dialog.querySelector('.lab-actions').append(b);
    });
    dialog.querySelector('[data-panel-close]').onclick = () => dialog.close();
    page.append(dialog);
    const open = document.createElement('button'); open.type = 'button'; open.dataset.labOpen = ''; open.textContent = '實驗';
    open.title = '實驗面板'; open.hidden = true; open.onclick = () => { if (!dialog.open) dialog.showModal(); };
    header.insertBefore(open, header.querySelector('[data-audio-tools]'));
    function line(message, tone) {
      const li = document.createElement('li'); if (tone) li.className = tone;
      li.textContent = new Date().toLocaleTimeString('zh-TW', { hour12: false }) + '  ' + message;
      log.prepend(li); while (log.children.length > 40) log.lastChild.remove();
    }
    const names = Object.fromEntries(channels.map(([kind, label]) => [kind, label]));
    return {
      // 每次開始通話呼叫：on＝本通後端有開實驗白名單；ownBrain＝Gemini 大腦，偷問大腦不適用。
      session(on, ownBrain) {
        open.hidden = !on; open.classList.toggle('lab-on', on);
        buttons.ask.disabled = !!ownBrain; buttons.ask.title = ownBrain ? 'Gemini 大腦由我們自己接，偷問大腦不適用' : channels[3][2];
        usage.textContent = '上下文用量：通話中約每分鐘更新一次';
        if (!on && dialog.open) dialog.close();
        if (on) line('開始新通話，實驗管道已開', 'good');
      },
      event(value) {
        if (!value || typeof value !== 'object') return;
        if (value.kind === 'sent') {
          if (value.why) line('沒送出（' + (names[value.channel] || value.channel) + '）：' + value.why, 'bad');
          else line('已送出 ' + (names[value.channel] || value.channel) + '：' + (value.types || []).join('＋'));
        } else if (value.kind === 'ack') line('OpenAI 已接受：' + value.type, 'good');
        else if (value.kind === 'error') line('OpenAI 拒絕：' + [value.code, value.message].filter(Boolean).join(' · '), 'bad');
        else if (value.kind === 'usage') {
          const ratio = value.ratio == null ? NaN : Number(value.ratio), seconds = value.seconds == null ? NaN : Number(value.seconds);
          usage.textContent = '上下文用量：' + (Number.isFinite(ratio) ? Math.round(ratio * 1000) / 10 + '%' : 'OpenAI 沒回報') +
            (Number.isFinite(seconds) ? '（通話 ' + Math.floor(seconds / 60) + ' 分 ' + Math.round(seconds % 60) + ' 秒）' : '');
        }
      }
    };
  };
})();
