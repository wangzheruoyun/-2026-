(function () {
  'use strict'

  // 在适配器篡改之前，捕获原始浏览器 API
  var _createElement = document.createElement.bind(document)
  var _XHR = window.XMLHttpRequest
  var _WebSocket = window.WebSocket

  window.GameGlobal = window

  /* ===== WeChat 模块系统 ===== */
  var __wxModules = {}
  var __wxWaiting = null

  window.define = function (name, deps, factory) {
    if (typeof deps === 'function') {
      factory = deps
      deps = []
    }
    __wxModules[name] = { factory: factory, exports: {}, loaded: false }
  }

  window.require = function (name) {
    var m = __wxModules[name]
    if (!m) return null
    if (m.loaded) return m.exports
    m.loaded = true

    // 适配器用 Object.defineProperty 把属性写到 window 上，
    // 但 document/location/navigator 等是 read-only。静默跳过。
    var origDP = Object.defineProperty
    Object.defineProperty = function (obj, prop, desc) {
      try { return origDP(obj, prop, desc) } catch (e) {}
      return obj
    }

    try {
      m.factory(function localRequire(n) { return window.require(n) }, m, m.exports)
    } finally {
      Object.defineProperty = origDP
    }

    return m.exports
  }

  var wx = {}

  /* ======================== 系统信息 ======================== */
  wx.getSystemInfoSync = function () {
    return {
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      pixelRatio: window.devicePixelRatio || 1,
      platform: 'devtools',
      model: 'Android WebView',
      brand: 'Generic',
      system: 'Android 10',
      SDKVersion: '1.0.0',
      version: '1.0.0',
      benchmarkLevel: 10,
      language: 'zh_CN',
      fontSizeSetting: 16,
    }
  }

  /* ======================== Canvas ======================== */
  wx.createCanvas = function () {
    var canvas = _createElement('canvas')
    canvas.type = 'canvas'
    canvas.id = 'gameCanvas'
    document.body.appendChild(canvas)
    return canvas
  }

  /* ======================== Image ======================== */
  wx.createImage = function () {
    return _createElement('img')
  }

  /* ======================== 字体 ======================== */
  wx.loadFont = function (url) {
    if (wx._fontLoaded) return wx._fontFamily
    wx._fontFamily = 'num'
    try {
      var f = new FontFace(wx._fontFamily, 'url(' + url + ')')
      f.load().then(function (face) {
        document.fonts.add(face)
        wx._fontLoaded = true
      }).catch(function () {
        wx._fontFamily = 'sans-serif'
        wx._fontLoaded = true
      })
    } catch (e) {
      wx._fontFamily = 'sans-serif'
      wx._fontLoaded = true
    }
    return wx._fontFamily
  }

  /* ======================== 音频 ======================== */
  wx.createInnerAudioContext = function () {
    var audio = _createElement('audio')
    audio.crossOrigin = 'anonymous'
    var cbs = {}
    var inner = {
      _audio: audio,
      get src() { return audio.src },
      set src(v) { audio.src = v },
      get loop() { return audio.loop },
      set loop(v) { audio.loop = v },
      get autoplay() { return audio.autoplay },
      set autoplay(v) { audio.autoplay = v },
      get paused() { return audio.paused },
      get currentTime() { return audio.currentTime },
      set currentTime(v) { audio.currentTime = v },
      get duration() { return audio.duration },
      play: function () {
        audio.play().catch(function () {})
      },
      pause: function () { audio.pause() },
      stop: function () {
        audio.pause()
        audio.currentTime = 0
      },
      seek: function (t) { audio.currentTime = t },
      destroy: function () {},
      onCanplay: function (cb) { audio.addEventListener('canplay', cb) },
      onPlay: function (cb) { audio.addEventListener('play', cb) },
      onPause: function (cb) { audio.addEventListener('pause', cb) },
      onEnded: function (cb) { audio.addEventListener('ended', cb) },
      onError: function (cb) { audio.addEventListener('error', cb) },
      onStop: function (cb) { cbs.stop = cb },
      offCanplay: function (cb) { audio.removeEventListener('canplay', cb) },
      offPlay: function (cb) { audio.removeEventListener('play', cb) },
      offPause: function (cb) { audio.removeEventListener('pause', cb) },
      offEnded: function (cb) { audio.removeEventListener('ended', cb) },
      offError: function (cb) { audio.removeEventListener('error', cb) },
    }
    return inner
  }

  /* ======================== 网络请求 ======================== */
  wx.request = function (opts) {
    if (!opts) return

    var url = opts.url || ''
    var method = (opts.method || 'GET').toUpperCase()

    // 微信服务器端点在浏览器中不可用，直接 mock
    if (url.indexOf('mp.weixin.qq.com/wxagame/') >= 0) {
      setTimeout(function () {
        var body = opts.data || {}
        if (typeof body === 'string') { try { body = JSON.parse(body) } catch (e) { body = {} } }

        var mockData = { base_resp: { errcode: 0, errmsg: 'ok' } }
        if (url.indexOf('wxagame_getuserinfo') >= 0) {
          mockData = {
            nickname: 'Player',
            headimg: '',
            score: 0,
            best_score: 0,
            grade: 1,
            role: 0,
            is_new: false,
            openid: 'mock_openid',
            base_resp: { errcode: 0, errmsg: 'ok' },
          }
        } else if (url.indexOf('wxagame_init') >= 0) {
          mockData = {
            is_open: 1,
            first_visit: false,
            gameid: '',
            server_time: Math.floor(Date.now() / 1000),
            server_config: { bad_js_ratio: 0 },
            base_resp: { errcode: 0, errmsg: 'ok' },
            version: 1,
            friends_score_switch: 0,
            audience_mode_switch: 0,
          }
        } else if (url.indexOf('wxagame_getfriendsscore') >= 0) {
          mockData = { base_resp: { errcode: 0, errmsg: 'ok' }, user_info: [], my_user_info: { week_best_score: 0, score: 0 } }
        } else if (url.indexOf('wxagame_settlement') >= 0) {
          mockData = { base_resp: { errcode: 0, errmsg: 'ok' }, score: body.score || 0, times: body.times || 0 }
        }

        opts.success && opts.success({ data: mockData, statusCode: 200, header: {}, errMsg: 'request:ok' })
        opts.complete && opts.complete({ data: mockData, statusCode: 200, header: {}, errMsg: 'request:ok' })
      }, 50)
      return
    }

    var xhr = new _XHR()
    var data = opts.data
    var headers = opts.header || {}
    var responseType = opts.responseType || ''

    xhr.open(method, url)
    xhr.responseType = responseType
    for (var k in headers) {
      xhr.setRequestHeader(k, headers[k])
    }
    if (opts.dataType === 'json') {
      xhr.setRequestHeader('Accept', 'application/json')
    }
    xhr.onload = function () {
      var res = {
        data: xhr.response || xhr.responseText,
        statusCode: xhr.status,
        header: {},
        errMsg: 'request:ok',
      }
      try {
        var h = xhr.getAllResponseHeaders()
        if (h) {
          h.split('\n').forEach(function (line) {
            var idx = line.indexOf(':')
            if (idx > 0) {
              var key = line.slice(0, idx).trim().toLowerCase()
              res.header[key] = line.slice(idx + 1).trim()
            }
          })
        }
      } catch (e) {}
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.success && opts.success(res)
      } else {
        opts.fail && opts.fail({ errMsg: 'request:fail status=' + xhr.status })
      }
      opts.complete && opts.complete(res)
    }
    xhr.onerror = function () {
      var err = { errMsg: 'request:fail', errno: 0 }
      opts.fail && opts.fail(err)
      opts.complete && opts.complete(err)
    }
    xhr.send(data || null)
  }

  wx.login = function (opts) {
    if (!opts) return
    var res = { code: 'mock_login_code_' + Date.now(), errMsg: 'login:ok' }
    opts.success && opts.success(res)
    opts.complete && opts.complete(res)
  }

  wx.getUserInfo = function (opts) {
    if (!opts) return
    var res = {
      errMsg: 'getUserInfo:ok',
      userInfo: {
        nickName: 'Player',
        avatarUrl: '',
        gender: 0,
        city: '',
        province: '',
        country: '',
      },
      rawData: '',
      signature: '',
      encryptedData: '',
      iv: '',
    }
    opts.success && opts.success(res)
    opts.complete && opts.complete(res)
  }

  wx.checkSession = function (opts) {
    opts && opts.success && opts.success()
  }

  /* ======================== 本地存储 ======================== */
  wx.getStorageSync = function (key) {
    try { return localStorage.getItem(key) } catch (e) { return null }
  }
  wx.setStorageSync = function (key, val) {
    try { localStorage.setItem(key, val) } catch (e) {}
  }
  wx.removeStorageSync = function (key) {
    try { localStorage.removeItem(key) } catch (e) {}
  }
  wx.clearStorageSync = function () {
    try { localStorage.clear() } catch (e) {}
  }
  wx.getStorageInfoSync = function () {
    var keys = []
    try { for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)) } catch (e) {}
    return { keys: keys, currentSize: 0, limitSize: 10240 }
  }

  /* ======================== WebSocket ======================== */
  var mockSocket = {
    readyState: 3,
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
    close: function () { this.readyState = 3 },
    send: function () {},
    onOpen: null,
    onClose: null,
    onMessage: null,
    onError: null,
  }

  var _wsCallbacks = {}

  wx.connectSocket = function (opts) {
    if (!opts) return mockSocket
    if (opts.url && opts.url.indexOf('ws://') === 0) {
      var real = new _WebSocket(opts.url)
      _wsCallbacks = {}
      real.onopen = function (e) {
        _wsCallbacks.open && _wsCallbacks.open.forEach(function (fn) { fn(e) })
        opts.success && opts.success()
      }
      real.onmessage = function (e) {
        _wsCallbacks.message && _wsCallbacks.message.forEach(function (fn) { fn(e) })
      }
      real.onclose = function (e) {
        _wsCallbacks.close && _wsCallbacks.close.forEach(function (fn) { fn(e) })
        opts.fail && opts.fail(e)
      }
      real.onerror = function (e) {
        _wsCallbacks.error && _wsCallbacks.error.forEach(function (fn) { fn(e) })
        opts.fail && opts.fail(e)
      }
      return real
    }
    return mockSocket
  }

  wx.onSocketOpen = function (cb) {
    _wsCallbacks.open = _wsCallbacks.open || []
    _wsCallbacks.open.push(cb)
  }
  wx.onSocketMessage = function (cb) {
    _wsCallbacks.message = _wsCallbacks.message || []
    _wsCallbacks.message.push(cb)
  }
  wx.onSocketClose = function (cb) {
    _wsCallbacks.close = _wsCallbacks.close || []
    _wsCallbacks.close.push(cb)
  }
  wx.onSocketError = function (cb) {
    _wsCallbacks.error = _wsCallbacks.error || []
    _wsCallbacks.error.push(cb)
  }
  wx.sendSocketMessage = function (opts) {
    if (opts && opts.data) {
      mockSocket.send(opts.data)
    }
  }
  wx.closeSocket = function (opts) {
    mockSocket.close()
    if (opts && opts.success) opts.success()
  }

  /* ======================== 触摸事件 ======================== */
  wx.onTouchStart = function (cb) {
    document.addEventListener('touchstart', cb)
    document.addEventListener('mousedown', function (e) {
      var t = { touches: [{ clientX: e.clientX, clientY: e.clientY }], changedTouches: [{ clientX: e.clientX, clientY: e.clientY }], timeStamp: e.timeStamp }
      cb(t)
    })
  }
  wx.onTouchMove = function (cb) { document.addEventListener('touchmove', cb) }
  wx.onTouchEnd = function (cb) {
    document.addEventListener('touchend', cb)
    document.addEventListener('mouseup', function (e) {
      var t = { changedTouches: [{ clientX: e.clientX, clientY: e.clientY }], timeStamp: e.timeStamp }
      cb(t)
    })
  }
  wx.onTouchCancel = function (cb) { document.addEventListener('touchcancel', cb) }

  /* ======================== 生命周期 ======================== */
  wx.onShow = function (cb) {
    cb({ scene: 1001 })
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) cb({ scene: 1001 })
    })
  }
  wx.onHide = function (cb) {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) cb()
    })
  }
  wx.onError = function (cb) {
    window.onerror = function (msg, url, line, col, err) {
      cb({ message: msg, stack: err ? err.stack : '' })
    }
  }
  wx.onAudioInterruptionBegin = function (cb) {
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) cb && cb()
    })
  }

  /* ======================== UI ======================== */
  wx.showModal = function (opts) {
    if (!opts) return
    if (opts.showCancel === false) {
      alert(opts.content || opts.title || '')
      opts.success && opts.success({ confirm: true, cancel: false })
    }
  }
  wx.showLoading = function () {}
  wx.hideLoading = function () {}

  wx.showToast = function (opts) {
    if (opts && opts.title) console.log('[Toast]', opts.title)
  }
  wx.hideToast = function () {}

  /* ======================== 设备 ======================== */
  wx.setKeepScreenOn = function () {}
  wx.triggerGC = function () {}

  wx.getNetworkType = function (opts) {
    opts && opts.success && opts.success({ networkType: 'wifi' })
  }

  /* ======================== 启动参数 ======================== */
  wx.getLaunchOptionsSync = function () {
    return { query: {}, scene: 1001, path: 'game.js', referrerInfo: {} }
  }
  wx.exitMiniProgram = function () {
    console.warn('[wx-polyfill] exitMiniProgram called')
  }

  /* ======================== 文件系统 ======================== */
  wx.getFileSystemManager = function () {
    return {
      readFile: function () {},
      writeFile: function () {},
      accessSync: function () { return true },
      mkdirSync: function () {},
    }
  }

  /* ======================== 其他 ======================== */
  wx.getUpdateManager = function () {
    return {
      onCheckForUpdate: function () {},
      onUpdateReady: function () {},
      applyUpdate: function () {},
    }
  }

  wx.createVideo = function () { return _createElement('video') }

  wx.reportAnalytics = function () {}

  wx.getMenuButtonBoundingClientRect = function () {
    return { left: 0, top: 0, width: 0, height: 0 }
  }

  wx.getWindowInfo = wx.getSystemInfoSync

  /* ======================== 存储(异步) ======================== */
  wx.setStorage = function (opts) {
    if (!opts || !opts.key) return
    try { localStorage.setItem(opts.key, opts.data) } catch (e) {}
    opts && opts.success && opts.success({ errMsg: 'setStorage:ok' })
    opts && opts.complete && opts.complete({ errMsg: 'setStorage:ok' })
  }
  wx.removeStorage = function (opts) {
    if (!opts || !opts.key) return
    try { localStorage.removeItem(opts.key) } catch (e) {}
    opts && opts.success && opts.success({ errMsg: 'removeStorage:ok' })
    opts && opts.complete && opts.complete({ errMsg: 'removeStorage:ok' })
  }

  /* ======================== 分享 ======================== */
  wx.getShareInfo = function (opts) {
    opts && opts.success && opts.success({
      errMsg: 'getShareInfo:ok',
      encryptedData: '',
      iv: '',
    })
  }
  wx.shareAppMessage = function (opts) {
    return {}
  }
  wx.updateShareMenu = function (opts) {
    opts && opts.success && opts.success({ errMsg: 'updateShareMenu:ok' })
  }

  window.wx = wx
})()
