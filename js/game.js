/* ============================================================
   game.js —— 状态机 / 摄像机 / HUD / 主循环
   ============================================================ */
(function (PG) {
  'use strict';

  var TILE = PG.TILE, T = PG.T, VW = PG.VIEW_W, VH = PG.VIEW_H;
  var STEP = 1 / 60;

  var canvas = document.getElementById('screen');
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  /* ---------------- Kenney Pixel Adventure UI 素材 ---------------- */
  var UI_SHEET = new Image();
  UI_SHEET.src = 'data:image/png;base64,' + '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';
  // 从tilesheet裁剪一个tile并绘制（每个tile 32x32，间距1px）
  function drawUITile(tileX, tileY, dx, dy, dw, dh) {
    if (!UI_SHEET.complete || !UI_SHEET.naturalWidth) return false;
    uctx.drawImage(UI_SHEET, tileX * 33, tileY * 33, 32, 32, dx, dy, dw, dh);
    return true;
  }

  /* ---------------- UI 层（原生分辨率） ----------------
     世界层只有 480×272，铺到屏幕上要放大 2~3 倍，矢量字体在那个
     尺度上被放大就糊了。所以另开一块 #ui 画布：
       · CSS 尺寸跟世界层完全重合，像素一一对齐
       · 后备缓冲按 devicePixelRatio 放大
       · 再用 transform 把 480×272 的逻辑坐标映射上去
     于是所有 UI 绘制代码的坐标**一个都不用改**，字却变清晰了。
     拿不到 #ui（或它不可用时）就退回低分辨率层，功能不受影响。 */
  var uiCanvas = document.getElementById('ui');
  var uctx = uiCanvas && uiCanvas.getContext ? uiCanvas.getContext('2d') : ctx;
  function fitUI(cssW, cssH) {
    if (!uiCanvas || uctx === ctx) return;
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    var bw = Math.max(1, Math.round(cssW * dpr));
    var bh = Math.max(1, Math.round(cssH * dpr));
    // 改 width/height 会重置上下文状态（含 transform），所以放在 setTransform 之前
    if (uiCanvas.width !== bw || uiCanvas.height !== bh) {
      uiCanvas.width = bw; uiCanvas.height = bh;
    }
    uiCanvas.style.width = cssW + 'px';
    uiCanvas.style.height = cssH + 'px';
    // 两个方向分开算比例：就算 bw/VW 与 bh/VH 差一点点，坐标也不会偏
    uctx.setTransform(bw / VW, 0, 0, bh / VH, 0, 0);
  }

  /* ---------------- 全局游戏状态 ---------------- */
  var G = PG.G = {
    state: 'title',
    lv: null, player: null, ents: [], particles: [], floats: [],
    cam: { x: 0, y: 0 },
    coins: 0, stars: 0, starTaken: {}, lives: 5, score: 0,
    time: 0, shakeT: 0, dark: 0, fogT: 0,
    checkpoint: null, bumpAnims: {}, t: 0,
    bonusReturn: null, world: 0, level: 0,
    selWorld: 0, selLevel: 0, flashT: 0, msg: null, msgT: 0,
    clearInfo: null, freeze: 0,
    deathPending: false          // 死亡回溯窗口：这一小段时间里还能把命拨回来
  };

  /* ---------------- 小工具 ---------------- */
  G.addParticle = function (x, y, vx, vy, color, life, size, grav) {
    G.particles.push({ x: x, y: y, vx: vx, vy: vy, color: color, life: life, max: life, size: size || 2, grav: grav || 0 });
  };
  G.burst = function (x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, sp = 40 + Math.random() * 130;
      G.addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 40, color, 0.5 + Math.random() * 0.4, 2, 380);
    }
  };
  G.puff = function (x, y, dir) {
    for (var i = 0; i < 3; i++)
      G.addParticle(x, y, -dir * (20 + Math.random() * 40), -Math.random() * 30, 'rgba(255,255,255,.8)', 0.28, 2, 60);
  };
  G.popText = function (x, y, text, color) {
    G.floats.push({ x: x, y: y, text: text, color: color || '#fff', life: 1.1, max: 1.1 });
  };
  G.shake = function (t) { G.shakeT = Math.max(G.shakeT, t); };
  G.addCoin = function (n) { G.coins += n; PG.rewind.gain(0.008 * n); };
  G.addScore = function (n) { G.score += n; };
  G.bumpAnim = function (c, r) { G.bumpAnims[c + ',' + r] = 0.18; };

  G.hurtPlayer = function () {
    var p = G.player;
    if (!p || !p.alive) return;
    if (p.starT > 0) return;
    if (p.invT > 0) return;
    if (p.shield > 0) {
      p.shield--; p.invT = 1.3;
      PG.audio.sfx('shield');
      G.popText(p.x - 6, p.y - 10, '护盾格挡！', '#7ce8ff');
      G.burst(p.x + 5, p.y + 7, '#7ce8ff', 12);
      return;
    }
    if (p.form === 'fire') {
      p.form = 'normal'; p.invT = 1.6;
      PG.audio.sfx('hurt');
      G.popText(p.x - 6, p.y - 10, '变回原形…', '#ff9a5a');
      G.shake(0.18);
      return;
    }
    G.loseLife();
  };

  /* 死亡不再当场扣命 —— 先开一个 1.5 秒的「星辰回溯」窗口。
     这段时间里按住 R 就能把时间拨回去，这条命就当没丢过。
     窗口走完还没拨回来，才真的扣命。 */
  G.beginDeath = function (reason) {
    var p = G.player;
    if (!p || !p.alive || G.deathPending) return;
    PG.audio.sfx('die');
    p.alive = false; p.vy = -280;
    G.deathPending = true;
    G.freeze = 1.5;
    G.popText(p.x - 12, p.y - 14, reason || '失误了！', '#ff5a7a');
  };

  G.loseLife = function () { G.beginDeath('生命 -1'); };
  G.killPlayer = function () { G.beginDeath('掉下去了！'); };

  /* ---------------- 关卡装载 ---------------- */
  G.loadLevel = function (w, l, keepCheckpoint) {
    G.world = w; G.level = l;
    G.lv = PG.buildLevel(w, l);
    G.ents = [];
    PG.spawnFromLevel(G.lv, G);
    // 已收集的星辰碎片保持已收集
    var si = 0;
    G.ents.forEach(function (e) { if (e.type === 'bigstar') { e.si = si; if (G.starTaken[w + '-' + l + '-' + si]) e.dead = true; si++; } });
    G.player = PG.makePlayer(G.lv);
    G.checkpoint = null;
    G.time = G.lv.timeLimit;
    G.stars = 0;
    G.particles.length = 0; G.floats.length = 0;
    G.cam.x = 0; G.dark = 0; G.fogT = 0;
    G.freeze = 0; G.shakeT = 0; G.bumpAnims = {};
    G.msg = null; G.msgT = 0; G.flashT = 0;
    G.deathPending = false;
    PG.rewind.reset();
    G.state = 'play';
    PG.audio.startWorldMusic(w, l === 2);
  };

  G.respawn = function () {
    var w = G.world, l = G.level;
    G.lv = PG.buildLevel(w, l);
    G.ents = [];
    PG.spawnFromLevel(G.lv, G);
    var si = 0;
    G.ents.forEach(function (e) { if (e.type === 'bigstar') { e.si = si; if (G.starTaken[w + '-' + l + '-' + si]) e.dead = true; si++; } });
    G.player = PG.makePlayer(G.lv);
    if (G.checkpoint) { G.player.x = G.checkpoint.x; G.player.y = G.checkpoint.y - 8; }
    G.time = G.lv.timeLimit;
    G.particles.length = 0; G.floats.length = 0;
    G.dark = 0; G.fogT = 0;
    G.deathPending = false;
    PG.rewind.reset();
    G.state = 'play';
  };

  G.winLevel = function () {
    if (G.state !== 'play') return;
    var w = G.world, l = G.level;
    var timeBonus = Math.floor(G.time) * 10;
    G.score += timeBonus;
    if (!G.lv.isBonus) {
      PG.save.setLevel(w, l, G.stars, true);
      var d = PG.save.load();
      if (l === 2) d.unlocked = Math.max(d.unlocked, Math.min(5, w + 2));
      PG.save.store();
    }
    G.clearInfo = { w: w, l: l, stars: G.stars, coins: G.coins, timeBonus: timeBonus, isBoss: l === 2, isBonus: !!G.lv.isBonus };
    PG.audio.sfx('clear');
    PG.audio.startMusic('clear');
    G.state = 'clear';
  };

  G.bossDefeated = function () { G.winLevel(); };

  G.enterBonus = function (c, r) {
    G.bonusReturn = {
      lv: G.lv, ents: G.ents, px: G.player.x, py: G.player.y,
      time: G.time, cam: G.cam.x, crumble: G.lv.crumble
    };
    G.lv = PG.buildBonus(G.world);
    G.ents = [];
    PG.spawnFromLevel(G.lv, G);
    G.player = PG.makePlayer(G.lv);
    G.time = G.lv.timeLimit;
    G.cam.x = 0;
    G.deathPending = false;
    PG.rewind.reset();          // 不跨关卡回溯
    G.state = 'play';
    G.msg = '密室彩蛋 · 收集全部金币！'; G.msgT = 2.2;
  };

  G.exitBonus = function () {
    var b = G.bonusReturn;
    if (!b) { G.winLevel(); return; }
    G.lv = b.lv; G.ents = b.ents;
    G.player = PG.makePlayer(G.lv);
    G.player.x = b.px; G.player.y = b.py - 6;
    G.time = b.time;
    G.lv.crumble = b.crumble;
    G.bonusReturn = null;
    G.deathPending = false;
    PG.rewind.reset();
    G.msg = '回到冒险！'; G.msgT = 1.4;
    PG.audio.sfx('secret');
  };

  /* ---------------- 更新 ---------------- */
  function updatePlay(dt) {
    var p = G.player, lv = G.lv;
    var IN = PG.input, RW = PG.rewind;

    /* ---- 1. 回溯中：时间在倒着走，正常更新一律暂停 ---- */
    if (RW.active) {
      if (!IN.down('rewind') || !RW.step(G, dt)) RW.stop(G);
      return;
    }

    /* ---- 2. 死亡回溯窗口：还来得及把这条命拨回来 ---- */
    if (G.deathPending) {
      G.freeze -= dt;
      updateParticles(dt);
      RW.updateEcho(dt);

      if (IN.down('rewind') && RW.can()) {
        G.deathPending = false;
        G.freeze = 0;
        RW.rescues++;
        G.player.alive = true;
        PG.audio.sfx('rescue');
        RW.start(G);
        G.msg = '命保住了！'; G.msgT = 1.3;
        return;
      }
      if (G.freeze <= 0) {
        G.deathPending = false;
        G.lives--;
        if (G.lives <= 0) { G.state = 'gameover'; PG.audio.stopMusic(); }
        else G.respawn();
      }
      return;
    }

    /* ---- 3. 主动回溯 ---- */
    if (IN.down('rewind') && RW.can()) { RW.start(G); return; }

    G.time -= dt;
    if (G.time <= 0) { G.time = 0; G.killPlayer(); return; }

    PG.updatePlayer(p, dt, G);

    // 塌陷砖块计时
    if (lv.crumble) {
      for (var k in lv.crumble) {
        if (lv.crumble[k] == null) continue;
        lv.crumble[k] -= dt;
        if (lv.crumble[k] <= 0) {
          var parts = k.split(','), cc = +parts[0], rr = +parts[1];
          PG.lvSet(lv, cc, rr, T.EMPTY);
          delete lv.crumble[k];
          for (var i = 0; i < 4; i++)
            G.ents.push({ type: 'debris', x: cc * TILE + (i % 2) * 8, y: rr * TILE + Math.floor(i / 2) * 8, w: 6, h: 6, vx: (i % 2 ? 40 : -40), vy: -80, life: 1.2 });
          PG.audio.sfx('brick');
        }
      }
    }

    // 实体
    for (var e = 0; e < G.ents.length; e++) {
      var ent = G.ents[e];
      if (ent.dead) continue;
      // 视野外的实体跳过 AI（但 boss 和玩家附近的照常）
      if (ent.type !== 'boss' && Math.abs(ent.x - G.player.x) > 620) continue;
      PG.updateEntity(ent, dt, G);
    }
    G.ents = G.ents.filter(function (x) { return !x.dead; });

    // 记录已吃星星
    if (lv.isBonus) { /* 密室里的星星不占用关卡星星计数 */ }

    updateParticles(dt);

    // 顶砖块动画
    for (var bk in G.bumpAnims) {
      G.bumpAnims[bk] -= dt;
      if (G.bumpAnims[bk] <= 0) delete G.bumpAnims[bk];
    }

    // 特效衰减
    if (G.shakeT > 0) G.shakeT -= dt;
    if (G.fogT > 0) G.fogT -= dt;
    if (G.dark > 0) G.dark = Math.max(0, G.dark - dt * 0.06);

    // 摄像机
    var targetX = p.x + p.w / 2 - VW * 0.42 + p.vx * 0.22;
    G.cam.x = PG.clamp(PG.lerp(G.cam.x, targetX, 8 * dt), 0, Math.max(0, lv.cols * TILE - VW));

    // 录一帧进历史（供回溯用），并让残影平台老化
    RW.record(G, dt);
    RW.updateEcho(dt);
  }

  function updateParticles(dt) {
    for (var i = G.particles.length - 1; i >= 0; i--) {
      var q = G.particles[i];
      q.life -= dt;
      if (q.life <= 0) { G.particles.splice(i, 1); continue; }
      q.vy += q.grav * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
    }
    for (var j = G.floats.length - 1; j >= 0; j--) {
      var f = G.floats[j];
      f.life -= dt; f.y -= 26 * dt;
      if (f.life <= 0) G.floats.splice(j, 1);
    }
    if (G.msgT > 0) { G.msgT -= dt; if (G.msgT <= 0) G.msg = null; }
    if (G.flashT > 0) G.flashT -= dt;
  }

  /* ---------------- 渲染 ---------------- */
  function renderPlay() {
    var lv = G.lv, th = lv.theme, cam = G.cam;
    var sx = 0, sy = 0;
    if (G.shakeT > 0) { sx = (Math.random() - 0.5) * 6 * G.shakeT * 4; sy = (Math.random() - 0.5) * 6 * G.shakeT * 4; }

    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));

    PG.drawBackground(ctx, cam, lv.world, G.t);

    // 地块
    var c0 = Math.max(0, Math.floor(cam.x / TILE) - 1);
    var c1 = Math.min(lv.cols - 1, Math.floor((cam.x + VW) / TILE) + 1);
    for (var c = c0; c <= c1; c++) {
      for (var r = 0; r < PG.ROWS; r++) {
        var t = PG.lvGet(lv, c, r);
        if (t === T.EMPTY || t === T.HIDDEN) continue;
        var px = Math.round(c * TILE - cam.x), py = r * TILE;
        var bump = G.bumpAnims[c + ',' + r];
        if (bump) py -= Math.round(Math.sin((1 - bump / 0.18) * Math.PI) * 6);
        if (t === T.CRUMBLE && lv.crumble && lv.crumble[c + ',' + r] != null) {
          py += Math.round(Math.sin(G.t * 60) * 2);
        }
        PG.drawTile(ctx, t, px, py, th, G.t, c, r);
      }
    }

    // 残影之桥：画在地块之上、实体之下
    PG.rewind.drawEcho(ctx, cam);

    // 实体
    for (var i = 0; i < G.ents.length; i++) {
      var e = G.ents[i];
      if (e.dead) continue;
      if (e.type === 'boss') continue;
      PG.drawEntity(ctx, e, cam, G.t, G);
    }
    // BOSS 单独画（在玩家后面但保证可见）
    G.ents.forEach(function (e) { if (!e.dead && e.type === 'boss') PG.drawEntity(ctx, e, cam, G.t, G); });

    // 玩家
    var p = G.player;
    // 死亡回溯窗口里也要画主角 —— 那正是玩家要"救"的时刻，
    // 让他闪成半透明残影，比直接消失更能说明"还有救"
    if (p && (p.alive || G.deathPending)) {
      if (G.deathPending) ctx.globalAlpha = 0.30 + 0.55 * Math.abs(Math.sin(G.t * 12));
      drawPlayer(ctx, p, cam);
      ctx.globalAlpha = 1;
    }

    // 粒子
    for (var q = 0; q < G.particles.length; q++) {
      var pt = G.particles[q];
      ctx.globalAlpha = PG.clamp(pt.life / pt.max, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x - cam.x), Math.round(pt.y - cam.y), pt.size, pt.size);
    }
    ctx.globalAlpha = 1;

    // 飘字
    ctx.font = '9px "Fusion Pixel",monospace';
    ctx.textAlign = 'center';
    for (var f = 0; f < G.floats.length; f++) {
      var fl = G.floats[f];
      ctx.globalAlpha = PG.clamp(fl.life / fl.max, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillText(fl.text, Math.round(fl.x - cam.x) + 1, Math.round(fl.y - cam.y) + 1);
      ctx.fillStyle = fl.color;
      ctx.fillText(fl.text, Math.round(fl.x - cam.x), Math.round(fl.y - cam.y));
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    ctx.restore();

    /* 屏幕特效 */
    if (G.fogT > 0) {
      ctx.fillStyle = 'rgba(20,40,30,' + Math.min(0.72, G.fogT * 0.3) + ')';
      ctx.fillRect(0, 0, VW, VH);
      for (var g2 = 0; g2 < 6; g2++) {
        var fx = ((g2 * 160 + G.t * 30) % 900) - 150;
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#cfe6d8';
        ctx.beginPath(); ctx.arc(fx, 90 + (g2 % 3) * 50, 70, 0, 6.3); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (G.dark > 0.02) {
      var rad = 90 + Math.sin(G.t * 3) * 6;
      var px2 = (G.player ? G.player.x + 5 - cam.x : VW / 2);
      var py2 = (G.player ? G.player.y + 7 - cam.y : VH / 2);
      var rg = ctx.createRadialGradient(px2, py2, rad * 0.5, px2, py2, rad * 3.2);
      rg.addColorStop(0, 'rgba(10,0,20,0)');
      rg.addColorStop(0.55, 'rgba(10,0,20,' + (0.45 * G.dark) + ')');
      rg.addColorStop(1, 'rgba(6,0,14,' + (0.88 * G.dark) + ')');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, VW, VH);
    }
    // 冰霜减速提示
    if (G.player && G.player.chillT > 0) {
      ctx.fillStyle = 'rgba(140,220,255,' + (0.10 + 0.05 * Math.sin(G.t * 6)) + ')';
      ctx.fillRect(0, 0, VW, VH);
    }
    // 无敌星光
    if (G.player && G.player.starT > 0) {
      ctx.globalAlpha = 0.14 + 0.10 * Math.sin(G.t * 14);
      ctx.fillStyle = '#ffe066'; ctx.fillRect(0, 0, VW, VH);
      ctx.globalAlpha = 1;
    }
    if (G.freeze > 0) { ctx.fillStyle = 'rgba(0,0,0,' + (0.35 * Math.min(1, G.freeze)) + ')'; ctx.fillRect(0, 0, VW, VH); }

    // 回溯特效 / 死亡回溯窗口提示
    // 轨迹标记是世界坐标（要跟着镜头走）→ 世界层；
    // 撕裂特效和提示文字是屏幕坐标 → UI 层，字才清晰
    PG.rewind.drawOverlay(ctx, uctx, G);

    drawHUD();
  }

  function drawPlayer(ctx, p, cam) {
    var S = PG.SPR, D = PG.drawSpr;
    var x = Math.round(p.x - cam.x) - 1, y = Math.round(p.y - cam.y) - 2;
    // 闪烁（受伤无敌）
    if (p.invT > 0 && p.starT <= 0 && Math.floor(G.t * 20) % 2 === 0) return;

    var pal = p.form === 'fire' ? PG.FIRE_PAL : null;
    if (p.starT > 0) {
      // 星光形态：彩虹闪烁
      var hue = (G.t * 400) % 360;
      pal = Object.assign({}, PG.HERO_PAL, { c: 'hsl(' + hue + ',85%,62%)', h: 'hsl(' + ((hue + 120) % 360) + ',85%,62%)' });
    }
    var spr = S.heroIdle;
    if (!p.onGround) spr = S.heroJump;
    else if (p.crouch) spr = S.heroCrouch;
    else if (Math.abs(p.vx) > 12) spr = (Math.floor(p.animT * (Math.abs(p.vx) > 140 ? 14 : 9)) % 2) ? S.heroRun1 : S.heroRun2;

    if (p.chillT > 0) {
      ctx.globalAlpha = 0.85;
      D(ctx, spr, x, y, p.dir < 0, pal);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(140,220,255,.35)';
      ctx.fillRect(x, y, 12, 16);
    } else {
      D(ctx, spr, x, y, p.dir < 0, pal);
    }

    // 护盾光环
    if (p.shield > 0) {
      ctx.globalAlpha = 0.45 + 0.25 * Math.sin(G.t * 6);
      ctx.strokeStyle = '#7ce8ff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x + 6, y + 8, 12, 0, 6.3); ctx.stroke();
      if (p.shield > 1) { ctx.beginPath(); ctx.arc(x + 6, y + 8, 15, 0, 6.3); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    // 极速尾焰
    if (p.speedT > 0 && Math.abs(p.vx) > 60) {
      ctx.fillStyle = 'rgba(124,245,255,.6)';
      ctx.fillRect(x - p.dir * 6, y + 6, 6, 3);
      ctx.fillRect(x - p.dir * 11, y + 8, 5, 2);
    }
  }

  function drawHUD() {
    // 经典马里奥HUD风格：顶部通栏 + 白字黑描边 + 无厚重底
    var ctx = uctx;
    var lv = G.lv;
    var bossRef = null;
    for (var bi = 0; bi < G.ents.length; bi++) {
      var be = G.ents[bi];
      if (be.type === 'boss' && !be.dead && be.hp > 0) { bossRef = be; break; }
    }
    var bossOn = !!bossRef;

    // 像素风HUD：白色字 + 黑色描边
    ctx.font = '10px "Fusion Pixel",monospace';
    ctx.textBaseline = 'top';

    // 绘制带黑描边的文字（马里奥经典风格）
    function drawPixelText(text, x, y, align, color) {
      ctx.textAlign = align || 'left';
      ctx.fillStyle = '#000';
      ctx.fillText(text, x + 1, y + 1);
      ctx.fillText(text, x - 1, y - 1);
      ctx.fillText(text, x + 1, y - 1);
      ctx.fillText(text, x - 1, y + 1);
      ctx.fillStyle = color || '#fff';
      ctx.fillText(text, x, y);
    }

    // ===== 顶部通栏 HUD（FC马里奥经典布局）=====
    var hudY = 6;

    // 左：分数
    drawPixelText('分数', 30, hudY, 'left', '#fff');
    var scoreStr = String(G.score).padStart(6, '0');
    drawPixelText(scoreStr, 30, hudY + 12, 'left', '#fff');

    // 中左：金币（暖金色）
    ctx.fillStyle = '#ffc107';
    ctx.beginPath(); ctx.arc(130, hudY + 16, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ff9800';
    ctx.beginPath(); ctx.arc(130, hudY + 16, 3, 0, Math.PI*2); ctx.fill();
    drawPixelText('×' + String(G.coins).padStart(2, '0'), 140, hudY + 12, 'left', '#fff');

    // 中：关卡
    var worldLabel = lv.isBonus ? '隐藏关' : '第' + (lv.world + 1) + '-' + (lv.index + 1) + '关';
    drawPixelText(worldLabel, VW / 2, hudY, 'center', '#fff');

    // 中右：生命
    drawPixelText('×' + Math.max(0, G.lives), VW / 2 + 70, hudY + 12, 'left', '#fff');

    // 右：时间
    var t = Math.ceil(G.time);
    var timeColor = t < 30 ? (Math.floor(G.t * 6) % 2 ? '#ff0000' : '#fff') : '#fff';
    drawPixelText('时间', VW - 60, hudY, 'right', '#fff');
    drawPixelText(String(t).padStart(3, '0'), VW - 60, hudY + 12, 'right', timeColor);

    // ===== 状态图标（左上角，HUD下方）=====
    var p = G.player;
    if (p) {
      var ix = 30, iy = bossOn ? 56 : 36;
      if (p.form === 'fire') {
        drawPixelText('FIRE', ix, iy, 'left', '#ff8c42'); ix += 50;
      }
      if (p.shield > 0) {
        drawPixelText('SHIELD×' + p.shield, ix, iy, 'left', '#7ce8ff'); ix += 80;
      }
      if (p.starT > 0) {
        drawPixelText('STAR ' + Math.ceil(p.starT), ix, iy, 'left', '#ffe066');
      }
    }

    /* 星辰能量条 —— 左下角轻量化，无厚重背景 */
    var rw = PG.rewind;
    var rwY = VH - 16;
    // 小图标（暖橙色星星）
    ctx.fillStyle = '#ff9500';
    ctx.beginPath();
    ctx.moveTo(12, rwY - 8);
    ctx.lineTo(15, rwY - 3);
    ctx.lineTo(20, rwY - 2);
    ctx.lineTo(16, rwY + 2);
    ctx.lineTo(17, rwY + 8);
    ctx.lineTo(12, rwY + 5);
    ctx.lineTo(7, rwY + 8);
    ctx.lineTo(8, rwY + 2);
    ctx.lineTo(4, rwY - 2);
    ctx.lineTo(9, rwY - 3);
    ctx.closePath(); ctx.fill();

    // 能量条（细条，暖橙色）
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(26, rwY - 2, 60, 4);
    ctx.fillStyle = rw.energy > 0.18 ? '#ff9500' : '#ff6b6b';
    ctx.fillRect(26, rwY - 2, 60 * rw.energy, 4);

    // 提示文字
    if (rw.active) {
      ctx.font = '9px "Fusion Pixel",monospace';
      ctx.fillStyle = '#7cf5ff';
      ctx.textAlign = 'left';
      ctx.fillText('◀◀ 倒流', 92, rwY - 5);
    } else if (rw.can()) {
      ctx.font = '9px "Fusion Pixel",monospace';
      ctx.fillStyle = (Math.floor(G.t * 2.5) % 2 === 0) ? '#7cf5ff' : '#4a9aaa';
      ctx.textAlign = 'left';
      ctx.fillText('R 回溯', 92, rwY - 5);
    }

    // 中央提示（简洁横幅，白字黑描边）
    if (G.msg) {
      var my = bossOn ? 48 : 36;
      ctx.font = 'bold 11px "Fusion Pixel",monospace';
      ctx.textAlign = 'center';
      // 黑描边
      ctx.fillStyle = '#000';
      ctx.fillText(G.msg, VW / 2 + 1, my + 1);
      ctx.fillText(G.msg, VW / 2 - 1, my - 1);
      ctx.fillText(G.msg, VW / 2 + 1, my - 1);
      ctx.fillText(G.msg, VW / 2 - 1, my + 1);
      // 白字
      ctx.fillStyle = '#ffe066';
      ctx.fillText(G.msg, VW / 2, my);
      ctx.textAlign = 'left';
    }

    /* BOSS 血条 —— 放在 HUD 条（0..16）正下方。
       画在 UI 层，所以 BOSS 名字是清晰的，不再跟着世界层一起被放大糊掉。 */
    if (bossRef) {
      var b = bossRef;
      var bw = 168, bx = (VW - bw) / 2, by = 22;
      var ratio = PG.clamp(b.hp / b.maxhp, 0, 1);

      // 底衬：保证压在任何背景上都读得清
      ctx.fillStyle = 'rgba(10,6,20,.66)';
      ctx.fillRect(bx - 6, by - 2, bw + 12, 22);
      ctx.fillStyle = 'rgba(255,255,255,.09)';
      ctx.fillRect(bx - 6, by - 2, bw + 12, 1);
      ctx.fillRect(bx - 6, by + 19, bw + 12, 1);

      // 血槽
      ctx.fillStyle = '#241a2e';
      ctx.fillRect(bx, by, bw, 7);
      // 血量
      ctx.fillStyle = (b.phase === 2 && b.kind === 4) ? '#ff5a7a' : '#e5484d';
      ctx.fillRect(bx, by, Math.round(bw * ratio), 7);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(bx, by, Math.round(bw * ratio), 2);
      // 四等分刻度：一眼看出还剩几刀
      ctx.fillStyle = 'rgba(0,0,0,.42)';
      for (var sg = 1; sg < 4; sg++) ctx.fillRect(bx + Math.round(bw * sg / 4), by, 1, 7);

      // 名牌
      ctx.fillStyle = '#fff';
      ctx.font = '9px "Fusion Pixel",monospace';
      ctx.textAlign = 'center';
      ctx.fillText(b.name + (b.phase === 2 ? ' · 二阶段' : ''), VW / 2, by + 17);
      ctx.textAlign = 'left';
    }
  }

  /* ---------------- 标题 / 地图 / 结算 ---------------- */
  function renderTitle() {
    // 暖色调主菜单：夕阳橙金 + 暖米色背景
    var ctx = uctx;

    // 天空背景（暖夕阳渐变）
    var skyGrad = ctx.createLinearGradient(0, 0, 0, VH);
    skyGrad.addColorStop(0, '#ff9a56');
    skyGrad.addColorStop(0.5, '#ffb87a');
    skyGrad.addColorStop(1, '#ffd4a3');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, VW, VH);

    // 太阳装饰
    ctx.fillStyle = 'rgba(255,240,180,0.6)';
    ctx.beginPath();
    ctx.arc(VW - 60, 50, 30, 0, Math.PI*2);
    ctx.fill();

    // 远山（暖金色山丘）
    ctx.fillStyle = '#d4874a';
    ctx.beginPath();
    ctx.moveTo(0, VH - 30);
    ctx.quadraticCurveTo(60, VH - 80, 120, VH - 30);
    ctx.quadraticCurveTo(180, VH - 70, 240, VH - 30);
    ctx.quadraticCurveTo(320, VH - 90, 400, VH - 30);
    ctx.quadraticCurveTo(440, VH - 60, 480, VH - 30);
    ctx.lineTo(VW, VH);
    ctx.lineTo(0, VH);
    ctx.closePath();
    ctx.fill();

    // 地面（暖棕色）
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(0, VH - 24, VW, 24);
    ctx.fillStyle = '#a67c52';
    ctx.fillRect(0, VH - 24, VW, 6);

    // 暖白云朵
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (var c = 0; c < 4; c++) {
      var cx = 40 + c * 120 + Math.sin(G.t * 0.5 + c) * 10;
      var cy = 30 + (c % 2) * 25;
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI*2);
      ctx.arc(cx + 12, cy - 4, 8, 0, Math.PI*2);
      ctx.arc(cx + 24, cy, 9, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.textAlign = 'center';

    // 真实Kenney素材：米色边框面板（tile 5,0）
    var titleW = 280, titleH = 56;
    var titleX = VW / 2 - titleW / 2, titleY = 40;
    var titleDrew = drawUITile(5, 0, titleX, titleY, titleW, titleH);
    if (!titleDrew) {
      // 回退：代码绘制
      ctx.fillStyle = '#5a3e2b';
      ctx.fillRect(titleX, titleY, titleW, titleH);
      ctx.fillStyle = '#f5e6c8';
      ctx.fillRect(titleX + 3, titleY + 3, titleW - 6, titleH - 6);
    }

    // 游戏标题（像素风，适配像素字体尺寸）
    ctx.font = '16px "Fusion Pixel",monospace';
    ctx.fillStyle = '#5a3e2b';
    ctx.fillText('像素童话大陆', VW / 2, titleY + 26);

    // 副标题（放在面板底部）
    ctx.font = '10px "Fusion Pixel",monospace';
    ctx.fillStyle = '#b85c29';
    ctx.fillText('★ 小星冒险家 ★', VW / 2, titleY + 44);

    // 主角
    var bob = Math.sin(G.t * 2) * 3;
    PG.drawSpr(ctx, PG.SPR.heroIdle, VW / 2 - 6, 120 + bob, false, null);

    // 开始按钮（Kenney风格像素按钮）
    var blink = Math.floor(G.t * 2) % 2;
    var btnW = 180, btnH = 30;
    var btnX = VW / 2 - btnW / 2, btnY = 165;
    if (blink) {
      // 真实Kenney素材：红色矩形按钮（tile 4,2）
      var startDrew = drawUITile(4, 2, btnX, btnY, btnW, btnH);
      if (!startDrew) {
        // 回退：代码绘制
        ctx.fillStyle = '#5a3e2b';
        ctx.fillRect(btnX, btnY, btnW, btnH);
        ctx.fillStyle = '#ff8c42';
        ctx.fillRect(btnX + 3, btnY + 3, btnW - 6, btnH - 6);
      }
      // 文字
      ctx.font = '11px "Fusion Pixel",monospace';
      ctx.fillStyle = '#fff';
      ctx.fillText('按 回车 开始', VW / 2, btnY + 19);
    }

    // 底部信息（深棕色）
    ctx.font = '10px "Fusion Pixel",monospace';
    ctx.fillStyle = 'rgba(90,62,43,0.8)';
    ctx.fillText('已解锁世界 ' + PG.save.load().unlocked + '/5   星辰碎片 ' + PG.save.load().stars + '/30', VW / 2, 250);

    ctx.textAlign = 'left';
  }

  function renderMap() {
    // 暖色调选关界面：暖米色背景 + 橙金卡片
    var ctx = uctx;

    // 暖米色背景
    var bgGrad = ctx.createLinearGradient(0, 0, 0, VH);
    bgGrad.addColorStop(0, '#fff5e6');
    bgGrad.addColorStop(1, '#ffe8cc');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, VW, VH);

    // 背景装饰（暖橙色小点）
    ctx.fillStyle = 'rgba(255,150,80,0.1)';
    for (var s = 0; s < 30; s++) {
      var sx = (s * 97) % VW, sy = (s * 53) % VH;
      ctx.fillRect(sx, sy, 2, 2);
    }

    ctx.textAlign = 'center';

    // 标题（暖棕色，像素字体原生尺寸）
    ctx.font = '14px "Fusion Pixel",monospace';
    ctx.fillStyle = '#8b4513';
    ctx.fillText('选择世界', VW / 2, 28);
    ctx.font = '10px "Fusion Pixel",monospace';
    ctx.fillStyle = '#a67c52';
    ctx.fillText('← → 选择世界    ↑ ↓ 选择关卡    回车 开始', VW / 2, 46);

    var d = PG.save.load();
    var n = 5;
    var cardW = 82, cardH = 140, gap = 8;
    var totalW = n * cardW + (n - 1) * gap;
    var x0 = (VW - totalW) / 2;

    for (var i = 0; i < n; i++) {
      var th = PG.WORLDS[i];
      var x = x0 + i * (cardW + gap);
      var y = 60;
      var locked = (i + 1) > d.unlocked;
      var sel = i === G.selWorld;

      // 真实Kenney素材：米色边框面板（tile 5,0），未加载成功时回退到代码绘制
      var drew = drawUITile(locked ? 6 : 5, 0, x, y, cardW, cardH);
      if (!drew) {
        // 回退：代码绘制奶油色面板
        ctx.fillStyle = '#5a3e2b';
        ctx.fillRect(x, y, cardW, cardH);
        ctx.fillStyle = locked ? '#d4c4a8' : '#f5e6c8';
        ctx.fillRect(x + 3, y + 3, cardW - 6, cardH - 6);
      }
      // 选中时加橙色高亮边框
      if (sel) {
        ctx.strokeStyle = '#ff6b35';
        ctx.lineWidth = 3;
        ctx.strokeRect(x - 2, y - 2, cardW + 4, cardH + 4);
      }

      // 世界预览色块（顶部）
      var previewH = 40;
      if (!locked) {
        // 预览区奶油色边框
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(x + 6, y + 6, cardW - 12, previewH);
        ctx.fillStyle = th.sky[0];
        ctx.fillRect(x + 8, y + 8, cardW - 16, previewH - 4);
        ctx.fillStyle = th.sky[1] || th.sky[0];
        ctx.fillRect(x + 8, y + previewH - 4, cardW - 16, 6);
      } else {
        ctx.fillStyle = '#b8a888';
        ctx.fillRect(x + 6, y + 6, cardW - 12, previewH);
      }

      // 世界名称
      ctx.font = '11px "Fusion Pixel",monospace';
      ctx.fillStyle = locked ? '#b8a080' : '#5a3e2b';
      ctx.fillText(th.name, x + cardW / 2, y + 18);
      ctx.font = '9px "Fusion Pixel",monospace';
      ctx.fillStyle = locked ? '#c0a888' : '#8b5a2b';
      ctx.fillText(locked ? '未解锁' : '第' + (i+1) + '世界', x + cardW / 2, y + 34);

      // 关卡列表
      for (var l = 0; l < 3; l++) {
        var ly = y + previewH + 10 + l * 28;
        var info = d.levels[i + '-' + l] || { stars: 0, cleared: false };
        var lvLocked = locked;
        var isSel = sel && l === G.selLevel;

        // 真实Kenney素材：红色矩形按钮（tile 4,2）
        if (isSel) {
          var btnDrew = drawUITile(4, 2, x + 6, ly, cardW - 12, 22);
          if (!btnDrew) {
            // 回退：代码绘制
            ctx.fillStyle = '#5a3e2b';
            ctx.fillRect(x + 6, ly, cardW - 12, 22);
            ctx.fillStyle = '#ff8c42';
            ctx.fillRect(x + 8, ly + 2, cardW - 16, 18);
          }
        }

        ctx.font = '9px "Fusion Pixel",monospace';
        ctx.fillStyle = lvLocked ? '#b8a080' : '#6b4423';
        ctx.textAlign = 'left';
        var label = l === 2 ? 'BOSS' : (i+1) + '-' + (l+1);
        ctx.fillText(label, x + 12, ly + 15);

        // 星星
        if (!lvLocked && info.stars > 0) {
          ctx.textAlign = 'right';
          ctx.font = '8px "Fusion Pixel",monospace';
          ctx.fillStyle = '#ff9500';
          ctx.fillText('★'.repeat(info.stars), x + cardW - 10, ly + 15);
        }
        ctx.textAlign = 'center';
      }
    }

    // 底部说明
    ctx.font = '9px "Fusion Pixel",monospace';
    ctx.fillStyle = '#8b5a2b';
    var desc = [
      '草原世界 · 适合新手入门',
      '森林世界 · 高低错落地形',
      '沙漠世界 · 流沙减速陷阱',
      '冰川世界 · 地面打滑冰面',
      '城堡世界 · 终极BOSS决战'
    ][G.selWorld];
    ctx.fillText(desc, VW / 2, 225);
    ctx.fillStyle = '#a67c52';
    ctx.font = '10px "Fusion Pixel",monospace';
    ctx.fillText('回车 出发    Esc 返回标题', VW / 2, 248);

    ctx.textAlign = 'left';
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function renderOverlayPanel(title, lines, accent) {
    // 结算 / 暂停 / 结束面板：改画到原生分辨率层
    var ctx = uctx;
    ctx.fillStyle = 'rgba(6,4,14,.78)';
    ctx.fillRect(0, 0, VW, VH);
    var w = 300, h = 40 + lines.length * 18 + 26;
    var x = (VW - w) / 2, y = (VH - h) / 2;
    ctx.fillStyle = 'rgba(28,20,52,.96)';
    roundRect(ctx, x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = accent || '#ffe066'; ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 8); ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = 'bold 16px "Fusion Pixel",monospace';
    ctx.fillStyle = accent || '#ffe066';
    ctx.fillText(title, VW / 2, y + 30);
    ctx.font = '11px "Fusion Pixel",monospace';
    ctx.fillStyle = '#e8e2ff';
    for (var i = 0; i < lines.length; i++) {
      ctx.fillStyle = lines[i].c || '#e8e2ff';
      ctx.fillText(lines[i].t, VW / 2, y + 56 + i * 18);
    }
    ctx.textAlign = 'left';
  }

  function renderClear() {
    var ctx = uctx;
    var ci = G.clearInfo;
    var th = PG.WORLDS[ci.w];
    var lines = [];
    if (ci.isBonus) {
      lines.push({ t: '密室彩蛋通关！', c: '#ffe066' });
      lines.push({ t: '金币累计 ' + G.coins, c: '#fff' });
    } else {
      lines.push({ t: '星辰碎片 ' + ci.stars + ' / 3', c: ci.stars === 3 ? '#ffe066' : '#e8e2ff' });
      lines.push({ t: '时间奖励 +' + ci.timeBonus, c: '#7cf5ff' });
      lines.push({ t: '金币累计 ' + ci.coins, c: '#fff' });
    }
    if (ci.isBoss) {
      var story = [
        '荆棘巨兽倒下，草原重见阳光，通往森林的路打开了。',
        '暗影树人化作飞灰，迷雾散去，森林重新有了鸟鸣。',
        '流沙巨蝎沉入地底，沙暴平息，绿洲在远处浮现。',
        '寒冰巨熊崩解，冰川开始融化，春水漫过大地。'
      ][ci.w];
      lines.push({ t: story, c: '#9be36a' });
      if (ci.w < 4) lines.push({ t: '★ 解锁「' + PG.WORLDS[ci.w + 1].name + '」', c: '#ffe066' });
      else lines.push({ t: '童话大陆的黑暗，被你终结了。', c: '#ffe066' });
    }
    var title = ci.isBonus ? '密室通关' : (ci.isBoss ? '世界通关 · ' + th.name : '关卡完成');
    renderOverlayPanel(title, lines, ci.isBoss ? '#ff8c42' : '#ffe066');
    ctx.textAlign = 'center';
    ctx.font = '10px "Fusion Pixel",monospace';
    ctx.fillStyle = Math.floor(G.t * 2) % 2 ? '#ffe066' : '#7a6fa8';
    ctx.fillText('按 Enter 继续', VW / 2, VH - 26);
    ctx.textAlign = 'left';
  }

  /* ---------------- 状态更新 ---------------- */
  function update(dt) {
    G.t += dt;
    var IN = PG.input;

    if (IN.pressed('mute')) {
      PG.audio.on = !PG.audio.on;
      PG.audio.musicOn = PG.audio.on;
      if (PG.audio.on && G.state === 'play') PG.audio.startWorldMusic(G.world, G.level === 2);
      else PG.audio.stopMusic();
      G.msg = PG.audio.on ? '音效开' : '音效关'; G.msgT = 1.2;
    }

    if (IN.pressed('fullscreen')) toggleFullscreen();

    switch (G.state) {
      case 'title':
        if (IN.pressed('confirm') || IN.pressed('jump')) {
          PG.audio.resume(); PG.audio.sfx('select');
          goLandscape();                       // 借用这次手势请求横屏全屏
          G.selWorld = 0; G.selLevel = 0;
          G.state = 'map';
        }
        break;

      case 'map': {
        if (IN.pressed('left'))  { G.selWorld = (G.selWorld + 4) % 5; G.selLevel = 0; PG.audio.sfx('select'); }
        if (IN.pressed('right')) { G.selWorld = (G.selWorld + 1) % 5; G.selLevel = 0; PG.audio.sfx('select'); }
        if (IN.pressed('up'))    { G.selLevel = (G.selLevel + 2) % 3; PG.audio.sfx('select'); }
        if (IN.pressed('down'))  { G.selLevel = (G.selLevel + 1) % 3; PG.audio.sfx('select'); }
        if (IN.pressed('confirm') || IN.pressed('jump')) {
          var d = PG.save.load();
          if (G.selWorld + 1 <= d.unlocked) {
            G.lives = 5; G.score = 0; G.coins = 0; G.starTaken = {};
            PG.audio.resume();
            G.loadLevel(G.selWorld, G.selLevel);
          } else {
            G.msg = '这个世界还没解锁，先通关前面的 BOSS 关'; G.msgT = 1.8;
          }
        }
        if (IN.pressed('pause')) { G.state = 'title'; PG.audio.startMusic('title'); }
        break;
      }

      case 'play':
        updatePlay(dt);
        if (IN.pressed('pause')) { G.state = 'paused'; PG.audio.stopMusic(); }
        if (IN.pressed('restart')) { G.loseLife(); }
        break;

      case 'paused':
        if (IN.pressed('pause') || IN.pressed('confirm')) {
          G.state = 'play'; PG.audio.startWorldMusic(G.world, G.level === 2);
        }
        if (IN.pressed('left')) { G.lives = 5; G.loadLevel(G.world, G.level); }
        if (IN.pressed('right')) { G.state = 'map'; }
        break;

      case 'clear': {
        var ci = G.clearInfo;
        if (IN.pressed('confirm') || IN.pressed('jump')) {
          if (ci.isBonus) { G.exitBonus(); }
          else if (ci.w === 4 && ci.l === 2) { G.state = 'victory'; }
          else { G.state = 'map'; G.selWorld = ci.w; G.selLevel = ci.l; PG.audio.stopMusic(); }
        }
        break;
      }

      case 'gameover':
        if (IN.pressed('confirm') || IN.pressed('jump')) {
          G.lives = 5; G.score = 0; G.loadLevel(G.world, G.level);
        }
        if (IN.pressed('pause')) { G.state = 'map'; PG.audio.stopMusic(); }
        break;

      case 'victory':
        if (IN.pressed('confirm') || IN.pressed('jump')) { G.state = 'title'; PG.audio.startMusic('title'); }
        break;
    }
  }

  /* ---------------- 渲染分发 ---------------- */
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, VW, VH);
    // UI 层每帧重画。这里不能重置它的 transform —— 缩放比例就存在那儿
    if (uctx !== ctx) uctx.clearRect(0, 0, VW, VH);
    switch (G.state) {
      case 'title': renderTitle(); break;
      case 'map': renderMap(); break;
      case 'play':
      case 'paused':
        renderPlay();
        if (G.state === 'paused') {
          renderOverlayPanel('暂停', [
            { t: 'R 星辰回溯 · 本关用了 ' + PG.rewind.uses + ' 次，救回 ' + PG.rewind.rescues + ' 条命', c: '#7cf5ff' },
            { t: '星辰能量 ' + Math.round(PG.rewind.energy * 100) + '%（吃金币和星辰碎片回复）', c: '#9ff8ff' },
            { t: '← 重新开始本关（生命回满）', c: '#cfe6ff' },
            { t: '→ 返回秘境地图', c: '#cfe6ff' },
            { t: 'P / Enter 继续冒险', c: '#ffe066' }
          ], '#7cf5ff');
        }
        break;
      case 'clear': renderPlay(); renderClear(); break;
      case 'gameover':
        renderPlay();
        renderOverlayPanel('冒险结束', [
          { t: '生命耗尽了，但童话大陆还在等你。', c: '#e8e2ff' },
          { t: '本次得分 ' + G.score, c: '#7cf5ff' },
          { t: '按 Enter 重新挑战本关', c: '#ffe066' },
          { t: 'Esc 回到秘境地图', c: '#8d80b8' }
        ], '#ff5a7a');
        break;
      case 'victory': {
        var g = ctx.createLinearGradient(0, 0, 0, VH);
        g.addColorStop(0, '#2b1f4d'); g.addColorStop(1, '#0f0a1c');
        ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
        for (var s = 0; s < 80; s++) {
          var sx = (s * 97 + G.t * 12) % VW, sy = (s * 53) % VH;
          ctx.fillStyle = 'rgba(255,224,102,' + (0.2 + 0.6 * Math.abs(Math.sin(G.t * 3 + s))) + ')';
          ctx.fillRect(sx, sy, 2, 2);
        }
        // 背景与星星留在世界层（像素方块要锐利），文字走 UI 层
        var u = uctx;
        u.textAlign = 'center';
        u.font = 'bold 22px "Fusion Pixel",monospace';
        u.fillStyle = '#ffe066';
        u.fillText('星辰重燃 · 大陆重光', VW / 2, 90);
        u.font = '11px "Fusion Pixel",monospace';
        u.fillStyle = '#e8e2ff';
        var lines = [
          '暗影领主消散在光里，散落的星辰碎片重新聚成水晶。',
          '草原重新泛绿，森林有了鸟鸣，沙漠落下第一场雨，',
          '冰川融水汇成溪流，城堡的黑雾散尽。',
          '小星冒险家把帽子扶正，转身走向下一段旅程。',
          '',
          '最终得分 ' + G.score + '   星辰碎片 ' + PG.save.load().stars + '/30',
          '感谢游玩 · 像素童话大陆'
        ];
        lines.forEach(function (t, i) { u.fillText(t, VW / 2, 130 + i * 20); });
        u.fillStyle = Math.floor(G.t * 2) % 2 ? '#ffe066' : '#7a6fa8';
        u.font = 'bold 11px "Fusion Pixel",monospace';
        u.fillText('按 Enter 回到标题', VW / 2, 260);
        u.textAlign = 'left';
        break;
      }
    }
  }

  /* ---------------- 主循环 ---------------- */
  var last = 0, acc = 0;
  function frame(now) {
    if (!last) last = now;
    var dt = Math.min(0.06, (now - last) / 1000);
    last = now;
    acc += dt;
    var guard = 0;
    while (acc >= STEP && guard++ < 5) {
      update(STEP);
      PG.input.clearEdge();
      acc -= STEP;
    }
    render();
    requestAnimationFrame(frame);
  }

  /* ---------------- 自适应缩放（横屏铺满） ---------------- */
  function isTouch() { return document.body.classList.contains('touch'); }
  function isPortrait() { return window.innerHeight > window.innerWidth; }

  function fit() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var touch = isTouch();
    // 桌面端留出边距放操作提示；移动端铺满
    var padX = touch ? 0 : 48;
    var padY = touch ? 4 : 52;
    var sw = Math.max(240, vw - padX);
    var sh = Math.max(160, vh - padY);
    var s = Math.min(sw / VW, sh / VH);
    // 大屏用 0.5 的整数倍，保证像素锐利；小屏（手机）直接铺满
    if (s >= 2) s = Math.floor(s * 2) / 2;
    var cssW = Math.round(VW * s), cssH = Math.round(VH * s);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    // UI 层跟着世界层一起缩放，保证两层像素严丝合缝
    fitUI(cssW, cssH);
  }

  /* 竖屏时提示旋转 */
  function checkOrient() {
    document.body.classList.toggle('need-rotate', isTouch() && isPortrait());
    fit();
  }

  /* 进入横屏全屏（必须在用户手势里调用） */
  function goLandscape() {
    var el = document.documentElement;
    try {
      if (!document.fullscreenElement && el.requestFullscreen) {
        el.requestFullscreen({ navigationUI: 'hide' }).catch(function () {});
      }
    } catch (e) {}
    try {
      if (screen.orientation && screen.orientation.lock) {
        setTimeout(function () {
          try { screen.orientation.lock('landscape').catch(function () {}); } catch (e) {}
        }, 220);
      }
    } catch (e) {}
  }
  function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen();
      } else goLandscape();
    } catch (e) {}
  }

  window.addEventListener('resize', checkOrient);
  window.addEventListener('orientationchange', function () { setTimeout(checkOrient, 140); });

  /* ---------------- 触摸按键 ---------------- */
  var touchRoot = document.getElementById('touch');
  if (touchRoot && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
    PG.bindTouch(touchRoot);
  }
  checkOrient();

  /* 首次交互解锁音频 */
  window.addEventListener('pointerdown', function once() {
    PG.audio.resume();
    if (G.state === 'title') PG.audio.startMusic('title');
    window.removeEventListener('pointerdown', once);
  });

  /* 清空存档 */
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Delete' && (G.state === 'title' || G.state === 'map')) {
      PG.save.reset();
      G.msg = '存档已清空'; G.msgT = 1.5;
    }
  });

  /* 等像素字体加载完成后再启动，避免canvas用fallback字体 */
  function startGame() {
    requestAnimationFrame(frame);

    /* 调试入口：?level=w-l 直接进关 */
    var m = /[?&]level=(\d)-(\d)/.exec(location.search);
    if (m) {
      G.lives = 5; G.selWorld = +m[1]; G.selLevel = +m[2];
      G.loadLevel(+m[1], +m[2]);
    }
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(startGame);
  } else {
    startGame();
  }

})(window.PG);
