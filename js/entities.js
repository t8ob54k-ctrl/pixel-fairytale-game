/* ============================================================
   entities.js —— 主角 / 小怪 / 道具 / 弹幕 / BOSS
   ============================================================ */
(function (PG) {
  'use strict';

  var TILE = PG.TILE, T = PG.T;
  /* 星辰回溯：不要缓存成局部变量（曾经写成 var RW = PG.rewind;）——
     本文件在 IIFE 执行时取一次值，如果 rewind.js 排在它后面加载，
     RW 就永远是 undefined，残影之桥会**静默失效**：
     不报错、不掉帧，就是踩不上去。所以每次用的时候现取 PG.rewind。 */

  /* 物理参数
     —— 手感按"新手也能过"来调：
        跳跃高度 365²/(2×840) ≈ 79px = 5 格（原来是 3.9 格）
        土狼时间 0.12s、跳跃缓冲 0.16s，按早了按晚了都还能救回来
        起步加速 900，落地到全速只要 0.13s，不黏手 */
  var PH = PG.PHYS = {
    GRAV: 840, MAXFALL: 440,
    ACC: 900, AIRACC: 620, FRIC: 1250,
    RUNMAX: 114, SPRINTMAX: 176,
    JUMPV: -365, JUMPCUT: -165,
    COYOTE: 0.12, BUFFER: 0.16,
    STOMP: -215
  };

  function tileTypeAt(lv, px, py) {
    return PG.lvGet(lv, Math.floor(px / TILE), Math.floor(py / TILE));
  }
  function solidAt(lv, px, py) { return PG.isSolid(tileTypeAt(lv, px, py)); }

  /* ---------------- 水平/垂直碰撞解算 ---------------- */
  function resolveX(e, lv) {
    var top = Math.floor(e.y / TILE), bot = Math.floor((e.y + e.h - 1) / TILE);
    if (e.vx > 0) {
      var c = Math.floor((e.x + e.w - 1) / TILE);
      for (var r = top; r <= bot; r++) {
        if (PG.isSolid(PG.lvGet(lv, c, r))) { e.x = c * TILE - e.w; e.vx = 0; e.hitWall = 1; return; }
      }
    } else if (e.vx < 0) {
      var c2 = Math.floor(e.x / TILE);
      for (var r2 = top; r2 <= bot; r2++) {
        if (PG.isSolid(PG.lvGet(lv, c2, r2))) { e.x = (c2 + 1) * TILE; e.vx = 0; e.hitWall = -1; return; }
      }
    }
  }

  function resolveY(e, lv, prevBottom) {
    var left = Math.floor(e.x / TILE), right = Math.floor((e.x + e.w - 1) / TILE);
    if (e.vy >= 0) {
      var r = Math.floor((e.y + e.h - 1) / TILE);
      for (var c = left; c <= right; c++) {
        var t = PG.lvGet(lv, c, r);
        var oneWayOk = PG.isOneWay(t) && prevBottom <= r * TILE + 2 && !e.dropThrough;
        // 残影之桥：回溯留下的临时平台，和单向平台一样只从上面踩得住
        var rw = PG.rewind;
        var echoOk = rw && !e.dropThrough && prevBottom <= r * TILE + 2 && rw.solidAt(c, r);
        if (PG.isSolid(t) || oneWayOk || echoOk) {
          e.y = r * TILE - e.h; e.vy = 0;
          e.onGround = true; e.groundTile = t; e.gc = c; e.gr = r;
          return;
        }
      }
    } else {
      var r2 = Math.floor(e.y / TILE);
      var hits = [], soft = [];
      for (var c2 = left; c2 <= right; c2++) {
        var t2 = PG.lvGet(lv, c2, r2);
        if (PG.isSolid(t2)) hits.push({ c: c2, r: r2, t: t2 });
        // 隐形砖块不是实心的：能顶出来，但不该把人挡住
        else if (PG.isBumpable(t2)) soft.push({ c: c2, r: r2, t: t2 });
      }
      if (hits.length) {
        e.y = (r2 + 1) * TILE; e.vy = 0;
        e.headHits = hits;
      } else if (soft.length) {
        e.headHits = soft;
      }
    }
  }

  /* ---------------- 主角 ---------------- */
  PG.makePlayer = function (lv) {
    return {
      type: 'player', x: lv.start.x, y: lv.start.y, w: 10, h: 14,
      vx: 0, vy: 0, dir: 1, onGround: false, coyote: 0, jumpBuf: 0,
      form: 'normal',        // normal | fire
      starT: 0, shield: 0, speedT: 0, chillT: 0,
      invT: 0, animT: 0, alive: true, crouch: false, holdJump: false,
      fireCd: 0, riding: null
    };
  };

  PG.updatePlayer = function (p, dt, G) {
    var lv = G.lv, IN = PG.input;
    p.animT += dt;
    if (p.invT > 0)    p.invT    -= dt;
    if (p.starT > 0)   p.starT   -= dt;
    if (p.speedT > 0)  p.speedT  -= dt;
    if (p.chillT > 0)  p.chillT  -= dt;
    if (p.fireCd > 0)  p.fireCd  -= dt;

    var chill = p.chillT > 0;
    var onIce = p.onGround && p.groundTile === T.ICE;
    var maxSpd = (p.speedT > 0 ? PH.SPRINTMAX * 1.25 : (IN.down('run') ? PH.SPRINTMAX : PH.RUNMAX));
    if (chill) maxSpd *= 0.45;

    var acc = (p.onGround ? (onIce ? 320 : PH.ACC) : PH.AIRACC);
    if (chill) acc *= 0.55;
    var fric = onIce ? 90 : PH.FRIC;

    var move = (IN.down('right') ? 1 : 0) - (IN.down('left') ? 1 : 0);
    p.crouch = p.onGround && IN.down('down');
    if (p.crouch) move = 0;

    if (move !== 0) {
      p.vx += move * acc * dt;
      p.dir = move;
      if (Math.abs(p.vx) > maxSpd) p.vx = maxSpd * PG.sign(p.vx);
    } else if (p.onGround) {
      var f = fric * dt;
      if (Math.abs(p.vx) <= f) p.vx = 0; else p.vx -= f * PG.sign(p.vx);
    } else {
      p.vx -= PG.sign(p.vx) * 60 * dt;
    }

    /* 跳跃：土狼时间 + 输入缓冲 + 可变高度 */
    if (IN.pressed('jump')) p.jumpBuf = PH.BUFFER;
    if (p.jumpBuf > 0) p.jumpBuf -= dt;
    if (p.onGround) p.coyote = PH.COYOTE; else if (p.coyote > 0) p.coyote -= dt;

    if (p.jumpBuf > 0 && p.coyote > 0) {
      p.vy = PH.JUMPV * (p.chillT > 0 ? 0.82 : 1);
      p.onGround = false; p.coyote = 0; p.jumpBuf = 0; p.holdJump = true;
      PG.audio.sfx('jump');
      for (var i = 0; i < 5; i++) G.puff(p.x + p.w / 2, p.y + p.h, -p.dir);
    }
    if (!IN.down('jump') && p.vy < PH.JUMPCUT) p.vy = PH.JUMPCUT;

    /* 火球 */
    if (IN.pressed('run') && p.form === 'fire' && p.fireCd <= 0) {
      p.fireCd = 0.32;
      G.ents.push({
        type: 'fireball', x: p.x + (p.dir > 0 ? p.w : -8), y: p.y + 5,
        w: 8, h: 8, vx: p.dir * 230, vy: -60, dir: p.dir, life: 3, onGround: false
      });
      PG.audio.sfx('fire');
    }

    /* 重力 + 位移 */
    p.vy += PH.GRAV * dt;
    if (p.vy > PH.MAXFALL) p.vy = PH.MAXFALL;
    p.headHits = null;
    p.onGround = false;
    var prevBottom = p.y + p.h;
    p.y += p.vy * dt;
    resolveY(p, lv, prevBottom);
    p.x += p.vx * dt;
    resolveX(p, lv);

    /* 顶砖块 */
    if (p.headHits && p.headHits.length) {
      var best = null, bestD = 1e9, cx = p.x + p.w / 2;
      p.headHits.forEach(function (h) {
        var d = Math.abs((h.c + 0.5) * TILE - cx);
        if (d < bestD) { bestD = d; best = h; }
      });
      if (best) PG.bumpBlock(G, best.c, best.r, p);
    }

    // 顶到密室入口会切换关卡，此时这个 player 对象已经作废，立刻退出
    if (G.player !== p) return;

    /* 塌陷砖块 */
    if (p.onGround && p.groundTile === T.CRUMBLE) {
      lv.crumble = lv.crumble || {};
      var key = p.gc + ',' + p.gr;
      if (lv.crumble[key] == null) lv.crumble[key] = 0.42;
    }

    /* 站在移动平台上 */
    p.riding = null;
    G.ents.forEach(function (e) {
      if (e.type !== 'mplat' || e.dead) return;
      if (p.x + p.w > e.x && p.x < e.x + e.w && p.y + p.h >= e.y - 2 && p.y + p.h <= e.y + 8 && p.vy >= 0) {
        p.y = e.y - p.h; p.vy = 0; p.onGround = true; p.riding = e;
      }
    });

    /* 掉出地图 */
    if (p.y > PG.ROWS * TILE + 30) { G.killPlayer(); return; }

    /* 尖刺 */
    var foot = { x: p.x + 1, y: p.y + 2, w: p.w - 2, h: p.h - 2 };
    for (var dx = 0; dx < 2; dx++) for (var dy = 0; dy < 2; dy++) {
      var px = foot.x + dx * (foot.w - 1), py = foot.y + dy * (foot.h - 1);
      if (PG.isHazard(tileTypeAt(lv, px, py))) { G.hurtPlayer(1); break; }
    }
  };

  /* ---------------- 顶砖块逻辑 ---------------- */
  PG.bumpBlock = function (G, c, r, p) {
    var lv = G.lv, t = PG.lvGet(lv, c, r);
    if (!PG.isBumpable(t)) { PG.audio.sfx('bump'); return; }
    var key = c + ',' + r;
    var payload = lv.payload[key] || 'coin';

    if (t === T.BRICK) {
      if (p && p.form === 'fire') {
        PG.lvSet(lv, c, r, T.EMPTY);
        PG.audio.sfx('brick');
        G.shake(0.12);
        for (var i = 0; i < 10; i++)
          G.addParticle(c * TILE + 8, r * TILE + 8,
            (Math.random() - 0.5) * 150, -Math.random() * 180 - 40,
            lv.theme.brick, 0.7, 3, 620);
        G.addScore(50);
        return;
      }
      PG.audio.sfx('bump'); G.bumpAnim(c, r); return;
    }

    if (t === T.QBLOCK || t === T.HIDDEN) {
      PG.lvSet(lv, c, r, T.USED);
      G.bumpAnim(c, r);
      spawnPayload(G, c, r, payload);
      return;
    }
    PG.audio.sfx('bump');
  };

  function spawnPayload(G, c, r, payload) {
    var x = c * TILE + 8, y = r * TILE;
    if (payload === 'coin') {
      PG.audio.sfx('coin'); G.addCoin(1); G.addScore(200);
      G.ents.push({ type: 'popcoin', x: x - 4, y: y - 12, w: 8, h: 10, vy: -230, life: 0.6 });
    } else if (payload === 'coins3') {
      PG.audio.sfx('coin'); G.addCoin(3); G.addScore(600);
      for (var i = 0; i < 3; i++)
        G.ents.push({ type: 'popcoin', x: x - 4 + (i - 1) * 8, y: y - 12, w: 8, h: 10, vy: -230 - i * 20, life: 0.7, vx: (i - 1) * 40 });
    } else if (payload === 'warp') {
      PG.audio.sfx('secret');
      G.popText(x, y - 10, '密室开启！', '#ffe066');
      G.enterBonus(c, r);
    } else {
      PG.audio.sfx('power');
      G.ents.push({ type: 'item', item: payload, x: x - 6, y: y - 16, w: 12, h: 12, vy: -120, born: 0, life: 14 });
    }
  }

  /* ---------------- 实体工厂 ---------------- */
  PG.spawnFromLevel = function (lv, G) {
    lv.spawns.forEach(function (s) {
      var e = PG.makeEntity(s, lv);
      if (e) G.ents.push(e);
    });
  };

  PG.makeEntity = function (s, lv) {
    var x = s.tx * TILE, y = s.ty * TILE;
    switch (s.type) {
      case 'coin':
        return { type: 'coin', x: x + 4, y: y + 3, w: 8, h: 10, t: Math.random() * 6 };
      case 'bigstar':
        return { type: 'bigstar', x: x + 1, y: y + 1, w: 14, h: 14, t: Math.random() * 6, got: false };
      case 'walker':
        return { type: 'walker', x: x + 2, y: y + 4, w: 12, h: 12, vx: 42 * (s.dir || -1), vy: 0, dir: s.dir || -1, minX: s.minX, maxX: s.maxX, anim: 0 };
      case 'flyer':
        return { type: 'flyer', x: x, y: y, w: 12, h: 8, homeY: y, t: Math.random() * 6, vx: 46 * (s.dir || -1), dir: s.dir || -1, anim: 0 };
      case 'lurker': {
        var gy = PG.lvGet(lv, s.tx, s.ty + 1);
        return { type: 'lurker', x: x + 2, y: y + 4, w: 12, h: 12, homeY: y + 4, t: Math.random() * 2.5, out: false, vx: 0, vy: 0, dir: s.dir || 1, minX: s.minX, maxX: s.maxX };
      }
      case 'icespirit':
        return { type: 'icespirit', x: x, y: y, w: 12, h: 12, homeY: y, t: Math.random() * 6, phase: Math.random() * 6 };
      case 'checkpoint':
        return { type: 'checkpoint', x: x + 2, y: y + 4, w: 12, h: 12, on: false };
      case 'goal':
        return { type: 'goal', x: x - 4, y: y - 96, w: 16, h: 112, hidden: !!s.hidden };
      case 'boss':
        return PG.makeBoss(s.boss, x, y);
      default: return null;
    }
  };

  /* ---------------- 实体更新 ---------------- */
  PG.updateEntity = function (e, dt, G) {
    var lv = G.lv, p = G.player;
    if (e.dead) return;
    e.t = (e.t || 0) + dt;

    switch (e.type) {
      case 'coin':
        if (PG.overlap(e, p)) {
          e.dead = true; G.addCoin(1); G.addScore(100);
          PG.audio.sfx('coin');
          G.addParticle(e.x + 4, e.y + 5, 0, -40, '#ffe066', 0.4, 2, -60);
        }
        break;

      case 'bigstar':
        e.bob = Math.sin(e.t * 2.5) * 2;
        if (!e.got && PG.overlap(e, p)) {
          e.got = true; e.dead = true;
          if (!G.lv.isBonus) {
            G.stars++;
            if (e.si != null) G.starTaken[G.world + '-' + G.level + '-' + e.si] = 1;
          }
          // 星辰碎片就是回溯之力的来源
          PG.rewind.gain(0.10);
          G.addScore(1000);
          PG.audio.sfx('star');
          G.popText(e.x, e.y - 6, '星辰碎片 +1', '#ffe066');
          for (var i = 0; i < 18; i++) {
            var a = i / 18 * 6.283;
            G.addParticle(e.x + 7, e.y + 7, Math.cos(a) * 90, Math.sin(a) * 90, '#ffe066', 0.7, 2, 60);
          }
        }
        break;

      case 'popcoin':
        e.vy += 620 * dt; e.y += e.vy * dt;
        if (e.vx) e.x += e.vx * dt;
        e.life -= dt; if (e.life <= 0) e.dead = true;
        break;

      case 'item':
        e.born += dt;
        if (e.born < 0.55) { e.y -= 90 * dt; break; }
        e.vy = (e.vy || 0) + 700 * dt;
        e.y += e.vy * dt;
        if (solidAt(lv, e.x + e.w / 2, e.y + e.h + 1)) { e.vy = 0; e.y = Math.floor((e.y + e.h) / TILE) * TILE - e.h; }
        e.life -= dt; if (e.life <= 0) e.dead = true;
        if (PG.overlap(e, p)) {
          e.dead = true;
          PG.pickupItem(G, e.item);
        }
        break;

      case 'walker': {
        e.anim += dt;
        e.vy += PH.GRAV * dt; if (e.vy > PH.MAXFALL) e.vy = PH.MAXFALL;
        e.x += e.vx * dt; resolveX(e, lv);
        if (e.hitWall) { e.vx = -e.vx; e.dir = -e.dir; e.hitWall = 0; }
        var pb = e.y + e.h;
        e.y += e.vy * dt; e.onGround = false; resolveY(e, lv, pb);
        if (e.minX != null && e.x < e.minX) { e.x = e.minX; e.vx = Math.abs(e.vx); e.dir = 1; }
        if (e.maxX != null && e.x + e.w > e.maxX) { e.x = e.maxX - e.w; e.vx = -Math.abs(e.vx); e.dir = -1; }
        if (e.y > PG.ROWS * TILE + 40) e.dead = true;
        enemyTouch(e, G, 'stompable');
        break;
      }

      case 'flyer': {
        e.anim += dt;
        e.x += e.vx * dt;
        if (e.hitWall === undefined) e.hitWall = 0;
        // 碰到实体墙就掉头
        if (solidAt(lv, e.x + (e.vx > 0 ? e.w : 0), e.y + 4)) { e.vx = -e.vx; e.dir = -e.dir; }
        if (e.minX != null && e.x < e.minX) { e.x = e.minX; e.vx = Math.abs(e.vx); e.dir = 1; }
        if (e.maxX != null && e.x + e.w > e.maxX) { e.x = e.maxX - e.w; e.vx = -Math.abs(e.vx); e.dir = -1; }
        e.y = e.homeY + Math.sin(e.t * 2.2) * 18;
        enemyTouch(e, G, 'stompable');
        break;
      }

      case 'lurker': {
        e.timer = (e.timer || 2.2) - dt;
        if (!e.out) {
          if (e.timer <= 0) {
            e.out = true; e.timer = 3.2;
            e.vx = 78 * e.dir;
            e.y = e.homeY - 14;
            G.addParticle(e.x + 6, e.y + 12, 0, -50, '#e8c078', 0.5, 3, 200);
          } else {
            e.y = e.homeY + 12;
          }
        } else {
          e.vy += PH.GRAV * dt;
          e.x += e.vx * dt; resolveX(e, lv);
          if (e.hitWall) { e.vx = -e.vx; e.dir = -e.dir; e.hitWall = 0; }
          var pb2 = e.y + e.h;
          e.y += e.vy * dt; resolveY(e, lv, pb2);
          if (e.minX != null && e.x < e.minX) { e.x = e.minX; e.vx = Math.abs(e.vx); e.dir = 1; }
          if (e.maxX != null && e.x + e.w > e.maxX) { e.x = e.maxX - e.w; e.vx = -Math.abs(e.vx); e.dir = -1; }
          if (e.timer <= 0) {
            e.out = false; e.timer = 2.6; e.vx = 0;
            G.addParticle(e.x + 6, e.y + 10, 0, -60, '#e8c078', 0.6, 3, 200);
          }
        }
        if (e.out) enemyTouch(e, G, 'stompable');
        break;
      }

      case 'icespirit': {
        e.y = e.homeY + Math.sin(e.t * 1.6 + e.phase) * 22;
        e.x += Math.sin(e.t * 0.9 + e.phase) * 22 * dt;
        if (PG.overlap(e, p)) {
          if (p.chillT > 0) G.hurtPlayer(1);
          else {
            p.chillT = 3.2; p.invT = 1.0;
            PG.audio.sfx('chill');
            G.popText(p.x, p.y - 8, '被冻住了…', '#7ce8ff');
          }
        }
        break;
      }

      case 'fireball': {
        e.life -= dt; if (e.life <= 0) { e.dead = true; break; }
        e.vy += 780 * dt; if (e.vy > 300) e.vy = 300;
        var pb3 = e.y + e.h;
        e.y += e.vy * dt; e.onGround = false;
        resolveY(e, lv, pb3);
        if (e.onGround) e.vy = -170;      // 弹跳
        e.x += e.vx * dt;
        var before = e.x; resolveX(e, lv);
        if (e.x === before && e.vx === 0) { e.dead = true; break; }
        if (e.hitWall) { e.dead = true; G.burst(e.x, e.y, '#ff6b35', 6); break; }
        // 打怪
        for (var i = 0; i < G.ents.length; i++) {
          var o = G.ents[i];
          if (o === e || o.dead) continue;
          if (o.type === 'boss') {
            if (PG.overlap(e, o) && o.hp > 0 && o.invT <= 0) { PG.damageBoss(o, G, e.x); e.dead = true; break; }
            continue;
          }
          if (o.type === 'walker' || o.type === 'flyer' || o.type === 'lurker' || o.type === 'minion') {
            if (PG.overlap(e, o)) { o.dead = true; e.dead = true; G.burst(o.x + 6, o.y + 6, '#ff6b35', 8); G.addScore(200); PG.audio.sfx('stomp'); break; }
          }
        }
        break;
      }

      case 'eproj':
        e.life -= dt; if (e.life <= 0) { e.dead = true; break; }
        if (e.grav) e.vy += e.grav * dt;
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (e.homing) {
          var ang = Math.atan2(p.y + p.h / 2 - (e.y + e.h / 2), p.x + p.w / 2 - (e.x + e.w / 2));
          e.vx = PG.lerp(e.vx, Math.cos(ang) * e.speed, 1.6 * dt);
          e.vy = PG.lerp(e.vy, Math.sin(ang) * e.speed, 1.6 * dt);
        }
        if (solidAt(lv, e.x + e.w / 2, e.y + e.h / 2) && e.type === 'eproj' && !e.passWall) {
          e.dead = true; G.burst(e.x, e.y, e.color || '#fff', 4); break;
        }
        if (e.y > PG.ROWS * TILE + 20) e.dead = true;
        if (PG.overlap(e, p)) { e.dead = true; G.hurtPlayer(1); }
        break;

      case 'minion': {
        e.anim += dt;
        var ang2 = Math.atan2(p.y - e.y, p.x - e.x);
        e.vx = PG.lerp(e.vx, Math.cos(ang2) * 70, 1.2 * dt);
        e.vy = PG.lerp(e.vy, Math.sin(ang2) * 70, 1.2 * dt);
        e.x += e.vx * dt; e.y += e.vy * dt;
        e.life -= dt; if (e.life <= 0) e.dead = true;
        enemyTouch(e, G, 'stompable');
        break;
      }

      case 'mplat':
        e.px = e.x;
        e.x = e.homeX + Math.sin(e.t * e.spd) * e.range;
        e.dx = e.x - e.px;
        break;

      case 'debris':
        e.vy += 700 * dt; e.y += e.vy * dt; e.x += e.vx * dt;
        e.life -= dt; if (e.life <= 0) e.dead = true;
        break;

      case 'checkpoint':
        if (!e.on && PG.overlap(e, p)) {
          e.on = true; G.checkpoint = { x: e.x, y: e.y - 4 };
          PG.audio.sfx('power');
          G.popText(e.x - 10, e.y - 12, '存档点！', '#7cf5ff');
          G.burst(e.x + 6, e.y + 6, '#7cf5ff', 12);
        }
        break;

      case 'goal':
        if (!e.dead && PG.overlap(e, p)) { e.dead = true; G.winLevel(); }
        break;

      case 'boss':
        PG.updateBoss(e, dt, G);
        break;
    }
  };

  /* 踩怪 / 碰撞 */
  function enemyTouch(e, G, mode) {
    var p = G.player;
    if (p.invT > 0 && p.starT <= 0) return;
    if (!PG.overlap(e, p)) return;
    var stomping = p.vy > 20 && (p.y + p.h) < e.y + e.h * 0.62;
    if (p.starT > 0) {
      e.dead = true; G.burst(e.x + 6, e.y + 6, '#ffe066', 10); G.addScore(200);
      PG.audio.sfx('stomp'); return;
    }
    if (stomping) {
      e.dead = true;
      p.vy = PG.input.down('jump') ? PH.STOMP * 1.25 : PH.STOMP;
      G.addScore(100);
      PG.audio.sfx('stomp');
      G.burst(e.x + 6, e.y + 6, '#ffd166', 8);
      G.popText(e.x, e.y - 6, '+100', '#fff');
    } else {
      G.hurtPlayer(1);
    }
  }
  PG.enemyTouch = enemyTouch;

  /* 拾取道具 */
  PG.pickupItem = function (G, kind) {
    var p = G.player;
    if (kind === 'star') {
      p.starT = 9; PG.audio.sfx('star');
      G.popText(p.x, p.y - 10, '无敌星光！', '#ffe066');
    } else if (kind === 'fire') {
      p.form = 'fire'; PG.audio.sfx('power');
      G.popText(p.x, p.y - 10, '火焰形态！', '#ff6b35');
    } else if (kind === 'shield') {
      p.shield = Math.min(2, p.shield + 1); PG.audio.sfx('shield');
      G.popText(p.x, p.y - 10, '护盾 ×' + p.shield, '#7ce8ff');
    } else if (kind === 'speed') {
      p.speedT = 8; PG.audio.sfx('power');
      G.popText(p.x, p.y - 10, '极速冲刺！', '#7cf5ff');
    }
  };

  /* ============================================================
     BOSS
     ============================================================ */
  var BOSS_DEF = [
    { name: '荆棘巨兽', w: 46, h: 38, hp: 3, color: '#5c8a3a', dark: '#3d5c26', accent: '#e5484d' },
    { name: '暗影树人', w: 40, h: 46, hp: 3, color: '#4a3a5c', dark: '#2e2338', accent: '#9b6ff0' },
    { name: '流沙巨蝎', w: 50, h: 34, hp: 3, color: '#c08a44', dark: '#8f6530', accent: '#ff8c42' },
    { name: '寒冰巨熊', w: 48, h: 42, hp: 3, color: '#a8c8e8', dark: '#6f96bd', accent: '#7ce8ff' },
    { name: '暗影领主', w: 42, h: 50, hp: 5, color: '#3a2450', dark: '#20122e', accent: '#ff5a7a' }
  ];
  PG.BOSS_DEF = BOSS_DEF;

  PG.makeBoss = function (kind, x, y) {
    var d = BOSS_DEF[kind];
    return {
      type: 'boss', kind: kind, name: d.name,
      x: x, y: y + 16 - d.h, w: d.w, h: d.h,
      hp: d.hp, maxhp: d.hp, invT: 0, state: 'idle', st: 1.2,
      vx: 0, vy: 0, dir: -1, onGround: false, phase: 1, flash: 0,
      t: 0, sub: 0
    };
  };

  PG.damageBoss = function (b, G, fromX) {
    if (b.invT > 0 || b.hp <= 0) return;
    b.hp--; b.invT = 1.1; b.flash = 0.35;
    PG.audio.sfx('hurt');
    G.shake(0.25);
    G.burst(b.x + b.w / 2, b.y + b.h / 2, '#ffe066', 16);
    G.popText(b.x + b.w / 2 - 8, b.y - 8, '命中！剩 ' + b.hp, '#ffe066');
    if (b.kind === 4 && b.hp <= 2 && b.phase === 1) {
      b.phase = 2; b.state = 'phase'; b.st = 1.4; b.invT = 1.6;
      G.dark = 1; PG.audio.sfx('boss');
      G.popText(b.x + b.w / 2 - 40, b.y - 20, '暗影领域展开！！', '#ff5a7a');
    }
    if (b.hp <= 0) {
      b.state = 'dead'; b.st = 1.8; b.vx = 0;
      PG.audio.sfx('boss');
      G.dark = b.kind === 4 ? 0 : G.dark;
      for (var i = 0; i < 40; i++)
        G.addParticle(b.x + b.w / 2 + (Math.random() - 0.5) * b.w,
          b.y + b.h / 2 + (Math.random() - 0.5) * b.h,
          (Math.random() - 0.5) * 240, (Math.random() - 0.5) * 240 - 60,
          i % 2 ? '#ffe066' : BOSS_DEF[b.kind].accent, 1.2, 3, 220);
    }
  };

  PG.updateBoss = function (b, dt, G) {
    var p = G.player, lv = G.lv;
    if (b.invT > 0) b.invT -= dt;
    if (b.flash > 0) b.flash -= dt;

    if (b.state === 'dead') {
      b.st -= dt; b.y += 22 * dt;
      if (b.st <= 0) { b.dead = true; G.bossDefeated(); }
      return;
    }

    // 重力
    b.vy += 900 * dt; if (b.vy > 400) b.vy = 400;
    var pb = b.y + b.h;
    b.y += b.vy * dt; b.onGround = false; resolveY(b, lv, pb);
    b.x += b.vx * dt; resolveX(b, lv);
    if (b.hitWall) { b.vx = -b.vx; b.dir = -b.dir; b.hitWall = 0; }

    b.dir = (p.x + p.w / 2 < b.x + b.w / 2) ? -1 : 1;
    var dx = (p.x + p.w / 2) - (b.x + b.w / 2);

    b.st -= dt;
    var speed = b.kind === 4 && b.phase === 2 ? 1.35 : 1;

    switch (b.kind) {
      /* ---- 0 荆棘巨兽 ---- */
      case 0:
        if (b.state === 'idle' || b.state === 'walk') {
          b.state = 'walk';
          b.vx = PG.clamp(dx, -1, 1) * 46 * speed;
          if (b.st <= 0) { b.state = Math.random() < 0.5 ? 'shoot' : 'slam'; b.st = 0.5; b.sub = 0; }
        } else if (b.state === 'shoot') {
          b.vx = 0;
          if (b.st <= 0) {
            for (var i = 0; i < 3; i++) {
              G.ents.push({
                type: 'eproj', x: b.x + b.w / 2, y: b.y + 8, w: 8, h: 8,
                vx: PG.sign(dx) * (110 + i * 30), vy: -150 + i * 60,
                grav: 420, life: 4, color: '#5c8a3a'
              });
            }
            PG.audio.sfx('fire');
            b.state = 'walk'; b.st = 1.5;
          }
        } else if (b.state === 'slam') {
          b.vx = PG.clamp(dx, -1, 1) * 90;
          if (b.st <= 0 && b.onGround) {
            b.vy = -330; b.state = 'walk'; b.st = 1.8; G.shake(0.2);
          }
        }
        break;

      /* ---- 1 暗影树人 ---- */
      case 1:
        if (b.state === 'idle' || b.state === 'walk') {
          b.state = 'walk';
          b.vx = PG.clamp(dx, -1, 1) * 40 * speed;
          if (b.st <= 0) {
            var r = Math.random();
            b.state = r < 0.4 ? 'summon' : (r < 0.75 ? 'dash' : 'fog');
            b.st = 0.55; b.sub = 0;
          }
        } else if (b.state === 'summon') {
          b.vx = 0;
          if (b.st <= 0) {
            for (var m = 0; m < 2; m++)
              G.ents.push({
                type: 'minion', x: b.x + (m ? 30 : -16), y: b.y + 6, w: 10, h: 10,
                vx: 0, vy: 0, life: 7, anim: 0
              });
            PG.audio.sfx('boss'); b.state = 'walk'; b.st = 1.6;
          }
        } else if (b.state === 'dash') {
          b.vx = PG.sign(dx) * 210;
          if (b.st <= 0) { b.state = 'walk'; b.st = 1.4; }
        } else if (b.state === 'fog') {
          b.vx = 0;
          G.fogT = Math.max(G.fogT || 0, 3.2);
          if (b.st <= 0) { b.state = 'walk'; b.st = 1.6; }
        }
        break;

      /* ---- 2 流沙巨蝎 ---- */
      case 2:
        if (b.state === 'idle' || b.state === 'walk') {
          b.state = 'walk';
          b.vx = PG.clamp(dx, -1, 1) * 62 * speed;
          if (b.st <= 0) { b.state = Math.random() < 0.5 ? 'sting' : 'burrow'; b.st = 0.5; }
        } else if (b.state === 'sting') {
          b.vx = 0;
          if (b.st <= 0) {
            for (var s = 0; s < 3; s++) {
              var ang = Math.atan2(p.y - b.y, p.x - b.x) + (s - 1) * 0.26;
              G.ents.push({
                type: 'eproj', x: b.x + b.w / 2, y: b.y + 12, w: 7, h: 7,
                vx: Math.cos(ang) * 165, vy: Math.sin(ang) * 165, life: 3.2, color: '#ff8c42'
              });
            }
            PG.audio.sfx('shoot'); b.state = 'walk'; b.st = 1.5;
          }
        } else if (b.state === 'burrow') {
          b.burrow = (b.burrow || 0) + dt;
          b.y += 60 * dt;
          if (b.st <= 0) {
            b.x = PG.clamp(p.x - 40, 40, lv.cols * TILE - 90);
            b.y = 13 * TILE - b.h + 40; b.burrow = 0;
            G.shake(0.3);
            G.burst(b.x + b.w / 2, 13 * TILE, '#d8ab5f', 20);
            b.state = 'emerge'; b.st = 0.35;
          }
        } else if (b.state === 'emerge') {
          b.y -= 140 * dt;
          if (b.st <= 0) { b.state = 'walk'; b.st = 1.2; }
        }
        break;

      /* ---- 3 寒冰巨熊 ---- */
      case 3:
        if (b.state === 'idle' || b.state === 'walk') {
          b.state = 'walk';
          b.vx = PG.clamp(dx, -1, 1) * 44 * speed;
          if (b.st <= 0) { b.state = Math.random() < 0.55 ? 'spikes' : 'charge'; b.st = 0.45; }
        } else if (b.state === 'spikes') {
          b.vx = 0;
          if (b.st <= 0) {
            var baseX = p.x;
            for (var k = 0; k < 4; k++) {
              G.ents.push({
                type: 'eproj', x: baseX - 30 + k * 22, y: 12 * TILE, w: 8, h: 12,
                vx: 0, vy: -300, grav: 700, life: 2.2, color: '#7ce8ff', passWall: true
              });
            }
            PG.audio.sfx('chill'); b.state = 'walk'; b.st = 1.6;
          }
        } else if (b.state === 'charge') {
          b.vx = PG.sign(dx) * 250;
          if (b.st <= 0) { b.state = 'walk'; b.st = 1.2; }
        }
        break;

      /* ---- 4 暗影领主 ---- */
      case 4:
        if (b.state === 'phase') {
          b.vx = 0;
          G.dark = 1;
          if (b.st <= 0) { b.state = 'walk'; b.st = 1.0; }
        } else if (b.state === 'idle' || b.state === 'walk') {
          b.state = 'walk';
          b.vx = PG.clamp(dx, -1, 1) * (b.phase === 2 ? 80 : 52);
          if (b.st <= 0) {
            var rr = Math.random();
            b.state = rr < 0.5 ? 'barrage' : (rr < 0.8 ? 'teleport' : 'spread');
            b.st = 0.4; b.sub = 0;
          }
        } else if (b.state === 'barrage') {
          b.vx = 0;
          b.sub = (b.sub || 0) + dt;
          if (b.sub > (b.phase === 2 ? 0.11 : 0.19)) {
            b.sub = 0;
            var a2 = Math.atan2(p.y - b.y, p.x - b.x);
            G.ents.push({
              type: 'eproj', x: b.x + b.w / 2 - 4, y: b.y + b.h / 2 - 4, w: 8, h: 8,
              vx: Math.cos(a2) * 190, vy: Math.sin(a2) * 190, life: 3, color: '#ff5a7a'
            });
            PG.audio.sfx('shoot');
          }
          if (b.st <= 0) { b.state = 'walk'; b.st = 1.3; }
        } else if (b.state === 'spread') {
          b.vx = 0;
          if (b.st <= 0) {
            var n = b.phase === 2 ? 10 : 6;
            for (var q = 0; q < n; q++) {
              var ang2 = Math.PI * (0.15 + 0.7 * q / (n - 1));
              G.ents.push({
                type: 'eproj', x: b.x + b.w / 2, y: b.y + b.h - 14, w: 8, h: 8,
                vx: Math.cos(ang2 + Math.PI) * 150, vy: -Math.sin(ang2) * 90 - 40,
                grav: 260, life: 4, color: '#c04aff'
              });
            }
            PG.audio.sfx('fire'); b.state = 'walk'; b.st = 1.4;
          }
        } else if (b.state === 'teleport') {
          b.vx = 0;
          if (b.st <= 0) {
            G.burst(b.x + b.w / 2, b.y + b.h / 2, '#c04aff', 18);
            b.x = PG.clamp(p.x + (Math.random() < 0.5 ? -140 : 140), 40, lv.cols * TILE - 90);
            b.y = 6 * TILE;
            G.burst(b.x + b.w / 2, b.y + b.h / 2, '#c04aff', 18);
            b.state = 'walk'; b.st = 0.9;
          }
        }
        break;
    }

    /* 接触伤害 / 踩头判定 */
    if (b.hp > 0 && PG.overlap(b, p)) {
      var stomping = p.vy > 20 && (p.y + p.h) < b.y + b.h * 0.45;
      if (p.starT > 0) { PG.damageBoss(b, G, p.x); }
      else if (stomping) {
        PG.damageBoss(b, G, p.x);
        p.vy = PG.input.down('jump') ? PH.STOMP * 1.3 : PH.STOMP;
        G.burst(p.x, p.y + p.h, '#ffe066', 10);
      } else if (b.invT <= 0) {
        G.hurtPlayer(1);
      }
    }
  };

  /* ============================================================
     绘制
     ============================================================ */
  PG.drawEntity = function (ctx, e, cam, time, G) {
    var x = Math.round(e.x - cam.x), y = Math.round(e.y - cam.y);
    if (x < -80 || x > PG.VIEW_W + 80) return;
    var S = PG.SPR, D = PG.drawSpr;

    switch (e.type) {
      case 'coin': {
        var f = Math.floor((time * 6 + e.t) % 4);
        var wd = [8, 5, 2, 5][f];
        ctx.fillStyle = '#c9922a';
        ctx.fillRect(x + (8 - wd) / 2, y, wd, 10);
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(x + (8 - wd) / 2 + (wd > 3 ? 1 : 0), y + 1, Math.max(1, wd - 2), 8);
        if (wd > 3) { ctx.fillStyle = '#fff6c0'; ctx.fillRect(x + 3, y + 3, 2, 4); }
        break;
      }
      case 'popcoin': {
        var f2 = Math.floor(time * 12 % 4), wd2 = [8, 5, 2, 5][f2];
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(x + (8 - wd2) / 2, y, wd2, 10);
        break;
      }
      case 'bigstar': {
        var bob = e.bob || 0;
        ctx.save();
        ctx.translate(x + 7, y + 7 + bob);
        ctx.rotate(Math.sin(time * 1.5) * 0.25);
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#ffe066';
        ctx.beginPath(); ctx.arc(0, 0, 11 + Math.sin(time * 4) * 1.5, 0, 6.3); ctx.fill();
        ctx.globalAlpha = 1;
        D(ctx, S.starItem, -7, -7, false, null);
        ctx.restore();
        break;
      }
      case 'walker': {
        var spr = Math.floor(e.anim * 7) % 2 ? S.walker1 : S.walker2;
        D(ctx, spr, x, y, e.dir > 0, null);
        break;
      }
      case 'flyer': {
        var spr2 = Math.floor(e.anim * 10) % 2 ? S.flyer1 : S.flyer2;
        D(ctx, spr2, x, y, e.dir > 0, null);
        break;
      }
      case 'lurker': {
        if (!e.out) {
          // 只露出沙面的一点轮廓
          ctx.fillStyle = 'rgba(232,192,120,.55)';
          ctx.fillRect(x + 1, y + 9, 10, 3);
        } else {
          D(ctx, S.lurker, x, y, e.dir > 0, null);
        }
        break;
      }
      case 'icespirit': {
        ctx.globalAlpha = 0.75 + Math.sin(time * 3 + e.phase) * 0.2;
        D(ctx, S.ice1, x, y, false, null);
        ctx.globalAlpha = 1;
        break;
      }
      case 'minion': {
        ctx.globalAlpha = 0.85;
        D(ctx, Math.floor(e.anim * 8) % 2 ? S.flyer1 : S.flyer2, x, y, false,
          { k: '#1b1030', p: '#4a2f7a', w: '#ff5a7a' });
        ctx.globalAlpha = 1;
        break;
      }
      case 'item': {
        if (e.born < 0.55) { ctx.globalAlpha = 0.6; }
        var sprI = S.starItem;
        if (e.item === 'fire') sprI = S.fireItem;
        else if (e.item === 'shield') sprI = S.shieldItem;
        else if (e.item === 'speed') sprI = S.speedItem;
        D(ctx, sprI, x, y - 2, false, null);
        ctx.globalAlpha = 1;
        break;
      }
      case 'fireball': {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = '#ff6b35';
        ctx.beginPath(); ctx.arc(x + 4, y + 4, 6 + Math.sin(time * 20) * 1.2, 0, 6.3); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(x + 2, y + 2, 4, 4);
        break;
      }
      case 'eproj': {
        var col = e.color || '#c04aff';
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(x + e.w / 2, y + e.h / 2, e.w * 0.85, 0, 6.3); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = col;
        ctx.fillRect(x + 1, y + 1, e.w - 2, e.h - 2);
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.fillRect(x + 2, y + 2, 2, 2);
        break;
      }
      case 'mplat': {
        ctx.fillStyle = '#543c22'; ctx.fillRect(x, y, e.w, 8);
        ctx.fillStyle = '#7a5a34'; ctx.fillRect(x, y, e.w, 5);
        ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(x, y, e.w, 1);
        break;
      }
      case 'debris':
        ctx.fillStyle = '#7a5a34';
        ctx.fillRect(x, y, 6, 6);
        break;
      case 'checkpoint': {
        ctx.fillStyle = '#c8d2e0';
        ctx.fillRect(x + 5, y - 22, 2, 34);
        ctx.fillStyle = e.on ? '#7cf5ff' : '#6a6a80';
        var wv = Math.sin(time * 3) * 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 7, y - 20);
        ctx.lineTo(x + 7 + 12, y - 20 + 5 + wv);
        ctx.lineTo(x + 7, y - 20 + 10);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'goal':
        if (!e.hidden) PG.drawTile(ctx, T.GOAL, x + 4, y + 96, G.lv.theme, time, 0, 0);
        break;
      case 'boss':
        PG.drawBoss(ctx, e, x, y, time, G);
        break;
    }
  };

  /* ---------------- BOSS 绘制（程序化像素造型） ---------------- */
  PG.drawBoss = function (ctx, b, x, y, time, G) {
    var d = BOSS_DEF[b.kind];
    var k = d.color, dk = d.dark, ac = d.accent;
    var breathe = Math.sin(time * 2.4) * 2;
    var hurt = b.flash > 0 && Math.floor(b.flash * 30) % 2 === 0;
    if (hurt) { k = '#ffffff'; dk = '#ffd8d8'; }

    ctx.save();
    var cx = x + b.w / 2, cy = y + b.h / 2 + breathe;

    if (b.kind === 0) {           /* 荆棘巨兽：藤蔓团 + 头部核心 */
      ctx.fillStyle = dk;
      ctx.beginPath(); ctx.ellipse(cx, cy + 4, b.w / 2, b.h / 2, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = k;
      ctx.beginPath(); ctx.ellipse(cx, cy + 2, b.w / 2 - 3, b.h / 2 - 4, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = dk;
      for (var i = 0; i < 7; i++) {
        var a = time * 0.8 + i * 0.9;
        var vx = cx + Math.cos(a) * (b.w / 2 - 2);
        var vy = cy + Math.sin(a) * (b.h / 2 - 2);
        ctx.beginPath(); ctx.moveTo(vx, vy);
        ctx.lineTo(vx + Math.cos(a) * 9, vy + Math.sin(a) * 9 - 3);
        ctx.lineTo(vx + Math.cos(a + 0.6) * 5, vy + Math.sin(a + 0.6) * 5);
        ctx.closePath(); ctx.fill();
      }
      // 头部核心（弱点）
      ctx.fillStyle = hurt ? '#fff' : ac;
      ctx.beginPath(); ctx.arc(cx, cy - 12, 9, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#241a2e';
      ctx.fillRect(cx - 6 + b.dir * 2, cy - 15, 4, 4);
      ctx.fillRect(cx + 2 + b.dir * 2, cy - 15, 4, 4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 5 + b.dir * 2, cy - 14, 2, 2);
      ctx.fillRect(cx + 3 + b.dir * 2, cy - 14, 2, 2);

    } else if (b.kind === 1) {    /* 暗影树人 */
      ctx.fillStyle = dk;
      ctx.fillRect(cx - 8, cy - 4, 16, b.h / 2 + 6);
      ctx.fillStyle = k;
      ctx.fillRect(cx - 6, cy - 2, 12, b.h / 2 + 4);
      ctx.fillStyle = dk;
      ctx.beginPath(); ctx.arc(cx, cy - 14, 17, 0, 6.3); ctx.fill();
      ctx.fillStyle = k;
      ctx.beginPath(); ctx.arc(cx, cy - 14, 14, 0, 6.3); ctx.fill();
      // 树枝手臂
      ctx.strokeStyle = dk; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy - 6);
      ctx.lineTo(cx - 26, cy + Math.sin(time * 2) * 8);
      ctx.moveTo(cx + 12, cy - 6);
      ctx.lineTo(cx + 26, cy + Math.cos(time * 2) * 8);
      ctx.stroke();
      ctx.fillStyle = hurt ? '#fff' : ac;
      ctx.fillRect(cx - 9, cy - 18, 5, 4);
      ctx.fillRect(cx + 4, cy - 18, 5, 4);

    } else if (b.kind === 2) {    /* 流沙巨蝎 */
      ctx.fillStyle = dk;
      ctx.beginPath(); ctx.ellipse(cx, cy + 2, b.w / 2, b.h / 2 - 2, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = k;
      ctx.beginPath(); ctx.ellipse(cx, cy + 2, b.w / 2 - 3, b.h / 2 - 5, 0, 0, 6.3); ctx.fill();
      // 尾钩
      ctx.strokeStyle = ac; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + b.dir * 18, cy - 2);
      ctx.quadraticCurveTo(cx + b.dir * 32, cy - 20, cx + b.dir * 22, cy - 30);
      ctx.stroke();
      // 钳子
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - 14, cy + 6); ctx.lineTo(cx - 28, cy + 2);
      ctx.moveTo(cx + 14, cy + 6); ctx.lineTo(cx + 28, cy + 2);
      ctx.stroke();
      ctx.fillStyle = hurt ? '#fff' : ac;
      ctx.fillRect(cx - 10, cy - 4, 5, 4);
      ctx.fillRect(cx + 5, cy - 4, 5, 4);

    } else if (b.kind === 3) {    /* 寒冰巨熊 */
      ctx.fillStyle = dk;
      ctx.beginPath(); ctx.ellipse(cx, cy + 4, b.w / 2, b.h / 2 - 2, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = k;
      ctx.beginPath(); ctx.ellipse(cx, cy + 3, b.w / 2 - 3, b.h / 2 - 5, 0, 0, 6.3); ctx.fill();
      // 冰刺
      ctx.fillStyle = ac;
      for (var s = 0; s < 5; s++) {
        var sx = cx - 18 + s * 9;
        ctx.beginPath();
        ctx.moveTo(sx, cy - b.h / 2 + 2);
        ctx.lineTo(sx + 3, cy - b.h / 2 - 10 - (s % 2) * 4);
        ctx.lineTo(sx + 6, cy - b.h / 2 + 2);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#241a2e';
      ctx.fillRect(cx - 11, cy - 8, 5, 4);
      ctx.fillRect(cx + 6, cy - 8, 5, 4);
      ctx.fillStyle = ac;
      ctx.fillRect(cx - 10, cy - 7, 2, 2);
      ctx.fillRect(cx + 7, cy - 7, 2, 2);

    } else {                       /* 暗影领主 */
      var glow = 0.4 + 0.6 * Math.abs(Math.sin(time * 2));
      ctx.globalAlpha = glow * 0.5;
      ctx.fillStyle = ac;
      ctx.beginPath(); ctx.arc(cx, cy, b.w * 0.75, 0, 6.3); ctx.fill();
      ctx.globalAlpha = 1;
      // 斗篷
      ctx.fillStyle = dk;
      ctx.beginPath();
      ctx.moveTo(cx - b.w / 2, cy + b.h / 2);
      ctx.lineTo(cx, cy - b.h / 2);
      ctx.lineTo(cx + b.w / 2, cy + b.h / 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = k;
      ctx.beginPath();
      ctx.moveTo(cx - b.w / 2 + 5, cy + b.h / 2 - 3);
      ctx.lineTo(cx, cy - b.h / 2 + 6);
      ctx.lineTo(cx + b.w / 2 - 5, cy + b.h / 2 - 3);
      ctx.closePath(); ctx.fill();
      // 王冠
      ctx.fillStyle = ac;
      ctx.fillRect(cx - 13, cy - b.h / 2 + 2, 26, 4);
      ctx.fillRect(cx - 13, cy - b.h / 2 - 4, 3, 6);
      ctx.fillRect(cx - 2, cy - b.h / 2 - 6, 3, 8);
      ctx.fillRect(cx + 10, cy - b.h / 2 - 4, 3, 6);
      // 眼睛
      ctx.fillStyle = hurt ? '#fff' : ac;
      ctx.fillRect(cx - 11, cy - 10, 7, 4);
      ctx.fillRect(cx + 4, cy - 10, 7, 4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 10, cy - 9, 2, 2);
      ctx.fillRect(cx + 5, cy - 9, 2, 2);
      if (b.phase === 2) {
        ctx.globalAlpha = 0.35 + 0.35 * Math.abs(Math.sin(time * 6));
        ctx.fillStyle = ac;
        ctx.beginPath(); ctx.arc(cx, cy, b.w * 0.95, 0, 6.3); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();

    /* 血条不在这里画 —— 它属于 HUD，搬到 game.js 的 drawHUD() 里了。
       原因：这个函数拿到的是世界层画布（480×272，要放大显示），
       画上去名字会糊；而且 drawHUD 每帧在实体之后跑，会盖住它。
       在 HUD 里画还能顺便跟状态图标统一避让。 */
  };

})(window.PG);
