/* 德芳內部查詢系統 — 殼頁 service worker
   ============================================================================
   ⚠⚠ 這支 SW 存在的唯一理由是「讓 Android 能一鍵安裝」⚠⚠

   Chrome 要發出 beforeinstallprompt（＝我們攔下來、按安裝鈕才跳出的那個原生安裝視窗），
   網站必須符合它的安裝條件，其中一項是「有註冊 service worker 且具備 fetch handler」。
   沒有它的話，使用者只能自己從瀏覽器選單「安裝應用程式」。

   ⛔⛔ 這支 SW 刻意「一個位元組都不快取」⛔⛔
   本專案原本刻意不做 SW，理由是**怕快取住 GAS 的內容，改了程式卻看不到**。
   所以這裡只做 pass-through：把請求原封不動交給網路，不寫 Cache Storage、不攔截回應內容。
   → 殼頁與 GAS 的更新行為與加這支之前完全相同。
   **任何人想在這裡加快取之前，先去看專案 CLAUDE.md 裡那條踩過的坑。**

   附帶說明：它的 scope 只有 /defang-portal/，攔得到的僅有殼頁自己的
   index.html / manifest.json / icon-*.png。GAS 那個 iframe 是別的網域，
   本來就不會經過這支 SW。
   ============================================================================ */

// 裝好立刻接手，不必等使用者關掉所有分頁（避免「裝了卻要等下次才生效」）
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
  /* 只轉發、不快取。
     ⚠ 寫成明確的 respondWith(fetch(...)) 而不是空的 handler：
       空 handler 會被 Chrome 判定成 no-op 而可能不算數，安裝條件就白做了。
     ⚠ 失敗時原樣把錯誤丟回去，讓瀏覽器顯示它平常的離線頁面
       （這頁本來就需要網路才能用，SW 不該假裝自己能離線運作）。 */
  /* 導覽頁必須略過 GitHub Pages 的 HTTP 快取，否則已安裝的 iOS App
     會在發布後數分鐘仍開到舊 index.html，看起來就像修正完全沒生效。 */
  var options = event.request.mode === 'navigate' ? { cache: 'no-store' } : undefined;
  event.respondWith(fetch(event.request, options));
});
