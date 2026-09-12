/* ============================================================
   rewind.js —— 星辰回溯（本作的核心创新机制）
   ------------------------------------------------------------
   设定：星辰水晶碎裂后，碎片里还残留着"时间"。小星冒险家握着碎片，
   可以把时间往回拨几秒 —— 但每拨一次，碎片就暗一分。

   两个机制：
   1) 星辰回溯：按住 R 让时间倒流，敌人、金币、砖块、计时器全部回到从前。
      跳失误了、被怪撞了、掉坑了，都能拨回来。
   2) 残影之桥：倒流时你"退回去"的那条轨迹会留下残影，倒流结束后
      残影凝成一段临时平台，持续 4 秒。
      —— 换句话说：你摔下去的那条抛物线，会变成你下一次过坑的桥。

   实现要点：
   · 快照只存扁平字段（本作实体没有嵌套状态），所以浅拷贝就够
   · 残影平台不写进 lv.tiles，而是单独一张表 —— 否则会被后续快照
     录进去，回溯时和地形搅在一起。碰撞通过 solidAt() 单独接入。
   ============================================================ */
(function (PG) {
  'use strict';

  var TILE = PG.TILE, T = PG.T, ROWS = PG.ROWS, VW = PG.VIEW_W, VH = PG.VIEW_H;

  var MAX_SNAP    = 150;    // 历史长度：150 帧 @30Hz = 5 秒
  var REC_EVERY   = 2;      // 每 2 个逻辑帧记录一次（30Hz）
  var POP_PER_STEP= 2;      // 回溯时每逻辑帧回退 2 帧 = 2 倍速
  var DRAIN       = 0.35;   // 回溯每秒消耗的能量
  var TRICKLE     = 0.010;  // 平时每秒自动回一点能量（保底不卡死）
  var ECHO_LIFE   = 4.0;    // 残影平台存活时间
  var ECHO_MAX    = 26;     // 一次回溯最多凝出多少块残影
  var START_ENERGY= 0.65;

  var R = PG.rewind = {
    energy: START_ENERGY,
    buf: [],
    recTick: 0,
    active: false,
    activeT: 0,
    echo: [],
    trail: [],
    pops: 0,
    uses: 0,
    rescues: 0
  };

  /* ---------------- 快照 / 还原 ---------------- */
  function snap(G) {
    var lv = G.lv;
    return {
      p: Object.assign({}, G.player),
      ents: G.ents.map(function (e) { return { r: e, c: Object.assign({}, e) }; }),
      tiles: lv.tiles.slice(),
      payload: Object.assign({}, lv.payload),
      crumble: Object.assign({}, lv.crumble || {}),
      coins: G.coins, stars: G.stars, score: G.score, time: G.time,
      camx: G.cam.x, starTaken: Object.assign({}, G.starTaken),
      bump: Object.assign({}, G.bumpAnims),
      dark: G.dark, fogT: G.fogT
    };
  }

  function restore(G, s) {
    var lv = G.lv;
    lv.tiles.set(s.tiles);
    lv.payload = Object.assign({}, s.payload);
    lv.crumble = Object.assign({}, s.crumble);

    G.coins = s.coins; G.stars = s.stars; G.score = s.score; G.time = s.time;
    G.cam.x = s.camx;
    G.starTaken = Object.assign({}, s.starTaken);
    G.bumpAnims = Object.assign({}, s.bump);
    G.dark = s.dark; G.fogT = s.fogT;

    // 实体：把快照里的字段写回原对象；当时活着的重新挂回列表
    var live = [];
    for (var i = 0; i < s.ents.length; i++) {
      var it = s.ents[i];
      Object.assign(it.r, it.c);
      if (!it.r.dead) live.push(it.r);
    }
    G.ents = live;

    Object.assign(G.player, s.p);
    G.player.riding = null;
    G.player.alive = true;
  }

  /* ---------------- 对外接口 ---------------- */

  /* 换关 / 重开：历史作废，残影清空，能量重置 */
  R.reset = function (energy) {
    R.buf.length = 0;
    R.echo.length = 0;
    R.trail.length = 0;
    R.recTick = 0;
    R.active = false;
    R.activeT = 0;
    R.pops = 0;
    R.energy = energy == null ? START_ENERGY : energy;
  };

  R.gain = function (n) {
    R.energy = PG.clamp(R.energy + n, 0, 1);
  };

  R.can = function () {
    return !R.active && R.energy > 0.02 && R.buf.length > 2;
  };

  /* 记录当前状态（正常游玩时每帧调用） */
  R.record = function (G, dt) {
    R.energy = PG.clamp(R.energy + TRICKLE * dt, 0, 1);
    if (++R.recTick < REC_EVERY) return;
    R.recTick = 0;
    R.buf.push(snap(G));
    while (R.buf.length > MAX_SNAP) R.buf.shift();
  };

  R.start = function (G) {
    R.active = true;
    R.activeT = 0;
    R.pops = 0;
    R.trail.length = 0;
    R.uses++;
    PG.audio.sfx('rewind');
    G.msg = '星辰回溯'; G.msgT = 1.0;
  };

  /* 回退一个逻辑帧。返回 false 表示回溯该结束了 */
  R.step = function (G, dt) {
    if (R.energy <= 0 || R.buf.length === 0) return false;
    var popped = 0;
    for (var i = 0; i < POP_PER_STEP && R.buf.length > 0; i++) {
      restore(G, R.buf.pop());
      popped++;
      R.pops++;
      if (R.pops % 3 === 0) sampleTrail(G);
    }
    if (!popped) return false;
    R.energy = Math.max(0, R.energy - DRAIN * dt);
    R.activeT += dt;
    return R.energy > 0;
  };

  /* 倒流结束：把轨迹凝成残影之桥 */
  R.stop = function (G) {
    R.active = false;
    var lv = G.lv, placed = 0, seen = {};

    // 玩家此刻所在格，别在他身上生成
    var pc = Math.floor((G.player.x + G.player.w / 2) / TILE);
    var pr = Math.floor((G.player.y + G.player.h - 1) / TILE);

    for (var i = R.trail.length - 1; i >= 0 && placed < ECHO_MAX; i--) {
      var q = R.trail[i];
      var k = q.c + ',' + q.r;
      if (seen[k]) continue;
      seen[k] = 1;
      if (q.c < 0 || q.c >= lv.cols || q.r < 1 || q.r >= ROWS - 1) continue;
      if (PG.lvGet(lv, q.c, q.r) !== T.EMPTY) continue;      // 不覆盖任何已有地形
      // 只在"脚下是空的"位置凝桥。贴着地面跑出来的残影没有意义，
      // 真正有用的是你跳坑/坠落那一段悬空的轨迹。
      if (PG.isSolid(PG.lvGet(lv, q.c, q.r + 1))) continue;
      if (q.c === pc && (q.r === pr || q.r === pr - 1)) continue;
      R.echo.push({ c: q.c, r: q.r, t: ECHO_LIFE, max: ECHO_LIFE });
      placed++;
    }

    R.trail.length = 0;
    PG.audio.sfx(placed ? 'echo' : 'rewindEnd');
    if (placed) { G.msg = '残影之桥 · ' + placed + ' 格'; G.msgT = 1.4; }
  };

  function sampleTrail(G) {
    var p = G.player;
    R.trail.push({
      c: Math.floor((p.x + p.w / 2) / TILE),
      r: Math.floor((p.y + p.h - 1) / TILE)
    });
    if (R.trail.length > 120) R.trail.shift();
  }

  /* 残影平台老化 */
  R.updateEcho = function (dt) {
    for (var i = R.echo.length - 1; i >= 0; i--) {
      R.echo[i].t -= dt;
      if (R.echo[i].t <= 0) R.echo.splice(i, 1);
    }
  };

  R.clearEcho = function () { R.echo.length = 0; };

  /* 碰撞接入点：某个格子上有没有残影平台 */
  R.solidAt = function (c, r) {
    for (var i = 0; i < R.echo.length; i++) {
      var q = R.echo[i];
      if (q.c === c && q.r === r && q.t > 0) return true;
    }
    return false;
  };

  /* ---------------- 绘制 ---------------- */

  /* 残影之桥（画在地块之后、实体之前） */
  R.drawEcho = function (ctx, cam) {
    for (var i = 0; i < R.echo.length; i++) {
      var q = R.echo[i];
      var x = Math.round(q.c * TILE - cam.x), y = q.r * TILE;
      if (x < -TILE || x > VW + TILE) continue;
      var life = q.t / q.max;
      // 剩下不到 1 秒开始闪，提醒玩家它要消失了
      var a = life > 0.25 ? 0.94 : 0.30 + 0.6 * Math.abs(Math.sin(q.t * 16));
      ctx.globalAlpha = a;
      // 亮面 + 饱和青 + 一道暗底边：这样在浅色天空和深色地面上都看得清
      ctx.fillStyle = '#eaffff';
      ctx.fillRect(x, y, TILE, 3);
      ctx.fillStyle = '#5fd8f5';
      ctx.fillRect(x, y + 3, TILE, 2);
      ctx.fillStyle = '#123a4a';
      ctx.fillRect(x, y + 5, TILE, 1);
    }
    ctx.globalAlpha = 1;
  };

  /* 倒流中的屏幕特效 + 死亡回溯窗口提示
     wctx = 世界层（低分辨率、像素锐利），只用来画世界坐标的轨迹标记
     ctx  = UI 层（原生分辨率），撕裂特效与文字都画这里 */
  R.drawOverlay = function (wctx, ctx, G) {
    if (R.active) {
      // 冷色罩 + 横向撕裂条，像录像带在倒带
      ctx.fillStyle = 'rgba(90,200,255,.16)';
      ctx.fillRect(0, 0, VW, VH);
      for (var i = 0; i < 7; i++) {
        var seed = (R.pops * 37 + i * 91) % 1000;
        var y = (seed * 1.7) % VH;
        var h = 2 + (seed % 4);
        var off = ((seed % 21) - 10) * (1 + R.activeT * 2);
        ctx.globalAlpha = 0.16 + (seed % 5) * 0.05;
        ctx.fillStyle = '#e8faff';
        ctx.fillRect(off, y, VW, h);
      }
      ctx.globalAlpha = 1;

      // 轨迹残影：把你「退回去」的那条路标出来（世界坐标 → 世界层）
      for (var k = 0; k < R.trail.length; k += 2) {
        var q = R.trail[k];
        var tx = Math.round(q.c * TILE - G.cam.x), ty = Math.round(q.r * TILE);
        wctx.fillStyle = 'rgba(16,58,74,.55)';
        wctx.fillRect(tx + 4, ty + 3, 8, 8);
        wctx.fillStyle = 'rgba(180,250,255,.85)';
        wctx.fillRect(tx + 5, ty + 4, 6, 6);
      }

      // 倒带角标
      ctx.font = 'bold 11px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'left';
      var blink = Math.floor(R.activeT * 10) % 2 === 0;
      ctx.fillStyle = blink ? '#9ff8ff' : '#4fb8d8';
      ctx.fillText('◀◀ 星辰回溯', 8, VH - 26);
      R.bar(ctx, 8, VH - 20, 96, 6, R.energy);
      ctx.textAlign = 'left';
      return;
    }

    if (G.deathPending) {
      // 死亡回溯窗口：告诉玩家"还能救"
      var pulse = 0.5 + 0.5 * Math.sin(G.t * 10);
      ctx.fillStyle = 'rgba(8,4,20,' + (0.30 + 0.10 * pulse) + ')';
      ctx.fillRect(0, 0, VW, VH);
      ctx.textAlign = 'center';
      ctx.font = 'bold 13px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = R.energy > 0.05 ? '#9ff8ff' : '#7a6fa8';
      ctx.fillText(R.energy > 0.05 ? '时间还没走远…' : '星辰能量不足', VW / 2, VH / 2 - 14);
      ctx.font = '10px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#cfe6ff';
      if (R.energy > 0.05) {
        ctx.fillText('按住 R（或点 ◀◀ 键）把时间拨回去', VW / 2, VH / 2 + 2);
      } else {
        ctx.fillText('这关的星辰之力用完了', VW / 2, VH / 2 + 2);
      }
      // 倒计时条
      var w = 150, x0 = VW / 2 - w / 2;
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      ctx.fillRect(x0, VH / 2 + 12, w, 4);
      ctx.fillStyle = '#9ff8ff';
      ctx.fillRect(x0, VH / 2 + 12, w * PG.clamp(G.freeze / 1.5, 0, 1), 4);
      R.bar(ctx, x0, VH / 2 + 20, w, 5, R.energy);
      ctx.textAlign = 'left';
    }
  };

  /* 能量条：分段显示，直观看出还剩几次 */
  R.bar = function (ctx, x, y, w, h, v) {
    ctx.fillStyle = 'rgba(8,14,28,.72)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.fillRect(x, y, w, h);
    var fill = PG.clamp(v, 0, 1) * w;
    var col = v > 0.5 ? '#7cf5ff' : (v > 0.18 ? '#ffe066' : '#ff7a9a');
    ctx.fillStyle = col;
    ctx.fillRect(x, y, fill, h);
    // 分段刻度
    ctx.fillStyle = 'rgba(8,14,28,.55)';
    for (var i = 1; i < 5; i++) ctx.fillRect(x + Math.round(w * i / 5), y, 1, h);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fillRect(x, y, fill, 1);
  };

})(window.PG);
