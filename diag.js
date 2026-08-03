// 臨時診斷：找「側邊一條用不到的黑」用的，修好後連同 index.html 的區塊一起刪掉。
// ⚠ 由 index.html 以 diag.js?t=<時間戳> 載入 —— GitHub Pages 的 Cache-Control 是
//    max-age=600（10 分鐘），而全螢幕 PWA 沒有網址列可以強制重整。帶時間戳等於每次
//    都是新網址，我改完你立刻看得到，不必等快取過期。
(function(){
  // 用一個 fixed 探針把 env(safe-area-inset-*) 換算成看得到的 px
  var probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;' +
    'padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px);' +
    'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
  document.body.appendChild(probe);

  var out = document.getElementById('diagOut');
  function n(v){ return Math.round(parseFloat(v) || 0); }

  function snap(){
    var cs = getComputedStyle(probe);
    var f  = document.querySelector('iframe').getBoundingClientRect();
    var vv = window.visualViewport || {};
    return {
      sw: screen.width, sh: screen.height,
      iw: innerWidth,   ih: innerHeight,
      ow: outerWidth,   oh: outerHeight,
      vw: n(vv.width),  vh: n(vv.height), vo: n(vv.offsetLeft),
      sl: n(cs.paddingLeft), sr: n(cs.paddingRight),
      st: n(cs.paddingTop),  sb: n(cs.paddingBottom),
      fx: n(f.left), fy: n(f.top), fw: n(f.width), fh: n(f.height),
      dm: ['fullscreen','standalone','minimal-ui','browser'].filter(function(m){
            return matchMedia('(display-mode:' + m + ')').matches; }).join(',') || '?',
      fs: !!(document.fullscreenElement || document.webkitFullscreenElement)
    };
  }

  function verdict(s){
    var gap = Math.round(s.sw - s.iw);
    return gap > 1 ? '[A] 視窗比螢幕窄 ' + gap + 'px -> 沒拿到挖孔區'
         : (s.sl || s.sr ? '[B] 蓋滿螢幕 + 安全區 L' + s.sl + '/R' + s.sr + ' -> 拿到挖孔區了'
                         : '[C] 蓋滿螢幕且無安全區');
  }

  var before = null, fsErr = '';

  function render(){
    var s = snap();
    var t = verdict(s) + '\n' +
      'screen ' + s.sw + 'x' + s.sh + '  dpr ' + devicePixelRatio +
        '   inner ' + s.iw + 'x' + s.ih + '   outer ' + s.ow + 'x' + s.oh + '\n' +
      'visualVP ' + s.vw + 'x' + s.vh + ' offL ' + s.vo +
        '   safe L' + s.sl + ' R' + s.sr + ' T' + s.st + ' B' + s.sb + '\n' +
      'iframe x' + s.fx + ' y' + s.fy + ' w' + s.fw + ' h' + s.fh +
        '   mode ' + s.dm + '   FS-API ' + (s.fs ? 'ON' : 'off');
    if (before) {
      t += '\n--------- 前後對照 ---------\n' +
           'FS 前   inner ' + before.iw + '   safeL ' + before.sl + '\n' +
           'FS 後   inner ' + s.iw + '   safeL ' + s.sl + '   ' +
           (s.iw > before.iw || s.sl > 0 ? '==> 有效！Fullscreen API 拿得到'
                                         : '==> 沒變，這條路不通');
    }
    if (fsErr) t += '\nFS 錯誤: ' + fsErr;
    out.textContent = t;
  }

  render();
  addEventListener('resize', render);
  addEventListener('orientationchange', function(){ setTimeout(render, 300); });
  document.addEventListener('fullscreenchange', function(){ setTimeout(render, 400); });
  if (window.visualViewport) visualViewport.addEventListener('resize', render);

  // 測試：分頁進入 Fullscreen API，看 Chrome 會不會改用 SHORT_EDGES 挖孔模式
  document.getElementById('fsBtn').addEventListener('click', function(){
    before = snap(); fsErr = '';
    var el = document.documentElement, p = null;
    try {
      if (el.requestFullscreen)            p = el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) p = el.webkitRequestFullscreen();
      else fsErr = '這個瀏覽器沒有 requestFullscreen';
    } catch (err) { fsErr = String(err && err.message || err); }
    if (p && p['catch']) p['catch'](function(err){
      fsErr = String(err && err.message || err); render();
    });
    setTimeout(render, 600);
    setTimeout(render, 1600);
  });

  document.getElementById('diagHide').addEventListener('click', function(){
    document.getElementById('diagBox').style.display = 'none';
    document.getElementById('edgeMark').style.display = 'none';
  });
})();
