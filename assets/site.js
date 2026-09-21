/* Distill 站点交互：鼠标跟随聚光灯
 *
 * 设计见 docs/superpowers/specs/2026-09-19-frontend-spotlight-redesign-design.md
 *
 * 三条硬约束：
 * 1. 没有脚本时必须仍然可用 —— 卡片亮度靠 CSS 里 --near 的默认值 1 兜底，
 *    本脚本只负责把它往下压，不负责初始化。
 * 2. 性能 —— 首页有 50 张卡片，/process 有 761 行表格。
 *    矩形只在必要时测量（绝不在每帧里调 getBoundingClientRect），
 *    每帧只对与视口相交的元素写变量。
 * 3. 尊重 prefers-reduced-motion —— 不做缓动循环，只保留悬停与焦点反馈。
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 缓动跟随 ---------- */
  var K = 0.13;                       // 缓动系数：越小越"拖"，越大越"贴"
  var tx = window.innerWidth / 2;     // 目标点（指针位置）
  var ty = window.innerHeight * 0.26;
  var mx = tx, my = ty;               // 当前点（缓动后）

  /* ---------- 卡片级高光 ---------- */
  // /process 的表格行（761 行）刻意不参与，只有卡片、漏斗行与统计块参与
  var SELECTOR = '.card, .funnel-row, .stat';
  var nodes = [];
  var rects = [];                     // 文档坐标（不随滚动变化）
  var dirty = true;

  function collect() {
    nodes = Array.prototype.slice.call(document.querySelectorAll(SELECTOR));
    rects = new Array(nodes.length);
    dirty = true;
  }

  function measure() {
    if (!dirty || !nodes.length) return;
    var sx = window.scrollX, sy = window.scrollY;
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect();
      rects[i] = {
        l: r.left + sx, t: r.top + sy, w: r.width, h: r.height
      };
    }
    dirty = false;
  }

  function paintCards() {
    var sx = window.scrollX, sy = window.scrollY;
    var vx = mx + sx, vy = my + sy;
    var top = sy - 240, bottom = sy + window.innerHeight + 240;  // 视口上下留缓冲
    for (var i = 0; i < nodes.length; i++) {
      var r = rects[i], el = nodes[i];
      if (!r) continue;
      if (r.t > bottom || r.t + r.h < top) continue;             // 屏外直接跳过
      var cx = r.l + r.w / 2, cy = r.t + r.h / 2;
      var d = Math.sqrt((vx - cx) * (vx - cx) + (vy - cy) * (vy - cy));
      el.style.setProperty('--lx', (vx - r.l).toFixed(0) + 'px');
      el.style.setProperty('--ly', (vy - r.t).toFixed(0) + 'px');
      el.style.setProperty('--near', Math.max(0, 1 - d / 520).toFixed(3));
    }
  }

  /* ---------- 主循环 ---------- */
  var raf = 0;

  function frame() {
    mx += (tx - mx) * K;
    my += (ty - my) * K;
    root.style.setProperty('--mx', mx.toFixed(1) + 'px');
    root.style.setProperty('--my', my.toFixed(1) + 'px');
    measure();
    paintCards();
    raf = window.requestAnimationFrame(frame);
  }

  function start() {
    if (!raf) raf = window.requestAnimationFrame(frame);
  }

  /* ---------- 输入 ---------- */
  // pointermove 同时覆盖鼠标、触屏与手写笔：触屏上手指拖动即移动光斑
  window.addEventListener('pointermove', function (e) {
    tx = e.clientX;
    ty = e.clientY;
  }, { passive: true });

  /* ---------- 失效与重测 ---------- */
  // 位置只在布局变化时改变，因此不按帧测量：
  //   - 窗口尺寸变化
  //   - body 高度变化（例如 /process 的筛选把行隐藏掉，下方元素整体上移）
  //   - 筛选下拉变化（同一原因的显式兜底）
  var reTimer = 0;
  function invalidate() {
    dirty = true;
  }
  function invalidateDebounced() {
    window.clearTimeout(reTimer);
    reTimer = window.setTimeout(invalidate, 120);
  }

  window.addEventListener('resize', invalidateDebounced, { passive: true });

  if (window.ResizeObserver) {
    try {
      new window.ResizeObserver(invalidate).observe(document.body);
    } catch (err) { /* 老浏览器忽略即可，resize 兜底 */ }
  }

  document.addEventListener('change', function (e) {
    if (e.target && e.target.tagName === 'SELECT') invalidateDebounced();
  });

  /* ---------- 启动 ---------- */
  function boot() {
    collect();
    measure();
    if (reduceMotion) {
      // 不做缓动循环：把光斑放到默认位置，交回 CSS 的静态观感
      root.style.setProperty('--mx', '50vw');
      root.style.setProperty('--my', '26vh');
      return;
    }
    start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
