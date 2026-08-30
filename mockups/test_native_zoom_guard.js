const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const earlyIphoneClass = html.indexOf("document.documentElement.classList.add('iphone-device')");
const styleStart = html.indexOf('<style>');
const appFrame = html.indexOf('<iframe');
const checks = [
  ['最外層 viewport 鎖定 1 倍', /initial-scale=1,minimum-scale=1,maximum-scale=1,user-scalable=no/.test(html)],
  ['殼頁 root touch-action 禁止原生 pinch', /html,body\{[\s\S]*?touch-action:pan-x pan-y/.test(html)],
  ['touchstart/touchmove 多指守門', ['touchstart', 'touchmove'].every(event => html.includes(`addEventListener('${event}', 擋多指, { passive: false, capture: true })`))],
  ['iOS gesture 守門完整', ['gesturestart', 'gesturechange', 'gestureend'].every(event => html.includes(`addEventListener('${event}', 擋縮放`))],
  ['Ctrl+滾輪縮放守門', /addEventListener\('wheel',[\s\S]*?e\.ctrlKey/.test(html)],
  ['viewport 方向與安全區同步仍保留', /visualViewport\.addEventListener\('resize', scheduleViewportInsets\)/.test(html)],
  ['iPad 合成 guard 維持 16px', /html\.ios-device:not\(\.iphone-device\)\{\s*--app-overscan-guard:16px/.test(html)],
  ['iPhone guard 維持舊版 4px', /html\.ios-device\.iphone-device\{\s*--app-overscan-guard:4px/.test(html)],
  ['iPhone standalone 底部 fallback 維持 20px', /html\.ios-device\.ios-standalone,[\s\S]*?--app-bottom-inset:max\(env\(safe-area-inset-bottom,0px\),20px\)/.test(html)],
  ['iPhone class 在 style 與 iframe 建立前掛上', earlyIphoneClass >= 0 && earlyIphoneClass < styleStart && earlyIphoneClass < appFrame],
  ['iPhone 縮放移到一般外層容器', /html\.iphone-device #appFrameViewport\{[\s\S]*?transform:scale\(var\(--app-scale\)\);[\s\S]*?transform-origin:0 0;[\s\S]*?\}/.test(html)],
  ['iPhone iframe 本身不再 transform', /html\.iphone-device iframe\{\s*position:static;top:auto;left:auto;width:100%;height:100%;transform:none\s*\}/.test(html)],
  ['iframe 已由專用外層容器包住', /<div id="appFrameViewport">\s*<iframe[\s\S]*?<\/iframe>\s*<\/div>/.test(html)],
  ['iPad iframe absolute 合成基準未動', /iframe\{\s*display:block;position:absolute;top:0;left:0;width:100%;height:100%/.test(html)],
  ['iPad guard 不回報、iPhone 回報完整裁切', /var reportedGuard = 是iPhone裝置 \? 0 : overscanGuard;/.test(html)],
  ['裁切值使用裝置分流後的 guard', /rect\.bottom - viewportHeight - reportedGuard/.test(html)],
  ['已移除無效的安全區中心偏移', !['centerOffsetX', '--shell-center-x', '--app-safe-left', '--app-safe-right'].some(marker => html.includes(marker))]
];

let passed = 0;
for (const [name, ok] of checks) {
  if (ok) passed++;
  console.log(`${ok ? '✅' : '❌'} ${name}`);
}
console.log(`\n${passed} / ${checks.length} 項通過`);
if (passed !== checks.length) process.exit(1);
