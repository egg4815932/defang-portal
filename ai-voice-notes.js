/* 音色小筆記：依帳號保存，草稿按音色分開，不參與情境或 API 指令。 */
(function () {
  'use strict';
  window.DFAIVoiceNotes = function (rpc, activity) {
    let voice = 'Kore', saved = {}, drafts = {}, loaded = false, pending = false, locked = false, generation = 0;
    const element = document.createElement('div'); element.className = 'voice-notes wide';
    element.innerHTML = '<label><span data-note-title></span><textarea data-voice-note maxlength="1000" rows="3" placeholder="例如：聲音很溫柔，適合慢慢講解"></textarea></label>' +
      '<p class="note">這是你的音色小筆記，跟著帳號保存。換情境也能看到，不會送給 AI。每個音色最多 1,000 字。</p>' +
      '<div class="voice-note-actions"><button type="button" data-note-save>儲存此音色備註</button><button type="button" data-note-reload>重新載入備註</button></div><p class="note" role="status" data-note-status></p>';
    const find = s => element.querySelector(s), input = find('textarea'), status = find('[data-note-status]');
    const original = key => saved[key] ? saved[key].note : '';
    const changed = key => Object.hasOwn(drafts, key) && drafts[key] !== original(key);
    function controls() {
      input.disabled = locked || pending || !loaded;
      find('[data-note-save]').disabled = locked || pending || !loaded || !changed(voice);
      find('[data-note-reload]').disabled = locked || pending;
    }
    function select(value) {
      voice = value;
      find('[data-note-title]').textContent = value + ' 的備註';
      input.value = Object.hasOwn(drafts, value) ? drafts[value] : original(value);
      status.textContent = pending ? '處理備註中…' : !loaded ? '請載入音色備註' : changed(value) ? '此音色備註尚未儲存' : '此音色備註已同步';
      controls();
    }
    input.addEventListener('input', event => {
      event.stopPropagation(); drafts[voice] = input.value; status.textContent = '此音色備註尚未儲存'; controls(); activity();
    });
    async function load(force) {
      if (pending || loaded && !force) return;
      if (force && Object.keys(drafts).some(changed) && !window.confirm('重新載入會捨棄所有尚未儲存的音色備註，確定嗎？')) return;
      const version = generation; pending = true; select(voice);
      try {
        const result = await rpc({ action: 'list' });
        if (version !== generation) return;
        saved = Object.fromEntries(result.items.map(item => [item.voice, item])); drafts = {}; loaded = true;
        pending = false; select(voice);
      } catch (error) { if (version === generation) status.textContent = error.message + '；請重新載入備註'; }
      finally { if (version === generation) { pending = false; controls(); } }
    }
    find('[data-note-save]').onclick = async () => {
      const version = generation, key = voice, note = input.value;
      pending = true; status.textContent = '儲存備註中…'; controls(); activity();
      try {
        const result = await rpc({ action: 'save', voice: key, note, revision: saved[key] ? saved[key].revision : 0 });
        if (version !== generation) return;
        // 只更新本次音色，其他草稿保留原版本，避免覆蓋別的視窗更新。
        saved[key] = result.items.find(item => item.voice === key); delete drafts[key];
        pending = false; select(voice); status.textContent = key + ' 備註已儲存至你的帳號';
      } catch (error) { if (version === generation) status.textContent = error.message; }
      finally { if (version === generation) { pending = false; controls(); } }
    };
    find('[data-note-reload]').onclick = () => { activity(); load(true); };
    select(voice);
    return { element, select, load, lock: value => { locked = value; controls(); },
      reset: () => { generation++; saved = {}; drafts = {}; loaded = false; pending = false; locked = false; select('Kore'); } };
  };
})();
