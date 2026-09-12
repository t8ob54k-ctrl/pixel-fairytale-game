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
    PG.audio.startMusic(w);
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
    ctx.font = '9px "PingFang SC","Microsoft YaHei",sans-serif';
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
    // 整段改画到原生分辨率 UI 层：坐标不变，字变清晰
    var ctx = uctx;
    var lv = G.lv;
    // BOSS 血条占着 HUD 正下方那条带（y=20..41），下面几处都要给它让位
    var bossRef = null;
    for (var bi = 0; bi < G.ents.length; bi++) {
      var be = G.ents[bi];
      if (be.type === 'boss' && !be.dead && be.hp > 0) { bossRef = be; break; }
    }
    var bossOn = !!bossRef;
    ctx.font = '9px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'left';

    // 半透明底
    ctx.fillStyle = 'rgba(10,6,20,.42)';
    ctx.fillRect(0, 0, VW, 16);

    var th = PG.WORLDS[lv.world];
    ctx.fillStyle = '#fff';
    ctx.fillText((lv.isBonus ? '密室彩蛋' : th.name + ' · ' + (lv.index + 1) + '-关'), 6, 11);

    // 金币
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(150, 5, 6, 7);
    ctx.fillStyle = '#c9922a';
    ctx.fillRect(151, 6, 4, 5);
    ctx.fillStyle = '#fff';
    ctx.fillText('×' + G.coins, 160, 11);

    // 星星
    ctx.fillStyle = '#ffe066';
    ctx.fillText('★ ' + G.stars + '/3', 200, 11);

    // 生命
    ctx.fillStyle = '#ff5a7a';
    ctx.fillText('♥ ×' + Math.max(0, G.lives), 250, 11);

    // 得分
    ctx.fillStyle = '#cfe6ff';
    ctx.fillText('SCORE ' + G.score, 300, 11);

    // 时间
    var t = Math.ceil(G.time);
    ctx.fillStyle = t < 30 ? (Math.floor(G.t * 6) % 2 ? '#ff5a7a' : '#fff') : '#fff';
    ctx.textAlign = 'right';
    ctx.fillText('⏱ ' + t, VW - 6, 11);
    ctx.textAlign = 'left';

    // 状态图标
    var p = G.player;
    if (p) {
      var ix = 6, iy = bossOn ? 52 : 22;
      if (p.form === 'fire') { ctx.fillStyle = '#ff6b35'; ctx.fillText('火焰', ix, iy + 8); ix += 34; }
      if (p.shield > 0) { ctx.fillStyle = '#7ce8ff'; ctx.fillText('护盾×' + p.shield, ix, iy + 8); ix += 48; }
      if (p.speedT > 0) { ctx.fillStyle = '#7cf5ff'; ctx.fillText('极速 ' + p.speedT.toFixed(0), ix, iy + 8); ix += 46; }
      if (p.starT > 0) { ctx.fillStyle = '#ffe066'; ctx.fillText('无敌 ' + p.starT.toFixed(0), ix, iy + 8); }
    }

    /* 星辰能量条 —— 回溯的燃料，左下角常驻 */
    var rw = PG.rewind;
    ctx.fillStyle = 'rgba(10,6,20,.46)';
    ctx.fillRect(0, VH - 20, 178, 20);
    ctx.fillStyle = rw.energy > 0.18 ? '#9ff8ff' : '#ff7a9a';
    ctx.fillText('星辰', 6, VH - 8);
    PG.rewind.bar(ctx, 30, VH - 13, 86, 6, rw.energy);
    if (rw.active) {
      ctx.fillStyle = '#9ff8ff';
      ctx.fillText('倒流中…', 122, VH - 8);
    } else if (rw.can()) {
      ctx.fillStyle = (Math.floor(G.t * 2.5) % 2 === 0) ? '#7cf5ff' : '#3d8fa8';
      ctx.fillText('R 回溯', 122, VH - 8);
    } else {
      ctx.fillStyle = '#6a5f90';
      ctx.fillText(rw.buf.length <= 2 ? '记录中…' : '能量不足', 122, VH - 8);
    }

    // 中央提示（有 BOSS 时让开血条）
    if (G.msg) {
      var my = bossOn ? 52 : 34;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      var w = ctx.measureText(G.msg).width + 20;
      ctx.fillRect(VW / 2 - w / 2, my, w, 18);
      ctx.fillStyle = '#ffe066';
      ctx.fillText(G.msg, VW / 2, my + 13);
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
      ctx.font = '9px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.name + (b.phase === 2 ? ' · 二阶段' : ''), VW / 2, by + 17);
      ctx.textAlign = 'left';
    }
  }

  /* ---------------- 标题 / 地图 / 结算 ---------------- */
  function renderTitle() {
    // 标题页整页都是 UI：改画到原生分辨率层
    var ctx = uctx;
    var g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#2b1f4d'); g.addColorStop(1, '#0f0a1c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);

    for (var s = 0; s < 70; s++) {
      var sx = (s * 97) % VW, sy = (s * 53) % VH;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.15 + 0.5 * Math.abs(Math.sin(G.t * 2 + s))) + ')';
      ctx.fillRect(sx, sy, 1, 1);
    }

    // 轻量界面装饰：月晕、顶部章节签和半透明操作卡片
    ctx.strokeStyle = 'rgba(124,245,255,.13)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(VW / 2, 112, 74, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(VW / 2, 112, 86, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    roundRect(ctx, 18, 14, 88, 18, 9); ctx.fill();
    ctx.font = 'bold 8px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#9ff8ff';
    ctx.textAlign = 'center';
    ctx.fillText('CHAPTER 01 · 星之旅', 62, 26);

    ctx.fillStyle = 'rgba(10,6,22,.58)';
    roundRect(ctx, 66, 150, 348, 52, 9); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.10)';
    roundRect(ctx, 66, 150, 348, 52, 9); ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = 'bold 30px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#000';
    ctx.fillText('像素童话大陆', VW / 2 + 2, 84 + 2);
    var tg = ctx.createLinearGradient(0, 58, 0, 90);
    tg.addColorStop(0, '#ffe066'); tg.addColorStop(1, '#ff8c42');
    ctx.fillStyle = tg;
    ctx.fillText('像素童话大陆', VW / 2, 84);

    ctx.font = '12px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#9be36a';
    ctx.fillText('小 星 冒 险 家', VW / 2, 106);

    // 主角站台
    var bob = Math.sin(G.t * 2) * 3;
    PG.drawSpr(ctx, PG.SPR.heroIdle, VW / 2 - 6, 128 + bob, false, null);

    ctx.font = '9px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#cfe6ff';
    ctx.fillText('← →  移动     Z / 空格  跳跃     X / Shift  冲刺·火球', VW / 2, 165);

    /* 核心机制单独高亮一行，别埋进按键列表里 */
    var rp = 0.68 + 0.32 * Math.sin(G.t * 2.6);
    ctx.font = 'bold 11px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(124,245,255,' + rp.toFixed(2) + ')';
    ctx.fillText('R  星辰回溯 · 把时间拨回去 5 秒', VW / 2, 183);
    ctx.font = '8px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#9387b8';
    ctx.fillText('倒流留下的轨迹，将凝成一座「残影之桥」', VW / 2, 196);

    var blink = Math.floor(G.t * 2) % 2;
    ctx.fillStyle = blink ? 'rgba(255,224,102,.2)' : 'rgba(138,108,255,.18)';
    roundRect(ctx, 146, 207, 188, 26, 13); ctx.fill();
    ctx.strokeStyle = blink ? 'rgba(255,224,102,.6)' : 'rgba(138,108,255,.45)';
    roundRect(ctx, 146, 207, 188, 26, 13); ctx.stroke();
    ctx.fillStyle = blink ? '#ffe066' : '#c9bcff';
    ctx.font = 'bold 11px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('ENTER / 空格  开始冒险', VW / 2, 224);

    ctx.font = '9px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#6a5f90';
    ctx.fillText('进度：已解锁 ' + PG.save.load().unlocked + '/5 个世界   星辰碎片 ' + PG.save.load().stars + '/30   （Delete 清空存档）', VW / 2, 248);
    ctx.textAlign = 'left';
  }

  function renderMap() {
    // 秘境地图整页都是 UI：改画到原生分辨率层
    var ctx = uctx;
    var g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#1c1436'); g.addColorStop(1, '#0d0819');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);

    ctx.textAlign = 'center';
    ctx.font = 'bold 13px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#ffe066';
    ctx.fillText('选择秘境   ← → 换世界   ↑ ↓ 换关卡   Enter 出发', VW / 2, 22);

    var d = PG.save.load();
    var n = 5, cw = 84, gap = 6;
    var totalW = n * cw + (n - 1) * gap;
    var x0 = (VW - totalW) / 2;

    for (var i = 0; i < n; i++) {
      var th = PG.WORLDS[i];
      var x = x0 + i * (cw + gap), y = 44, h = 168;
      var locked = (i + 1) > d.unlocked;
      var sel = i === G.selWorld;

      ctx.fillStyle = locked ? 'rgba(30,24,50,.85)' : 'rgba(40,30,72,.9)';
      roundRect(ctx, x, y, cw, h, 6); ctx.fill();

      // 顶部色带
      ctx.fillStyle = locked ? '#2a2340' : th.sky[0];
      roundRect(ctx, x, y, cw, 34, 6); ctx.fill();
      ctx.fillStyle = locked ? '#3a3355' : th.sky[1];
      ctx.fillRect(x, y + 24, cw, 10);

      ctx.font = 'bold 11px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = locked ? '#6a5f90' : '#fff';
      ctx.fillText(th.name, x + cw / 2, y + 16);
      ctx.font = '8px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = locked ? '#4a4166' : 'rgba(255,255,255,.75)';
      ctx.fillText(th.sub, x + cw / 2, y + 28);

      // 世界小图标
      var iy = y + 48;
      ctx.fillStyle = locked ? '#3a3355' : th.hill[0];
      ctx.beginPath();
      ctx.moveTo(x + 12, iy + 22); ctx.lineTo(x + cw / 2, iy - 4); ctx.lineTo(x + cw - 12, iy + 22);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = locked ? '#4a4166' : th.top;
      ctx.fillRect(x + 12, iy + 22, cw - 24, 4);

      // 关卡行
      for (var l = 0; l < 3; l++) {
        var ly = y + 86 + l * 24;
        var info = d.levels[i + '-' + l] || { stars: 0, cleared: false };
        var lvLocked = locked;
        var isSel = sel && l === G.selLevel;
        ctx.fillStyle = isSel ? 'rgba(255,224,102,.22)' : 'rgba(255,255,255,.05)';
        roundRect(ctx, x + 8, ly, cw - 16, 20, 4); ctx.fill();
        if (isSel) { ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 1; roundRect(ctx, x + 8, ly, cw - 16, 20, 4); ctx.stroke(); }

        ctx.font = '9px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillStyle = lvLocked ? '#4a4166' : '#e8e2ff';
        ctx.textAlign = 'left';
        var label = l === 2 ? 'BOSS 关' : (l + 1) + '-关';
        ctx.fillText(lvLocked ? '🔒 ' + label : label, x + 13, ly + 14);
        ctx.textAlign = 'right';
        if (!lvLocked) {
          for (var s2 = 0; s2 < 3; s2++) {
            ctx.fillStyle = s2 < info.stars ? '#ffe066' : 'rgba(255,255,255,.18)';
            ctx.fillText('★', x + cw - 12 - (2 - s2) * 8, ly + 14);
          }
          if (info.cleared) { ctx.fillStyle = '#7cf5ff'; ctx.fillText('✓', x + cw - 46, ly + 14); }
        }
        ctx.textAlign = 'center';
      }
      ctx.textAlign = 'center';
    }

    // 当前世界详情
    var th2 = PG.WORLDS[G.selWorld];
    ctx.font = '10px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#cfe6ff';
    var desc = [
      '阳光草地，机关简单，藏着不少隐形砖块与密室入口。',
      '薄雾笼罩，地形高低错落，飞行怪物遍布林间。',
      '黄沙漫天，流沙减速、塌陷砖块，关卡限时更紧。',
      '地面打滑、平台狭窄，寒冰精灵会让你减速。',
      '黑暗笼罩，全部高阶怪物齐聚，终点是暗影领主。'
    ][G.selWorld];
    ctx.fillText(desc, VW / 2, 232);
    ctx.fillStyle = '#8d80b8';
    ctx.font = '9px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('Enter 出发    Esc 返回标题    Delete 清空存档', VW / 2, 252);
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
    ctx.font = 'bold 16px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = accent || '#ffe066';
    ctx.fillText(title, VW / 2, y + 30);
    ctx.font = '11px "PingFang SC","Microsoft YaHei",sans-serif';
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
    ctx.font = '10px "PingFang SC","Microsoft YaHei",sans-serif';
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
      if (PG.audio.on && G.state === 'play') PG.audio.startMusic(G.world);
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
        if (IN.pressed('pause')) { G.state = 'title'; }
        break;
      }

      case 'play':
        updatePlay(dt);
        if (IN.pressed('pause')) { G.state = 'paused'; PG.audio.stopMusic(); }
        if (IN.pressed('restart')) { G.loseLife(); }
        break;

      case 'paused':
        if (IN.pressed('pause') || IN.pressed('confirm')) {
          G.state = 'play'; PG.audio.startMusic(G.world);
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
        if (IN.pressed('confirm') || IN.pressed('jump')) { G.state = 'title'; }
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
        u.font = 'bold 22px "PingFang SC","Microsoft YaHei",sans-serif';
        u.fillStyle = '#ffe066';
        u.fillText('星辰重燃 · 大陆重光', VW / 2, 90);
        u.font = '11px "PingFang SC","Microsoft YaHei",sans-serif';
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
        u.font = 'bold 11px "PingFang SC","Microsoft YaHei",sans-serif';
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
    window.removeEventListener('pointerdown', once);
  });

  /* 清空存档 */
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Delete' && (G.state === 'title' || G.state === 'map')) {
      PG.save.reset();
      G.msg = '存档已清空'; G.msgT = 1.5;
    }
  });

  requestAnimationFrame(frame);

  /* 调试入口：?level=w-l 直接进关 */
  var m = /[?&]level=(\d)-(\d)/.exec(location.search);
  if (m) {
    G.lives = 5; G.selWorld = +m[1]; G.selLevel = +m[2];
    G.loadLevel(+m[1], +m[2]);
  }

})(window.PG);
