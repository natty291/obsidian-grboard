"use strict";
/*
  bd-detect — Board Crop & Auto Stone Detector
  Web App version
*/
const STRINGS = {
    ja: {
        cmdName: '盤面検出ビューを開く',
        viewTitle: 'Board Detect',
        settingsTitle: 'Board Detect 設定',
        headerSubtitle: '碁盤/連珠盤 石検出 → SGF 生成',
        settingLangName: '言語',
        settingLangDesc: 'UIの表示言語を選択します',
        langJa: '日本語',
        langEn: 'English',
        startTitle: '起動モードを選択',
        btnLoad: '📂 画像を読み込む',
        btnGen: '🖼 デフォルト画像生成',
        genColsLabel: '横 (列)',
        genRowsLabel: '縦 (行)',
        intersections: '交点',
        btnGenGo: '▶ 生成して開始',
        genStoneCount: '石の数',
        errMaxSize: 'ボードサイズは最大 19 交点です。',
        errMinSize: 'ボードサイズは最小 1 交点です。',
        mainTitle: '▎ ボード検出',
        labelInput: '入力画像（元画像）',
        dropZoneText: 'クリックまたはドロップで画像を読み込む',
        cardBoardSize: '盤面サイズ',
        boardCols: '横 (列)',
        boardRows: '縦 (行)',
        cardMargin: '余白カット（px）',
        imgSizePrefix: '画像サイズ: ',
        imgSizeSep: ' × ',
        imgSizeSuffix: ' px',
        marginTop: '上 (top)',
        marginBottom: '下 (bot)',
        marginLeft: '左 (left)',
        marginRight: '右 (right)',
        diagTop: '上',
        diagBottom: '下',
        diagLeft: '左',
        diagRight: '右',
        pxUnit: 'px',
        cardParam: '判定パラメータ',
        paramBlack: '黒閾値',
        paramWhite: '白閾値',
        paramRing: '輪郭スコア',
        paramHint: '白石：円周上の暗いピクセル割合 / 空点：低スコア',
        btnDetect: '▶ 検出実行',
        btnReset: '再設定',
        labelCropped: 'カット後（盤面のみ）',
        cardResult: '検出結果',
        cardStats: '統計',
        statsInitial: 'まだ検出されていません',
        statsBlack: '黒石',
        statsWhite: '白石',
        statsNone: '空点',
        statsTotal: '合計交点数',
        statsUnit: '個',
        verifyHeader: '▎ 検出精度評価（生成ボードとの照合）',
        verifyResult: (ok, total, pct) => `正解 ${ok} / ${total} 交点 （${pct}%）`,
        verifyNgBlack: (n) => `黒石の誤検出 ${n}件:`,
        verifyNgWhite: (n) => `白石の誤検出 ${n}件:`,
        verifyNgNone: (n) => `空点の誤検出 ${n}件:`,
        verifyPerfect: '✔ 全交点正解！',
        verifyExpected: '期待:',
        verifyActual: '実際:',
        cardExpand: 'ボード展開',
        expandDesc: '検出結果を大きなボードの指定位置に配置します',
        expandOutCols: '出力 横',
        expandOutRows: '出力 縦',
        expandOffX: 'オフセット X',
        expandOffY: 'オフセット Y',
        expandColUnit: '列',
        expandRowUnit: '行',
        btnExpand: '▶ 展開実行',
        errNoDetect: '先に検出実行してください。',
        errMinOut: '出力ボードは最小 1 交点です。',
        errMaxOut: '出力ボードは最大 19 交点です。',
        errOverflowX: (ox, ic, oc) => `枠超えエラー: X(${ox})+幅(${ic})=${ox + ic} > ${oc}`,
        errOverflowY: (oy, ir, or_) => `枠超えエラー: Y(${oy})+高さ(${ir})=${oy + ir} > ${or_}`,
        cardExpandResult: '展開結果',
        expandSummary: (ic, ir, oc, or_, ox, oy) => `入力: ${ic}×${ir} → 出力: ${oc}×${or_} &nbsp; オフセット: X=${ox}, Y=${oy}`,
        cardSGF: 'SGF 出力',
        sgfPLLabel: '初手',
        sgfPLBlack: '黒先',
        sgfPLWhite: '白先',
        sgfGMLabel: 'ゲームモード',
        sgfRULabel: 'ルール',
        sgfGMGo: '囲碁',
        sgfGMRenju: '連珠 / 五目',
        sgfRUPlaceholder: 'Puzzle info（省略可）',
        btnMakeSGF: '▶ SGF 作成',
        sgfTextLabel: 'SGF テキスト',
        btnCopy: '📋 コピー',
        copyDone: '✔ コピーしました',
        btnDownloadSGF: '💾 SGFをダウンロード',
        downloadDone: (f) => `✔ ${f} をダウンロード`,
        errNoSGF: '先にSGFを作成してください。',
        noticeMarginTooLarge: '余白が大きすぎます',
        noticeNoExpand: '先に展開実行してください。',
        resetConfirmTitle: 'リセットの確認',
        resetConfirmMsg: '本当にリセットしますか？\n現在の検出結果・設定がすべてクリアされます。',
        resetConfirmOk: 'リセット',
        resetConfirmCancel: 'キャンセル',
        labelMarkerSize: 'マーカーサイズ',
        markerSizeUnit: '% (石サイズ比)',
        btnCorrection: '✏ 補正',
        btnCorrectionActive: '✏ 補正中（タップで変更 / 再押しでリセット）',
        btnCorrectionHint: '補正モード：各交点をタップして 黒→白→空→解除 とトグル。再押しで全リセット',
        btnImageOverlay: '🔍 実画像を重ねる',
        btnImageOverlayActive: '🔍 実画像を重ねる（表示中）',
        btnImageOverlayHint: '検出結果の碁盤グラフィックにカット後の実画像を半透明で重ねて表示します',
        labelOverlayOpacity: '透明度',
    },
    en: {
        cmdName: 'Open Board Detect view',
        viewTitle: 'Board Detect',
        settingsTitle: 'Board Detect Settings',
        headerSubtitle: 'Board stone detection → SGF',
        settingLangName: 'Language',
        settingLangDesc: 'Select the display language for the UI',
        langJa: '日本語',
        langEn: 'English',
        startTitle: 'Select startup mode',
        btnLoad: '📂 Load image',
        btnGen: '🖼 New sample board',
        genColsLabel: 'Columns',
        genRowsLabel: 'Rows',
        intersections: 'intersections',
        btnGenGo: '▶ Generate & start',
        genStoneCount: 'Stone count',
        errMaxSize: 'Board size must be 19 intersections or fewer.',
        errMinSize: 'Board size must be at least 1 intersection.',
        mainTitle: '▎ BOARD DETECTOR',
        labelInput: 'Source image',
        dropZoneText: 'Click or drop to load another image',
        cardBoardSize: 'Board size',
        boardCols: 'Columns',
        boardRows: 'Rows',
        cardMargin: 'Margin crop (px)',
        imgSizePrefix: 'Image size: ',
        imgSizeSep: ' × ',
        imgSizeSuffix: ' px',
        marginTop: 'Top',
        marginBottom: 'Bottom',
        marginLeft: 'Left',
        marginRight: 'Right',
        diagTop: 'T',
        diagBottom: 'B',
        diagLeft: 'L',
        diagRight: 'R',
        pxUnit: 'px',
        cardParam: 'Detection parameters',
        paramBlack: 'Black thresh',
        paramWhite: 'White thresh',
        paramRing: 'Ring score',
        paramHint: 'White stones: dark pixel ratio on circumference / Empty: low score',
        btnDetect: '▶ Detect',
        btnReset: 'Re-setup',
        labelCropped: 'Cropped (board only)',
        cardResult: 'Detection result',
        cardStats: 'Statistics',
        statsInitial: 'No detection yet',
        statsBlack: 'Black',
        statsWhite: 'White',
        statsNone: 'Empty',
        statsTotal: 'Total intersections',
        statsUnit: '',
        verifyHeader: '▎ Accuracy check (vs. generated board)',
        verifyResult: (ok, total, pct) => `Correct: ${ok} / ${total} (${pct}%)`,
        verifyNgBlack: (n) => `Black misdetections (${n}):`,
        verifyNgWhite: (n) => `White misdetections (${n}):`,
        verifyNgNone: (n) => `Empty misdetections (${n}):`,
        verifyPerfect: '✔ All intersections correct!',
        verifyExpected: 'expected:',
        verifyActual: 'actual:',
        cardExpand: 'Board expand',
        expandDesc: 'Place detection result onto a larger board at a specified offset.',
        expandOutCols: 'Output cols',
        expandOutRows: 'Output rows',
        expandOffX: 'Offset X',
        expandOffY: 'Offset Y',
        expandColUnit: 'col',
        expandRowUnit: 'row',
        btnExpand: '▶ Expand',
        errNoDetect: 'Please run detection first.',
        errMinOut: 'Output board must be at least 1 intersection.',
        errMaxOut: 'Output board must be 19 intersections or fewer.',
        errOverflowX: (ox, ic, oc) => `Overflow: X(${ox})+W(${ic})=${ox + ic} > ${oc}`,
        errOverflowY: (oy, ir, or_) => `Overflow: Y(${oy})+H(${ir})=${oy + ir} > ${or_}`,
        cardExpandResult: 'Expand result',
        expandSummary: (ic, ir, oc, or_, ox, oy) => `Input: ${ic}×${ir} → Output: ${oc}×${or_} &nbsp; Offset: X=${ox}, Y=${oy}`,
        cardSGF: 'SGF output',
        sgfPLLabel: 'First move',
        sgfPLBlack: 'Black first',
        sgfPLWhite: 'White first',
        sgfGMLabel: 'Game mode',
        sgfRULabel: 'Rules',
        sgfGMGo: 'Go',
        sgfGMRenju: 'Renju / Gomoku',
        sgfRUPlaceholder: 'Puzzle info (optional)',
        btnMakeSGF: '▶ Create SGF',
        sgfTextLabel: 'SGF text',
        btnCopy: '📋 Copy',
        copyDone: '✔ Copied',
        btnDownloadSGF: '💾 Download SGF',
        downloadDone: (f) => `✔ Downloaded ${f}`,
        errNoSGF: 'Please create the SGF first.',
        noticeMarginTooLarge: 'Margin is too large.',
        noticeNoExpand: 'Please run expand first.',
        resetConfirmTitle: 'Confirm reset',
        resetConfirmMsg: 'Are you sure you want to reset?\nAll current detection results and settings will be cleared.',
        resetConfirmOk: 'Reset',
        resetConfirmCancel: 'Cancel',
        labelMarkerSize: 'Marker size',
        markerSizeUnit: '% (of stone)',
        btnCorrection: '✏ Correct',
        btnCorrectionActive: '✏ Correcting (tap to toggle / press again to reset)',
        btnCorrectionHint: 'Correction mode: tap each intersection to cycle Black→White→Empty→Auto. Press again to reset all.',
        btnImageOverlay: '🔍 Overlay image',
        btnImageOverlayActive: '🔍 Overlay image (ON)',
        btnImageOverlayHint: 'Overlay the cropped board image semi-transparently onto the detection result graphic',
        labelOverlayOpacity: 'Opacity',
    },
};
// ══════════════════════════════════════════
//  Default settings
// ══════════════════════════════════════════
const DEFAULT_SETTINGS = {
    language: 'ja',
    boardBgColor: '#d4a843',
    markerBlackColor: 'rgba(0,200,255,0.8)',
    markerWhiteColor: 'rgba(255,80,80,0.8)',
    markerSizeRatio: 25,
};
// ══════════════════════════════════════════
//  Simple toast notification (replaces Obsidian Notice)
// ══════════════════════════════════════════
function showNotice(msg, durationMs = 3000) {
    const existing = document.getElementById('bd-toast');
    if (existing)
        existing.remove();
    const toast = document.createElement('div');
    toast.id = 'bd-toast';
    toast.textContent = msg;
    toast.style.cssText = [
        'position:fixed',
        'bottom:24px',
        'left:50%',
        'transform:translateX(-50%)',
        'background:rgba(30,30,30,0.92)',
        'color:#fff',
        'padding:10px 20px',
        'border-radius:6px',
        'font-size:0.85rem',
        'z-index:9999',
        'pointer-events:none',
        'transition:opacity 0.3s',
        'white-space:pre-line',
        'max-width:90vw',
        'text-align:center',
    ].join(';');
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, durationMs);
}
// ══════════════════════════════════════════
//  Confirm dialog (replaces Obsidian Modal)
// ══════════════════════════════════════════
function showConfirm(title, message, okLabel, cancelLabel, onConfirm) {
    const overlay = document.createElement('div');
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.55)',
        'display:flex', 'align-items:center', 'justify-content:center', 'z-index:10000',
    ].join(';');
    const box = document.createElement('div');
    box.style.cssText = [
        'background:var(--bd-surface)', 'border-radius:10px',
        'padding:28px 28px 20px', 'min-width:280px', 'max-width:420px',
        'box-shadow:0 8px 32px rgba(0,0,0,0.35)',
    ].join(';');
    const h2 = document.createElement('h2');
    h2.textContent = title;
    h2.style.cssText = 'margin:0 0 12px;font-size:1rem;color:var(--bd-text)';
    box.appendChild(h2);
    const p = document.createElement('p');
    p.textContent = message;
    p.style.cssText = 'margin:0 0 20px;color:var(--bd-text-muted);font-size:0.85rem;white-space:pre-line;line-height:1.6';
    box.appendChild(p);
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end';
    const btnCancel = document.createElement('button');
    btnCancel.textContent = cancelLabel;
    btnCancel.className = 'bd-btn';
    btnCancel.style.cssText = 'padding:6px 16px;cursor:pointer;width:auto';
    btnCancel.addEventListener('click', () => overlay.remove());
    const btnOk = document.createElement('button');
    btnOk.textContent = okLabel;
    btnOk.className = 'bd-btn';
    btnOk.style.cssText = 'padding:6px 16px;background:#c0392b;color:#fff;border:none;border-radius:4px;cursor:pointer;width:auto';
    btnOk.addEventListener('click', () => { overlay.remove(); onConfirm(); });
    btnRow.appendChild(btnCancel);
    btnRow.appendChild(btnOk);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    // Close on backdrop click
    overlay.addEventListener('click', (e) => { if (e.target === overlay)
        overlay.remove(); });
}
// ══════════════════════════════════════════
//  Main BdDetectApp class
// ══════════════════════════════════════════
class BdDetectApp {
    constructor(settings) {
        this.sourceImage = null;
        this.srcW = 360;
        this.srcH = 360;
        this.boardData = [];
        this.generatedBoardAnswer = null;
        this.expandedBoard = null;
        this.lastSgfBody = '';
        this.lastRenderedData = [];
        this._detectTimer = null;
        this.genOptionsEl = null;
        // ── Correction mode ──
        this.correctionMap = new Map();
        this.correctionMode = false;
        this.correctionBtn = null;
        // ── Image overlay on result canvas ──
        this.imageOverlayMode = false;
        this.imageOverlayAlpha = 0.45;
        this.imageOverlayCanvas = null;
        this.imageOverlayBtn = null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, settings);
    }
    // ────────────────────────────────────
    //  Translation helper
    // ────────────────────────────────────
    t(key, ...args) {
        var _a, _b, _c;
        const val = (_b = (_a = STRINGS[this.settings.language]) === null || _a === void 0 ? void 0 : _a[key]) !== null && _b !== void 0 ? _b : STRINGS['ja'][key];
        return typeof val === 'function' ? val(...args) : ((_c = val) !== null && _c !== void 0 ? _c : key);
    }
    // ────────────────────────────────────
    //  DOM helpers  (replaces Obsidian createEl)
    // ────────────────────────────────────
    el(id) {
        return this.rootEl.querySelector('#' + id);
    }
    getMargin(id) {
        const el = this.el('bd-' + id + 'Num');
        return Math.max(0, parseInt(el ? el.value : '0') || 0);
    }
    // ────────────────────────────────────
    //  Mount: attach to a container element
    // ────────────────────────────────────
    mount(container) {
        this.rootEl = container;
        container.innerHTML = '';
        container.className = 'bd-view-container';
        this.buildUI(container);
        this.srcW = this.srcCanvas.width;
        this.srcH = this.srcCanvas.height;
        this.updateMarginSliders(this.srcW, this.srcH);
        this.drawCropOverlay();
        // Update header subtitle to match current language
        const sub = document.querySelector('.subtitle');
        if (sub)
            sub.textContent = this.t('headerSubtitle');
    }
    // ────────────────────────────────────
    //  UI construction helpers
    // ────────────────────────────────────
    mk(parent, tag, opts = {}) {
        const el = document.createElement(tag);
        if (opts.cls)
            el.className = opts.cls;
        if (opts.text !== undefined)
            el.textContent = opts.text;
        if (opts.id)
            el.id = opts.id;
        if (opts.style)
            el.setAttribute('style', opts.style);
        if (opts.attr)
            Object.entries(opts.attr).forEach(([k, v]) => el.setAttribute(k, v));
        parent.appendChild(el);
        return el;
    }
    // ────────────────────────────────────
    //  UI build
    // ────────────────────────────────────
    buildUI(root) {
        // Language selector (top right)
        const langBar = this.mk(root, 'div', { style: 'display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-bottom:6px;font-size:0.8rem;color:var(--bd-text-muted)' });
        const langSel = this.mk(langBar, 'select');
        langSel.style.cssText = 'background:var(--bd-surface2);border:1px solid var(--bd-border);color:var(--bd-text);padding:2px 8px;border-radius:4px;font-size:0.8rem;cursor:pointer';
        const optJa = document.createElement('option');
        optJa.value = 'ja';
        optJa.textContent = '日本語';
        langSel.appendChild(optJa);
        const optEn = document.createElement('option');
        optEn.value = 'en';
        optEn.textContent = 'English';
        langSel.appendChild(optEn);
        langSel.value = this.settings.language;
        langSel.addEventListener('change', () => {
            this.settings.language = langSel.value;
            this.mount(root); // full rebuild with new language
        });
        this.mk(root, 'div', { cls: 'bd-title', text: this.t('mainTitle') });
        this.startOverlayEl = this.mk(root, 'div', { cls: 'bd-start-overlay' });
        this.buildStartOverlay(this.startOverlayEl, root);
        this.mainContentEl = this.mk(root, 'div');
        this.mainContentEl.style.display = 'none';
        this.buildMainContent(this.mainContentEl);
    }
    buildStartOverlay(container, rootEl) {
        const box = this.mk(container, 'div', { cls: 'bd-start-box' });
        this.mk(box, 'h2', { text: this.t('startTitle') });
        const row = this.mk(box, 'div', { cls: 'bd-start-btn-row' });
        const fileInput = this.mk(rootEl, 'input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files === null || files === void 0 ? void 0 : files[0]) {
                this.startOverlayEl.style.display = 'none';
                this.mainContentEl.style.display = '';
                this.loadImageFile(files[0]);
            }
        });
        const btnLoad = this.mk(row, 'button', { cls: 'bd-btn bd-btn-primary', text: this.t('btnLoad') });
        btnLoad.addEventListener('click', () => {
            this.startOverlayEl.style.display = 'none';
            this.mainContentEl.style.display = '';
            fileInput.click();
        });
        const btnGen = this.mk(row, 'button', { cls: 'bd-btn', text: this.t('btnGen') });
        const genOptions = this.mk(box, 'div');
        genOptions.style.cssText = 'display:none;margin-top:16px;border-top:1px solid var(--bd-border);padding-top:14px';
        this.genOptionsEl = genOptions;
        btnGen.addEventListener('click', () => { genOptions.style.display = 'block'; });
        const r1 = this.mk(genOptions, 'div', { cls: 'bd-field-row' });
        this.mk(r1, 'label', { text: this.t('genColsLabel') });
        const genCols = this.mk(r1, 'input');
        genCols.type = 'number';
        genCols.value = '15';
        genCols.min = '1';
        genCols.max = '19';
        this.mk(r1, 'span', { text: this.t('intersections'), style: 'font-size:0.75rem;color:var(--bd-text-faint)' });
        const r2 = this.mk(genOptions, 'div', { cls: 'bd-field-row' });
        this.mk(r2, 'label', { text: this.t('genRowsLabel') });
        const genRows = this.mk(r2, 'input');
        genRows.type = 'number';
        genRows.value = '15';
        genRows.min = '1';
        genRows.max = '19';
        this.mk(r2, 'span', { text: this.t('intersections'), style: 'font-size:0.75rem;color:var(--bd-text-faint)' });
        const r3 = this.mk(genOptions, 'div', { cls: 'bd-field-row' });
        this.mk(r3, 'label', { text: this.t('genStoneCount') });
        const genStoneInput = this.mk(r3, 'input');
        genStoneInput.type = 'number';
        genStoneInput.min = '0';
        const genStoneTotalEl = this.mk(r3, 'span');
        genStoneTotalEl.style.cssText = 'font-size:0.75rem;color:var(--bd-text-faint);margin-left:6px';
        const updateStoneTotal = () => {
            const c = parseInt(genCols.value) || 0;
            const r = parseInt(genRows.value) || 0;
            const total = c * r;
            genStoneTotalEl.textContent = `/ ${total}`;
            if (!genStoneInput.value)
                genStoneInput.value = String(Math.round(total * 0.4));
        };
        genCols.addEventListener('input', updateStoneTotal);
        genRows.addEventListener('input', updateStoneTotal);
        updateStoneTotal();
        const btnGenGo = this.mk(genOptions, 'button', { cls: 'bd-btn bd-btn-primary', text: this.t('btnGenGo') });
        btnGenGo.style.marginTop = '10px';
        btnGenGo.addEventListener('click', () => {
            const c = parseInt(genCols.value) || 0, r = parseInt(genRows.value) || 0;
            if (c > 19 || r > 19) {
                showNotice(this.t('errMaxSize'));
                return;
            }
            if (c < 1 || r < 1) {
                showNotice(this.t('errMinSize'));
                return;
            }
            const total = c * r;
            const stoneCount = Math.max(0, Math.min(total, parseInt(genStoneInput.value) || 0));
            const BASE = 360;
            if (c >= r) {
                this.srcCanvas.width = BASE;
                this.srcCanvas.height = Math.round(BASE * r / c);
            }
            else {
                this.srcCanvas.height = BASE;
                this.srcCanvas.width = Math.round(BASE * c / r);
            }
            this.cropOverlay.width = this.srcCanvas.width;
            this.cropOverlay.height = this.srcCanvas.height;
            this.srcW = this.srcCanvas.width;
            this.srcH = this.srcCanvas.height;
            const setV = (id, v) => { const el = this.el(id); if (el)
                el.value = String(v); };
            setV('bd-boardCols', c);
            setV('bd-boardRows', r);
            setV('bd-outCols', c);
            setV('bd-outRows', r);
            this.startOverlayEl.style.display = 'none';
            this.mainContentEl.style.display = '';
            this.drawSampleBoard(c, r, stoneCount);
            this.updateMarginSliders(this.srcW, this.srcH);
            this.drawCropOverlay();
        });
    }
    buildMainContent(container) {
        this.mk(container, 'div', { cls: 'bd-canvas-label', text: this.t('labelInput') });
        const wrap = this.mk(container, 'div', { cls: 'bd-canvas-wrap' });
        this.srcCanvas = this.mk(wrap, 'canvas');
        this.srcCanvas.width = 360;
        this.srcCanvas.height = 360;
        this.srcCtx = this.srcCanvas.getContext('2d');
        this.cropOverlay = this.mk(wrap, 'canvas');
        this.cropOverlay.width = 360;
        this.cropOverlay.height = 360;
        this.cropOverlay.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none';
        this.cropCtx = this.cropOverlay.getContext('2d');
        const dropZone = this.mk(container, 'div', { cls: 'bd-drop-zone', text: this.t('dropZoneText') });
        const dropInput = this.mk(container, 'input');
        dropInput.type = 'file';
        dropInput.accept = 'image/*';
        dropInput.style.display = 'none';
        dropZone.addEventListener('click', () => dropInput.click());
        dropInput.addEventListener('change', (e) => {
            const f = e.target.files;
            if (f === null || f === void 0 ? void 0 : f[0])
                this.loadImageFile(f[0]);
        });
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('over'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
        dropZone.addEventListener('drop', (e) => {
            var _a;
            e.preventDefault();
            dropZone.classList.remove('over');
            if ((_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.files[0])
                this.loadImageFile(e.dataTransfer.files[0]);
        });
        const btnReset = this.mk(container, 'button', { cls: 'bd-btn', text: this.t('btnReset') });
        btnReset.style.cssText = 'margin-top:6px;border:2px solid #c0392b;width:auto;padding:5px 14px';
        btnReset.addEventListener('click', () => this.onResetConfirm());
        // Board size card
        const sizeCard = this.mk(container, 'div', { cls: 'bd-card' });
        this.mk(sizeCard, 'h2', { text: this.t('cardBoardSize') });
        this.addNumRow(sizeCard, this.t('boardCols'), 'bd-boardCols', 15, 1, 19, this.t('intersections'));
        this.addNumRow(sizeCard, this.t('boardRows'), 'bd-boardRows', 15, 1, 19, this.t('intersections'));
        // Margin crop card
        this.buildMarginCard(container);
        // Detection parameters card
        const paramCard = this.mk(container, 'div', { cls: 'bd-card' });
        this.mk(paramCard, 'h2', { text: this.t('cardParam') });
        this.addSliderRow(paramCard, this.t('paramBlack'), 'bd-blackThresh', 30, 150, 80, 'bd-blackThreshVal');
        this.addSliderRow(paramCard, this.t('paramWhite'), 'bd-whiteThresh', 100, 240, 170, 'bd-whiteThreshVal');
        this.addSliderRow(paramCard, this.t('paramRing'), 'bd-ringThresh', 5, 90, 40, 'bd-ringThreshVal', '%');
        this.mk(paramCard, 'div', { text: this.t('paramHint'), style: 'font-size:0.68rem;color:var(--bd-text-faint);margin-top:4px;line-height:1.6' });
        const btnRow = this.mk(container, 'div', { style: 'display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap;' });
        const btnDetect = this.mk(btnRow, 'button', { cls: 'bd-btn bd-btn-primary', text: this.t('btnDetect') });
        btnDetect.style.margin = '0';
        btnDetect.addEventListener('click', () => this.onDetect());
        const btnCorrection = this.mk(btnRow, 'button', { cls: 'bd-btn', text: this.t('btnCorrection') });
        btnCorrection.style.margin = '0';
        btnCorrection.title = this.t('btnCorrectionHint');
        this.correctionBtn = btnCorrection;
        btnCorrection.addEventListener('click', () => this.onToggleCorrectionMode());
        // ── Image overlay button + opacity slider (below correction button) ──
        const imgOverlayRow = this.mk(container, 'div');
        imgOverlayRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap;';
        const btnImgOverlay = this.mk(imgOverlayRow, 'button', { cls: 'bd-btn', text: this.t('btnImageOverlay') });
        btnImgOverlay.style.cssText = 'margin:0;flex-shrink:0;';
        btnImgOverlay.title = this.t('btnImageOverlayHint');
        this.imageOverlayBtn = btnImgOverlay;
        btnImgOverlay.addEventListener('click', () => this.onToggleImageOverlay());
        const overlaySlider = this.mk(imgOverlayRow, 'input');
        overlaySlider.type = 'range';
        overlaySlider.min = '10';
        overlaySlider.max = '90';
        overlaySlider.step = '5';
        overlaySlider.value = String(Math.round(this.imageOverlayAlpha * 100));
        overlaySlider.style.cssText = 'flex:1;min-width:80px;';
        overlaySlider.title = this.t('labelOverlayOpacity');
        const overlayValLabel = this.mk(imgOverlayRow, 'span');
        overlayValLabel.style.cssText = 'font-size:0.72rem;color:var(--bd-text-faint);min-width:2.5em;text-align:right;';
        overlayValLabel.textContent = overlaySlider.value + '%';
        overlaySlider.addEventListener('input', () => {
            this.imageOverlayAlpha = parseInt(overlaySlider.value) / 100;
            overlayValLabel.textContent = overlaySlider.value + '%';
            this.drawImageOverlay();
        });
        // Marker size card
        const markerSizeCard = this.mk(container, 'div', { cls: 'bd-card' });
        markerSizeCard.style.marginTop = '10px';
        const msRow = this.mk(markerSizeCard, 'div', { cls: 'bd-field-row' });
        this.mk(msRow, 'label', { text: this.t('labelMarkerSize') });
        const msSlider = this.mk(msRow, 'input');
        msSlider.type = 'range';
        msSlider.min = '5';
        msSlider.max = '100';
        msSlider.step = '1';
        msSlider.value = String(this.settings.markerSizeRatio);
        msSlider.style.flex = '1';
        const msNum = this.mk(msRow, 'input');
        msNum.type = 'number';
        msNum.min = '5';
        msNum.max = '100';
        msNum.value = String(this.settings.markerSizeRatio);
        msNum.style.width = '52px';
        this.mk(msRow, 'span', { text: this.t('markerSizeUnit'), style: 'font-size:0.7rem;color:var(--bd-text-faint)' });
        msSlider.addEventListener('input', () => {
            const n = parseInt(msSlider.value);
            msNum.value = String(n);
            this.settings.markerSizeRatio = n;
            this.redrawMarkers();
        });
        msNum.addEventListener('input', () => {
            const n = Math.min(100, Math.max(5, parseInt(msNum.value) || 5));
            msNum.value = String(n);
            msSlider.value = String(n);
            this.settings.markerSizeRatio = n;
            this.redrawMarkers();
        });
        // Color settings (inline, replaces plugin settings tab)
        this.buildColorSettings(container);
        // Cropped canvas (wrapped for overlay)
        this.mk(container, 'div', { cls: 'bd-canvas-label', text: this.t('labelCropped'), style: 'margin-top:10px' });
        const croppedWrap = this.mk(container, 'div', { id: 'bd-croppedCanvasWrap' });
        croppedWrap.style.cssText = 'position:relative;display:inline-block;';
        this.croppedCanvas = this.mk(croppedWrap, 'canvas');
        this.croppedCanvas.width = 300;
        this.croppedCanvas.height = 300;
        this.croppedCanvas.style.border = '1px solid var(--bd-border)';
        this.croppedCtx = this.croppedCanvas.getContext('2d');
        // Image overlay canvas on top of croppedCanvas (shows result board graphic semi-transparently)
        const imgOv = document.createElement('canvas');
        imgOv.className = 'bd-image-overlay';
        imgOv.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;display:none;';
        croppedWrap.appendChild(imgOv);
        this.imageOverlayCanvas = imgOv;
        // Register correction click listener once here (not in setupCorrectionOverlay)
        this.croppedCanvas.addEventListener('click', (e) => {
            if (!this.correctionMode || !this.boardData.length)
                return;
            const canvas = this.croppedCanvas;
            const rect = canvas.getBoundingClientRect();
            const px = (e.clientX - rect.left) * (canvas.width / rect.width);
            const py = (e.clientY - rect.top) * (canvas.height / rect.height);
            const bsRows = this.boardData.length, bsCols = (this.boardData[0] || []).length;
            const cW = canvas.width / bsCols, cH = canvas.height / bsRows;
            const col = Math.floor(px / cW), row = Math.floor(py / cH);
            if (col < 0 || col >= bsCols || row < 0 || row >= bsRows)
                return;
            const key = `${row},${col}`;
            const cell = this.boardData[row][col];
            const auto = cell.stone;
            const current = this.correctionMap.get(key);
            const order = ['black', 'white', 'none'];
            const autoIdx = order.indexOf(auto);
            const cycle = [
                order[(autoIdx + 1) % 3],
                order[(autoIdx + 2) % 3],
                'clear',
            ];
            let idx = 0;
            if (current !== undefined) {
                const pos = cycle.indexOf(current);
                idx = pos >= 0 ? (pos + 1) % cycle.length : 0;
            }
            const chosen = cycle[idx];
            if (chosen === 'clear') {
                this.correctionMap.delete(key);
            }
            else {
                this.correctionMap.set(key, chosen);
            }
            this.redrawMarkers();
        });
        ;
        // Result canvas card
        const resultCard = this.mk(container, 'div', { cls: 'bd-card' });
        this.mk(resultCard, 'h2', { text: this.t('cardResult') });
        const resultWrap = this.mk(resultCard, 'div');
        resultWrap.style.cssText = 'position:relative;display:inline-block;';
        const rc = this.mk(resultWrap, 'canvas');
        rc.id = 'bd-resultCanvas';
        rc.style.cssText = 'display:none;border:1px solid var(--bd-border)';
        // Stats card
        const statsCard = this.mk(container, 'div', { cls: 'bd-card' });
        this.mk(statsCard, 'h2', { text: this.t('cardStats') });
        const statsEl = this.mk(statsCard, 'div', { text: this.t('statsInitial') });
        statsEl.id = 'bd-statsText';
        // Expand card
        this.buildExpandCard(container);
        // SGF card
        this.buildSgfCard(container);
    }
    buildColorSettings(container) {
        const card = this.mk(container, 'div', { cls: 'bd-card' });
        card.style.marginTop = '10px';
        const summary = this.mk(card, 'details');
        const s = this.mk(summary, 'summary');
        s.style.cssText = 'cursor:pointer;font-size:0.82rem;color:var(--bd-text-muted);user-select:none';
        s.textContent = '🎨 色設定 / Color settings';
        const addColorRow = (parent, label, getValue, setValue) => {
            const row = this.mk(parent, 'div', { cls: 'bd-field-row', style: 'margin-top:8px' });
            this.mk(row, 'label', { text: label });
            const cp = this.mk(row, 'input');
            cp.type = 'color';
            const hexVal = this.rgbaToHex(getValue());
            cp.value = hexVal;
            cp.style.cssText = 'width:40px;height:28px;border:1px solid var(--bd-border);border-radius:4px;cursor:pointer;padding:2px';
            cp.addEventListener('input', () => { setValue(cp.value); this.redrawMarkers(); });
            const resetBtn = this.mk(row, 'button', { text: '↺', style: 'padding:2px 7px;font-size:0.75rem;cursor:pointer;width:auto;background:var(--bd-surface2);border:1px solid var(--bd-border);border-radius:4px;color:var(--bd-text)' });
            resetBtn.title = 'Reset to default';
            resetBtn.addEventListener('click', () => {
                // restore default, rebuild color
                this.mount(this.rootEl);
            });
        };
        addColorRow(summary, '盤面背景色 / Board BG', () => this.settings.boardBgColor, (v) => { this.settings.boardBgColor = v; });
        addColorRow(summary, '黒石マーカー / Black marker', () => this.settings.markerBlackColor, (v) => { this.settings.markerBlackColor = v; });
        addColorRow(summary, '白石マーカー / White marker', () => this.settings.markerWhiteColor, (v) => { this.settings.markerWhiteColor = v; });
    }
    buildMarginCard(container) {
        const card = this.mk(container, 'div', { cls: 'bd-card' });
        this.mk(card, 'h2', { text: this.t('cardMargin') });
        const info = this.mk(card, 'div', { cls: 'bd-img-info' });
        info.innerHTML = this.t('imgSizePrefix') +
            '<span id="bd-imgSizeW">—</span>' + this.t('imgSizeSep') +
            '<span id="bd-imgSizeH">—</span>' + this.t('imgSizeSuffix');
        const diag = this.mk(card, 'div', { cls: 'bd-diagram' });
        const inner = this.mk(diag, 'div', { cls: 'bd-diagram-inner' });
        inner.id = 'bd-diagramInner';
        const diagLabels = [
            [this.t('diagTop'), 'top:2px;left:50%;transform:translateX(-50%)'],
            [this.t('diagBottom'), 'bottom:2px;left:50%;transform:translateX(-50%)'],
            [this.t('diagLeft'), 'left:2px;top:50%;transform:translateY(-50%)'],
            [this.t('diagRight'), 'right:2px;top:50%;transform:translateY(-50%)'],
        ];
        diagLabels.forEach(([text, style]) => {
            const el = this.mk(diag, 'div', { cls: 'bd-diagram-label', text });
            el.style.cssText += ';' + style;
        });
        const margins = [
            ['marginTop', this.t('marginTop')],
            ['marginBottom', this.t('marginBottom')],
            ['marginLeft', this.t('marginLeft')],
            ['marginRight', this.t('marginRight')],
        ];
        margins.forEach(([id, label]) => {
            const row = this.mk(card, 'div', { cls: 'bd-field-row' });
            this.mk(row, 'label', { text: label });
            const sl = this.mk(row, 'input');
            sl.type = 'range';
            sl.id = 'bd-' + id;
            sl.min = '0';
            sl.max = '200';
            sl.value = '0';
            sl.style.flex = '1';
            const num = this.mk(row, 'input');
            num.type = 'number';
            num.id = 'bd-' + id + 'Num';
            num.min = '0';
            num.max = '200';
            num.value = '0';
            num.style.width = '52px';
            this.mk(row, 'span', { text: this.t('pxUnit'), style: 'font-size:0.7rem;color:var(--bd-text-faint)' });
            sl.addEventListener('input', () => { num.value = sl.value; this.drawCropOverlay(); });
            num.addEventListener('input', () => {
                const v = Math.max(0, parseInt(num.value) || 0);
                num.value = String(v);
                sl.value = String(Math.min(v, parseInt(sl.max)));
                this.drawCropOverlay();
            });
        });
    }
    buildExpandCard(container) {
        const card = this.mk(container, 'div', { cls: 'bd-card' });
        this.mk(card, 'h2', { text: this.t('cardExpand') });
        this.mk(card, 'div', { text: this.t('expandDesc'), style: 'font-size:0.68rem;color:var(--bd-text-faint);margin-bottom:8px;line-height:1.6' });
        this.addNumRow(card, this.t('expandOutCols'), 'bd-outCols', 19, 1, 19, this.t('expandColUnit'));
        this.addNumRow(card, this.t('expandOutRows'), 'bd-outRows', 19, 1, 19, this.t('expandRowUnit'));
        this.addNumRow(card, this.t('expandOffX'), 'bd-offsetX', 0, 0, 18, this.t('expandColUnit'));
        this.addNumRow(card, this.t('expandOffY'), 'bd-offsetY', 0, 0, 18, this.t('expandRowUnit'));
        const btn = this.mk(card, 'button', { cls: 'bd-btn bd-btn-primary', text: this.t('btnExpand') });
        btn.style.marginTop = '8px';
        btn.addEventListener('click', () => this.onExpand());
        const errEl = this.mk(card, 'div', { cls: 'bd-error' });
        errEl.id = 'bd-expandError';
        errEl.style.display = 'none';
        const erc = this.mk(container, 'div', { cls: 'bd-card' });
        erc.id = 'bd-expandResultCard';
        erc.style.display = 'none';
        this.mk(erc, 'h2', { text: this.t('cardExpandResult') });
        const es = this.mk(erc, 'div');
        es.id = 'bd-expandStats';
        es.style.cssText = 'font-size:0.72rem;color:var(--bd-text-muted);line-height:1.8;margin-bottom:8px';
        const ec = this.mk(erc, 'canvas');
        ec.id = 'bd-expandCanvas';
        ec.style.border = '1px solid var(--bd-border)';
    }
    buildSgfCard(container) {
        const card = this.mk(container, 'div', { cls: 'bd-card' });
        card.id = 'bd-sgfCard';
        card.style.display = 'none';
        this.mk(card, 'h2', { text: this.t('cardSGF') });
        // PL (first move)
        const plRow = this.mk(card, 'div', { cls: 'bd-field-row' });
        this.mk(plRow, 'label', { text: this.t('sgfPLLabel') });
        const plSel = this.mk(plRow, 'select');
        plSel.id = 'bd-sgfPL';
        const plOpts = [['', '—'], ['B', this.t('sgfPLBlack')], ['W', this.t('sgfPLWhite')]];
        plOpts.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.text = t; plSel.appendChild(o); });
        // GM (game mode)
        const gmRow = this.mk(card, 'div', { cls: 'bd-field-row' });
        this.mk(gmRow, 'label', { text: this.t('sgfGMLabel') });
        const gmSel = this.mk(gmRow, 'select');
        gmSel.id = 'bd-sgfGM';
        const gmOpts = [['1', this.t('sgfGMGo')], ['4', this.t('sgfGMRenju')]];
        gmOpts.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.text = t; gmSel.appendChild(o); });
        // RU (rules)
        const ruRow = this.mk(card, 'div', { cls: 'bd-field-row' });
        this.mk(ruRow, 'label', { text: this.t('sgfRULabel') });
        const ruInp = this.mk(ruRow, 'input');
        ruInp.type = 'text';
        ruInp.id = 'bd-sgfRU';
        ruInp.placeholder = this.t('sgfRUPlaceholder');
        const btnMake = this.mk(card, 'button', { cls: 'bd-btn bd-btn-primary', text: this.t('btnMakeSGF') });
        btnMake.addEventListener('click', () => this.onMakeSGF());
        // Output area
        const od = this.mk(card, 'div');
        od.id = 'bd-sgfOutput';
        od.style.display = 'none';
        const cr = this.mk(od, 'div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap' });
        this.mk(cr, 'span', { text: this.t('sgfTextLabel'), style: 'font-size:0.7rem;color:var(--bd-text-faint)' });
        const btnCopy = this.mk(cr, 'button', { cls: 'bd-btn', text: this.t('btnCopy') });
        btnCopy.style.cssText = 'width:auto;padding:4px 12px;font-size:0.72rem;margin-top:0';
        btnCopy.addEventListener('click', () => this.onCopySGF());
        // Download button (replaces Vault save)
        const btnDownload = this.mk(cr, 'button', { cls: 'bd-btn', text: this.t('btnDownloadSGF') });
        btnDownload.style.cssText = 'width:auto;padding:4px 12px;font-size:0.72rem;margin-top:0';
        btnDownload.addEventListener('click', () => this.onDownloadSGF());
        const fb = this.mk(cr, 'span', { cls: 'bd-copy-feedback' });
        fb.id = 'bd-copyFeedback';
        fb.style.display = 'none';
        const ta = this.mk(od, 'textarea');
        ta.id = 'bd-sgfText';
        ta.readOnly = true;
        ta.style.cssText = 'width:100%;min-height:100px;box-sizing:border-box;background:var(--bd-surface2);border:1px solid var(--bd-border);color:var(--bd-text);font-family:monospace;font-size:0.72rem;padding:8px;border-radius:3px;resize:vertical;line-height:1.5';
    }
    // ────────────────────────────────────
    //  Helper UI row builders
    // ────────────────────────────────────
    addNumRow(parent, label, id, value, min, max, unitText) {
        const row = this.mk(parent, 'div', { cls: 'bd-field-row' });
        this.mk(row, 'label', { text: label });
        const inp = this.mk(row, 'input');
        inp.type = 'number';
        inp.id = id;
        inp.value = String(value);
        inp.min = String(min);
        inp.max = String(max);
        if (unitText)
            this.mk(row, 'span', { text: unitText, style: 'font-size:0.75rem;color:var(--bd-text-faint)' });
    }
    addSliderRow(parent, label, sliderId, min, max, value, valId, suffix) {
        const row = this.mk(parent, 'div', { cls: 'bd-field-row' });
        this.mk(row, 'label', { text: label });
        const sl = this.mk(row, 'input');
        sl.type = 'range';
        sl.id = sliderId;
        sl.min = String(min);
        sl.max = String(max);
        sl.value = String(value);
        sl.style.flex = '1';
        const vEl = this.mk(row, 'span', { cls: 'bd-val', text: String(value) });
        vEl.id = valId;
        if (suffix)
            this.mk(row, 'span', { text: suffix, style: 'font-size:0.68rem;color:var(--bd-text-faint)' });
        sl.addEventListener('input', () => {
            vEl.textContent = sl.value;
            if (this._detectTimer)
                clearTimeout(this._detectTimer);
            this._detectTimer = setTimeout(() => { this.onDetect(); }, 300);
        });
    }
    // ══════════════════════════════════════════
    //  Sample board generation
    // ══════════════════════════════════════════
    drawSampleBoard(bsCols, bsRows, stoneCount) {
        const W = this.srcCanvas.width, H = this.srcCanvas.height;
        const cW = W / bsCols, cH = H / bsRows;
        const ix = (c) => cW / 2 + c * cW, iy = (r) => cH / 2 + r * cH;
        const s = this.srcCtx;
        s.fillStyle = this.settings.boardBgColor;
        s.fillRect(0, 0, W, H);
        for (let i = 0; i < H; i += 5) {
            s.strokeStyle = `rgba(0,0,0,${0.03 + 0.01 * Math.sin(i)})`;
            s.lineWidth = 1;
            s.beginPath();
            s.moveTo(0, i);
            s.lineTo(W, i + 2);
            s.stroke();
        }
        s.strokeStyle = '#5a3800';
        s.lineWidth = 0.8;
        for (let i = 0; i < bsCols; i++) {
            s.beginPath();
            s.moveTo(ix(i), iy(0));
            s.lineTo(ix(i), iy(bsRows - 1));
            s.stroke();
        }
        for (let i = 0; i < bsRows; i++) {
            s.beginPath();
            s.moveTo(ix(0), iy(i));
            s.lineTo(ix(bsCols - 1), iy(i));
            s.stroke();
        }
        if (bsCols >= 9 && bsRows >= 9) {
            const sC = Math.floor(bsCols / 4), sR = Math.floor(bsRows / 4);
            [sR, Math.floor(bsRows / 2), bsRows - 1 - sR].forEach(r => {
                [sC, Math.floor(bsCols / 2), bsCols - 1 - sC].forEach(c => {
                    s.beginPath();
                    s.arc(ix(c), iy(r), 2.5, 0, Math.PI * 2);
                    s.fillStyle = '#5a3800';
                    s.fill();
                });
            });
        }
        const r = Math.min(cW, cH) * 0.44;
        const ans = new Map();
        for (let row = 0; row < bsRows; row++)
            for (let col = 0; col < bsCols; col++)
                ans.set(`${row},${col}`, 'none');
        const place = (row, col, color) => {
            const cx = ix(col), cy = iy(row);
            s.beginPath();
            s.arc(cx, cy, r, 0, Math.PI * 2);
            if (color === 'black') {
                const g = s.createRadialGradient(cx - r * .3, cy - r * .3, r * .1, cx, cy, r);
                g.addColorStop(0, '#555');
                g.addColorStop(1, '#111');
                s.fillStyle = g;
            }
            else {
                const g = s.createRadialGradient(cx - r * .3, cy - r * .3, r * .1, cx, cy, r);
                g.addColorStop(0, '#fff');
                g.addColorStop(1, '#ccc');
                s.fillStyle = g;
            }
            s.fill();
            s.strokeStyle = color === 'black' ? '#000' : '#444';
            s.lineWidth = 1.2;
            s.stroke();
            ans.set(`${row},${col}`, color);
        };
        const total = bsCols * bsRows;
        const n = (stoneCount !== undefined) ? Math.max(0, Math.min(total, stoneCount)) : Math.round(total * 0.4);
        const positions = [];
        for (let row = 0; row < bsRows; row++)
            for (let col = 0; col < bsCols; col++)
                positions.push([row, col]);
        for (let i = positions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [positions[i], positions[j]] = [positions[j], positions[i]];
        }
        for (let i = 0; i < n; i++) {
            const [row, col] = positions[i];
            place(row, col, i % 2 === 0 ? 'black' : 'white');
        }
        s.strokeStyle = 'rgba(80,160,255,0.4)';
        s.lineWidth = 1;
        s.setLineDash([3, 4]);
        s.strokeRect(0, 0, W, H);
        s.setLineDash([]);
        this.generatedBoardAnswer = { cols: bsCols, rows: bsRows, stones: ans };
    }
    // ══════════════════════════════════════════
    //  Crop overlay
    // ══════════════════════════════════════════
    drawCropOverlay() {
        const W = this.cropOverlay.width, H = this.cropOverlay.height;
        this.cropCtx.clearRect(0, 0, W, H);
        const mt = this.getMargin('marginTop'), mb = this.getMargin('marginBottom');
        const ml = this.getMargin('marginLeft'), mr = this.getMargin('marginRight');
        const sx = W / this.srcW, sy = H / this.srcH;
        const tx = ml * sx, ty = mt * sy, tw = (this.srcW - ml - mr) * sx, th = (this.srcH - mt - mb) * sy;
        this.cropCtx.fillStyle = 'rgba(0,0,0,0.45)';
        this.cropCtx.fillRect(0, 0, W, H);
        this.cropCtx.clearRect(tx, ty, tw, th);
        this.cropCtx.strokeStyle = '#ffcc44';
        this.cropCtx.lineWidth = 2;
        this.cropCtx.setLineDash([6, 3]);
        this.cropCtx.strokeRect(tx, ty, tw, th);
        this.cropCtx.setLineDash([]);
        this.updateDiagram(mt, mb, ml, mr);
    }
    updateDiagram(t, b, l, r) {
        const scale = 60 / Math.max(this.srcW, this.srcH);
        const di = this.el('bd-diagramInner');
        if (!di)
            return;
        const L = Math.min(l * scale, 28), T = Math.min(t * scale, 28), R = Math.min(r * scale, 28), B = Math.min(b * scale, 28);
        di.style.left = (8 + L) + 'px';
        di.style.top = (8 + T) + 'px';
        di.style.width = (64 - L - R) + 'px';
        di.style.height = (64 - T - B) + 'px';
    }
    // ══════════════════════════════════════════
    //  Step 1: Crop
    // ══════════════════════════════════════════
    cropImage() {
        const mt = this.getMargin('marginTop'), mb = this.getMargin('marginBottom');
        const ml = this.getMargin('marginLeft'), mr = this.getMargin('marginRight');
        const cw = this.srcW - ml - mr, ch = this.srcH - mt - mb;
        if (cw <= 0 || ch <= 0) {
            showNotice(this.t('noticeMarginTooLarge'));
            return null;
        }
        const BASE = 300;
        let outW, outH;
        if (cw >= ch) {
            outW = BASE;
            outH = Math.round(BASE * ch / cw);
        }
        else {
            outH = BASE;
            outW = Math.round(BASE * cw / ch);
        }
        this.croppedCanvas.width = outW;
        this.croppedCanvas.height = outH;
        this.croppedCtx.clearRect(0, 0, outW, outH);
        if (this.sourceImage)
            this.croppedCtx.drawImage(this.sourceImage, ml, mt, cw, ch, 0, 0, outW, outH);
        else
            this.croppedCtx.drawImage(this.srcCanvas, ml, mt, cw, ch, 0, 0, outW, outH);
        return { outW, outH, cw, ch };
    }
    // ══════════════════════════════════════════
    //  Step 2: Stone detection
    // ══════════════════════════════════════════
    detectStones() {
        const bsCols = parseInt(this.el('bd-boardCols').value) || 15;
        const bsRows = parseInt(this.el('bd-boardRows').value) || 15;
        const blackTh = parseInt(this.el('bd-blackThresh').value);
        const whiteTh = parseInt(this.el('bd-whiteThresh').value);
        const ringTh = parseInt(this.el('bd-ringThresh').value) / 100;
        const OW = this.croppedCanvas.width, OH = this.croppedCanvas.height;
        const cX = OW / bsCols, cY = OH / bsRows;
        const sR = Math.min(cX, cY) * 0.44;
        const px = this.croppedCtx.getImageData(0, 0, OW, OH).data;
        const lum = (x, y) => {
            if (x < 0 || x >= OW || y < 0 || y >= OH)
                return null;
            const i = (y * OW + x) * 4;
            return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        };
        const avgL = (cx, cy, r) => {
            let s = 0, n = 0;
            const ri = Math.ceil(r);
            for (let dy = -ri; dy <= ri; dy++)
                for (let dx = -ri; dx <= ri; dx++) {
                    if (dx * dx + dy * dy > r * r)
                        continue;
                    const v = lum(Math.round(cx + dx), Math.round(cy + dy));
                    if (v !== null) {
                        s += v;
                        n++;
                    }
                }
            return n > 0 ? s / n : 128;
        };
        const N = 24;
        const cScore = (cx, cy, r) => {
            const dt = blackTh * 1.8;
            let h = 0;
            for (let i = 0; i < N; i++) {
                const a = 2 * Math.PI * i / N;
                for (const rr of [r * .85, r, r * 1.15]) {
                    const v = lum(Math.round(cx + rr * Math.cos(a)), Math.round(cy + rr * Math.sin(a)));
                    if (v !== null && v < dt) {
                        h++;
                        break;
                    }
                }
            }
            return h / N;
        };
        const res = [];
        for (let row = 0; row < bsRows; row++) {
            res[row] = [];
            for (let col = 0; col < bsCols; col++) {
                const cx = cX / 2 + col * cX, cy = cY / 2 + row * cY;
                const l = avgL(cx, cy, sR * 0.6);
                let stone, score = 0;
                if (l < blackTh) {
                    stone = 'black';
                }
                else if (l > whiteTh) {
                    score = cScore(cx, cy, sR);
                    stone = score >= ringTh ? 'white' : 'none';
                }
                else {
                    stone = 'none';
                }
                res[row][col] = { stone, lum: l.toFixed(1), ringMin: (score * 100).toFixed(0), row, col, cx, cy };
            }
        }
        return res;
    }
    // ══════════════════════════════════════════
    //  Step 3: Render result
    // ══════════════════════════════════════════
    renderResult(data) {
        this.lastRenderedData = data;
        const bsRows = data.length, bsCols = (data[0] || []).length;
        let bl = 0, wh = 0, no = 0;
        data.forEach(r => r.forEach(c => { if (c.stone === 'black')
            bl++;
        else if (c.stone === 'white')
            wh++;
        else
            no++; }));
        const unit = this.t('statsUnit') ? (' ' + this.t('statsUnit')) : '';
        const st = this.el('bd-statsText');
        if (st)
            st.innerHTML =
                `<b>${this.t('statsBlack')}</b>: ${bl}${unit} &nbsp; <b>${this.t('statsWhite')}</b>: ${wh}${unit} &nbsp; <b>${this.t('statsNone')}</b>: ${no}${unit}<br>` +
                    `${this.t('statsTotal')}: ${bsCols} × ${bsRows} = ${bsCols * bsRows}`;
        const OW = this.croppedCanvas.width, OH = this.croppedCanvas.height;
        const cellW = OW / bsCols, cellH = OH / bsRows;
        const stoneR = Math.min(cellW, cellH) * 0.44;
        const markerR = stoneR * (this.settings.markerSizeRatio / 100);
        const blackColor = this.settings.markerBlackColor;
        const whiteColor = this.settings.markerWhiteColor;
        data.forEach(rowArr => rowArr.forEach(c => {
            const stone = this.getEffectiveStone(c);
            if (stone === 'none')
                return;
            this.croppedCtx.beginPath();
            this.croppedCtx.arc(c.cx, c.cy, markerR, 0, Math.PI * 2);
            this.croppedCtx.fillStyle = stone === 'black' ? blackColor : whiteColor;
            this.croppedCtx.fill();
        }));
        const rc = this.el('bd-resultCanvas');
        if (rc) {
            this.drawBoardCanvas(rc, bsCols, bsRows, data.map(r => r.map(c => this.getEffectiveStone(c))));
            rc.style.display = 'block';
        }
        this.drawImageOverlay();
        this.verifySample(data);
    }
    redrawMarkers() {
        const data = this.lastRenderedData;
        if (!data || data.length === 0)
            return;
        const bsCols = (data[0] || []).length, bsRows = data.length;
        this.croppedCtx.clearRect(0, 0, this.croppedCanvas.width, this.croppedCanvas.height);
        if (this.sourceImage) {
            const mt = this.getMargin('marginTop'), mb = this.getMargin('marginBottom');
            const ml = this.getMargin('marginLeft'), mr = this.getMargin('marginRight');
            const cw = this.srcW - ml - mr, ch = this.srcH - mt - mb;
            this.croppedCtx.drawImage(this.sourceImage, ml, mt, cw, ch, 0, 0, this.croppedCanvas.width, this.croppedCanvas.height);
        }
        else {
            const mt = this.getMargin('marginTop'), mb = this.getMargin('marginBottom');
            const ml = this.getMargin('marginLeft'), mr = this.getMargin('marginRight');
            const cw = this.srcW - ml - mr, ch = this.srcH - mt - mb;
            this.croppedCtx.drawImage(this.srcCanvas, ml, mt, cw, ch, 0, 0, this.croppedCanvas.width, this.croppedCanvas.height);
        }
        const OW = this.croppedCanvas.width, OH = this.croppedCanvas.height;
        const cellW = OW / bsCols, cellH = OH / bsRows;
        const stoneR = Math.min(cellW, cellH) * 0.44;
        const markerR = stoneR * (this.settings.markerSizeRatio / 100);
        data.forEach(rowArr => rowArr.forEach(c => {
            const stone = this.getEffectiveStone(c);
            if (stone === 'black' || stone === 'white') {
                this.croppedCtx.beginPath();
                this.croppedCtx.arc(c.cx, c.cy, markerR, 0, Math.PI * 2);
                this.croppedCtx.fillStyle = stone === 'black' ? this.settings.markerBlackColor : this.settings.markerWhiteColor;
                this.croppedCtx.fill();
            }
            else if (this.correctionMode && this.correctionMap.has(`${c.row},${c.col}`)) {
                const arm = markerR * 0.75;
                this.croppedCtx.strokeStyle = '#ff3300';
                this.croppedCtx.lineWidth = Math.max(2, markerR * 0.35);
                this.croppedCtx.lineCap = 'round';
                this.croppedCtx.beginPath();
                this.croppedCtx.moveTo(c.cx - arm, c.cy - arm);
                this.croppedCtx.lineTo(c.cx + arm, c.cy + arm);
                this.croppedCtx.stroke();
                this.croppedCtx.beginPath();
                this.croppedCtx.moveTo(c.cx + arm, c.cy - arm);
                this.croppedCtx.lineTo(c.cx - arm, c.cy + arm);
                this.croppedCtx.stroke();
            }
        }));
        // Also update resultCanvas with corrected stones
        const bsRows2 = data.length, bsCols2 = (data[0] || []).length;
        const rc = this.el('bd-resultCanvas');
        if (rc && rc.style.display !== 'none') {
            this.drawBoardCanvas(rc, bsCols2, bsRows2, data.map(r => r.map(c => this.getEffectiveStone(c))));
        }
        this.drawImageOverlay();
    }
    // ══════════════════════════════════════════
    //  Correction mode
    // ══════════════════════════════════════════
    getEffectiveStone(cell) {
        var _a;
        return (_a = this.correctionMap.get(`${cell.row},${cell.col}`)) !== null && _a !== void 0 ? _a : cell.stone;
    }
    onToggleCorrectionMode() {
        if (!this.boardData.length) {
            showNotice(this.t('errNoDetect'));
            return;
        }
        this.correctionMode = !this.correctionMode;
        this.correctionMap.clear();
        const btn = this.correctionBtn;
        if (this.correctionMode) {
            if (btn) {
                btn.classList.add('bd-btn-correction-active');
                btn.textContent = this.t('btnCorrectionActive');
            }
            this.croppedCanvas.style.cursor = 'crosshair';
        }
        else {
            if (btn) {
                btn.classList.remove('bd-btn-correction-active');
                btn.textContent = this.t('btnCorrection');
            }
            this.croppedCanvas.style.cursor = '';
            this.redrawMarkers();
        }
    }
    // ══════════════════════════════════════════
    //  Image overlay on result canvas
    // ══════════════════════════════════════════
    onToggleImageOverlay() {
        this.imageOverlayMode = !this.imageOverlayMode;
        const btn = this.imageOverlayBtn;
        if (this.imageOverlayMode) {
            if (btn) {
                btn.classList.add('bd-btn-image-overlay-active');
                btn.textContent = this.t('btnImageOverlayActive');
            }
            this.drawImageOverlay();
        }
        else {
            if (btn) {
                btn.classList.remove('bd-btn-image-overlay-active');
                btn.textContent = this.t('btnImageOverlay');
            }
            const ov = this.imageOverlayCanvas;
            if (ov) {
                const ctx = ov.getContext('2d');
                ctx.clearRect(0, 0, ov.width, ov.height);
                ov.style.display = 'none';
            }
        }
    }
    drawImageOverlay() {
        const ov = this.imageOverlayCanvas;
        if (!ov || !this.imageOverlayMode)
            return;
        const rc = this.el('bd-resultCanvas');
        if (!rc || rc.style.display === 'none')
            return;
        ov.width = this.croppedCanvas.width;
        ov.height = this.croppedCanvas.height;
        ov.style.width = ov.width + 'px';
        ov.style.height = ov.height + 'px';
        ov.style.display = 'block';
        const ctx = ov.getContext('2d');
        ctx.clearRect(0, 0, ov.width, ov.height);
        // Draw resultCanvas (board graphic) semi-transparently onto croppedCanvas
        ctx.globalAlpha = this.imageOverlayAlpha;
        ctx.drawImage(rc, 0, 0, ov.width, ov.height);
        ctx.globalAlpha = 1.0;
    }
    drawBoardCanvas(canvas, cols, rows, grid) {
        var _a;
        const BASE = 300;
        if (cols >= rows) {
            canvas.width = BASE;
            canvas.height = Math.round(BASE * rows / cols);
        }
        else {
            canvas.height = BASE;
            canvas.width = Math.round(BASE * cols / rows);
        }
        canvas.width = Math.max(canvas.width, 40);
        canvas.height = Math.max(canvas.height, 40);
        const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
        const cW = W / cols, cH = H / rows;
        const ix = (c) => cW / 2 + c * cW, iy = (r) => cH / 2 + r * cH;
        ctx.fillStyle = this.settings.boardBgColor;
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < H; i += 5) {
            ctx.strokeStyle = `rgba(0,0,0,${0.03 + 0.01 * Math.sin(i)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(W, i + 2);
            ctx.stroke();
        }
        ctx.strokeStyle = '#5a3800';
        ctx.lineWidth = 0.8;
        for (let c = 0; c < cols; c++) {
            ctx.beginPath();
            ctx.moveTo(ix(c), iy(0));
            ctx.lineTo(ix(c), iy(rows - 1));
            ctx.stroke();
        }
        for (let r = 0; r < rows; r++) {
            ctx.beginPath();
            ctx.moveTo(ix(0), iy(r));
            ctx.lineTo(ix(cols - 1), iy(r));
            ctx.stroke();
        }
        if (cols >= 9 && rows >= 9) {
            const sC = Math.floor(cols / 4), sR = Math.floor(rows / 4);
            [sR, Math.floor(rows / 2), rows - 1 - sR].forEach(r => {
                [sC, Math.floor(cols / 2), cols - 1 - sC].forEach(c => {
                    ctx.beginPath();
                    ctx.arc(ix(c), iy(r), 2.5, 0, Math.PI * 2);
                    ctx.fillStyle = '#5a3800';
                    ctx.fill();
                });
            });
        }
        const stR = Math.min(cW, cH) * 0.44;
        for (let r = 0; r < rows; r++)
            for (let c = 0; c < cols; c++) {
                const stone = (_a = grid[r]) === null || _a === void 0 ? void 0 : _a[c];
                if (!stone || stone === 'none')
                    continue;
                const cx = ix(c), cy = iy(r);
                ctx.beginPath();
                ctx.arc(cx, cy, stR, 0, Math.PI * 2);
                if (stone === 'black') {
                    const g = ctx.createRadialGradient(cx - stR * .3, cy - stR * .3, stR * .1, cx, cy, stR);
                    g.addColorStop(0, '#555');
                    g.addColorStop(1, '#111');
                    ctx.fillStyle = g;
                }
                else {
                    const g = ctx.createRadialGradient(cx - stR * .3, cy - stR * .3, stR * .1, cx, cy, stR);
                    g.addColorStop(0, '#fff');
                    g.addColorStop(1, '#ccc');
                    ctx.fillStyle = g;
                }
                ctx.fill();
                ctx.strokeStyle = stone === 'black' ? '#000' : '#444';
                ctx.lineWidth = 1.2;
                ctx.stroke();
            }
    }
    verifySample(data) {
        if (this.sourceImage || !this.generatedBoardAnswer)
            return;
        const { stones } = this.generatedBoardAnswer;
        const total = data.length * ((data[0] || []).length);
        let ok = 0;
        const nB = [], nW = [], nN = [];
        data.forEach((rowArr) => rowArr.forEach((cell) => {
            const exp = stones.get(`${cell.row},${cell.col}`) || 'none';
            if (cell.stone === exp) {
                ok++;
            }
            else {
                const info = `(${cell.row},${cell.col}) ${this.t('verifyExpected')}<b>${exp}</b> ${this.t('verifyActual')}${cell.stone} lum=${cell.lum} ring=${cell.ringMin}%`;
                if (exp === 'black')
                    nB.push(info);
                else if (exp === 'white')
                    nW.push(info);
                else
                    nN.push(info);
            }
        }));
        const ng = [...nB, ...nW, ...nN], pct = Math.round(ok / total * 100);
        const col = pct === 100 ? '#80c860' : pct >= 90 ? '#c8b040' : '#e06040';
        const st = this.el('bd-statsText');
        if (!st)
            return;
        st.innerHTML +=
            `<br><hr style="border-color:var(--bd-border);margin:6px 0">` +
                `<span style="color:var(--bd-text-faint);font-size:0.68rem">${this.t('verifyHeader')}</span><br>` +
                `<span style="color:${col}">${this.t('verifyResult', ok, total, pct)}</span>` +
                (nB.length ? `<br><span style="color:#e08060;font-size:0.68rem">${this.t('verifyNgBlack', nB.length)}<br>${nB.join('<br>')}</span>` : '') +
                (nW.length ? `<br><span style="color:#e08060;font-size:0.68rem">${this.t('verifyNgWhite', nW.length)}<br>${nW.join('<br>')}</span>` : '') +
                (nN.length ? `<br><span style="color:#e08060;font-size:0.68rem">${this.t('verifyNgNone', nN.length)}<br>${nN.join('<br>')}</span>` : '') +
                (ng.length === 0 ? `<br><span style="color:#80c860">${this.t('verifyPerfect')}</span>` : '');
    }
    // ══════════════════════════════════════════
    //  Event handlers
    // ══════════════════════════════════════════
    onDetect() {
        const cols = parseInt(this.el('bd-boardCols').value) || 0;
        const rows = parseInt(this.el('bd-boardRows').value) || 0;
        if (cols > 19 || rows > 19) {
            showNotice(this.t('errMaxSize'));
            return;
        }
        if (cols < 1 || rows < 1) {
            showNotice(this.t('errMinSize'));
            return;
        }
        if (!this.cropImage())
            return;
        // Reset correction on new detection
        this.correctionMap.clear();
        this.correctionMode = false;
        if (this.correctionBtn) {
            this.correctionBtn.classList.remove('bd-btn-correction-active');
            this.correctionBtn.textContent = this.t('btnCorrection');
        }
        // Reset grid preview on new detection
        this.imageOverlayMode = false;
        if (this.imageOverlayBtn) {
            this.imageOverlayBtn.classList.remove('bd-btn-image-overlay-active');
            this.imageOverlayBtn.textContent = this.t('btnImageOverlay');
        }
        if (this.imageOverlayCanvas)
            this.imageOverlayCanvas.style.display = 'none';
        this.boardData = this.detectStones();
        this.renderResult(this.boardData);
        const sc = this.el('bd-sgfCard');
        if (sc)
            sc.style.display = 'block';
    }
    onExpand() {
        var _a;
        const err = this.el('bd-expandError');
        if (err)
            err.style.display = 'none';
        if (!((_a = this.boardData) === null || _a === void 0 ? void 0 : _a.length)) {
            if (err) {
                err.textContent = this.t('errNoDetect');
                err.style.display = 'block';
            }
            return;
        }
        const iR = this.boardData.length, iC = (this.boardData[0] || []).length;
        const oC = parseInt(this.el('bd-outCols').value) || 0;
        const oR = parseInt(this.el('bd-outRows').value) || 0;
        const oX = parseInt(this.el('bd-offsetX').value) || 0;
        const oY = parseInt(this.el('bd-offsetY').value) || 0;
        const chk = (cond, msg) => { if (cond) {
            if (err) {
                err.textContent = msg;
                err.style.display = 'block';
            }
            return true;
        } return false; };
        if (chk(oC < 1 || oR < 1, this.t('errMinOut')) ||
            chk(oC > 19 || oR > 19, this.t('errMaxOut')) ||
            chk(oX + iC > oC, this.t('errOverflowX', oX, iC, oC)) ||
            chk(oY + iR > oR, this.t('errOverflowY', oY, iR, oR)))
            return;
        const board = Array.from({ length: oR }, () => new Array(oC).fill('none'));
        for (let r = 0; r < iR; r++)
            for (let c = 0; c < iC; c++)
                board[oY + r][oX + c] = this.getEffectiveStone(this.boardData[r][c]);
        let bl = 0, wh = 0, no = 0;
        board.forEach(row => row.forEach(s => { if (s === 'black')
            bl++;
        else if (s === 'white')
            wh++;
        else
            no++; }));
        const unit = this.t('statsUnit') ? (' ' + this.t('statsUnit')) : '';
        const es = this.el('bd-expandStats');
        if (es)
            es.innerHTML = this.t('expandSummary', iC, iR, oC, oR, oX, oY) + '<br>' +
                `<b>${this.t('statsBlack')}</b>: ${bl}${unit} &nbsp; <b>${this.t('statsWhite')}</b>: ${wh}${unit} &nbsp; <b>${this.t('statsNone')}</b>: ${no}${unit}`;
        const ec = this.el('bd-expandCanvas');
        if (ec)
            this.drawBoardCanvas(ec, oC, oR, board);
        this.expandedBoard = { cols: oC, rows: oR, stones: board };
        const erc = this.el('bd-expandResultCard');
        if (erc)
            erc.style.display = 'block';
        const so = this.el('bd-sgfOutput');
        if (so)
            so.style.display = 'none';
        const sc = this.el('bd-sgfCard');
        if (sc)
            sc.style.display = 'block';
    }
    onResetConfirm() {
        showConfirm(this.t('resetConfirmTitle'), this.t('resetConfirmMsg'), this.t('resetConfirmOk'), this.t('resetConfirmCancel'), () => this.onReset());
    }
    onReset() {
        this.croppedCtx.clearRect(0, 0, this.croppedCanvas.width, this.croppedCanvas.height);
        this.srcCtx.clearRect(0, 0, this.srcCanvas.width, this.srcCanvas.height);
        this.cropCtx.clearRect(0, 0, this.cropOverlay.width, this.cropOverlay.height);
        const g = (id) => this.el(id);
        const st = g('bd-statsText');
        if (st)
            st.textContent = this.t('statsInitial');
        const rc = g('bd-resultCanvas');
        if (rc)
            rc.style.display = 'none';
        this.boardData = [];
        this.sourceImage = null;
        this.generatedBoardAnswer = null;
        this.expandedBoard = null;
        this.lastSgfBody = '';
        this.lastRenderedData = [];
        this.correctionMap.clear();
        this.correctionMode = false;
        if (this.correctionBtn) {
            this.correctionBtn.classList.remove('bd-btn-correction-active');
            this.correctionBtn.textContent = this.t('btnCorrection');
        }
        this.imageOverlayMode = false;
        if (this.imageOverlayBtn) {
            this.imageOverlayBtn.classList.remove('bd-btn-image-overlay-active');
            this.imageOverlayBtn.textContent = this.t('btnImageOverlay');
        }
        if (this.imageOverlayCanvas)
            this.imageOverlayCanvas.style.display = 'none';
        const es = g('bd-expandStats');
        if (es)
            es.textContent = '';
        ['bd-expandResultCard', 'bd-expandError', 'bd-sgfCard', 'bd-sgfOutput'].forEach(id => {
            const el = g(id);
            if (el)
                el.style.display = 'none';
        });
        const ta = g('bd-sgfText');
        if (ta)
            ta.value = '';
        this.updateMarginSliders(this.srcCanvas.width, this.srcCanvas.height);
        this.drawCropOverlay();
        this.startOverlayEl.style.display = 'flex';
        this.mainContentEl.style.display = 'none';
        if (this.genOptionsEl)
            this.genOptionsEl.style.display = 'none';
    }
    onMakeSGF() {
        var _a, _b, _c, _d, _e, _f;
        if (!this.expandedBoard) {
            showNotice(this.t('noticeNoExpand'));
            return;
        }
        const { cols, rows, stones } = this.expandedBoard;
        const pl = (_b = (_a = this.el('bd-sgfPL')) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : 'B';
        const gm = (_d = (_c = this.el('bd-sgfGM')) === null || _c === void 0 ? void 0 : _c.value) !== null && _d !== void 0 ? _d : '1';
        const ru = (_f = ((_e = this.el('bd-sgfRU')) === null || _e === void 0 ? void 0 : _e.value.trim())) !== null && _f !== void 0 ? _f : '';
        const coord = (c, r) => String.fromCharCode(97 + c) + String.fromCharCode(97 + r);
        const bs = [], ws = [];
        for (let r = 0; r < rows; r++)
            for (let c = 0; c < cols; c++) {
                if (stones[r][c] === 'black')
                    bs.push(coord(c, r));
                else if (stones[r][c] === 'white')
                    ws.push(coord(c, r));
            }
        const sz = cols === rows ? `${cols}` : `${cols}:${rows}`;
        let sgf = `(;GM[${gm}]FF[4]SZ[${sz}]`;
        if (pl)
            sgf += `PL[${pl}]`;
        if (ru)
            sgf += `RU[${ru}]`;
        if (bs.length)
            sgf += `\nAB[${bs.join('][')}]`;
        if (ws.length)
            sgf += `\nAW[${ws.join('][')}]`;
        sgf += ')';
        this.lastSgfBody = sgf;
        const display = `${sgf}`;
        const ta = this.el('bd-sgfText');
        if (ta)
            ta.value = display;
        const so = this.el('bd-sgfOutput');
        if (so)
            so.style.display = 'block';
        const fb = this.el('bd-copyFeedback');
        if (fb)
            fb.style.display = 'none';
    }
    onCopySGF() {
        var _a;
        const ta = this.el('bd-sgfText');
        if (!ta || !ta.value)
            return;
        const text = ta.value;
        const showFB = (msg) => {
            const fb = this.el('bd-copyFeedback');
            if (fb) {
                fb.textContent = msg;
                fb.style.display = 'inline';
                setTimeout(() => { fb.style.display = 'none'; }, 2000);
            }
        };
        if ((_a = navigator.clipboard) === null || _a === void 0 ? void 0 : _a.writeText) {
            navigator.clipboard.writeText(text).then(() => showFB(this.t('copyDone'))).catch(() => { ta.select(); document.execCommand('copy'); showFB(this.t('copyDone')); });
        }
        else {
            ta.select();
            document.execCommand('copy');
            showFB(this.t('copyDone'));
        }
    }
    /** Download SGF file (replaces Vault save) */
    onDownloadSGF() {
        if (!this.lastSgfBody) {
            showNotice(this.t('errNoSGF'));
            return;
        }
        const d = new Date();
        const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
        const fname = `grb-${ts}.sgf`;
        const blob = new Blob([this.lastSgfBody], { type: 'application/x-go-sgf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        const fb = this.el('bd-copyFeedback');
        if (fb) {
            const msg = this.t('downloadDone', fname);
            fb.textContent = (typeof msg === 'string' ? msg : fname + ' downloaded');
            fb.style.display = 'inline';
            setTimeout(() => { fb.style.display = 'none'; }, 3000);
        }
    }
    loadImageFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.sourceImage = img;
                this.srcW = img.width;
                this.srcH = img.height;
                const scale = Math.min(1, 500 / Math.max(this.srcW, this.srcH));
                this.srcCanvas.width = Math.round(this.srcW * scale);
                this.srcCanvas.height = Math.round(this.srcH * scale);
                this.cropOverlay.width = this.srcCanvas.width;
                this.cropOverlay.height = this.srcCanvas.height;
                this.srcCtx.drawImage(img, 0, 0, this.srcCanvas.width, this.srcCanvas.height);
                this.updateMarginSliders(this.srcW, this.srcH);
                this.drawCropOverlay();
                // Reset detection and mode states (keep references, just reset state)
                this.boardData = [];
                this.lastRenderedData = [];
                this.lastSgfBody = '';
                const rc = this.el('bd-resultCanvas');
                if (rc)
                    rc.style.display = 'none';
                const st = this.el('bd-statsText');
                if (st)
                    st.textContent = this.t('statsInitial');
                this.correctionMap.clear();
                this.correctionMode = false;
                if (this.correctionBtn) {
                    this.correctionBtn.classList.remove('bd-btn-correction-active');
                    this.correctionBtn.textContent = this.t('btnCorrection');
                }
                this.imageOverlayMode = false;
                if (this.imageOverlayBtn) {
                    this.imageOverlayBtn.classList.remove('bd-btn-image-overlay-active');
                    this.imageOverlayBtn.textContent = this.t('btnImageOverlay');
                }
                if (this.imageOverlayCanvas)
                    this.imageOverlayCanvas.style.display = 'none';
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
    updateMarginSliders(w, h) {
        const wEl = this.el('bd-imgSizeW'), hEl = this.el('bd-imgSizeH');
        if (wEl)
            wEl.textContent = String(w);
        if (hEl)
            hEl.textContent = String(h);
        ['marginTop', 'marginBottom', 'marginLeft', 'marginRight'].forEach((id, i) => {
            const max = i < 2 ? h : w;
            const sl = this.el('bd-' + id);
            const nu = this.el('bd-' + id + 'Num');
            if (sl) {
                sl.max = String(max);
                sl.value = '0';
            }
            if (nu) {
                nu.max = String(max);
                nu.value = '0';
            }
        });
    }
    // ────────────────────────────────────
    //  Utility
    // ────────────────────────────────────
    rgbaToHex(color) {
        if (color.startsWith('#'))
            return color.slice(0, 7);
        const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m)
            return '#00c8ff';
        const r = parseInt(m[1]).toString(16).padStart(2, '0');
        const g = parseInt(m[2]).toString(16).padStart(2, '0');
        const b = parseInt(m[3]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }
}
// Auto-mount when used as a plain <script> (non-module)
if (typeof window !== 'undefined') {
    window.BdDetectApp = BdDetectApp;
    window.BdDetectDefaultSettings = DEFAULT_SETTINGS;
}
