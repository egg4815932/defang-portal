/* 通話中保持螢幕常亮：手機自動暗螢幕會讓頁面進背景、通話被掛斷。自己按電源鍵仍會掛斷（網頁做不到背景收音）。
 * 只包兩個通話 client 的 start／stop，不改它們的內容；不支援 Wake Lock 的瀏覽器維持原行為。 */
(function () {
  'use strict';
  if (!navigator.wakeLock || !navigator.wakeLock.request) return;
  let lock = null, pending = false, active = null;
  function acquire(client) {
    active = client;
    if (lock || pending || document.hidden) return;
    pending = true;
    navigator.wakeLock.request('screen').then(sentinel => {
      pending = false;
      if (!active) { sentinel.release().catch(() => {}); return; }
      lock = sentinel;
      sentinel.addEventListener('release', () => { if (lock === sentinel) lock = null; });
    }, error => {
      pending = false;
      console.warn('[AI 通話] 無法保持螢幕常亮：' + (error && (error.name + ' ' + error.message)));
    });
  }
  function release(client) {
    if (active !== client) return;
    active = null;
    if (lock) { const held = lock; lock = null; held.release().catch(() => {}); }
  }
  ['DFLiveClient', 'DFOpenAILiveClient'].forEach(name => {
    const Client = window[name];
    if (!Client) return;
    const start = Client.prototype.start, stop = Client.prototype.stop;
    // start 開頭會同步先呼叫 stop，所以先跑原本的 start 再上鎖，順序才不會被自己放掉。
    Client.prototype.start = function () { const result = start.apply(this, arguments); acquire(this); return result; };
    Client.prototype.stop = function () { const result = stop.apply(this, arguments); release(this); return result; };
  });
})();
