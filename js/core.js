/* ============================================================
   core.js —— 引擎底座
   常量 / 工具 / 随机数 / 输入 / 音效 / 存档 / 调色板 / 像素素材
   ============================================================ */
window.PG = window.PG || {};
(function (PG) {
  'use strict';

  /* ---------------- 常量 ---------------- */
  PG.TILE   = 16;
  PG.VIEW_W = 480;
  PG.VIEW_H = 272;
  PG.ROWS   = 17;          // 480x272 = 30 x 17 格

  /* ---------------- 工具 ---------------- */
  PG.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  PG.lerp  = function (a, b, t) { return a + (b - a) * t; };
  PG.sign  = function (v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); };
  PG.overlap = function (a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  };
  PG.dist = function (ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy);
  };
  // 确定性随机（同一个种子永远生成同一关）
  PG.RNG = function (seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;  s >>>= 0;
      return s / 4294967296;
    };
  };
  PG.pick = function (rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; };
  PG.range = function (rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); };

  /* ---------------- 输入 ---------------- */
  var KEYMAP = {
    ArrowLeft: 'left',  KeyA: 'left',
    ArrowRight:'right', KeyD: 'right',
    ArrowUp:   'up',    KeyW: 'up',
    ArrowDown: 'down',  KeyS: 'down',
    Space: 'jump', KeyZ: 'jump', KeyK: 'jump',
    KeyX: 'run',   KeyJ: 'run',  ShiftLeft: 'run', ShiftRight: 'run',
    Enter: 'confirm', NumpadEnter: 'confirm',
    KeyP: 'pause', Escape: 'pause',
    KeyF: 'fullscreen',
    KeyR: 'rewind',                 // R = 星辰回溯
    KeyT: 'restart', KeyM: 'mute'
  };
  var held = {}, edge = {}, touchHeld = {};
  var Input = PG.input = {
    held: held,
    down: function (a) { return !!held[a]; },
    pressed: function (a) { return !!edge[a]; },
    clearEdge: function () { edge = Input._edge = {}; },
    _edge: {}
  };
  function setKey(action, on) {
    if (!action) return;
    if (on && !held[action]) edge[action] = true;
    held[action] = on;
  }
  window.addEventListener('keydown', function (e) {
    var a = KEYMAP[e.code];
    if (a) { e.preventDefault(); setKey(a, true); }
  }, { passive: false });
  window.addEventListener('keyup', function (e) {
    var a = KEYMAP[e.code];
    if (a) { e.preventDefault(); setKey(a, false); }
  }, { passive: false });
  window.addEventListener('blur', function () {
    for (var k in held) held[k] = false;
  });
  // 触摸/鼠标虚拟键
  PG.bindTouch = function (root) {
    Array.prototype.forEach.call(root.querySelectorAll('button[data-k]'), function (btn) {
      var a = btn.getAttribute('data-k');
      var on  = function (e) {
        e.preventDefault();
        // 关键：在用户触摸的直接调用栈里解锁音频（iOS必须这样才有声）
        if (PG.audio) PG.audio.resume();
        setKey(a, true);
        btn.classList.add('on');
      };
      var off = function (e) { e.preventDefault(); setKey(a, false); btn.classList.remove('on'); };
      btn.addEventListener('touchstart', on,  { passive: false });
      btn.addEventListener('touchend', off,   { passive: false });
      btn.addEventListener('touchcancel', off,{ passive: false });
      btn.addEventListener('mousedown', on);
      btn.addEventListener('mouseup', off);
      btn.addEventListener('mouseleave', off);
    });
    document.body.classList.add('touch');
  };

  /* ---------------- 音效（WebAudio 合成，无外部资源） ---------------- */
  var Audio = PG.audio = {
    ctx: null,
    on: true,
    musicOn: true,
    _musicTimer: null,
    _step: 0,
    _world: 0,
    ensure: function () {
      if (this.ctx) return this.ctx;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
      } catch (e) { this.on = false; }
      return this.ctx;
    },
    resume: function () {
      var c = this.ensure();
      if (!c) return;
      // iOS/安卓都要求在用户手势里 resume；这里兼容 suspended/中断 两种情况
      if (c.state === 'suspended' || c.state === 'interrupted') {
        var p = c.resume();
        // 某些机型第一次 resume 会被拒，Promise 回来后若仍挂起再试一次
        if (p && p.catch) {
          p.catch(function () {}).then(function () {
            if (c.state === 'suspended') { try { c.resume(); } catch (e) {} }
          });
        }
      }
    },
    tone: function (freq, dur, type, vol, slideTo) {
      if (!this.on) return;
      var c = this.ensure(); if (!c) return;
      var t = c.currentTime;
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol == null ? 0.09 : vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise: function (dur, vol) {
      if (!this.on) return;
      var c = this.ensure(); if (!c) return;
      var n = Math.floor(c.sampleRate * dur);
      var buf = c.createBuffer(1, n, c.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var s = c.createBufferSource(); s.buffer = buf;
      var g = c.createGain(); g.gain.value = vol == null ? 0.07 : vol;
      s.connect(g); g.connect(c.destination); s.start();
    },
    sfx: function (name) {
      if (!this.on) return;
      switch (name) {
        case 'jump':   this.tone(320, 0.13, 'square', 0.07, 620); break;
        case 'bigjump':this.tone(300, 0.20, 'square', 0.08, 880); break;
        case 'coin':   this.tone(988, 0.07, 'square', 0.07); this.tone(1319, 0.13, 'square', 0.06); break;
        case 'stomp':  this.tone(240, 0.09, 'square', 0.09, 90);  break;
        case 'bump':   this.tone(150, 0.08, 'square', 0.07, 100); break;
        case 'brick':  this.noise(0.13, 0.09); break;
        case 'power':  [523,659,784,1047].forEach(function(f,i){ setTimeout(function(){ Audio.tone(f,0.1,'square',0.07); }, i*55); }); break;
        case 'star':   [784,988,1175,1568].forEach(function(f,i){ setTimeout(function(){ Audio.tone(f,0.1,'triangle',0.07); }, i*50); }); break;
        case 'fire':   this.tone(700, 0.10, 'sawtooth', 0.06, 220); break;
        case 'hurt':   this.tone(420, 0.20, 'sawtooth', 0.09, 110); break;
        case 'shield': this.tone(600, 0.18, 'triangle', 0.08, 1400); break;
        case 'die':    [520,392,330,262,196].forEach(function(f,i){ setTimeout(function(){ Audio.tone(f,0.16,'square',0.09); }, i*90); }); break;
        case 'clear':  [523,659,784,1047,1319].forEach(function(f,i){ setTimeout(function(){ Audio.tone(f,0.16,'square',0.08); }, i*95); }); break;
        case 'boss':   [110,98,87,73].forEach(function(f,i){ setTimeout(function(){ Audio.tone(f,0.30,'sawtooth',0.10); }, i*130); }); break;
        case 'select': this.tone(660, 0.06, 'square', 0.06); break;
        case 'secret': [659,880,1047,1319,1760].forEach(function(f,i){ setTimeout(function(){ Audio.tone(f,0.13,'triangle',0.07); }, i*70); }); break;
        case 'shoot':  this.tone(880, 0.07, 'square', 0.05, 400); break;
        case 'chill':  this.tone(1200, 0.22, 'triangle', 0.05, 500); break;
        /* 回溯：频率往下扫 = 时间在倒着走 */
        case 'rewind': this.tone(900, 0.30, 'triangle', 0.055, 180); break;
        case 'rewindEnd': this.tone(180, 0.16, 'triangle', 0.06, 760); break;
        case 'echo':   this.tone(1400, 0.09, 'sine', 0.05, 900); break;
        case 'rescue': [1047, 784, 1047, 1319].forEach(function (f, i) {
                         setTimeout(function () { Audio.tone(f, 0.12, 'triangle', 0.075); }, i * 65);
                       }); break;
      }
    },
    /* 增强版芯片音乐：多场景 × 16音循环 + 低音线 */
    MUSIC_SCENES: {
      title: {
        notes: [523, 659, 784, 659, 587, 698, 880, 698, 523, 659, 784, 1047, 880, 784, 659, 523],
        bass:  [131, 131, 165, 165, 147, 147, 196, 196, 131, 131, 165, 165, 147, 147, 98, 98],
        wave: 'square', bassWave: 'triangle', tempo: 200, vol: 0.032
      },
      world0: {
        notes: [392, 523, 659, 523, 440, 587, 698, 587, 392, 523, 659, 784, 698, 587, 440, 523],
        bass:  [98, 98, 110, 110, 87, 87, 98, 98, 98, 98, 110, 110, 87, 87, 73, 73],
        wave: 'triangle', bassWave: 'square', tempo: 235, vol: 0.038
      },
      world1: {
        notes: [349, 440, 523, 466, 349, 523, 587, 466, 392, 494, 587, 523, 392, 523, 659, 587],
        bass:  [87, 87, 110, 110, 98, 98, 87, 87, 98, 98, 123, 123, 110, 110, 98, 98],
        wave: 'triangle', bassWave: 'square', tempo: 250, vol: 0.036
      },
      world2: {
        notes: [330, 415, 494, 415, 370, 466, 554, 466, 330, 415, 494, 622, 554, 466, 370, 415],
        bass:  [83, 83, 98, 98, 92, 92, 83, 83, 83, 83, 98, 98, 104, 104, 92, 92],
        wave: 'sawtooth', bassWave: 'square', tempo: 220, vol: 0.034
      },
      world3: {
        notes: [523, 587, 659, 587, 494, 554, 659, 784, 523, 587, 698, 659, 587, 523, 494, 440],
        bass:  [131, 131, 147, 147, 123, 123, 131, 131, 131, 131, 165, 165, 147, 147, 123, 123],
        wave: 'triangle', bassWave: 'sine', tempo: 210, vol: 0.033
      },
      world4: {
        notes: [220, 262, 247, 196, 220, 175, 196, 165, 220, 294, 330, 294, 262, 247, 220, 196],
        bass:  [55, 55, 49, 49, 55, 55, 41, 41, 55, 55, 65, 65, 49, 49, 41, 41],
        wave: 'sawtooth', bassWave: 'square', tempo: 260, vol: 0.042
      },
      boss: {
        notes: [110, 110, 110, 110, 116, 116, 110, 110, 98, 98, 98, 98, 104, 104, 110, 110],
        bass:  [55, 55, 55, 55, 58, 58, 55, 55, 49, 49, 49, 49, 52, 52, 55, 55],
        wave: 'sawtooth', bassWave: 'square', tempo: 180, vol: 0.045
      },
      clear: {
        notes: [523, 659, 784, 1047, 784, 659, 523, 659, 784, 1047, 1319, 1047, 784, 659, 523, 523],
        bass:  [131, 131, 165, 165, 131, 131, 98, 98, 131, 131, 165, 165, 131, 131, 98, 98],
        wave: 'square', bassWave: 'triangle', tempo: 170, vol: 0.040
      }
    },
    _currentScene: null,
    startMusic: function (sceneOrWorld) {
      if (!this.musicOn) return;
      this.stopMusic();
      var scene;
      if (typeof sceneOrWorld === 'string') {
        scene = sceneOrWorld;
      } else {
        scene = 'world' + (sceneOrWorld || 0);
      }
      if (!this.MUSIC_SCENES[scene]) scene = 'world0';
      this._currentScene = scene;
      var self = this;
      var cfg = this.MUSIC_SCENES[scene];
      this._step = 0;
      this._musicTimer = setInterval(function () {
        if (!self.musicOn) return;
        var i = self._step % cfg.notes.length;
        var n = cfg.notes[i];
        var b = cfg.bass[i];
        self.tone(n, cfg.tempo / 1000 * 0.85, cfg.wave, cfg.vol);
        if (i % 2 === 0) self.tone(b, cfg.tempo / 1000 * 1.6, cfg.bassWave, cfg.vol * 0.7);
        // 每4小节加一个装饰音
        if (self._step % 8 === 4) self.tone(n * 2, 0.08, 'sine', cfg.vol * 0.5);
        self._step++;
      }, cfg.tempo);
    },
    stopMusic: function () {
      if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
      this._currentScene = null;
    },
    // 兼容旧调用：按世界编号开始音乐
    startWorldMusic: function (worldIndex, isBoss) {
      if (isBoss) this.startMusic('boss');
      else this.startMusic('world' + worldIndex);
    }
  };

  /* ---------------- 存档 ---------------- */
  PG.save = {
    KEY: 'pixel-fairytale-save-v1',
    data: null,
    fresh: function () {
      return {
        unlocked: 1,        // 已解锁到第几个世界（1..5）
        levels: {},         // "w-l": {stars:0..3, cleared:true}
        stars: 0,
        coins: 0,
        deaths: 0,
        muted: false,
        musicMuted: false
      };
    },
    load: function () {
      if (this.data) return this.data;
      var d = null;
      try { d = JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (e) { d = null; }
      this.data = d && typeof d === 'object' ? Object.assign(this.fresh(), d) : this.fresh();
      if (!this.data.levels) this.data.levels = {};
      return this.data;
    },
    store: function () {
      try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {}
    },
    reset: function () {
      this.data = this.fresh();
      this.store();
    },
    levelKey: function (w, l) { return w + '-' + l; },
    getLevel: function (w, l) {
      var d = this.load();
      return d.levels[this.levelKey(w, l)] || { stars: 0, cleared: false };
    },
    setLevel: function (w, l, stars, cleared) {
      var d = this.load();
      var k = this.levelKey(w, l);
      var cur = d.levels[k] || { stars: 0, cleared: false };
      cur.stars = Math.max(cur.stars || 0, stars || 0);
      cur.cleared = cur.cleared || !!cleared;
      d.levels[k] = cur;
      // 重新统计星星总数
      var total = 0;
      for (var kk in d.levels) total += (d.levels[kk].stars || 0);
      d.stars = total;
      this.store();
    }
  };

  /* ---------------- 五大世界主题 ---------------- */
  PG.WORLDS = [
    {
      key: 'grass', name: '翠绿草原', sub: '新手秘境',
      sky: ['#5fb8e8', '#bfe9ff'], hill: ['#3f8f4a', '#2f7340'],
      ground: '#8a5a2b', groundDark: '#6a4420', top: '#5cc24e', topDark: '#3f9e3a',
      brick: '#c9772f', brickDark: '#8f5320', accent: '#ffe066',
      fog: 0, name_en: 'GRASS'
    },
    {
      key: 'forest', name: '迷雾森林', sub: '进阶秘境',
      sky: ['#24513f', '#6fa88a'], hill: ['#1f4a35', '#173a29'],
      ground: '#5a4630', groundDark: '#40311f', top: '#4a9c5a', topDark: '#2f6f42',
      brick: '#7a5a34', brickDark: '#543c22', accent: '#9be36a',
      fog: 0.55, name_en: 'FOREST'
    },
    {
      key: 'desert', name: '灼热沙漠', sub: '挑战秘境',
      sky: ['#e8a44e', '#ffe2a8'], hill: ['#d9a55c', '#c08a44'],
      ground: '#d8ab5f', groundDark: '#b98a41', top: '#f0cf85', topDark: '#d4ac5e',
      brick: '#c08a44', brickDark: '#8f6530', accent: '#ff8c42',
      fog: 0.12, name_en: 'DESERT'
    },
    {
      key: 'ice', name: '极寒冰川', sub: '高阶秘境',
      sky: ['#4a7fc4', '#cfe6ff'], hill: ['#7fa8d8', '#5c86b8'],
      ground: '#9fc4e8', groundDark: '#6f96bd', top: '#e8f6ff', topDark: '#b6dcf5',
      brick: '#8fb4d8', brickDark: '#6688ac', accent: '#7ce8ff',
      fog: 0.22, name_en: 'GLACIER'
    },
    {
      key: 'castle', name: '暗黑城堡', sub: '终极秘境',
      sky: ['#150e22', '#3d2044'], hill: ['#241634', '#1a0f26'],
      ground: '#3a2b48', groundDark: '#281d33', top: '#4d3a5e', topDark: '#352644',
      brick: '#4a3556', brickDark: '#33243d', accent: '#ff5a7a',
      fog: 0.35, name_en: 'CASTLE'
    }
  ];

  /* ---------------- 像素素材 ---------------- */
  // 把字符画转成 {w,h,rows,map}
  function S(rows, map) {
    var w = 0;
    for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length);
    return { w: w, h: rows.length, rows: rows, map: map };
  }
  PG.S = S;

  var HERO = {
    k: '#241a2e', s: '#f7c58c', h: '#e5484d', c: '#3b6ee0',
    b: '#7a4a1e', w: '#ffffff', y: '#ffe066'
  };
  PG.HERO_PAL = HERO;

  PG.SPR = {
    heroIdle: S([
      '....kkkk....',
      '...khhhhk...',
      '..khhhhhhk..',
      '..kssssssk..',
      '..kswsswsk..',
      '..kssssssk..',
      '..kskkkksk..',
      '...kssssk...',
      '..kcccccck..',
      '.kcccccccck.',
      '.kcwccccwck.',
      '.kcccccccck.',
      '..kcccccck..',
      '..kbbkkbbk..',
      '..kbbkkbbk..',
      '..kkk..kkk..'
    ], HERO),
    heroRun1: S([
      '....kkkk....',
      '...khhhhk...',
      '..khhhhhhk..',
      '..kssssssk..',
      '..kswsswsk..',
      '..kssssssk..',
      '..kskkkksk..',
      '...kssssk...',
      '..kcccccck..',
      '.kcccccccck.',
      '.kcwccccwck.',
      '.kcccccccck.',
      '..kcccccck..',
      '.kbbk..kbbk.',
      '.kbbk..kbbk.',
      'kkk......kkk'
    ], HERO),
    heroRun2: S([
      '....kkkk....',
      '...khhhhk...',
      '..khhhhhhk..',
      '..kssssssk..',
      '..kswsswsk..',
      '..kssssssk..',
      '..kskkkksk..',
      '...kssssk...',
      '..kcccccck..',
      '.kcccccccck.',
      '.kcwccccwck.',
      '.kcccccccck.',
      '..kcccccck..',
      '...kbbbbk...',
      '...kbbbbk...',
      '...kk..kk...'
    ], HERO),
    heroJump: S([
      '....kkkk....',
      '...khhhhk...',
      '..khhhhhhk..',
      '..kssssssk..',
      '..kswsswsk..',
      '..kssssssk..',
      '..kskkkksk..',
      '...kssssk...',
      '.kcccccccck.',
      'kcccccccccck',
      'kccwccccwcck',
      '.kcccccccck.',
      '..kcccccck..',
      '..kbbkkbbk..',
      '.kbbk..kbbk.',
      'kkk......kkk'
    ], HERO),
    heroCrouch: S([
      '............',
      '............',
      '............',
      '....kkkk....',
      '...khhhhk...',
      '..khhhhhhk..',
      '..kswsswsk..',
      '..kskkkksk..',
      '.kcccccccck.',
      '.kcwccccwck.',
      '.kcccccccck.',
      '..kcccccck..',
      '..kbbkkbbk..',
      '..kbbkkbbk..',
      '.kkkkkkkkkk.',
      '.kk......kk.'
    ], HERO),

    walker1: S([
      '..k.k..k.k..',
      '.kkggggggkk.',
      '.kggggggggk.',
      'kkgwggggwgkk',
      'kggggggggggk',
      'kggkkggkkggk',
      'kggggggggggk',
      '.kggggggggk.',
      '.kggggggggk.',
      '..kggggggk..',
      '..kk.kk.kk..',
      '..kk.kk.kk..'
    ], { k: '#241a2e', g: '#7a4a1e', w: '#ffffff' }),
    walker2: S([
      '..k.k..k.k..',
      '.kkggggggkk.',
      '.kggggggggk.',
      'kkgwggggwgkk',
      'kggggggggggk',
      'kggkkggkkggk',
      'kggggggggggk',
      '.kggggggggk.',
      '.kggggggggk.',
      '..kggggggk..',
      '...kkkkkk...',
      '...kk..kk...'
    ], { k: '#241a2e', g: '#7a4a1e', w: '#ffffff' }),

    flyer1: S([
      'k..........k',
      'kk..kkkk..kk',
      '.kkkppppkkk.',
      '..kppwwppk..',
      '..kppppppk..',
      '...kppppk...',
      '....kkkk....',
      '.....kk.....'
    ], { k: '#1b1030', p: '#7b4fd6', w: '#ffe066' }),
    flyer2: S([
      '............',
      '....kkkk....',
      '.kkkppppkkk.',
      '..kppwwppk..',
      '..kppppppk..',
      '...kppppk...',
      '....kkkk....',
      '.....kk.....'
    ], { k: '#1b1030', p: '#9b6ff0', w: '#ffe066' }),

    lurker: S([
      '....kkkk....',
      '..kksssskk..',
      '.kssssssssk.',
      '.kswsssswsk.',
      '.kssssssssk.',
      '..kskkkksk..',
      '...kssssk...',
      '....kkkk....'
    ], { k: '#6a4420', s: '#e8c078', w: '#ffffff' }),

    ice1: S([
      '....kkkk....',
      '..kkaaaakk..',
      '.kaaaaaaaak.',
      '.kaawaawaak.',
      '.kaaaaaaaak.',
      '.kaakkkkaak.',
      '..kaaaaaak..',
      '...kaaaak...',
      '..kkaaaakk..',
      '...kaaaak...',
      '....kaak....',
      '.....kk.....'
    ], { k: '#2a4a6a', a: '#a8e4ff', w: '#ffffff' }),

    starItem: S([
      '.....kk.....',
      '....kyyk....',
      '...kyyyyk...',
      'kkkkyyyykkkk',
      '.kyyyyyyyyk.',
      '..kyyyyyyk..',
      '..kyyyyyyk..',
      '.kyyk..kyyk.',
      '.kyk....kyk.',
      'kkk......kkk'
    ], { k: '#8a6a00', y: '#ffe066' }),

    fireItem: S([
      '....kk....',
      '...kffk...',
      '..kffffk..',
      '.kffffffk.',
      '.kfyffffk.',
      'kffffffffk',
      'kffyfffffk',
      '.kffffffk.',
      '..kffffk..',
      '...kffk...',
      '....kk....'
    ], { k: '#7a2010', f: '#ff6b35', y: '#ffe066' }),

    shieldItem: S([
      'kkkkkkkkkkkkk',
      'ksssssssssssk',
      'ksshhhhhhhssk',
      'ksshhhhhhhssk',
      'ksshhwwhhhssk',
      'ksshhwwhhhssk',
      '.ksshhhhhhsk.',
      '.ksshhhhhhsk.',
      '..ksshhhhsk..',
      '...kssssssk..',
      '....kssssk...',
      '.....kkkk....'
    ], { k: '#123a5a', s: '#3aa0e0', h: '#7ce8ff', w: '#ffffff' }),

    speedItem: S([
      '...kkkk.',
      '..kyyk..',
      '.kyyk...',
      'kyyk....',
      'kyyyyyk.',
      '..kyyk..',
      '.kyyk...',
      'kyyk....',
      'kyk.....',
      'kk......'
    ], { k: '#8a6a00', y: '#7cf5ff' }),

    heart: S([
      '.kk..kk.',
      'khhkkhhk',
      'khhhhhhk',
      'khhhhhhk',
      '.khhhhk.',
      '..khhk..',
      '...kk...'
    ], { k: '#5a0f1e', h: '#ff5a7a' })
  };

  /* 绘制像素素材。palOverride 可整体换色（火焰形态用）；scale 用于放大显示 */
  PG.drawSpr = function (ctx, spr, x, y, flip, palOverride, alpha, scale) {
    var map = palOverride || spr.map;
    var sc = scale || 1;
    if (alpha != null) ctx.globalAlpha = alpha;
    for (var r = 0; r < spr.rows.length; r++) {
      var row = spr.rows[r];
      for (var c = 0; c < row.length; c++) {
        var ch = row[c];
        if (ch === '.' || ch === ' ') continue;
        var col = map[ch];
        if (!col) continue;
        ctx.fillStyle = col;
        var dx = flip ? (spr.w - 1 - c) : c;
        ctx.fillRect(x + dx * sc, y + r * sc, sc, sc);
      }
    }
    if (alpha != null) ctx.globalAlpha = 1;
  };

  /* 火焰形态：把蓝衣换成红衣 */
  PG.FIRE_PAL = Object.assign({}, HERO, { c: '#e5484d', h: '#ffe066' });

})(window.PG);
