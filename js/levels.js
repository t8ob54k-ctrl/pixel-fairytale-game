/* ============================================================
   levels.js —— 关卡生成 + 地块绘制 + 视差背景
   五大世界 × 3 关（前两关横版闯关，第三关 BOSS 竞技场）
   ============================================================ */
(function (PG) {
  'use strict';

  var TILE = PG.TILE, ROWS = PG.ROWS;

  /* ---------------- 地块类型 ---------------- */
  var T = PG.T = {
    EMPTY: 0, GROUND: 1, BRICK: 2, QBLOCK: 3, HIDDEN: 4, USED: 5,
    SPIKE: 6, CRUMBLE: 7, ICE: 8, SLOW: 9, PLATFORM: 10, GOAL: 11, WALL: 12
  };
  PG.isSolid = function (t) {
    return t === T.GROUND || t === T.BRICK || t === T.QBLOCK || t === T.USED ||
           t === T.CRUMBLE || t === T.ICE || t === T.SLOW || t === T.WALL;
  };
  PG.isOneWay  = function (t) { return t === T.PLATFORM; };
  PG.isHazard  = function (t) { return t === T.SPIKE; };
  PG.isBumpable= function (t) { return t === T.BRICK || t === T.QBLOCK || t === T.HIDDEN; };

  /* 确定性噪声，用于贴图纹理 */
  PG.hash = function (x, y) {
    var h = (x | 0) * 374761393 + (y | 0) * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  };

  /* ---------------- 关卡对象 ---------------- */
  function makeLevel(w, l) {
    return {
      world: w, index: l, isBoss: l === 2, isBonus: false,
      cols: 0, rows: ROWS, tiles: null,
      payload: {},          // "c,r" -> 道具类型
      spawns: [],
      start: { x: 3 * TILE, y: 10 * TILE },
      goalCol: 0,
      timeLimit: 200,
      theme: PG.WORLDS[w],
      checkpoints: []
    };
  }
  function idx(lv, c, r) { return r * lv.cols + c; }
  function set(lv, c, r, t) {
    if (c < 0 || c >= lv.cols || r < 0 || r >= lv.rows) return;
    lv.tiles[idx(lv, c, r)] = t;
  }
  function get(lv, c, r) {
    if (c < 0 || c >= lv.cols) return T.WALL;   // 左右边界是墙
    if (r < 0) return T.EMPTY;                  // 上方是天空
    if (r >= lv.rows) return T.EMPTY;           // 下方是深渊：掉出去就摔死，不能有隐形地板
    return lv.tiles[idx(lv, c, r)];
  }
  PG.lvGet = get;
  PG.lvSet = set;

  /* ---------------- 横版关卡生成 ---------------- */
  function buildRun(w, l) {
    var lv = makeLevel(w, l);
    var rng = PG.RNG(0x51ed + w * 977 + l * 131);
    var cols = 148 + w * 10 + l * 16 + PG.range(rng, 0, 24);
    lv.cols = cols;
    lv.tiles = new Uint8Array(cols * ROWS);
    lv.timeLimit = 260 - w * 6 + l * 10;

    var pitChance = [0.26, 0.34, 0.38, 0.40, 0.42][w];
    var maxGap    = [3, 3, 4, 4, 4][w];

    /* --- 1. 先算每列地面高度 ---
       关键约束：抬升越高，能跨越的坑就越窄。
       跳跃初速 370、重力 820 → 最高 83px（5.2 格），跑速 115px/s 时
       空中停留 0.90s ≈ 6.5 格；抬升 2 格时窗口收窄到 4.5 格。
       下面取更保守的值，保证「不按冲刺键也能过」。 */
    var RISE_GAP = [4, 4, 3, 2];
    var heights = new Int16Array(cols).fill(-1);
    var gy = 13, x = 0;
    while (x < cols) {
      var len = PG.range(rng, 8, 16);
      for (var i = 0; i < len && x + i < cols; i++) heights[x + i] = gy;
      x += len;
      if (x < cols - 22 && rng() < pitChance) {
        // 先决定坑后地面的高度，再据此决定坑能挖多宽
        var gy2 = gy;
        if (rng() < 0.45) gy2 = PG.clamp(gy + PG.pick(rng, [-2, -1, 1, 2]), 11, 13);
        var rise = gy - gy2;                                   // >0 = 要往上跳
        var capByRise = RISE_GAP[PG.clamp(rise, 0, 3)];
        var pw = PG.range(rng, 1, Math.max(1, Math.min(maxGap, capByRise)));
        for (var p = 0; p < pw && x + p < cols; p++) heights[x + p] = -1;
        x += pw;
        gy = gy2;
      } else if (rng() < 0.28) {
        gy = PG.clamp(gy + PG.pick(rng, [-1, 1]), 11, 13);
      }
    }
    // 头尾强制平坦
    for (var c = 0; c < 8; c++) heights[c] = 13;
    for (var c2 = cols - 18; c2 < cols; c2++) heights[c2] = 13;

    /* --- 2. 填地面（材质随世界变化） --- */
    var sandPatch = 0;
    for (var cx = 0; cx < cols; cx++) {
      var h = heights[cx];
      if (h < 0) continue;
      for (var r = h; r < ROWS; r++) {
        var t = T.GROUND;
        if (r === h) {
          if (w === 3) t = T.ICE;                       // 冰川：表层打滑
          else if (w === 2) {                           // 沙漠：流沙带
            if (sandPatch === 0 && rng() < 0.16 && cx > 10 && cx < cols - 22) sandPatch = PG.range(rng, 2, 4);
            if (sandPatch > 0) { t = T.SLOW; sandPatch--; }
          }
        }
        set(lv, cx, r, t);
      }
    }

    /* --- 3. 地面装饰与机关（特征之间互不重叠） --- */
    var platformSpots = [];        // 可站立的落脚点，稍后用来放星辰碎片
    var fx = 8;
    while (fx < cols - 20) {
      var hh = heights[fx];
      if (hh < 0) { fx += 4; continue; }
      // 从 fx 起连续的非坑列有多宽。特征一律不许横跨到坑口上方：
      // 否则玩家从坑边起跳时头部会撞在方块上，竖直速度被清零，
      // 跳跃距离从 6 格骤降到 2 格 —— 直接掉坑。
      var freeW = 0;
      while (fx + freeW < cols && heights[fx + freeW] >= 0) freeW++;
      if (freeW < 3) { fx += freeW + 1; continue; }
      var roll = rng();
      var used = 6;
      // 坑后面两格内不放会抬高地面的机关，避免"坑 + 台阶"叠加成跳不过去的高墙
      var nearPit = (fx >= 1 && heights[fx - 1] < 0) || (fx >= 2 && heights[fx - 2] < 0);

      /* 3a. 悬空砖块平台（可踩） */
      if (roll < 0.44) {
        var pw2 = PG.range(rng, 3, 7);
        if (fx + pw2 > cols - 20) pw2 = Math.max(3, cols - 20 - fx);
        var prow = hh - 3;
        var mat = w >= 2 ? (rng() < 0.5 ? T.CRUMBLE : T.BRICK) : T.BRICK;
        if (w === 3 && rng() < 0.4) mat = T.PLATFORM;
        for (var k = 0; k < pw2; k++) set(lv, fx + k, prow, mat);
        platformSpots.push({ c: fx + Math.floor(pw2 / 2), r: prow, base: hh });
        if (rng() < 0.6) for (var k2 = 0; k2 < pw2; k2 += 2)
          lv.spawns.push({ type: 'coin', tx: fx + k2, ty: prow - 1 });
        // 更高一层（要靠下面的平台接力）
        if (rng() < 0.35 && fx + 4 < cols - 20 && freeW >= 5) {
          for (var k3 = 0; k3 < 3; k3++) set(lv, fx + 1 + k3, prow - 3, T.BRICK);
          platformSpots.push({ c: fx + 2, r: prow - 3, base: hh });
        }
        used = pw2 + 1;
      }
      /* 3b. 问号砖块（从下方顶，不改变地面高度） */
      else if (roll < 0.76 || nearPit) {
        var n = PG.range(rng, 1, 4);
        var qrow = hh - 4;
        var powerAt = PG.range(rng, 0, n - 1);
        for (var q = 0; q < n; q++) {
          set(lv, fx + q, qrow, T.QBLOCK);
          lv.payload[(fx + q) + ',' + qrow] = (q === powerAt) ? powerList(w, rng) : 'coin';
        }
        used = n + 1;
      }
      /* 3c. 阶梯 */
      else if (roll < 0.88) {
        var sn = PG.range(rng, 3, 5);
        for (var s = 0; s < sn; s++)
          for (var rr = hh - 1 - s; rr < hh; rr++) set(lv, fx + s, rr, T.GROUND);
        used = sn + 1;
      }
      /* 3d. 尖刺（沙漠之后） */
      else if (w >= 2) {
        var spn = Math.min(PG.range(rng, 1, 2), freeW);
        for (var sp = 0; sp < spn; sp++) set(lv, fx + sp, hh - 1, T.SPIKE);
        used = spn + 1;
      }
      fx += used + PG.range(rng, 2, 6);
    }

    /* --- 3.5. 跳跃走廊（保险层） ---
       上面已经限制特征不许横跨坑口，这里再兜一道底：
       逐个坑打通一条空中走廊，清掉坑口及其两侧一列里所有实心块。
       走廊高度 = 较高一侧地面往上 7 格（跳跃最高 5.2 格 + 身高 0.9 格）。
       单向平台（PLATFORM）保留 —— 从下方可以穿过去，不挡跳。
       这一步只动空中，绝不碰任何一列的地面本体。 */
    for (var cr = 8; cr < cols - 20; cr++) {
      if (heights[cr] !== -1) continue;
      var pa = cr, pb = cr;
      while (pa > 0 && heights[pa - 1] === -1) pa--;
      while (pb < cols - 1 && heights[pb + 1] === -1) pb++;
      cr = pb;
      var gL = heights[pa - 1], gR = heights[pb + 1];
      if (!(gL >= 0)) gL = 13;
      if (!(gR >= 0)) gR = 13;
      var gLo = Math.max(gL, gR);                  // 较低的一侧（行号更大）
      var gHi = Math.min(gL, gR);                  // 起跳的那一侧
      var corTop = Math.max(1, gHi - 7);
      var cFrom = Math.max(0, pa - 1), cTo = Math.min(cols - 1, pb + 1);
      for (var cc = cFrom; cc <= cTo; cc++) {
        var lim = heights[cc] >= 0 ? heights[cc] : gLo;   // 只清地面以上
        for (var rr = corTop; rr < lim; rr++) {
          var tt = PG.lvGet(lv, cc, rr);
          if (tt === T.EMPTY || tt === T.PLATFORM) continue;
          if (PG.isSolid(tt) || tt === T.HIDDEN) {
            set(lv, cc, rr, T.EMPTY);
            delete lv.payload[cc + ',' + rr];
          }
        }
      }
    }

    /* --- 4. 坑上的金币弧线 + 隐藏砖块（密室入口） --- */
    for (var px2 = 9; px2 < cols - 20; px2++) {
      if (heights[px2] === -1) {
        var runStart = px2, runLen = 0;
        while (px2 < cols && heights[px2] === -1) { px2++; runLen++; }
        var mid = runStart + Math.floor(runLen / 2);
        var base = heights[runStart - 1] > 0 ? heights[runStart - 1] : 13;
        for (var q2 = 0; q2 < runLen; q2++) {
          var lift = Math.min(q2, runLen - 1 - q2) + 1;
          lv.spawns.push({ type: 'coin', tx: runStart + q2, ty: base - 2 - lift });
        }
        // 22% 概率在坑上方藏一个隐形砖块：顶出来是金币，第一关那个是密室入口
        if (rng() < 0.22 && runLen >= 2) {
          var hx = mid, hy = base - 4;
          if (PG.lvGet(lv, hx, hy) === T.EMPTY) {
            set(lv, hx, hy, T.HIDDEN);
            var isWarp = (w === 0 && l === 0 && !lv._warpUsed);
            lv.payload[hx + ',' + hy] = isWarp ? 'warp' : 'coins3';
            if (isWarp) lv._warpUsed = true;
          }
        }
      }
    }

    /* --- 5. 敌人布置 --- */
    var groundY = function (c) { return heights[c] >= 0 ? heights[c] : 13; };
    for (var ex = 14; ex < cols - 22; ex += PG.range(rng, 7, 14)) {
      if (heights[ex] < 0) continue;
      var r2 = rng();
      var pool = ['walker'];
      if (w >= 1) pool.push('flyer');
      if (w === 2) pool.push('lurker', 'walker');
      if (w === 3) pool.push('icespirit');
      if (w === 4) pool.push('flyer', 'walker', 'icespirit');
      var type = PG.pick(rng, pool);
      if (r2 < 0.72 || type === 'walker') {
        lv.spawns.push({ type: type, tx: ex, ty: groundY(ex) - 1, dir: rng() < 0.5 ? -1 : 1 });
      } else {
        lv.spawns.push({ type: type, tx: ex, ty: Math.max(3, groundY(ex) - PG.range(rng, 4, 6)), dir: -1 });
      }
    }
    // 巡逻范围：地面怪走完所在平台；飞行怪在出生点左右 8 格内游荡
    lv.spawns.forEach(function (s) {
      if (s.type === 'flyer') {
        s.minX = Math.max(0, (s.tx - 8)) * TILE;
        s.maxX = Math.min(cols, (s.tx + 9)) * TILE;
        return;
      }
      if (s.type !== 'walker' && s.type !== 'lurker' && s.type !== 'icespirit') return;
      var a = s.tx, b = s.tx;
      while (a > 0 && heights[a - 1] >= 0 && heights[a - 1] === heights[s.tx]) a--;
      while (b < cols - 1 && heights[b + 1] >= 0 && heights[b + 1] === heights[s.tx]) b++;
      s.minX = a * TILE; s.maxX = (b + 1) * TILE;
    });

    /* --- 6. 清理：把生成在实心块里的实体挪到上方空位 --- */
    function freeSpot(c, r) {
      if (c < 0 || c >= cols) return -1;
      for (var d = 0; d < 9; d++) {
        var rr = r - d;
        if (rr >= 1 && rr < ROWS - 1 &&
            !PG.isSolid(PG.lvGet(lv, c, rr)) &&
            !PG.isSolid(PG.lvGet(lv, c, rr - 1))) return rr;
      }
      return -1;
    }
    var cleaned = [];
    lv.spawns.forEach(function (s) {
      if (s.type === 'goal') { cleaned.push(s); return; }
      if (PG.isSolid(PG.lvGet(lv, s.tx, s.ty))) {
        var nr = freeSpot(s.tx, s.ty - 1);
        if (nr < 0) return;               // 实在放不下就丢掉
        s.ty = nr;
      }
      cleaned.push(s);
    });
    lv.spawns = cleaned;

    /* --- 7. 星辰碎片 ×3：放在平台落脚点上，保证够得着 --- */
    platformSpots.sort(function (a, b) { return a.c - b.c; });
    var picks = [];
    if (platformSpots.length) {
      picks.push(platformSpots[0]);
      picks.push(platformSpots[Math.floor(platformSpots.length / 2)]);
      picks.push(platformSpots[platformSpots.length - 1]);
    }
    var seenC = {}, finalSpots = [];
    picks.forEach(function (s) { if (!seenC[s.c]) { seenC[s.c] = 1; finalSpots.push(s); } });
    var guard = 0;
    while (finalSpots.length < 3 && guard++ < 30) {
      var cc = PG.clamp(Math.floor(cols * (0.3 + 0.22 * finalSpots.length)) + PG.range(rng, -3, 3), 10, cols - 22);
      var gh = heights[cc] >= 0 ? heights[cc] : 13;
      if (!seenC[cc]) { seenC[cc] = 1; finalSpots.push({ c: cc, r: gh - 3 }); }
    }
    finalSpots.slice(0, 3).forEach(function (s) {
      var r = freeSpot(s.c, s.r - 1);
      if (r < 0) r = Math.max(1, s.r - 1);
      lv.spawns.push({ type: 'bigstar', tx: s.c, ty: r });
    });

    /* --- 8. 中途旗（存档点） --- */
    var cp = Math.floor(cols * 0.52);
    while (cp < cols - 2 && heights[cp] < 0) cp++;
    var cpRow = freeSpot(cp, heights[cp] - 1);
    if (cpRow >= 0) {
      lv.checkpoints.push({ tx: cp, ty: cpRow });
      lv.spawns.push({ type: 'checkpoint', tx: cp, ty: cpRow });
    }

    /* --- 9. 终点旗（旗杆是纯装饰实体，不占地块，避免地面出现坑） --- */
    lv.goalCol = cols - 6;
    lv.spawns.push({ type: 'goal', tx: lv.goalCol, ty: 13 });

    lv.start = { x: 3 * TILE, y: 12 * TILE };
    return lv;
  }

  function powerList(w, rng) {
    var pool = ['star', 'shield', 'speed'];
    if (w >= 1) pool.push('fire');
    if (w >= 2) pool.push('fire', 'star');
    if (w >= 3) pool.push('shield', 'speed');
    return PG.pick(rng, pool);
  }

  /* ---------------- BOSS 竞技场 ---------------- */
  function buildBoss(w) {
    var lv = makeLevel(w, 2);
    var cols = 46;
    lv.cols = cols;
    lv.tiles = new Uint8Array(cols * ROWS);
    lv.timeLimit = 150;
    var gy = 13;
    for (var c = 0; c < cols; c++) {
      for (var r = gy; r < ROWS; r++) set(lv, c, r, w === 3 ? T.ICE : T.GROUND);
    }
    // 两侧墙
    for (var r2 = 4; r2 < ROWS; r2++) { set(lv, 0, r2, T.WALL); set(lv, cols - 1, r2, T.WALL); }
    // 躲避平台
    var plats = [[8, 9], [16, 8], [26, 8], [34, 9]];
    plats.forEach(function (p) { for (var k = 0; k < 4; k++) set(lv, p[0] + k, p[1], T.PLATFORM); });
    // 少量问号块
    [[12, 9], [30, 9]].forEach(function (q) {
      set(lv, q[0], q[1], T.QBLOCK); lv.payload[q[0] + ',' + q[1]] = 'star';
    });
    lv.spawns.push({ type: 'boss', tx: cols - 12, ty: gy - 1, boss: w });
    lv.spawns.push({ type: 'goal', tx: 0, ty: 0, hidden: true });
    lv.goalCol = cols - 1;
    lv.start = { x: 3 * TILE, y: 12 * TILE };
    return lv;
  }

  /* ---------------- 密室彩蛋（隐藏奖励房） ---------------- */
  function buildBonus(w) {
    var lv = makeLevel(w, 0);
    var cols = 34;
    lv.cols = cols; lv.isBonus = true;
    lv.tiles = new Uint8Array(cols * ROWS);
    lv.timeLimit = 30;
    for (var c = 0; c < cols; c++)
      for (var r = 14; r < ROWS; r++) set(lv, c, r, T.GROUND);
    for (var r2 = 3; r2 < ROWS; r2++) { set(lv, 0, r2, T.WALL); set(lv, cols - 1, r2, T.WALL); }
    for (var cx = 2; cx < cols - 3; cx++)
      for (var ry = 6; ry <= 12; ry += 2) lv.spawns.push({ type: 'coin', tx: cx, ty: ry });
    lv.spawns.push({ type: 'bigstar', tx: Math.floor(cols / 2), ty: 4 });
    lv.goalCol = cols - 3;
    lv.spawns.push({ type: 'goal', tx: lv.goalCol, ty: 13 });
    lv.start = { x: 2 * TILE, y: 12 * TILE };
    return lv;
  }

  PG.buildLevel = function (w, l) {
    return l === 2 ? buildBoss(w) : buildRun(w, l);
  };
  PG.buildBonus = buildBonus;

  /* ============================================================
     地块绘制
     ============================================================ */
  PG.drawTile = function (ctx, t, px, py, th, time, c, r) {
    var n = PG.hash(c, r);
    switch (t) {
      case T.GROUND: {
        ctx.fillStyle = th.groundDark; ctx.fillRect(px, py, 16, 16);
        ctx.fillStyle = th.ground;     ctx.fillRect(px, py, 16, 13);
        ctx.fillStyle = th.top;        ctx.fillRect(px, py, 16, 4);
        ctx.fillStyle = th.topDark;    ctx.fillRect(px, py + 4, 16, 2);
        if (n > 0.62) { ctx.fillStyle = th.groundDark; ctx.fillRect(px + Math.floor(n * 10), py + 8, 2, 2); }
        if (n > 0.86) { ctx.fillStyle = th.topDark; ctx.fillRect(px + 3, py + 1, 3, 1); }
        break;
      }
      case T.ICE: {
        ctx.fillStyle = th.groundDark; ctx.fillRect(px, py, 16, 16);
        ctx.fillStyle = th.ground;     ctx.fillRect(px, py, 16, 13);
        ctx.fillStyle = th.top;        ctx.fillRect(px, py, 16, 5);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px + 2 + Math.floor(n * 6), py + 1, 4, 1);
        ctx.globalAlpha = 0.35; ctx.fillRect(px, py + 7, 16, 1); ctx.globalAlpha = 1;
        break;
      }
      case T.SLOW: {
        ctx.fillStyle = '#b98a41'; ctx.fillRect(px, py, 16, 16);
        ctx.fillStyle = '#d8ab5f'; ctx.fillRect(px, py, 16, 12);
        ctx.fillStyle = '#e8c078';
        var w1 = Math.sin(time * 2 + c * 0.7) * 2;
        ctx.fillRect(px, py + 2 + w1, 16, 2);
        ctx.fillStyle = '#a87c38';
        ctx.fillRect(px + Math.floor(n * 12), py + 8, 3, 2);
        break;
      }
      case T.BRICK: {
        ctx.fillStyle = th.brickDark; ctx.fillRect(px, py, 16, 16);
        ctx.fillStyle = th.brick;
        ctx.fillRect(px + 1, py + 1, 6, 6); ctx.fillRect(px + 9, py + 1, 6, 6);
        ctx.fillRect(px + 1, py + 9, 14, 6);
        ctx.fillStyle = th.brickDark;
        ctx.fillRect(px, py, 16, 1); ctx.fillRect(px, py + 8, 16, 1);
        break;
      }
      case T.CRUMBLE: {
        ctx.fillStyle = th.brickDark; ctx.fillRect(px, py, 16, 16);
        ctx.fillStyle = th.brick; ctx.fillRect(px + 1, py + 1, 14, 14);
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.fillRect(px + 2, py + 4, 6, 1); ctx.fillRect(px + 5, py + 5, 1, 5);
        ctx.fillRect(px + 9, py + 9, 5, 1); ctx.fillRect(px + 9, py + 5, 1, 5);
        break;
      }
      case T.QBLOCK: {
        var pulse = 0.5 + 0.5 * Math.sin(time * 4 + c);
        ctx.fillStyle = '#8a5a10'; ctx.fillRect(px, py, 16, 16);
        ctx.fillStyle = '#e8a72a'; ctx.fillRect(px + 1, py + 1, 14, 14);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + pulse * 0.35) + ')';
        ctx.fillRect(px + 1, py + 1, 14, 3);
        ctx.fillStyle = '#6a4210';
        // 问号
        ctx.fillRect(px + 6, py + 4, 4, 2);
        ctx.fillRect(px + 9, py + 6, 2, 3);
        ctx.fillRect(px + 7, py + 8, 3, 2);
        ctx.fillRect(px + 7, py + 11, 2, 2);
        break;
      }
      case T.USED: {
        ctx.fillStyle = th.groundDark; ctx.fillRect(px, py, 16, 16);
        ctx.fillStyle = th.ground; ctx.fillRect(px + 1, py + 1, 14, 14);
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(px + 1, py + 12, 14, 3);
        break;
      }
      case T.SPIKE: {
        ctx.fillStyle = '#5a6070';
        for (var s = 0; s < 4; s++) {
          ctx.beginPath();
          ctx.moveTo(px + s * 4, py + 16);
          ctx.lineTo(px + s * 4 + 2, py + 5);
          ctx.lineTo(px + s * 4 + 4, py + 16);
          ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#c8d2e0';
        for (var s2 = 0; s2 < 4; s2++) ctx.fillRect(px + s2 * 4 + 2, py + 7, 1, 4);
        break;
      }
      case T.PLATFORM: {
        ctx.fillStyle = th.brickDark; ctx.fillRect(px, py, 16, 5);
        ctx.fillStyle = th.brick;     ctx.fillRect(px, py, 16, 3);
        ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(px, py, 16, 1);
        break;
      }
      case T.WALL: {
        ctx.fillStyle = th.groundDark; ctx.fillRect(px, py, 16, 16);
        ctx.fillStyle = th.ground; ctx.fillRect(px + 1, py + 1, 14, 14);
        ctx.fillStyle = 'rgba(0,0,0,.3)';
        ctx.fillRect(px, py + 7, 16, 1); ctx.fillRect(px + 7, py, 1, 16);
        break;
      }
      case T.GOAL: {
        var t2 = time * 2;
        ctx.fillStyle = '#d8d8e8'; ctx.fillRect(px + 7, py - 96, 2, 112);
        ctx.fillStyle = th.accent;
        var wave = Math.sin(t2) * 2;
        ctx.beginPath();
        ctx.moveTo(px + 9, py - 92);
        ctx.lineTo(px + 9 + 14, py - 92 + 6 + wave);
        ctx.lineTo(px + 9, py - 92 + 12);
        ctx.closePath(); ctx.fill();
        break;
      }
    }
  };

  /* ============================================================
     视差背景
     ============================================================ */
  PG.drawBackground = function (ctx, cam, w, time) {
    var th = PG.WORLDS[w];
    var g = ctx.createLinearGradient(0, 0, 0, PG.VIEW_H);
    g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, PG.VIEW_W, PG.VIEW_H);

    // 远景光斑 / 星星（城堡）
    if (w === 4) {
      for (var s = 0; s < 40; s++) {
        var sx = (s * 137.5) % PG.VIEW_W;
        var sy = (s * 71.3) % 140;
        var tw = 0.4 + 0.6 * Math.abs(Math.sin(time * 1.6 + s));
        ctx.fillStyle = 'rgba(255,180,220,' + (tw * 0.6) + ')';
        ctx.fillRect(sx, sy, 1, 1);
      }
      ctx.fillStyle = 'rgba(255,120,180,.20)';
      ctx.beginPath(); ctx.arc(370, 52, 26, 0, 6.3); ctx.fill();
    } else {
      // 太阳 / 云
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.arc(390 - cam.x * 0.02, 46, 18, 0, 6.3); ctx.fill();
      for (var cl = 0; cl < 4; cl++) {
        var cxp = ((cl * 190 + 40) - cam.x * 0.12) % 700 - 100;
        var cyp = 34 + (cl % 3) * 22;
        ctx.fillStyle = 'rgba(255,255,255,.42)';
        ctx.beginPath();
        ctx.arc(cxp, cyp, 11, 0, 6.3);
        ctx.arc(cxp + 12, cyp + 2, 9, 0, 6.3);
        ctx.arc(cxp - 12, cyp + 3, 8, 0, 6.3);
        ctx.fill();
      }
    }

    // 远山 / 树线 / 沙丘 / 冰峰 / 塔楼
    drawLayer(ctx, cam, w, 0.22, 118, 62, th.hill[1]);
    drawLayer(ctx, cam, w, 0.40, 96, 48, th.hill[0]);

    if (w === 1) { // 森林：树干剪影
      ctx.fillStyle = 'rgba(10,30,20,.75)';
      for (var t = 0; t < 16; t++) {
        var tx = ((t * 118) - cam.x * 0.5) % 900 - 120;
        var hgt = 90 + (t % 4) * 22;
        ctx.fillRect(tx, PG.VIEW_H - 34 - hgt, 9, hgt);
        ctx.beginPath();
        ctx.arc(tx + 4, PG.VIEW_H - 34 - hgt, 26, 0, 6.3);
        ctx.fill();
      }
    }
    if (w === 3) { // 冰川：飘雪
      for (var sn = 0; sn < 60; sn++) {
        var snx = (sn * 97 + time * 18 * (0.4 + (sn % 5) * 0.2)) % (PG.VIEW_W + 40) - 20;
        var sny = (sn * 53 + time * 26 * (0.3 + (sn % 3) * 0.3)) % PG.VIEW_H;
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.fillRect(snx, sny, 2, 2);
      }
    }
    if (w === 2) { // 沙漠：热浪
      ctx.fillStyle = 'rgba(255,220,160,.18)';
      for (var hz = 0; hz < 4; hz++) {
        var hy = 130 + hz * 22 + Math.sin(time * 1.5 + hz) * 3;
        ctx.fillRect(0, hy, PG.VIEW_W, 2);
      }
    }

    // 前景雾
    if (th.fog > 0.3) {
      ctx.fillStyle = 'rgba(200,225,215,' + (th.fog * 0.30) + ')';
      for (var f = 0; f < 5; f++) {
        var fx = ((f * 220 + time * 14) - cam.x * 0.6) % 800 - 120;
        ctx.beginPath(); ctx.arc(fx, 150 + (f % 3) * 40, 60, 0, 6.3); ctx.fill();
      }
    }
  };

  function drawLayer(ctx, cam, w, para, spacing, maxH, color) {
    ctx.fillStyle = color;
    var off = -cam.x * para;
    var start = Math.floor((-off - 200) / spacing) - 1;
    var end = start + Math.ceil((PG.VIEW_W + 400) / spacing) + 2;
    for (var i = start; i <= end; i++) {
      var n = PG.hash(i, w * 31 + 7);
      var hgt = 26 + n * maxH;
      var x = i * spacing + off;
      var baseY = PG.VIEW_H - 20;
      ctx.beginPath();
      if (w === 2) {          // 沙丘：圆润
        ctx.moveTo(x, baseY);
        ctx.quadraticCurveTo(x + spacing / 2, baseY - hgt * 1.1, x + spacing, baseY);
      } else if (w === 3) {   // 冰峰：尖锐
        ctx.moveTo(x, baseY);
        ctx.lineTo(x + spacing / 2, baseY - hgt * 1.5);
        ctx.lineTo(x + spacing, baseY);
      } else if (w === 4) {   // 城堡：方形塔
        ctx.moveTo(x, baseY);
        ctx.lineTo(x, baseY - hgt * 1.3);
        ctx.lineTo(x + spacing * 0.62, baseY - hgt * 1.3);
        ctx.lineTo(x + spacing * 0.62, baseY);
      } else {                // 草原/森林：圆丘
        ctx.moveTo(x, baseY);
        ctx.quadraticCurveTo(x + spacing / 2, baseY - hgt, x + spacing, baseY);
      }
      ctx.closePath(); ctx.fill();
    }
  }

})(window.PG);
