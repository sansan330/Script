// ==UserScript==
// @name         学习通作业粘贴解禁 (REA Patch v2)
// @namespace    rea-patch-chaoxing
// @version      2.0.0
// @description  解除学习通(超星)作业粘贴限制：移除 beforepaste 清空监听 + CodeMirror change.cancel 拦截
// @author       REA Reverse Engineering
// @match        *://*.chaoxing.com/*
// @match        *://*.chaoxing.cn/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    if (window.__reaPatchV2) return;
    window.__reaPatchV2 = true;

    // 学习通拦截器特征：beforepaste 里把 html.html 清空并提示
    var UE_BLOCK_RE = /只能录入|不能粘贴|已禁止粘贴|html\.html\s*=\s*["']{2}/;
    // CodeMirror 拦截器特征：beforeChange 里 change.cancel()
    var CM_BLOCK_RE = /change\.cancel|editorPaste/;

    function srcOf(obj) {
        try {
            var fn = (obj && typeof obj === 'function') ? obj : (obj && (obj.fn || obj.listener));
            return (typeof fn === 'function') ? fn.toString() : '';
        } catch (e) { return ''; }
    }

    function isUEBlocker(fn) { return UE_BLOCK_RE.test(srcOf(fn)); }
    function isCMBlocker(fn) { return CM_BLOCK_RE.test(srcOf(fn)); }

    // ---------- UEditor ----------
    var UE = null, uePatched = false;

    function patchUEProto() {
        if (uePatched) return true;
        if (!UE) return false;
        var proto = null;
        if (UE.EventBase && UE.EventBase.prototype) proto = UE.EventBase.prototype;
        else if (UE.Editor && UE.Editor.prototype) proto = UE.Editor.prototype;
        if (!proto || typeof proto.addListener !== 'function') return false;

        var origAdd = proto.addListener;
        proto.addListener = function (types, listener) {
            try {
                if (typeof types === 'string' && /(^|\s)beforepaste(\s|$)/.test(types) && isUEBlocker(listener)) {
                    console.log('[REA-Patch] 已拦截 UEditor 粘贴限制监听器');
                    return this;
                }
            } catch (e) {}
            return origAdd.apply(this, arguments);
        };
        uePatched = true;
        return true;
    }

    function cleanUE() {
        var n = 0;
        if (!UE) return 0;
        var insts = UE.instants || {};
        for (var id in insts) {
            var ed = insts[id];
            if (!ed) continue;
            var store = ed.__allListeners;
            var arr = store && store.beforepaste;
            if (arr && arr.length) {
                for (var i = arr.length - 1; i >= 0; i--) {
                    if (isUEBlocker(arr[i])) { arr.splice(i, 1); n++; }
                }
            }
            try {
                if (ed.options) {
                    ed.options.allowPaste = true;
                    ed.options.disablePasteImage = false;
                }
            } catch (e) {}
        }
        try {
            if (window.UEDITOR_CONFIG) {
                window.UEDITOR_CONFIG.disablePasteImage = false;
                window.UEDITOR_CONFIG.disableDraggable = false;
            }
            window.myEditor_paste = function () {}; // 页面里定义的全局清空函数
        } catch (e) {}
        return n;
    }

    // ---------- CodeMirror（编程题） ----------
    var CM = null;

    function cleanCMEmitter(em) {
        var n = 0;
        if (!em || !em._handlers) return 0;
        var arr = em._handlers.beforeChange;
        if (!arr || !arr.length) {
            arr = em._handlers['beforeChange'];
        }
        if (!arr || !arr.length) return 0;
        var kept = [];
        for (var i = 0; i < arr.length; i++) {
            if (isCMBlocker(arr[i])) { n++; } else { kept.push(arr[i]); }
        }
        if (n > 0) em._handlers.beforeChange = kept;
        return n;
    }

    function cleanCM() {
        var n = 0;
        var eds = window.codeEditors || {};
        for (var id in eds) {
            var cm = eds[id];
            if (!cm) continue;
            n += cleanCMEmitter(cm);
            try { if (cm.getDoc) n += cleanCMEmitter(cm.getDoc()); } catch (e) {}
        }
        // 兜底：页面上所有 CodeMirror 实例
        try {
            var nodes = document.querySelectorAll('.CodeMirror');
            for (var i = 0; i < nodes.length; i++) {
                var inst = nodes[i].CodeMirror;
                if (inst) { n += cleanCMEmitter(inst); try { n += cleanCMEmitter(inst.getDoc && inst.getDoc()); } catch (e) {} }
            }
        } catch (e) {}
        return n;
    }

    function patchCMProto() {
        if (!CM || CM.__reaOnPatched) return;
        var proto = CM.prototype;
        if (!proto || typeof proto.on !== 'function') return;
        CM.__reaOnPatched = true;
        var origOn = proto.on;
        proto.on = function (type, fn) {
            try {
                if (type === 'beforeChange' && isCMBlocker(fn)) {
                    console.log('[REA-Patch] 已拦截 CodeMirror 粘贴限制监听器');
                    return this;
                }
            } catch (e) {}
            return origOn.apply(this, arguments);
        };
    }

    // ---------- 全局对象钩子（document-start 时拦截赋值） ----------
    function hookGlobal(name, onSet) {
        var val;
        try {
            Object.defineProperty(window, name, {
                configurable: true,
                enumerable: true,
                get: function () { return val; },
                set: function (v) {
                    val = v;
                    try { onSet(v); } catch (e) {}
                }
            });
        } catch (e) {
            // 定义失败则退化为轮询
        }
    }

    hookGlobal('UE', function (v) {
        if (v && v !== UE) { UE = v; patchUEProto(); }
    });
    hookGlobal('CodeMirror', function (v) {
        if (v && v !== CM) { CM = v; patchCMProto(); }
    });

    // ---------- 统一执行 ----------
    var toastShown = false;
    function applyAll(manual) {
        if (!UE && window.UE) { UE = window.UE; patchUEProto(); }
        if (!CM && window.CodeMirror) { CM = window.CodeMirror; patchCMProto(); }
        patchUEProto();
        patchCMProto();
        var a = cleanUE();
        var b = cleanCM();
        if ((a + b) > 0 || manual) {
            console.log('[REA-Patch] 已解除 ' + (a + b) + ' 处粘贴限制');
            if (!toastShown) { toastShown = true; toast('粘贴限制已解除，可以 Ctrl+V 了'); }
        }
        return a + b;
    }

    function toast(msg) {
        try {
            var old = document.getElementById('__rea_toast');
            if (old) old.remove();
            var t = document.createElement('div');
            t.id = '__rea_toast';
            t.style.cssText = 'position:fixed;top:70px;right:20px;z-index:2147483647;background:#52c41a;color:#fff;'
                + 'padding:10px 18px;border-radius:8px;font:14px/1.5 -apple-system,"Segoe UI",sans-serif;'
                + 'box-shadow:0 6px 20px rgba(0,0,0,.25);transition:opacity .4s';
            t.textContent = 'REA · ' + msg;
            document.body.appendChild(t);
            setTimeout(function () { t.style.opacity = '0'; }, 2200);
            setTimeout(function () { try { t.remove(); } catch (e) {} }, 2700);
        } catch (e) {}
    }

    // 暴露手动入口，Console 里可执行 window.__reaUnblockPaste()
    window.__reaUnblockPaste = function () { return applyAll(true); };

    // 首次启动：高频短轮询，抢在编辑器初始化前后都覆盖
    var fast = 0;
    var fastTimer = setInterval(function () {
        fast++;
        applyAll(false);
        if (fast >= 80) clearInterval(fastTimer); // 约 8 秒
    }, 100);

    // 常驻：低频兜底（动态加载、重新注册监听）
    setInterval(function () { applyAll(false); }, 1000);

    // DOM 变化时立即补一刀
    try {
        var mo = new MutationObserver(function () { setTimeout(function () { applyAll(false); }, 200); });
        if (document.documentElement) {
            mo.observe(document.documentElement, { childList: true, subtree: true });
        }
    } catch (e) {}

    console.log('[REA-Patch v2] 已启动：针对 beforepaste 清空 + CodeMirror change.cancel 拦截');
})();
