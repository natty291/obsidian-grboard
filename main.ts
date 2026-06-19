/*
  bd-detect — Board Crop & Auto Stone Detector
  Obsidian Plugin  (TypeScript source)
*/

import {
  App,
  ItemView,
  MarkdownPostProcessorContext,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  FileView,
  WorkspaceLeaf,
  normalizePath,
  TFile,
} from 'obsidian';
import { h, render as preactRender } from 'preact';
import { Goban } from '@sabaki/shudan';
// @ts-ignore
import * as sabakiSgf from '@sabaki/sgf';
import { StringsDict, STRINGS } from './strings';

// ══════════════════════════════════════════
//  Type definitions
// ══════════════════════════════════════════
type StoneColor = 'black' | 'white' | 'none';

interface CellData {
  stone: StoneColor;
  lum: string;
  ringMin: string;
  row: number;
  col: number;
  cx: number;
  cy: number;
}

interface GeneratedAnswer {
  cols: number;
  rows: number;
  stones: Map<string, StoneColor>;
}

interface ExpandedBoard {
  cols: number;
  rows: number;
  stones: StoneColor[][];
}

interface BdDetectSettings {
  language: 'ja' | 'en';
  boardBgColor: string;      // Board background color
  markerBlackColor: string;  // Black stone detection marker color
  markerWhiteColor: string;  // White stone detection marker color
  markerSizeRatio: number;   // Marker radius (percentage relative to one grid cell, 0–100)
  lastMoveColor: string;       // Last move marker color
  sgfMarkerColor: string;      // Symbol marker color (on stone)
  sgfMarkerEmptyColor: string; // Symbol marker color (on empty intersection)
  moveNumBlackStoneColor: string; // Move number color (on black stone)
  moveNumWhiteStoneColor: string; // Move number color (on white stone)
}


// ══════════════════════════════════════════
//  Default settings
// ══════════════════════════════════════════
const DEFAULT_SETTINGS: BdDetectSettings = {
  language: 'en',
  boardBgColor: '#d4a843',
  markerBlackColor: 'rgba(0,200,255,0.8)',
  markerWhiteColor: 'rgba(255,80,80,0.8)',
  markerSizeRatio: 25,   // 25% of one grid cell ≈ equivalent feel to the old fixed 4 px value
  lastMoveColor: '#00aa00',           // Last move marker color (default: green)
  sgfMarkerColor: '#ff0000',         // Symbol marker color (on stone, default: red)
  sgfMarkerEmptyColor: '#222222',     // Symbol marker color (on empty, default: near-black)
  moveNumBlackStoneColor: '#ffffff',  // Move number color (on black stone, default: white)
  moveNumWhiteStoneColor: '#000000',  // Move number color (on white stone, default: black)
};

const VIEW_TYPE = 'bd-detect-view';

// ══════════════════════════════════════════
//  Plugin class
// ══════════════════════════════════════════
export default class BdDetectPlugin extends Plugin {
  settings!: BdDetectSettings;
  private mutationObserver: MutationObserver | null = null;

  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE, (leaf) => new BdDetectView(leaf, this.app, this));
    this.addRibbonIcon('scan', 'Board Detect', () => this.activateView());
    this.addCommand({
      id: 'open-bd-detect',
      name: STRINGS[this.settings.language]?.cmdName as string ?? STRINGS['ja'].cmdName as string,
      callback: () => this.activateView(),
    });
    this.addSettingTab(new BdDetectSettingTab(this.app, this));

    // ── grboard code block renderer (rendered via Sabaki Goban) ──
    this.registerMarkdownCodeBlockProcessor('grboard', (source, el, ctx) => {
      const params  = parseInfoString(ctx, el);
      const sgfText = source.trim();
      // Use bgcolor option if specified, otherwise fall back to plugin setting
      const bgColor = params.bgcolor ?? this.settings.boardBgColor;
      const app     = this.app;
      const plugin  = this;

      // ── Divider line ──
      const hrEl = el.createEl('hr');
      hrEl.style.cssText = 'border:none;border-top:1px solid var(--background-modifier-border);margin:6px 0;';

      // ── Mode selector dropdown ──
      const controlRow = el.createEl('div');
      controlRow.style.cssText =
        'display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.78rem;';

      controlRow.createEl('span', {
        text: plugin.t('sgfModeLabel') + ':',
        attr: { style: 'color:var(--text-muted)' },
      });

      const modeSelect = controlRow.createEl('select') as HTMLSelectElement;
      modeSelect.style.cssText =
        'background:var(--background-secondary);border:1px solid var(--background-modifier-border);' +
        'color:var(--text-normal);padding:2px 8px;border-radius:3px;font-size:0.78rem;cursor:pointer;';

      const optRef  = modeSelect.createEl('option', { text: plugin.t('sgfModeRef') }) as HTMLOptionElement;
      optRef.value  = 'ref';
      const optPlay = modeSelect.createEl('option', { text: plugin.t('sgfModePlay') }) as HTMLOptionElement;
      optPlay.value = 'play';
      const optEdit = modeSelect.createEl('option', { text: plugin.t('sgfModeEdit') }) as HTMLOptionElement;
      optEdit.value = 'edit';

      modeSelect.value = 'ref';

      // ── Move number checkbox row (visible only in play mode) ──
      const checkRow = el.createEl('div');
      checkRow.style.cssText = 'display:none;align-items:center;gap:16px;margin-bottom:4px;font-size:0.75rem;color:var(--text-muted);';

      const chkMoveLabel = checkRow.createEl('label');
      chkMoveLabel.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer;';
      const chkMove = chkMoveLabel.createEl('input') as HTMLInputElement;
      chkMove.type = 'checkbox'; chkMove.checked = true;
      chkMoveLabel.appendText(plugin.t('showMoveNum'));

      // ── Image save button (right side of controlRow) ──
      const saveImgBtn = controlRow.createEl('button');
      saveImgBtn.textContent = '📷';
      saveImgBtn.title = 'Save as PNG';
      saveImgBtn.style.cssText =
        'margin-left:auto;padding:2px 8px;border:1px solid var(--background-modifier-border);' +
        'border-radius:3px;background:var(--background-secondary);color:var(--text-normal);' +
        'cursor:pointer;font-size:1rem;line-height:1;';
      saveImgBtn.addEventListener('click', () => {
        new SavePngModal(
          app,
          plugin.t('savePngConfirmTitle'),
          plugin.t('savePngConfirmMsg'),
          plugin.t('savePngOk'),
          plugin.t('resetConfirmCancel'),
          plugin.t('savePngIncludeMarkers'),
          plugin.t('savePngIncludeBorder'),
          async (includeMarkers: boolean, includeBorder: boolean) => { try {
          // Retrieve saved board data from boardContainer
          const boardContainer = boardArea.querySelector('.grboard-display') as HTMLElement | null;
          if (!boardContainer) { new Notice('Board not ready', 2000); return; }
          const signMap = (boardContainer as any)._signMap as (0|1|-1)[][] | undefined;
          const cols    = (boardContainer as any)._boardCols as number | undefined;
          const rows    = (boardContainer as any)._boardRows as number | undefined;
          const markerMap     = (boardContainer as any)._markerMap as (GobanMarkerData | null)[][] | undefined;
          const markerColors  = ((boardContainer as any)._markerColors as { onStone: string; onEmpty: string; moveNumOnBlack: string; moveNumOnWhite: string; lastMove: string } | undefined)
                             ?? { onStone: '#ff0000', onEmpty: '#222222', moveNumOnBlack: '#ffffff', moveNumOnWhite: '#000000', lastMove: '#00aa00' };
          const showMarkersInPng  = includeMarkers;            // ON/OFF for all markers
          const showMoveNumInPng  = includeMarkers && chkMove.checked; // ON/OFF for move numbers
          if (!signMap || !cols || !rows) { new Notice('Board data not found', 2000); return; }

          // Convert signMap to StoneColor[][] and render using the same logic as drawBoardCanvas
          const grid: StoneColor[][] = signMap.map(row =>
            row.map(v => v === 1 ? 'black' : v === -1 ? 'white' : 'none')
          );

          // Canvas size: add margin for coordinate labels when border is enabled
          const BASE = 600;
          const canvas = document.createElement('canvas');
          if (cols >= rows) { canvas.width = BASE; canvas.height = Math.round(BASE * rows / cols); }
          else              { canvas.height = BASE; canvas.width = Math.round(BASE * cols / rows); }
          canvas.width  = Math.max(canvas.width,  40);
          canvas.height = Math.max(canvas.height, 40);

          // Border margin: reserve space for coordinate labels (numbers left, letters top/bottom)
          const borderFontSize = Math.round(Math.min(canvas.width / cols, canvas.height / rows) * 0.55);
          const MARGIN = includeBorder ? Math.round(borderFontSize * 1.8) : 0;

          // Expand canvas to accommodate the margin
          canvas.width  += MARGIN * 2;
          canvas.height += MARGIN * 2;

          const ctx = canvas.getContext('2d')!;
          const W = canvas.width, H = canvas.height;
          // Board drawing area (inside the margin)
          const BW = W - MARGIN * 2, BH = H - MARGIN * 2;
          const cW = BW / cols, cH = BH / rows;
          // Coordinate helpers: translate col/row to canvas pixel, offset by MARGIN
          const ix = (c: number) => MARGIN + cW / 2 + c * cW;
          const iy = (r: number) => MARGIN + cH / 2 + r * cH;

          // Full canvas background (covers label area too)
          ctx.fillStyle = bgColor || '#DCB35C';
          ctx.fillRect(0, 0, W, H);
          for (let i = 0; i < H; i += 5) {
            ctx.strokeStyle = 'rgba(0,0,0,' + (0.03 + 0.01 * Math.sin(i)) + ')';
            ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i + 2); ctx.stroke();
          }

          // Grid lines
          ctx.strokeStyle = '#5a3800'; ctx.lineWidth = 0.8;
          for (let c = 0; c < cols; c++) {
            ctx.beginPath(); ctx.moveTo(ix(c), iy(0)); ctx.lineTo(ix(c), iy(rows - 1)); ctx.stroke();
          }
          for (let r = 0; r < rows; r++) {
            ctx.beginPath(); ctx.moveTo(ix(0), iy(r)); ctx.lineTo(ix(cols - 1), iy(r)); ctx.stroke();
          }

          // Coordinate labels (when border is enabled)
          // Columns: A-H, J-Z (skip I) along top and bottom
          // Rows: 1-N (from bottom) along left and right
          if (includeBorder) {
            // Column letters: A B C D E F G H J K L M N O P Q R S T (skip I)
            const colLetters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
            ctx.fillStyle = '#3a2200';
            ctx.font = `bold ${borderFontSize}px Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let c = 0; c < cols; c++) {
              const letter = colLetters[c] ?? String(c + 1);
              const px = ix(c);
              // Top label
              ctx.fillText(letter, px, MARGIN / 2);
              // Bottom label
              ctx.fillText(letter, px, H - MARGIN / 2);
            }
            // Row numbers: 1 at bottom, counting up
            ctx.textAlign = 'center';
            for (let r = 0; r < rows; r++) {
              const num = String(rows - r); // 1 at bottom row
              const py = iy(r);
              // Left label
              ctx.fillText(num, MARGIN / 2, py);
              // Right label
              ctx.fillText(num, W - MARGIN / 2, py);
            }
          }

          // Star points (handicap points)
          if (cols >= 9 && rows >= 9) {
            const sC = Math.floor(cols / 4), sR = Math.floor(rows / 4);
            [sR, Math.floor(rows / 2), rows - 1 - sR].forEach(r => {
              [sC, Math.floor(cols / 2), cols - 1 - sC].forEach(c => {
                ctx.beginPath(); ctx.arc(ix(c), iy(r), 2.5, 0, Math.PI * 2);
                ctx.fillStyle = '#5a3800'; ctx.fill();
              });
            });
          }

          // Stones
          const stR = Math.min(cW, cH) * 0.44;
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const stone = grid[r]?.[c];
              if (!stone || stone === 'none') continue;
              const cx = ix(c), cy = iy(r);
              ctx.beginPath(); ctx.arc(cx, cy, stR, 0, Math.PI * 2);
              if (stone === 'black') {
                const g = ctx.createRadialGradient(cx - stR*.3, cy - stR*.3, stR*.1, cx, cy, stR);
                g.addColorStop(0, '#555'); g.addColorStop(1, '#111'); ctx.fillStyle = g;
              } else {
                const g = ctx.createRadialGradient(cx - stR*.3, cy - stR*.3, stR*.1, cx, cy, stR);
                g.addColorStop(0, '#fff'); g.addColorStop(1, '#ccc'); ctx.fillStyle = g;
              }
              ctx.fill();
              ctx.strokeStyle = stone === 'black' ? '#000' : '#444';
              ctx.lineWidth = 1.2; ctx.stroke();
            }
          }

          // ── Marker / move-number rendering ──
          // showMarkersInPng : true when "Include markers" is checked in the dialog
          // showMoveNumInPng : true when showMarkersInPng AND move-number checkbox is ON
          const isPlayMode     = (boardContainer as any)._isPlayMode as boolean | undefined;
          const savedPlayMoves = (boardContainer as any)._playMoves as Array<{color:'B'|'W', point:string}> | undefined;

          // ── ① Play mode + move numbers ON: render move numbers independently ──
          if (showMoveNumInPng && isPlayMode && savedPlayMoves && savedPlayMoves.length > 0) {
            const pSignMap: (0|1|-1)[][] = Array.from({length: rows}, () => new Array(cols).fill(0) as (0|1|-1)[]);
            for (let r2 = 0; r2 < rows; r2++)
              for (let c2 = 0; c2 < cols; c2++)
                pSignMap[r2][c2] = signMap[r2][c2];

            for (let i = 0; i < savedPlayMoves.length; i++) {
              const pm = savedPlayMoves[i];
              const vx = pm.point.charCodeAt(0) - 97;
              const vy = pm.point.charCodeAt(1) - 97;
              if (vx < 0 || vy < 0 || vx >= cols || vy >= rows) continue;
              const stoneColor: 1|-1 = pm.color === 'B' ? 1 : -1;
              if (pSignMap[vy][vx] !== stoneColor) continue; // Skip captured stones
              const label = String(i + 1);
              const cx2 = ix(vx), cy2 = iy(vy);
              const stone2 = grid[vy]?.[vx];
              const fontSize = label.length >= 3 ? Math.min(cW, cH) * 0.28
                             : label.length === 2 ? Math.min(cW, cH) * 0.36
                             : Math.min(cW, cH) * 0.46;
              ctx.font = 'bold ' + Math.round(fontSize) + 'px Arial, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = stone2 === 'black' ? markerColors.moveNumOnBlack
                            : stone2 === 'white'  ? markerColors.moveNumOnWhite
                            : markerColors.onEmpty;
              ctx.fillText(label, cx2, cy2);
            }
          }

          // ── ② Render markers from markerMap ──
          // Applies when: markers ON, and NOT (play mode + move numbers ON)
          // In play+move-numbers-ON mode the last-move circle would overlap numbers, so skip.
          if (showMarkersInPng && markerMap && !(showMoveNumInPng && isPlayMode && savedPlayMoves && savedPlayMoves.length > 0)) {
            const markerR = stR * 0.55;
            const lastMovePosPng = (boardContainer as any)._lastMovePos as [number, number] | null;
            for (let r = 0; r < rows; r++) {
              for (let c2 = 0; c2 < cols; c2++) {
                const marker = markerMap[r]?.[c2];
                if (!marker) continue;
                const cx2 = ix(c2), cy2 = iy(r);
                const stone2 = grid[r]?.[c2];
                const isOnEmpty = stone2 === 'none' || !stone2;
                const isLastMovePng = marker.type === 'circle' &&
                  lastMovePosPng !== null &&
                  c2 === lastMovePosPng[0] && r === lastMovePosPng[1];
                const fgColor = isLastMovePng ? markerColors.lastMove
                              : isOnEmpty      ? markerColors.onEmpty
                              : markerColors.onStone;
                ctx.strokeStyle = fgColor;
                ctx.fillStyle   = fgColor;
                ctx.lineWidth   = Math.max(1, stR * 0.12);

                if (marker.type === 'label' && marker.label) {
                  const label = marker.label;
                  const fontSize = label.length >= 3 ? Math.min(cW, cH) * 0.28
                                 : label.length === 2 ? Math.min(cW, cH) * 0.36
                                 : Math.min(cW, cH) * 0.46;
                  ctx.font = 'bold ' + Math.round(fontSize) + 'px Arial, sans-serif';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(label, cx2, cy2);
                } else if (marker.type === 'circle') {
                  ctx.beginPath();
                  ctx.arc(cx2, cy2, markerR, 0, Math.PI * 2);
                  ctx.stroke();
                } else if (marker.type === 'triangle') {
                  const h = markerR * 1.1;
                  ctx.beginPath();
                  ctx.moveTo(cx2,           cy2 - h);
                  ctx.lineTo(cx2 + h * 0.9, cy2 + h * 0.55);
                  ctx.lineTo(cx2 - h * 0.9, cy2 + h * 0.55);
                  ctx.closePath();
                  ctx.stroke();
                } else if (marker.type === 'square') {
                  const s = markerR * 0.9;
                  ctx.strokeRect(cx2 - s, cy2 - s, s * 2, s * 2);
                } else if (marker.type === 'cross' || marker.type === 'point') {
                  const d = markerR * 0.75;
                  ctx.beginPath();
                  ctx.moveTo(cx2 - d, cy2 - d); ctx.lineTo(cx2 + d, cy2 + d);
                  ctx.moveTo(cx2 + d, cy2 - d); ctx.lineTo(cx2 - d, cy2 + d);
                  ctx.stroke();
                }
              }
            }
          }

          // Save as PNG
          canvas.toBlob(async (pngBlob) => {
            if (!pngBlob) { new Notice('PNG creation failed', 3000); return; }
            const buf = await pngBlob.arrayBuffer();
            const _d = new Date();
            const ts = `${_d.getFullYear()}${String(_d.getMonth()+1).padStart(2,'0')}${String(_d.getDate()).padStart(2,'0')}T${String(_d.getHours()).padStart(2,'0')}${String(_d.getMinutes()).padStart(2,'0')}${String(_d.getSeconds()).padStart(2,'0')}`;
            const fname = 'grb-' + ts + '.png';
            try {
              await app.vault.createBinary(fname, buf);
            } catch (_) {
              const existing = app.vault.getAbstractFileByPath(fname);
              if (existing) await app.vault.modifyBinary(existing as any, buf);
            }
            new Notice('Saved: ' + fname, 3000);
          }, 'image/png');

          } catch (err) {
            new Notice('Export error: ' + String(err), 4000);
          } }
        ).open();
      });


      // ── Board rendering area ──
      const boardArea = el.createEl('div');

      let currentRerender: (() => void) | null = null;

      const redraw = () => {
        boardArea.empty();
        const sel = modeSelect.value;
        const editMode = sel === 'edit';
        const playMode = sel === 'play';
        const gbResult = renderGoBoard(app, boardArea, sgfText, editMode, ctx, 0, bgColor, playMode, (k) => plugin.t(k), chkMove.checked,
          { onStone: plugin.settings.sgfMarkerColor, onEmpty: plugin.settings.sgfMarkerEmptyColor,
            moveNumOnBlack: plugin.settings.moveNumBlackStoneColor, moveNumOnWhite: plugin.settings.moveNumWhiteStoneColor,
            lastMove: plugin.settings.lastMoveColor });
        currentRerender = gbResult.rerender;
      };

      modeSelect.addEventListener('change', () => {
        checkRow.style.display = modeSelect.value === 'play' ? 'flex' : 'none';
        redraw();
      });
      // On chkMove change: rerender only (do not call renderGoBoard again)
      chkMove.addEventListener('change', () => {
        if (modeSelect.value !== 'play' || !currentRerender) return;
        (boardArea as any)._showMoveNumbers = chkMove.checked;
        currentRerender();
      });

      // Initial render
      redraw();
    });

    // ── Register view for opening .sgf files ──
    this.registerExtensions(['sgf', 'SGF'], 'sgf-file-view');
    this.registerView(
      'sgf-file-view',
      (leaf) => new SGFFileView(leaf, this)
    );

    // ── Support for ![[file.sgf]] embeds ──
    this.registerMarkdownPostProcessor(async (el, ctx) => {
      // Process if el itself or a descendant has an internal-embed pointing to a .sgf file
      const isSGF = (e: HTMLElement) => {
        const s = e.getAttribute('src') || e.getAttribute('alt');
        return s?.toLowerCase().endsWith('.sgf') ?? false;
      };
      const sourcePath = ctx.sourcePath ?? '';
      const embeds: HTMLElement[] = [];
      if (el.classList.contains('internal-embed') && isSGF(el)) embeds.push(el);
      el.querySelectorAll<HTMLElement>('.internal-embed').forEach(e => { if (isSGF(e)) embeds.push(e); });
      for (const embed of embeds) await processSingleSGFEmbed(this, embed, sourcePath);
    });
    this.mutationObserver = setupMutationObserverForSGF(this);
    setTimeout(() => { processSGFEmbedsInDoc(this).catch(console.error); }, 2000);
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  t(key: string, ...args: any[]): string {
    const val = STRINGS[this.settings.language]?.[key] ?? STRINGS['ja'][key];
    return typeof val === 'function' ? val(...args) : (val as string);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE);
    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf!);
  }
}

// ══════════════════════════════════════════
//  Settings tab
// ══════════════════════════════════════════
class BdDetectSettingTab extends PluginSettingTab {
  plugin: BdDetectPlugin;

  constructor(app: App, plugin: BdDetectPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: this.plugin.t('settingsTitle') });

    new Setting(containerEl)
      .setName(this.plugin.t('settingLangName'))
      .setDesc(this.plugin.t('settingLangDesc'))
      .addDropdown(drop => {
        drop.addOption('ja', STRINGS.ja.langJa as string);
        drop.addOption('en', STRINGS.en.langEn as string);
        drop.setValue(this.plugin.settings.language);
        drop.onChange(async (value: string) => {
          this.plugin.settings.language = value as 'ja' | 'en';
          await this.plugin.saveSettings();
          // Immediately re-render the settings screen
          this.display();
          // Update the command palette display name
          const cmd = (this.app as any).commands?.commands?.['bd-detect:open-bd-detect'];
          if (cmd) cmd.name = this.plugin.t('cmdName');
          // Also update the view UI
          this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach(leaf => {
            if (leaf.view instanceof BdDetectView) leaf.view.rebuildUI();
          });
        });
      });



    // ── Visual settings section ──
    containerEl.createEl('h3', { text: this.plugin.t('settingVisualTitle') });

    new Setting(containerEl)
      .setName(this.plugin.t('settingBoardBgName'))
      .setDesc(this.plugin.t('settingBoardBgDesc'))
      .addColorPicker(cp => {
        cp.setValue(this.plugin.settings.boardBgColor)
          .onChange(async (value: string) => {
            this.plugin.settings.boardBgColor = value;
            await this.plugin.saveSettings();
          });
      })
      .addButton(btn => {
        btn.setButtonText(this.plugin.t('btnResetColor'))
          .onClick(async () => {
            this.plugin.settings.boardBgColor = DEFAULT_SETTINGS.boardBgColor;
            await this.plugin.saveSettings();
            this.display(); // Re-render the settings tab to reflect color change
          });
      });

    new Setting(containerEl)
      .setName(this.plugin.t('settingMarkerBlackName'))
      .setDesc(this.plugin.t('settingMarkerBlackDesc'))
      .addColorPicker(cp => {
        cp.setValue(this.rgbaToHex(this.plugin.settings.markerBlackColor))
          .onChange(async (value: string) => {
            this.plugin.settings.markerBlackColor = value;
            await this.plugin.saveSettings();
          });
      })
      .addButton(btn => {
        btn.setButtonText(this.plugin.t('btnResetColor'))
          .onClick(async () => {
            this.plugin.settings.markerBlackColor = DEFAULT_SETTINGS.markerBlackColor;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    new Setting(containerEl)
      .setName(this.plugin.t('settingMarkerWhiteName'))
      .setDesc(this.plugin.t('settingMarkerWhiteDesc'))
      .addColorPicker(cp => {
        cp.setValue(this.rgbaToHex(this.plugin.settings.markerWhiteColor))
          .onChange(async (value: string) => {
            this.plugin.settings.markerWhiteColor = value;
            await this.plugin.saveSettings();
          });
      })
      .addButton(btn => {
        btn.setButtonText(this.plugin.t('btnResetColor'))
          .onClick(async () => {
            this.plugin.settings.markerWhiteColor = DEFAULT_SETTINGS.markerWhiteColor;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    new Setting(containerEl)
      .setName(this.plugin.t('lastMoveColor'))
      .setDesc(this.plugin.t('lastMoveColor'))
      .addColorPicker(cp => {
        cp.setValue(this.plugin.settings.lastMoveColor)
          .onChange(async (value: string) => {
            this.plugin.settings.lastMoveColor = value;
            await this.plugin.saveSettings();
          });
      })
      .addButton(btn => {
        btn.setButtonText(this.plugin.t('btnResetColor'))
          .onClick(async () => {
            this.plugin.settings.lastMoveColor = DEFAULT_SETTINGS.lastMoveColor;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    new Setting(containerEl)
      .setName(this.plugin.t('sgfMarkerColor'))
      .setDesc(this.plugin.t('sgfMarkerColor'))
      .addColorPicker(cp => {
        cp.setValue(this.plugin.settings.sgfMarkerColor)
          .onChange(async (value: string) => {
            this.plugin.settings.sgfMarkerColor = value;
            await this.plugin.saveSettings();
          });
      })
      .addButton(btn => {
        btn.setButtonText(this.plugin.t('btnResetColor'))
          .onClick(async () => {
            this.plugin.settings.sgfMarkerColor = DEFAULT_SETTINGS.sgfMarkerColor;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    new Setting(containerEl)
      .setName(this.plugin.t('sgfMarkerEmptyColor'))
      .setDesc(this.plugin.t('sgfMarkerEmptyColor'))
      .addColorPicker(cp => {
        cp.setValue(this.plugin.settings.sgfMarkerEmptyColor)
          .onChange(async (value: string) => {
            this.plugin.settings.sgfMarkerEmptyColor = value;
            await this.plugin.saveSettings();
          });
      })
      .addButton(btn => {
        btn.setButtonText(this.plugin.t('btnResetColor'))
          .onClick(async () => {
            this.plugin.settings.sgfMarkerEmptyColor = DEFAULT_SETTINGS.sgfMarkerEmptyColor;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    new Setting(containerEl)
      .setName(this.plugin.t('moveNumBlackStoneColor'))
      .setDesc(this.plugin.t('moveNumBlackStoneColor'))
      .addColorPicker(cp => {
        cp.setValue(this.plugin.settings.moveNumBlackStoneColor)
          .onChange(async (value: string) => {
            this.plugin.settings.moveNumBlackStoneColor = value;
            await this.plugin.saveSettings();
          });
      })
      .addButton(btn => {
        btn.setButtonText(this.plugin.t('btnResetColor'))
          .onClick(async () => {
            this.plugin.settings.moveNumBlackStoneColor = DEFAULT_SETTINGS.moveNumBlackStoneColor;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    new Setting(containerEl)
      .setName(this.plugin.t('moveNumWhiteStoneColor'))
      .setDesc(this.plugin.t('moveNumWhiteStoneColor'))
      .addColorPicker(cp => {
        cp.setValue(this.plugin.settings.moveNumWhiteStoneColor)
          .onChange(async (value: string) => {
            this.plugin.settings.moveNumWhiteStoneColor = value;
            await this.plugin.saveSettings();
          });
      })
      .addButton(btn => {
        btn.setButtonText(this.plugin.t('btnResetColor'))
          .onClick(async () => {
            this.plugin.settings.moveNumWhiteStoneColor = DEFAULT_SETTINGS.moveNumWhiteStoneColor;
            await this.plugin.saveSettings();
            this.display();
          });
      });
  }

  /** Normalize rgba(r,g,b,a) or #rrggbb to #rrggbb format. */
  private rgbaToHex(color: string): string {
    // Already starts with #, return as-is
    if (color.startsWith('#')) return color.slice(0, 7);
    // Parse rgba(...)
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return '#00c8ff';
    const r = parseInt(m[1]).toString(16).padStart(2,'0');
    const g = parseInt(m[2]).toString(16).padStart(2,'0');
    const b = parseInt(m[3]).toString(16).padStart(2,'0');
    return `#${r}${g}${b}`;
  }
}  // end BdDetectSettingTab

// ══════════════════════════════════════════
//  ItemView class
// ══════════════════════════════════════════
class BdDetectView extends ItemView {
  private app2: App;
  private plugin: BdDetectPlugin;

  private srcCanvas!: HTMLCanvasElement;
  private srcCtx!: CanvasRenderingContext2D;
  private cropOverlay!: HTMLCanvasElement;
  private cropCtx!: CanvasRenderingContext2D;
  private croppedCanvas!: HTMLCanvasElement;
  private croppedCtx!: CanvasRenderingContext2D;

  private sourceImage: HTMLImageElement | null = null;
  private srcW = 360;
  private srcH = 360;
  private boardData: CellData[][] = [];
  private generatedBoardAnswer: GeneratedAnswer | null = null;
  private expandedBoard: ExpandedBoard | null = null;
  /** SGF body text (without code block wrapper). Used for Vault saving. */
  private lastSgfBody = '';
  /** Last data passed to renderResult. Used for marker redraw. */
  private lastRenderedData: CellData[][] = [];
  private _detectTimer: ReturnType<typeof setTimeout> | null = null;
  private genOptionsEl: HTMLElement | null = null;

  // ── Correction mode ──
  /** key: "row,col" → overridden StoneColor, or null (= no override) */
  private correctionMap: Map<string, StoneColor | null> = new Map();
  private correctionMode = false;
  /** Overlay canvas drawn on top of result canvas for correction indicators */
  private correctionOverlayCanvas: HTMLCanvasElement | null = null;
  private correctionBtn: HTMLButtonElement | null = null;

  // ── Cropped image overlay on result canvas ──
  private imageOverlayMode = false;
  private imageOverlayAlpha = 0.45;
  private imageOverlayCanvas: HTMLCanvasElement | null = null;
  private imageOverlayBtn: HTMLButtonElement | null = null;

  private startOverlayEl!: HTMLElement;
  private mainContentEl!: HTMLElement;

  constructor(leaf: WorkspaceLeaf, app: App, plugin: BdDetectPlugin) {
    super(leaf);
    this.app2 = app;
    this.plugin = plugin;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return this.plugin.t('viewTitle'); }
  getIcon() { return 'scan'; }

  t(key: string, ...args: any[]): string { return this.plugin.t(key, ...args); }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('bd-view-container');
    this.buildUI(this.contentEl);
  }

  async onClose() {}

  rebuildUI() {
    const hadImage = !!this.sourceImage;
    this.contentEl.empty();
    this.contentEl.addClass('bd-view-container');
    this.buildUI(this.contentEl);
    if (hadImage && this.sourceImage) {
      this.srcCtx.drawImage(this.sourceImage, 0, 0, this.srcCanvas.width, this.srcCanvas.height);
      this.updateMarginSliders(this.srcW, this.srcH);
      this.drawCropOverlay();
      this.startOverlayEl.style.display = 'none';
      this.mainContentEl.style.display = '';
    }
  }

  private el(id: string): HTMLElement { return this.contentEl.querySelector('#' + id) as HTMLElement; }

  private getMargin(id: string): number {
    const el = this.el('bd-' + id + 'Num') as HTMLInputElement | null;
    return Math.max(0, parseInt(el ? el.value : '0') || 0);
  }

  // ────────────────────────────────────
  //  UI construction
  // ────────────────────────────────────
  private buildUI(root: HTMLElement) {
    root.createEl('div', { cls: 'bd-title', text: this.t('mainTitle') });
    this.startOverlayEl = root.createEl('div', { cls: 'bd-start-overlay' });
    this.buildStartOverlay(this.startOverlayEl, root);
    this.mainContentEl = root.createEl('div');
    this.mainContentEl.style.display = 'none';
    this.buildMainContent(this.mainContentEl);
    this.srcW = this.srcCanvas.width;
    this.srcH = this.srcCanvas.height;
    this.updateMarginSliders(this.srcW, this.srcH);
    this.drawCropOverlay();
  }

  private buildStartOverlay(container: HTMLElement, rootEl: HTMLElement) {
    const box = container.createEl('div', { cls: 'bd-start-box' });
    box.createEl('h2', { text: this.t('startTitle') });
    const row = box.createEl('div', { cls: 'bd-start-btn-row' });

    const fileInput = rootEl.createEl('input') as HTMLInputElement;
    fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none';
    fileInput.addEventListener('change', (e: Event) => {
      const files = (e.target as HTMLInputElement).files;
      if (files?.[0]) { this.mainContentEl.style.display = ''; this.loadImageFile(files[0]); }
    });

    const btnLoad = row.createEl('button', { cls: 'bd-btn bd-btn-primary', text: this.t('btnLoad') });
    btnLoad.addEventListener('click', () => {
      this.startOverlayEl.style.display = 'none';
      this.mainContentEl.style.display = '';
      fileInput.click();
    });

    const btnGen = row.createEl('button', { cls: 'bd-btn', text: this.t('btnGen') });
    const genOptions = box.createEl('div');
    genOptions.style.cssText = 'display:none;margin-top:16px;border-top:1px solid var(--background-modifier-border);padding-top:14px';
    this.genOptionsEl = genOptions;
    btnGen.addEventListener('click', () => { genOptions.style.display = 'block'; });

    const r1 = genOptions.createEl('div', { cls: 'bd-field-row' });
    r1.createEl('label', { text: this.t('genColsLabel') });
    const genCols = r1.createEl('input') as HTMLInputElement;
    genCols.type = 'number'; genCols.value = '15'; genCols.min = '1'; genCols.max = '19';
    r1.createEl('span', { text: this.t('intersections'), attr: { style: 'font-size:0.75rem;color:var(--text-faint)' } });

    const r2 = genOptions.createEl('div', { cls: 'bd-field-row' });
    r2.createEl('label', { text: this.t('genRowsLabel') });
    const genRows = r2.createEl('input') as HTMLInputElement;
    genRows.type = 'number'; genRows.value = '15'; genRows.min = '1'; genRows.max = '19';
    r2.createEl('span', { text: this.t('intersections'), attr: { style: 'font-size:0.75rem;color:var(--text-faint)' } });

    // ── Stone count input row ──
    const r3 = genOptions.createEl('div', { cls: 'bd-field-row' });
    r3.createEl('label', { text: this.t('genStoneCount') });
    const genStoneInput = r3.createEl('input') as HTMLInputElement;
    genStoneInput.type = 'number'; genStoneInput.min = '0';
    const genStoneTotalEl = r3.createEl('span');
    genStoneTotalEl.style.cssText = 'font-size:0.75rem;color:var(--text-faint);margin-left:6px;';

    const updateStoneTotal = () => {
      const c = parseInt(genCols.value) || 0;
      const r = parseInt(genRows.value) || 0;
      const total = c * r;
      genStoneTotalEl.textContent = `/ ${total}`;
      if (!genStoneInput.value) {
        genStoneInput.value = String(Math.round(total * 0.4));
      }
    };
    genCols.addEventListener('input', updateStoneTotal);
    genRows.addEventListener('input', updateStoneTotal);
    updateStoneTotal();

    const btnGenGo = genOptions.createEl('button', { cls: 'bd-btn bd-btn-primary', text: this.t('btnGenGo') });
    btnGenGo.style.marginTop = '10px';
    btnGenGo.addEventListener('click', () => {
      const c = parseInt(genCols.value) || 0, r = parseInt(genRows.value) || 0;
      if (c > 19 || r > 19) { new Notice(this.t('errMaxSize')); return; }
      if (c < 1 || r < 1)   { new Notice(this.t('errMinSize')); return; }
      const total = c * r;
      const stoneCount = Math.max(0, Math.min(total, parseInt(genStoneInput.value) || 0));
      const BASE = 360;
      if (c >= r) { this.srcCanvas.width = BASE; this.srcCanvas.height = Math.round(BASE * r / c); }
      else        { this.srcCanvas.height = BASE; this.srcCanvas.width = Math.round(BASE * c / r); }
      this.cropOverlay.width = this.srcCanvas.width; this.cropOverlay.height = this.srcCanvas.height;
      this.srcW = this.srcCanvas.width; this.srcH = this.srcCanvas.height;
      const setV = (id: string, v: number) => { const el = this.el(id) as HTMLInputElement | null; if (el) el.value = String(v); };
      setV('bd-boardCols', c); setV('bd-boardRows', r);
      setV('bd-outCols', c);   setV('bd-outRows', r);
      this.startOverlayEl.style.display = 'none';
      this.mainContentEl.style.display = '';
      this.drawSampleBoard(c, r, stoneCount);
      this.updateMarginSliders(this.srcW, this.srcH);
      this.drawCropOverlay();
    });
  }

  private buildMainContent(container: HTMLElement) {
    container.createEl('div', { cls: 'bd-canvas-label', text: this.t('labelInput') });
    const wrap = container.createEl('div', { cls: 'bd-canvas-wrap' });

    this.srcCanvas = wrap.createEl('canvas') as HTMLCanvasElement;
    this.srcCanvas.width = 360; this.srcCanvas.height = 360;
    this.srcCtx = this.srcCanvas.getContext('2d')!;

    this.cropOverlay = wrap.createEl('canvas') as HTMLCanvasElement;
    this.cropOverlay.width = 360; this.cropOverlay.height = 360;
    this.cropOverlay.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none';
    this.cropCtx = this.cropOverlay.getContext('2d')!;

    const dropZone = container.createEl('div', { cls: 'bd-drop-zone', text: this.t('dropZoneText') });
    const dropInput = container.createEl('input') as HTMLInputElement;
    dropInput.type = 'file'; dropInput.accept = 'image/*'; dropInput.style.display = 'none';
    dropZone.addEventListener('click', () => dropInput.click());
    dropInput.addEventListener('change', (e: Event) => { const f = (e.target as HTMLInputElement).files; if (f?.[0]) this.loadImageFile(f[0]); });
    dropZone.addEventListener('dragover', (e: DragEvent) => { e.preventDefault(); dropZone.classList.add('over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
    dropZone.addEventListener('drop', (e: DragEvent) => { e.preventDefault(); dropZone.classList.remove('over'); if (e.dataTransfer?.files[0]) this.loadImageFile(e.dataTransfer.files[0]); });

    const btnReset = container.createEl('button', { cls: 'bd-btn', text: this.t('btnReset') });
    btnReset.style.marginTop = '6px';
    btnReset.style.border = '2px solid var(--color-red)';
    btnReset.addEventListener('click', () => this.onResetConfirm());

    const sizeCard = container.createEl('div', { cls: 'bd-card' });
    sizeCard.createEl('h2', { text: this.t('cardBoardSize') });
    this.addNumRow(sizeCard, this.t('boardCols'), 'bd-boardCols', 15, 1, 19, this.t('intersections'));
    this.addNumRow(sizeCard, this.t('boardRows'), 'bd-boardRows', 15, 1, 19, this.t('intersections'));

    this.buildMarginCard(container);

    const paramCard = container.createEl('div', { cls: 'bd-card' });
    paramCard.createEl('h2', { text: this.t('cardParam') });
    this.addSliderRow(paramCard, this.t('paramBlack'), 'bd-blackThresh', 30,  150, 80,  'bd-blackThreshVal');
    this.addSliderRow(paramCard, this.t('paramWhite'), 'bd-whiteThresh', 100, 240, 170, 'bd-whiteThreshVal');
    this.addSliderRow(paramCard, this.t('paramRing'),  'bd-ringThresh',  5,   90,  40,  'bd-ringThreshVal', '%');
    paramCard.createEl('div', { text: this.t('paramHint'), attr: { style: 'font-size:0.68rem;color:var(--text-faint);margin-top:4px;line-height:1.6' } });

    // ── Marker size ──
    const markerSizeCard = container.createEl('div', { cls: 'bd-card' });
    markerSizeCard.style.marginTop = '10px';
    const msRow = markerSizeCard.createEl('div', { cls: 'bd-field-row' });
    msRow.createEl('label', { text: this.t('labelMarkerSize') });
    const msSlider = msRow.createEl('input') as HTMLInputElement;
    msSlider.type = 'range'; msSlider.min = '5'; msSlider.max = '100'; msSlider.step = '1';
    msSlider.value = String(this.plugin.settings.markerSizeRatio);
    msSlider.style.flex = '1';
    msSlider.classList.add('bd-marker-slider');
    const msNum = msRow.createEl('input') as HTMLInputElement;
    msNum.type = 'number'; msNum.min = '5'; msNum.max = '100';
    msNum.value = String(this.plugin.settings.markerSizeRatio);
    msNum.style.width = '52px';
    msRow.createEl('span', { text: this.t('markerSizeUnit'), attr: { style: 'font-size:0.7rem;color:var(--text-faint)' } });
    // Two-way sync
    msSlider.addEventListener('input', async () => {
      const n = parseInt(msSlider.value);
      msNum.value = String(n);
      this.plugin.settings.markerSizeRatio = n;
      await this.plugin.saveSettings();
      this.redrawMarkers();
    });
    msNum.addEventListener('input', async () => {
      const n = Math.min(100, Math.max(5, parseInt(msNum.value) || 5));
      msNum.value = String(n);
      msSlider.value = String(n);
      this.plugin.settings.markerSizeRatio = n;
      await this.plugin.saveSettings();
      this.redrawMarkers();
    });

    // ── Detect button + Correction button row, placed just above the cropped canvas ──
    const detectBtnRow = container.createEl('div');
    detectBtnRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap;';
    const btnDetect = detectBtnRow.createEl('button', { cls: 'bd-btn bd-btn-primary', text: this.t('btnDetect') });
    btnDetect.style.margin = '0';
    btnDetect.addEventListener('click', () => this.onDetect());
    const btnCorrection = detectBtnRow.createEl('button', { cls: 'bd-btn', text: this.t('btnCorrection') });
    btnCorrection.id = 'bd-correctionBtn';
    btnCorrection.style.margin = '0';
    btnCorrection.title = this.t('btnCorrectionHint');
    this.correctionBtn = btnCorrection;
    btnCorrection.addEventListener('click', () => this.onToggleCorrectionMode());

    // ── Image overlay button + opacity slider (below correction button) ──
    const imgOverlayRow = container.createEl('div');
    imgOverlayRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap;';
    const btnImgOverlay = imgOverlayRow.createEl('button', { cls: 'bd-btn', text: this.t('btnImageOverlay') });
    btnImgOverlay.style.cssText = 'margin:0;flex-shrink:0;';
    btnImgOverlay.title = this.t('btnImageOverlayHint');
    this.imageOverlayBtn = btnImgOverlay;
    btnImgOverlay.addEventListener('click', () => this.onToggleImageOverlay());
    const overlaySlider = imgOverlayRow.createEl('input') as HTMLInputElement;
    overlaySlider.type = 'range'; overlaySlider.min = '10'; overlaySlider.max = '90'; overlaySlider.step = '5';
    overlaySlider.value = String(Math.round(this.imageOverlayAlpha * 100));
    overlaySlider.style.cssText = 'flex:1;min-width:80px;';
    overlaySlider.title = this.t('labelOverlayOpacity');
    const overlayValLabel = imgOverlayRow.createEl('span');
    overlayValLabel.style.cssText = 'font-size:0.72rem;color:var(--text-faint);min-width:2.5em;text-align:right;';
    overlayValLabel.textContent = overlaySlider.value + '%';
    overlaySlider.addEventListener('input', () => {
      this.imageOverlayAlpha = parseInt(overlaySlider.value) / 100;
      overlayValLabel.textContent = overlaySlider.value + '%';
      this.drawImageOverlay();
    });

    container.createEl('div', { cls: 'bd-canvas-label', text: this.t('labelCropped'), attr: { style: 'margin-top:10px' } });
    const croppedCanvasWrap = container.createEl('div'); croppedCanvasWrap.id = 'bd-croppedCanvasWrap';
    croppedCanvasWrap.style.cssText = 'position:relative;display:inline-block;';
    this.croppedCanvas = croppedCanvasWrap.createEl('canvas') as HTMLCanvasElement;
    this.croppedCanvas.width = 300; this.croppedCanvas.height = 300;
    this.croppedCanvas.style.border = '1px solid var(--background-modifier-border)';
    this.croppedCtx = this.croppedCanvas.getContext('2d')!;
    // Image overlay canvas on top of croppedCanvas
    const imgOv = croppedCanvasWrap.createEl('canvas') as HTMLCanvasElement;
    imgOv.className = 'bd-image-overlay';
    imgOv.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;display:none;';
    this.imageOverlayCanvas = imgOv;

    const resultCard = container.createEl('div', { cls: 'bd-card' });
    resultCard.createEl('h2', { text: this.t('cardResult') });
    const resultCanvasWrap = resultCard.createEl('div'); resultCanvasWrap.id = 'bd-resultCanvasWrap';
    resultCanvasWrap.style.cssText = 'position:relative;display:inline-block;';
    const rc = resultCanvasWrap.createEl('canvas') as HTMLCanvasElement; rc.id = 'bd-resultCanvas';
    rc.style.cssText = 'display:none;border:1px solid var(--background-modifier-border)';

    const statsCard = container.createEl('div', { cls: 'bd-card' });
    statsCard.createEl('h2', { text: this.t('cardStats') });
    const statsEl = statsCard.createEl('div', { text: this.t('statsInitial') }); statsEl.id = 'bd-statsText';

    this.buildExpandCard(container);
    this.buildSgfCard(container);
  }

  private addNumRow(parent: HTMLElement, label: string, id: string, value: number, min: number, max: number, unitText?: string) {
    const row = parent.createEl('div', { cls: 'bd-field-row' });
    row.createEl('label', { text: label });
    const inp = row.createEl('input') as HTMLInputElement;
    inp.type = 'number'; inp.id = id; inp.value = String(value); inp.min = String(min); inp.max = String(max);
    if (unitText) row.createEl('span', { text: unitText, attr: { style: 'font-size:0.75rem;color:var(--text-faint)' } });
  }

  private addSliderRow(parent: HTMLElement, label: string, sliderId: string, min: number, max: number, value: number, valId: string, suffix?: string) {
    const row = parent.createEl('div', { cls: 'bd-field-row' });
    row.createEl('label', { text: label });
    const sl = row.createEl('input') as HTMLInputElement;
    sl.type = 'range'; sl.id = sliderId; sl.min = String(min); sl.max = String(max); sl.value = String(value); sl.style.flex = '1';
    const vEl = row.createEl('span', { cls: 'bd-val', text: String(value) }); vEl.id = valId;
    if (suffix) row.createEl('span', { text: suffix, attr: { style: 'font-size:0.68rem;color:var(--text-faint)' } });
    sl.addEventListener('input', () => {
      vEl.textContent = sl.value;
      // Auto-detect on slider change (300 ms debounce)
      if (this._detectTimer) clearTimeout(this._detectTimer);
      this._detectTimer = setTimeout(() => { this.onDetect(); }, 300);
    });
  }

  private buildMarginCard(container: HTMLElement) {
    const card = container.createEl('div', { cls: 'bd-card' });
    card.createEl('h2', { text: this.t('cardMargin') });
    const info = card.createEl('div', { cls: 'bd-img-info' });
    info.innerHTML = this.t('imgSizePrefix') + '<span id="bd-imgSizeW">—</span>' + this.t('imgSizeSep') + '<span id="bd-imgSizeH">—</span>' + this.t('imgSizeSuffix');

    const diag = card.createEl('div', { cls: 'bd-diagram' });
    const inner = diag.createEl('div', { cls: 'bd-diagram-inner' }); inner.id = 'bd-diagramInner';
    ([
      [this.t('diagTop'),    'top:2px;left:50%;transform:translateX(-50%)'],
      [this.t('diagBottom'), 'bottom:2px;left:50%;transform:translateX(-50%)'],
      [this.t('diagLeft'),   'left:2px;top:50%;transform:translateY(-50%)'],
      [this.t('diagRight'),  'right:2px;top:50%;transform:translateY(-50%)'],
    ] as [string, string][]).forEach(([text, style]) => { const el = diag.createEl('div', { cls: 'bd-diagram-label', text }); el.setAttribute('style', style); });

    ([
      ['marginTop',    this.t('marginTop')],
      ['marginBottom', this.t('marginBottom')],
      ['marginLeft',   this.t('marginLeft')],
      ['marginRight',  this.t('marginRight')],
    ] as [string, string][]).forEach(([id, label]) => {
      const row = card.createEl('div', { cls: 'bd-field-row' });
      row.createEl('label', { text: label });
      const sl = row.createEl('input') as HTMLInputElement;
      sl.type = 'range'; sl.id = 'bd-' + id; sl.min = '0'; sl.max = '200'; sl.value = '0'; sl.style.flex = '1';
      const num = row.createEl('input') as HTMLInputElement;
      num.type = 'number'; num.id = 'bd-' + id + 'Num'; num.min = '0'; num.max = '200'; num.value = '0'; num.style.width = '52px';
      row.createEl('span', { text: this.t('pxUnit'), attr: { style: 'font-size:0.7rem;color:var(--text-faint)' } });
      sl.addEventListener('input', () => { num.value = sl.value; this.drawCropOverlay(); });
      num.addEventListener('input', () => { const v = Math.max(0, parseInt(num.value)||0); num.value = String(v); sl.value = String(Math.min(v, parseInt(sl.max))); this.drawCropOverlay(); });
    });
  }

  private buildExpandCard(container: HTMLElement) {
    const card = container.createEl('div', { cls: 'bd-card' });
    card.createEl('h2', { text: this.t('cardExpand') });
    card.createEl('div', { text: this.t('expandDesc'), attr: { style: 'font-size:0.68rem;color:var(--text-faint);margin-bottom:8px;line-height:1.6' } });
    this.addNumRow(card, this.t('expandOutCols'), 'bd-outCols',  19, 1, 19, this.t('expandColUnit'));
    this.addNumRow(card, this.t('expandOutRows'), 'bd-outRows',  19, 1, 19, this.t('expandRowUnit'));
    this.addNumRow(card, this.t('expandOffX'),    'bd-offsetX',   0, 0, 18, this.t('expandColUnit'));
    this.addNumRow(card, this.t('expandOffY'),    'bd-offsetY',   0, 0, 18, this.t('expandRowUnit'));
    const btn = card.createEl('button', { cls: 'bd-btn bd-btn-primary', text: this.t('btnExpand') }); btn.style.marginTop = '8px';
    btn.addEventListener('click', () => this.onExpand());
    const errEl = card.createEl('div', { cls: 'bd-error' }); errEl.id = 'bd-expandError'; errEl.style.display = 'none';

    const erc = container.createEl('div', { cls: 'bd-card' }); erc.id = 'bd-expandResultCard'; erc.style.display = 'none';
    erc.createEl('h2', { text: this.t('cardExpandResult') });
    const es = erc.createEl('div'); es.id = 'bd-expandStats';
    es.style.cssText = 'font-size:0.72rem;color:var(--text-muted);line-height:1.8;margin-bottom:8px';
    const ec = erc.createEl('canvas') as HTMLCanvasElement; ec.id = 'bd-expandCanvas';
    ec.style.border = '1px solid var(--background-modifier-border)';
  }

  private buildSgfCard(container: HTMLElement) {
    const card = container.createEl('div', { cls: 'bd-card' }); card.id = 'bd-sgfCard'; card.style.display = 'none';
    card.createEl('h2', { text: this.t('cardSGF') });

    const plRow = card.createEl('div', { cls: 'bd-field-row' });
    plRow.createEl('label', { text: this.t('sgfPLLabel') });
    const plSel = plRow.createEl('select') as HTMLSelectElement;
    plSel.id = 'bd-sgfPL';
    (() => { const o = plSel.createEl('option') as HTMLOptionElement; o.value = ''; o.text = '—'; })();
    (() => { const o = plSel.createEl('option') as HTMLOptionElement; o.value = 'B'; o.text = this.t('sgfPLBlack'); })();
    (() => { const o = plSel.createEl('option') as HTMLOptionElement; o.value = 'W'; o.text = this.t('sgfPLWhite'); })();

    const gmRow = card.createEl('div', { cls: 'bd-field-row' });
    gmRow.createEl('label', { text: this.t('sgfGMLabel') });
    const gmSel = gmRow.createEl('select') as HTMLSelectElement; gmSel.id = 'bd-sgfGM';
    const optGo  = gmSel.createEl('option', { text: this.t('sgfGMGo') }) as HTMLOptionElement;   optGo.value  = '1';
    const optRj  = gmSel.createEl('option', { text: this.t('sgfGMRenju') }) as HTMLOptionElement; optRj.value  = '4';

    const ruRow = card.createEl('div', { cls: 'bd-field-row' });
    ruRow.createEl('label', { text: this.t('sgfRULabel') });
    const ruInp = ruRow.createEl('input') as HTMLInputElement;
    ruInp.type = 'text'; ruInp.id = 'bd-sgfRU';
    ruInp.placeholder = this.t('sgfRUPlaceholder');  // Empty value, placeholder only

    const btnMake = card.createEl('button', { cls: 'bd-btn bd-btn-primary', text: this.t('btnMakeSGF') });
    btnMake.addEventListener('click', () => this.onMakeSGF());

    const od = card.createEl('div'); od.id = 'bd-sgfOutput'; od.style.display = 'none';
    const cr = od.createEl('div', { attr: { style: 'display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap' } });
    cr.createEl('span', { text: this.t('sgfTextLabel'), attr: { style: 'font-size:0.7rem;color:var(--text-faint)' } });

    const btnCopy = cr.createEl('button', { cls: 'bd-btn', text: this.t('btnCopy') });
    btnCopy.style.cssText = 'width:auto;padding:4px 12px;font-size:0.72rem;margin-top:0';
    btnCopy.addEventListener('click', () => this.onCopySGF());

    const btnSave = cr.createEl('button', { cls: 'bd-btn', text: this.t('btnSaveVault') });
    btnSave.style.cssText = 'width:auto;padding:4px 12px;font-size:0.72rem;margin-top:0';
    btnSave.addEventListener('click', () => this.onSaveSGF());

    const fb = cr.createEl('span', { cls: 'bd-copy-feedback' }); fb.id = 'bd-copyFeedback'; fb.style.display = 'none';

    const ta = od.createEl('textarea') as HTMLTextAreaElement; ta.id = 'bd-sgfText'; ta.readOnly = true;
    ta.style.cssText = 'width:100%;min-height:100px;background:var(--background-primary);border:1px solid var(--background-modifier-border);color:var(--text-normal);font-family:monospace;font-size:0.72rem;padding:8px;border-radius:3px;resize:vertical;line-height:1.5';
  }

  // ══════════════════════════════════════════
  //  Sample board generation
  // ══════════════════════════════════════════
  private drawSampleBoard(bsCols: number, bsRows: number, stoneCount?: number) {
    const W = this.srcCanvas.width, H = this.srcCanvas.height;
    const cW = W / bsCols, cH = H / bsRows;
    const ix = (c: number) => cW/2 + c*cW, iy = (r: number) => cH/2 + r*cH;
    const s = this.srcCtx;
    s.fillStyle = this.plugin.settings.boardBgColor; s.fillRect(0, 0, W, H);
    for (let i = 0; i < H; i += 5) { s.strokeStyle = `rgba(0,0,0,${0.03+0.01*Math.sin(i)})`; s.lineWidth=1; s.beginPath(); s.moveTo(0,i); s.lineTo(W,i+2); s.stroke(); }
    s.strokeStyle = '#5a3800'; s.lineWidth = 0.8;
    for (let i = 0; i < bsCols; i++) { s.beginPath(); s.moveTo(ix(i),iy(0)); s.lineTo(ix(i),iy(bsRows-1)); s.stroke(); }
    for (let i = 0; i < bsRows; i++) { s.beginPath(); s.moveTo(ix(0),iy(i)); s.lineTo(ix(bsCols-1),iy(i)); s.stroke(); }
    if (bsCols >= 9 && bsRows >= 9) {
      const sC=Math.floor(bsCols/4), sR=Math.floor(bsRows/4);
      [sR,Math.floor(bsRows/2),bsRows-1-sR].forEach(r=>{[sC,Math.floor(bsCols/2),bsCols-1-sC].forEach(c=>{s.beginPath();s.arc(ix(c),iy(r),2.5,0,Math.PI*2);s.fillStyle='#5a3800';s.fill();});});
    }
    const r = Math.min(cW, cH) * 0.44;
    const ans = new Map<string, StoneColor>();
    for (let row=0;row<bsRows;row++) for (let col=0;col<bsCols;col++) ans.set(`${row},${col}`,'none');
    const place = (row: number, col: number, color: StoneColor) => {
      const cx=ix(col), cy=iy(row);
      s.beginPath(); s.arc(cx,cy,r,0,Math.PI*2);
      if (color==='black'){const g=s.createRadialGradient(cx-r*.3,cy-r*.3,r*.1,cx,cy,r);g.addColorStop(0,'#555');g.addColorStop(1,'#111');s.fillStyle=g;}
      else               {const g=s.createRadialGradient(cx-r*.3,cy-r*.3,r*.1,cx,cy,r);g.addColorStop(0,'#fff');g.addColorStop(1,'#ccc');s.fillStyle=g;}
      s.fill(); s.strokeStyle=color==='black'?'#000':'#444'; s.lineWidth=1.2; s.stroke();
      ans.set(`${row},${col}`,color);
    };
    // Shuffle all intersections and place stoneCount stones
    const total = bsCols * bsRows;
    const n = (stoneCount !== undefined)
      ? Math.max(0, Math.min(total, stoneCount))
      : Math.round(total * 0.4);   // Default to 40% when not specified
    const positions: [number, number][] = [];
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
    s.strokeStyle='rgba(80,160,255,0.4)';s.lineWidth=1;s.setLineDash([3,4]);s.strokeRect(0,0,W,H);s.setLineDash([]);
    this.generatedBoardAnswer = { cols: bsCols, rows: bsRows, stones: ans };
  }

  // ══════════════════════════════════════════
  //  Crop overlay
  // ══════════════════════════════════════════
  private drawCropOverlay() {
    const W=this.cropOverlay.width, H=this.cropOverlay.height;
    this.cropCtx.clearRect(0,0,W,H);
    const mt=this.getMargin('marginTop'),mb=this.getMargin('marginBottom');
    const ml=this.getMargin('marginLeft'),mr=this.getMargin('marginRight');
    const sx=W/this.srcW, sy=H/this.srcH;
    const tx=ml*sx, ty=mt*sy, tw=(this.srcW-ml-mr)*sx, th=(this.srcH-mt-mb)*sy;
    this.cropCtx.fillStyle='rgba(0,0,0,0.45)'; this.cropCtx.fillRect(0,0,W,H);
    this.cropCtx.clearRect(tx,ty,tw,th);
    this.cropCtx.strokeStyle='#ffcc44'; this.cropCtx.lineWidth=2; this.cropCtx.setLineDash([6,3]);
    this.cropCtx.strokeRect(tx,ty,tw,th); this.cropCtx.setLineDash([]);
    this.updateDiagram(mt,mb,ml,mr);
  }

  private updateDiagram(t: number, b: number, l: number, r: number) {
    const scale=60/Math.max(this.srcW,this.srcH);
    const di=this.el('bd-diagramInner') as HTMLElement|null; if(!di) return;
    const L=Math.min(l*scale,28),T=Math.min(t*scale,28),R=Math.min(r*scale,28),B=Math.min(b*scale,28);
    di.style.left=(8+L)+'px'; di.style.top=(8+T)+'px';
    di.style.width=(64-L-R)+'px'; di.style.height=(64-T-B)+'px';
  }

  // ══════════════════════════════════════════
  //  Step 1: Crop
  // ══════════════════════════════════════════
  private cropImage(): {outW:number;outH:number;cw:number;ch:number}|null {
    const mt=this.getMargin('marginTop'),mb=this.getMargin('marginBottom');
    const ml=this.getMargin('marginLeft'),mr=this.getMargin('marginRight');
    const cw=this.srcW-ml-mr, ch=this.srcH-mt-mb;
    if (cw<=0||ch<=0){new Notice(this.t('noticeMarginTooLarge'));return null;}
    const BASE=300; let outW:number, outH:number;
    if(cw>=ch){outW=BASE;outH=Math.round(BASE*ch/cw);}
    else      {outH=BASE;outW=Math.round(BASE*cw/ch);}
    this.croppedCanvas.width=outW; this.croppedCanvas.height=outH;
    this.croppedCtx.clearRect(0,0,outW,outH);
    if(this.sourceImage) this.croppedCtx.drawImage(this.sourceImage,ml,mt,cw,ch,0,0,outW,outH);
    else                 this.croppedCtx.drawImage(this.srcCanvas,  ml,mt,cw,ch,0,0,outW,outH);
    return {outW,outH,cw,ch};
  }

  // ══════════════════════════════════════════
  //  Step 2: Stone detection
  // ══════════════════════════════════════════
  private detectStones(): CellData[][] {
    const bsCols=parseInt((this.el('bd-boardCols') as HTMLInputElement).value)||15;
    const bsRows=parseInt((this.el('bd-boardRows') as HTMLInputElement).value)||15;
    const blackTh=parseInt((this.el('bd-blackThresh') as HTMLInputElement).value);
    const whiteTh=parseInt((this.el('bd-whiteThresh') as HTMLInputElement).value);
    const ringTh =parseInt((this.el('bd-ringThresh')  as HTMLInputElement).value)/100;
    const OW=this.croppedCanvas.width, OH=this.croppedCanvas.height;
    const cX=OW/bsCols, cY=OH/bsRows;
    const sR=Math.min(cX,cY)*0.44;
    const px=this.croppedCtx.getImageData(0,0,OW,OH).data;
    const lum=(x:number,y:number):number|null=>{if(x<0||x>=OW||y<0||y>=OH)return null;const i=(y*OW+x)*4;return 0.299*px[i]+0.587*px[i+1]+0.114*px[i+2];};
    const avgL=(cx:number,cy:number,r:number):number=>{let s=0,n=0;const ri=Math.ceil(r);for(let dy=-ri;dy<=ri;dy++)for(let dx=-ri;dx<=ri;dx++){if(dx*dx+dy*dy>r*r)continue;const v=lum(Math.round(cx+dx),Math.round(cy+dy));if(v!==null){s+=v;n++;}}return n>0?s/n:128;};
    const N=24;
    const cScore=(cx:number,cy:number,r:number):number=>{const dt=blackTh*1.8;let h=0;for(let i=0;i<N;i++){const a=2*Math.PI*i/N;for(const rr of[r*.85,r,r*1.15]){const v=lum(Math.round(cx+rr*Math.cos(a)),Math.round(cy+rr*Math.sin(a)));if(v!==null&&v<dt){h++;break;}}}return h/N;};
    const res:CellData[][]=[];
    for(let row=0;row<bsRows;row++){res[row]=[];for(let col=0;col<bsCols;col++){
      const cx=cX/2+col*cX,cy=cY/2+row*cY;
      const l=avgL(cx,cy,sR*0.6);let stone:StoneColor,score=0;
      if(l<blackTh){stone='black';}else if(l>whiteTh){score=cScore(cx,cy,sR);stone=score>=ringTh?'white':'none';}else{stone='none';}
      res[row][col]={stone,lum:l.toFixed(1),ringMin:(score*100).toFixed(0),row,col,cx,cy};
    }}
    return res;
  }

  // ══════════════════════════════════════════
  //  Step 3: Render result
  // ══════════════════════════════════════════
  private renderResult(data: CellData[][]) {
    this.lastRenderedData = data;  // Stored for marker redraw
    const bsRows=data.length, bsCols=(data[0]||[]).length;
    let bl=0,wh=0,no=0;
    data.forEach(r=>r.forEach(c=>{if(c.stone==='black')bl++;else if(c.stone==='white')wh++;else no++;}));
    const unit=this.t('statsUnit')?(' '+this.t('statsUnit')):'';
    const st=this.el('bd-statsText');
    if(st) st.innerHTML=
      `<b>${this.t('statsBlack')}</b>: ${bl}${unit} &nbsp; <b>${this.t('statsWhite')}</b>: ${wh}${unit} &nbsp; <b>${this.t('statsNone')}</b>: ${no}${unit}<br>`+
      `${this.t('statsTotal')}: ${bsCols} × ${bsRows} = ${bsCols*bsRows}`;

    // Draw markers: use settings values
    // Stone radius = 0.44 × cell size. markerSizeRatio is a % relative to stone radius.
    const OW=this.croppedCanvas.width, OH=this.croppedCanvas.height;
    const cellW=OW/bsCols, cellH=OH/bsRows;
    const stoneR=Math.min(cellW,cellH)*0.44;
    const markerR=stoneR * (this.plugin.settings.markerSizeRatio/100);
    const blackColor=this.plugin.settings.markerBlackColor;
    const whiteColor=this.plugin.settings.markerWhiteColor;
    data.forEach(rowArr=>rowArr.forEach(c=>{
      if(c.stone==='none')return;
      this.croppedCtx.beginPath();this.croppedCtx.arc(c.cx,c.cy,markerR,0,Math.PI*2);
      this.croppedCtx.fillStyle=c.stone==='black'?blackColor:whiteColor;
      this.croppedCtx.fill();
    }));

    const rc=this.el('bd-resultCanvas') as HTMLCanvasElement|null;
    if(rc){this.drawBoardCanvas(rc,bsCols,bsRows,data.map(r=>r.map(c=>c.stone)));rc.style.display='block';}
    this.setupCorrectionOverlay(bsCols, bsRows);
    this.drawImageOverlay();
    this.verifySample(data);
  }

  /** Redraw markers only (used when marker size changes). */
  private redrawMarkers() {
    const data = this.lastRenderedData;
    if (!data || data.length === 0) return;
    const bsCols = (data[0]||[]).length;
    const bsRows = data.length;

    // Restore the cropped image to its original state (without markers)
    this.croppedCtx.clearRect(0, 0, this.croppedCanvas.width, this.croppedCanvas.height);
    if (this.sourceImage) {
      const mt=this.getMargin('marginTop'),mb=this.getMargin('marginBottom');
      const ml=this.getMargin('marginLeft'),mr=this.getMargin('marginRight');
      const cw=this.srcW-ml-mr, ch=this.srcH-mt-mb;
      this.croppedCtx.drawImage(this.sourceImage,ml,mt,cw,ch,0,0,this.croppedCanvas.width,this.croppedCanvas.height);
    } else {
      // For sample boards, redraw from srcCanvas
      const mt=this.getMargin('marginTop'),mb=this.getMargin('marginBottom');
      const ml=this.getMargin('marginLeft'),mr=this.getMargin('marginRight');
      const cw=this.srcW-ml-mr, ch=this.srcH-mt-mb;
      this.croppedCtx.drawImage(this.srcCanvas,ml,mt,cw,ch,0,0,this.croppedCanvas.width,this.croppedCanvas.height);
    }

    // Redraw markers at the new size
    const OW=this.croppedCanvas.width, OH=this.croppedCanvas.height;
    const cellW=OW/bsCols, cellH=OH/bsRows;
    const stoneR=Math.min(cellW,cellH)*0.44;
    const markerR=stoneR*(this.plugin.settings.markerSizeRatio/100);
    const blackColor=this.plugin.settings.markerBlackColor;
    const whiteColor=this.plugin.settings.markerWhiteColor;
    data.forEach(rowArr=>rowArr.forEach(c=>{
      if(c.stone==='none')return;
      this.croppedCtx.beginPath();this.croppedCtx.arc(c.cx,c.cy,markerR,0,Math.PI*2);
      this.croppedCtx.fillStyle=c.stone==='black'?blackColor:whiteColor;
      this.croppedCtx.fill();
    }));
  }

  // ══════════════════════════════════════════
  //  Correction mode
  // ══════════════════════════════════════════

  /** Return the effective stone color, applying any correction override. */
  private getEffectiveStone(cell: CellData): StoneColor {
    const key = `${cell.row},${cell.col}`;
    const override = this.correctionMap.get(key);
    // override === undefined: no entry (use auto-detected)
    // override === null: explicitly set to no-override (use auto-detected)
    if (override === undefined || override === null) return cell.stone;
    return override;
  }

  /** Set up (or refresh) the transparent overlay canvas on top of the cropped (detection) canvas. */
  private setupCorrectionOverlay(cols: number, rows: number) {
    const wrap = this.el('bd-croppedCanvasWrap');
    if (!wrap) return;
    // Remove old overlay
    const old = wrap.querySelector('.bd-correction-overlay') as HTMLCanvasElement | null;
    if (old) old.remove();

    const ov = wrap.createEl('canvas') as HTMLCanvasElement;
    ov.className = 'bd-correction-overlay';
    ov.width  = this.croppedCanvas.width;
    ov.height = this.croppedCanvas.height;
    ov.style.cssText =
      `position:absolute;top:0;left:0;width:${this.croppedCanvas.width}px;height:${this.croppedCanvas.height}px;` +
      `cursor:default;display:none;`;
    this.correctionOverlayCanvas = ov;

    ov.addEventListener('click', (e: MouseEvent) => {
      if (!this.correctionMode || !this.boardData.length) return;
      const rect = ov.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (ov.width / rect.width);
      const py = (e.clientY - rect.top)  * (ov.height / rect.height);
      const bsRows = this.boardData.length, bsCols = (this.boardData[0]||[]).length;
      const cW = ov.width / bsCols, cH = ov.height / bsRows;
      const col = Math.floor(px / cW), row = Math.floor(py / cH);
      if (col < 0 || col >= bsCols || row < 0 || row >= bsRows) return;
      const key = `${row},${col}`;
      const cell = this.boardData[row][col];
      const current: StoneColor | null | undefined = this.correctionMap.get(key);
      const auto = cell.stone;
      // Fixed order: black → white → none → clear (back to auto)
      // Always traverse in this order, starting from the state after auto.
      const order: StoneColor[] = ['black', 'white', 'none'];
      const autoIdx = order.indexOf(auto);
      // Cycle entries: the two non-auto states in fixed order, then clear
      const cycle: (StoneColor | 'clear')[] = [
        order[(autoIdx + 1) % 3],
        order[(autoIdx + 2) % 3],
        'clear',
      ];
      let idx = 0;
      if (current !== undefined) {
        const pos = cycle.indexOf(current as StoneColor);
        idx = pos >= 0 ? (pos + 1) % cycle.length : 0;
      }
      const chosen = cycle[idx];
      if (chosen === 'clear') {
        this.correctionMap.delete(key);
      } else {
        this.correctionMap.set(key, chosen);
      }
      this.redrawCroppedCanvas();
      this.redrawCorrectionOverlay();
      this.redrawResultBoard();
    });
  }

  /** Toggle correction mode on/off. Pressing again resets all overrides. */
  private onToggleCorrectionMode() {
    if (!this.boardData.length) { new Notice(this.t('errNoDetect')); return; }
    this.correctionMode = !this.correctionMode;
    // Reset all overrides each time the button is pressed
    this.correctionMap.clear();
    const btn = this.correctionBtn;
    if (this.correctionMode) {
      if (btn) { btn.classList.add('bd-btn-correction-active'); btn.textContent = this.t('btnCorrectionActive'); }
      // Sync overlay canvas size to current croppedCanvas (may have changed since last detect)
      const ov = this.correctionOverlayCanvas;
      if (ov) {
        ov.width  = this.croppedCanvas.width;
        ov.height = this.croppedCanvas.height;
        ov.style.width  = this.croppedCanvas.width  + 'px';
        ov.style.height = this.croppedCanvas.height + 'px';
        ov.style.display = 'block';
        ov.style.cursor  = 'crosshair';
      }
      // correctionMap was just cleared; redraw croppedCanvas to remove any previous indicators
      this.redrawCroppedCanvas();
    } else {
      if (btn) { btn.classList.remove('bd-btn-correction-active'); btn.textContent = this.t('btnCorrection'); }
      const ov = this.correctionOverlayCanvas;
      if (ov) { ov.style.display = 'none'; }
      this.redrawCroppedCanvas();
      this.redrawResultBoard();
    }
  }

  /** Redraw croppedCanvas: image + effective markers (without correction overlay indicators). */
  private redrawCroppedCanvas() {
    const data = this.lastRenderedData;
    if (!data || !data.length) return;
    const bsCols = (data[0]||[]).length, bsRows = data.length;
    const OW = this.croppedCanvas.width, OH = this.croppedCanvas.height;
    const mt=this.getMargin('marginTop'), mb=this.getMargin('marginBottom');
    const ml=this.getMargin('marginLeft'), mr=this.getMargin('marginRight');
    this.croppedCtx.clearRect(0, 0, OW, OH);
    if (this.sourceImage) {
      const cw = this.srcW-ml-mr, ch = this.srcH-mt-mb;
      this.croppedCtx.drawImage(this.sourceImage, ml, mt, cw, ch, 0, 0, OW, OH);
    } else {
      const cw = this.srcCanvas.width-ml-mr, ch = this.srcCanvas.height-mt-mb;
      this.croppedCtx.drawImage(this.srcCanvas, ml, mt, cw, ch, 0, 0, OW, OH);
    }
    // Redraw markers using effective stone (corrected)
    const cellW = OW / bsCols, cellH = OH / bsRows;
    const stoneR = Math.min(cellW, cellH) * 0.44;
    const markerR = stoneR * (this.plugin.settings.markerSizeRatio / 100);
    const blackColor = this.plugin.settings.markerBlackColor;
    const whiteColor = this.plugin.settings.markerWhiteColor;
    for (const rowArr of data) {
      for (const c of rowArr) {
        const stone = this.getEffectiveStone(c);
        if (stone === 'black' || stone === 'white') {
          this.croppedCtx.beginPath();
          this.croppedCtx.arc(c.cx, c.cy, markerR, 0, Math.PI * 2);
          this.croppedCtx.fillStyle = stone === 'black' ? blackColor : whiteColor;
          this.croppedCtx.fill();
        }
      }
    }
    this.drawImageOverlay();
  }

  /** Redraw the result board canvas using effective (corrected) stone colors. */
  private redrawResultBoard() {
    const data = this.lastRenderedData;
    if (!data || !data.length) return;
    const bsCols = (data[0]||[]).length, bsRows = data.length;
    const rc = this.el('bd-resultCanvas') as HTMLCanvasElement | null;
    if (!rc) return;
    this.drawBoardCanvas(rc, bsCols, bsRows, data.map(r => r.map(c => this.getEffectiveStone(c))));
    this.drawImageOverlay();
  }

  /** Draw correction indicators on the overlay canvas (cropped canvas coordinate space). */
  private redrawCorrectionOverlay() {
    const ov = this.correctionOverlayCanvas;
    if (!ov) return;
    const data = this.lastRenderedData;
    if (!data || !data.length) return;
    const bsCols = (data[0]||[]).length, bsRows = data.length;
    const ctx = ov.getContext('2d')!;
    ctx.clearRect(0, 0, ov.width, ov.height);
    const cW = ov.width / bsCols, cH = ov.height / bsRows;
    const stoneR = Math.min(cW, cH) * 0.44;
    const markerR = stoneR * (this.plugin.settings.markerSizeRatio / 100);
    const blackColor = this.plugin.settings.markerBlackColor;
    const whiteColor = this.plugin.settings.markerWhiteColor;
    for (const [key, override] of this.correctionMap) {
      const [row, col] = key.split(',').map(Number);
      const cell = data[row]?.[col];
      if (!cell) continue;
      const cx = cell.cx, cy = cell.cy;
      if (override === 'black' || override === 'white') {
        // Same filled circle as detection markers
        ctx.beginPath();
        ctx.arc(cx, cy, markerR, 0, Math.PI * 2);
        ctx.fillStyle = override === 'black' ? blackColor : whiteColor;
        ctx.fill();
      } else {
        // Empty (none): draw ❌ with same radius
        const arm = markerR * 0.75;
        ctx.strokeStyle = '#ff3300';
        ctx.lineWidth = Math.max(2, markerR * 0.35);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx - arm, cy - arm); ctx.lineTo(cx + arm, cy + arm); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + arm, cy - arm); ctx.lineTo(cx - arm, cy + arm); ctx.stroke();
      }
    }
  }

  // ══════════════════════════════════════════
  //  Cropped image overlay on result canvas
  // ══════════════════════════════════════════

  private onToggleImageOverlay() {
    this.imageOverlayMode = !this.imageOverlayMode;
    const btn = this.imageOverlayBtn;
    if (this.imageOverlayMode) {
      if (btn) { btn.classList.add('bd-btn-image-overlay-active'); btn.textContent = this.t('btnImageOverlayActive'); }
      this.drawImageOverlay();
    } else {
      if (btn) { btn.classList.remove('bd-btn-image-overlay-active'); btn.textContent = this.t('btnImageOverlay'); }
      const ov = this.imageOverlayCanvas;
      if (ov) { const ctx = ov.getContext('2d')!; ctx.clearRect(0, 0, ov.width, ov.height); ov.style.display = 'none'; }
    }
  }

  private drawImageOverlay() {
    const ov = this.imageOverlayCanvas;
    if (!ov || !this.imageOverlayMode) return;
    const rc = this.el('bd-resultCanvas') as HTMLCanvasElement | null;
    if (!rc || rc.style.display === 'none') return;
    // Match overlay size to croppedCanvas
    ov.width  = this.croppedCanvas.width;
    ov.height = this.croppedCanvas.height;
    ov.style.width  = ov.width  + 'px';
    ov.style.height = ov.height + 'px';
    ov.style.display = 'block';
    const ctx = ov.getContext('2d')!;
    ctx.clearRect(0, 0, ov.width, ov.height);
    // Draw resultCanvas (board graphic) semi-transparently onto croppedCanvas
    ctx.globalAlpha = this.imageOverlayAlpha;
    ctx.drawImage(rc, 0, 0, ov.width, ov.height);
    ctx.globalAlpha = 1.0;
  }

  private drawBoardCanvas(canvas: HTMLCanvasElement, cols: number, rows: number, grid: StoneColor[][]) {
    const BASE=300;
    if(cols>=rows){canvas.width=BASE;canvas.height=Math.round(BASE*rows/cols);}
    else          {canvas.height=BASE;canvas.width=Math.round(BASE*cols/rows);}
    canvas.width=Math.max(canvas.width,40);canvas.height=Math.max(canvas.height,40);
    const ctx=canvas.getContext('2d')!,W=canvas.width,H=canvas.height;
    const cW=W/cols,cH=H/rows;
    const ix=(c:number)=>cW/2+c*cW, iy=(r:number)=>cH/2+r*cH;
    ctx.fillStyle=this.plugin.settings.boardBgColor;ctx.fillRect(0,0,W,H);
    for(let i=0;i<H;i+=5){ctx.strokeStyle=`rgba(0,0,0,${0.03+0.01*Math.sin(i)})`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(W,i+2);ctx.stroke();}
    ctx.strokeStyle='#5a3800';ctx.lineWidth=0.8;
    for(let c=0;c<cols;c++){ctx.beginPath();ctx.moveTo(ix(c),iy(0));ctx.lineTo(ix(c),iy(rows-1));ctx.stroke();}
    for(let r=0;r<rows;r++){ctx.beginPath();ctx.moveTo(ix(0),iy(r));ctx.lineTo(ix(cols-1),iy(r));ctx.stroke();}
    if(cols>=9&&rows>=9){
      const sC=Math.floor(cols/4),sR=Math.floor(rows/4);
      [sR,Math.floor(rows/2),rows-1-sR].forEach(r=>{[sC,Math.floor(cols/2),cols-1-sC].forEach(c=>{ctx.beginPath();ctx.arc(ix(c),iy(r),2.5,0,Math.PI*2);ctx.fillStyle='#5a3800';ctx.fill();});});
    }
    const stR=Math.min(cW,cH)*0.44;
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
      const stone=grid[r]?.[c]; if(!stone||stone==='none')continue;
      const cx=ix(c),cy=iy(r);
      ctx.beginPath();ctx.arc(cx,cy,stR,0,Math.PI*2);
      if(stone==='black'){const g=ctx.createRadialGradient(cx-stR*.3,cy-stR*.3,stR*.1,cx,cy,stR);g.addColorStop(0,'#555');g.addColorStop(1,'#111');ctx.fillStyle=g;}
      else               {const g=ctx.createRadialGradient(cx-stR*.3,cy-stR*.3,stR*.1,cx,cy,stR);g.addColorStop(0,'#fff');g.addColorStop(1,'#ccc');ctx.fillStyle=g;}
      ctx.fill();ctx.strokeStyle=stone==='black'?'#000':'#444';ctx.lineWidth=1.2;ctx.stroke();
    }
  }

  private verifySample(data: CellData[][]) {
    if(this.sourceImage||!this.generatedBoardAnswer)return;
    const {stones}=this.generatedBoardAnswer;
    const total=data.length * ((data[0]||[]).length);
    let ok=0;
    const nB:string[]=[],nW:string[]=[],nN:string[]=[];
    data.forEach((rowArr:CellData[])=>rowArr.forEach((cell:CellData)=>{
      const exp:StoneColor=stones.get(`${cell.row},${cell.col}`)||'none';
      if(cell.stone===exp){ok++;}
      else{
        const info=`(${cell.row},${cell.col}) ${this.t('verifyExpected')}<b>${exp}</b> ${this.t('verifyActual')}${cell.stone} lum=${cell.lum} ring=${cell.ringMin}%`;
        if(exp==='black')nB.push(info);else if(exp==='white')nW.push(info);else nN.push(info);
      }
    }));
    const ng=[...nB,...nW,...nN],pct=Math.round(ok/total*100);
    const col=pct===100?'#80c860':pct>=90?'#c8b040':'#e06040';
    const st=this.el('bd-statsText');if(!st)return;
    st.innerHTML+=
      `<br><hr style="border-color:var(--background-modifier-border);margin:6px 0">`+
      `<span style="color:var(--text-faint);font-size:0.68rem">${this.t('verifyHeader')}</span><br>`+
      `<span style="color:${col}">${this.t('verifyResult',ok,total,pct)}</span>`+
      (nB.length?`<br><span style="color:#e08060;font-size:0.68rem">${this.t('verifyNgBlack',nB.length)}<br>${nB.join('<br>')}</span>`:'')+
      (nW.length?`<br><span style="color:#e08060;font-size:0.68rem">${this.t('verifyNgWhite',nW.length)}<br>${nW.join('<br>')}</span>`:'')+
      (nN.length?`<br><span style="color:#e08060;font-size:0.68rem">${this.t('verifyNgNone', nN.length)}<br>${nN.join('<br>')}</span>`:'')+
      (ng.length===0?`<br><span style="color:#80c860">${this.t('verifyPerfect')}</span>`:'');
  }

  // ══════════════════════════════════════════
  //  Event handlers
  // ══════════════════════════════════════════
  private onDetect() {
    const cols=parseInt((this.el('bd-boardCols') as HTMLInputElement).value)||0;
    const rows=parseInt((this.el('bd-boardRows') as HTMLInputElement).value)||0;
    if(cols>19||rows>19){new Notice(this.t('errMaxSize'));return;}
    if(cols<1||rows<1)  {new Notice(this.t('errMinSize'));return;}
    if(!this.cropImage())return;
    // Clear any active correction mode when re-detecting
    this.correctionMap.clear();
    this.correctionMode=false;
    const btnCorr = this.correctionBtn;
    if(btnCorr){btnCorr.classList.remove('bd-btn-correction-active');btnCorr.textContent=this.t('btnCorrection');}
    this.boardData=this.detectStones();
    this.renderResult(this.boardData);
    const sc=this.el('bd-sgfCard');if(sc)sc.style.display='block';
  }

  private onExpand() {
    const err=this.el('bd-expandError');if(err)err.style.display='none';
    if(!this.boardData?.length){if(err){err.textContent=this.t('errNoDetect');err.style.display='block';}return;}
    const iR=this.boardData.length,iC=(this.boardData[0]||[]).length;
    const oC=parseInt((this.el('bd-outCols') as HTMLInputElement).value)||0;
    const oR=parseInt((this.el('bd-outRows') as HTMLInputElement).value)||0;
    const oX=parseInt((this.el('bd-offsetX') as HTMLInputElement).value)||0;
    const oY=parseInt((this.el('bd-offsetY') as HTMLInputElement).value)||0;
    const chk=(cond:boolean,msg:string)=>{if(cond){if(err){err.textContent=msg;err.style.display='block';}return true;}return false;};
    if(chk(oC<1||oR<1, this.t('errMinOut'))||
       chk(oC>19||oR>19,this.t('errMaxOut'))||
       chk(oX+iC>oC,    this.t('errOverflowX',oX,iC,oC))||
       chk(oY+iR>oR,    this.t('errOverflowY',oY,iR,oR))) return;
    const board:StoneColor[][]=Array.from({length:oR},()=>new Array<StoneColor>(oC).fill('none'));
    for(let r=0;r<iR;r++) for(let c=0;c<iC;c++) board[oY+r][oX+c]=this.getEffectiveStone(this.boardData[r][c]);
    let bl=0,wh=0,no=0;
    board.forEach(row=>row.forEach(s=>{if(s==='black')bl++;else if(s==='white')wh++;else no++;}));
    const unit=this.t('statsUnit')?(' '+this.t('statsUnit')):'';
    const es=this.el('bd-expandStats');
    if(es) es.innerHTML=this.t('expandSummary',iC,iR,oC,oR,oX,oY)+'<br>'+
      `<b>${this.t('statsBlack')}</b>: ${bl}${unit} &nbsp; <b>${this.t('statsWhite')}</b>: ${wh}${unit} &nbsp; <b>${this.t('statsNone')}</b>: ${no}${unit}`;
    const ec=this.el('bd-expandCanvas') as HTMLCanvasElement|null;if(ec)this.drawBoardCanvas(ec,oC,oR,board);
    this.expandedBoard={cols:oC,rows:oR,stones:board};
    const erc=this.el('bd-expandResultCard');if(erc)erc.style.display='block';
    const so=this.el('bd-sgfOutput');if(so)so.style.display='none';
    const sc=this.el('bd-sgfCard');if(sc)sc.style.display='block';
  }

  private onResetConfirm() {
    const modal = new ResetConfirmModal(this.app2, this.t('resetConfirmTitle'), this.t('resetConfirmMsg'), this.t('resetConfirmOk'), this.t('resetConfirmCancel'), () => this.onReset());
    modal.open();
  }

  private onReset() {
    this.croppedCtx.clearRect(0,0,this.croppedCanvas.width,this.croppedCanvas.height);
    this.srcCtx.clearRect(0,0,this.srcCanvas.width,this.srcCanvas.height);
    this.cropCtx.clearRect(0,0,this.cropOverlay.width,this.cropOverlay.height);
    const g=(id:string)=>this.el(id);
    const st=g('bd-statsText');if(st)st.textContent=this.t('statsInitial');
    const rc=g('bd-resultCanvas');if(rc)rc.style.display='none';
    this.boardData=[];this.sourceImage=null;this.generatedBoardAnswer=null;this.expandedBoard=null;this.lastSgfBody='';
    this.correctionMap.clear();this.correctionMode=false;
    if(this.correctionBtn){this.correctionBtn.classList.remove('bd-btn-correction-active');this.correctionBtn.textContent=this.t('btnCorrection');}
    if(this.correctionOverlayCanvas)this.correctionOverlayCanvas.style.display='none';
    this.imageOverlayMode=false;
    if(this.imageOverlayBtn){this.imageOverlayBtn.classList.remove('bd-btn-image-overlay-active');this.imageOverlayBtn.textContent=this.t('btnImageOverlay');}
    if(this.imageOverlayCanvas)this.imageOverlayCanvas.style.display='none';
    const es=g('bd-expandStats');if(es)es.textContent='';
    ['bd-expandResultCard','bd-expandError','bd-sgfCard','bd-sgfOutput'].forEach(id=>{const el=g(id);if(el)el.style.display='none';});
    const ta=g('bd-sgfText') as HTMLTextAreaElement|null;if(ta)ta.value='';
    this.updateMarginSliders(this.srcCanvas.width,this.srcCanvas.height);
    this.drawCropOverlay();
    this.startOverlayEl.style.display='flex';
    this.mainContentEl.style.display='none';
    // Close image generation options and return to initial state
    if (this.genOptionsEl) this.genOptionsEl.style.display = 'none';
  }

  private onMakeSGF() {
    if(!this.expandedBoard){new Notice(this.t('noticeNoExpand'));return;}
    const{cols,rows,stones}=this.expandedBoard;
    const pl=(this.el('bd-sgfPL') as HTMLSelectElement|null)?.value ?? 'B';
    const gm=(this.el('bd-sgfGM') as HTMLSelectElement|null)?.value ?? '1';
    const ru=((this.el('bd-sgfRU') as HTMLInputElement|null)?.value.trim()) ?? '';
    const coord=(c:number,r:number)=>String.fromCharCode(97+c)+String.fromCharCode(97+r);
    const bs:string[]=[],ws:string[]=[];
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){if(stones[r][c]==='black')bs.push(coord(c,r));else if(stones[r][c]==='white')ws.push(coord(c,r));}
    const sz=cols===rows?`${cols}`:`${cols}:${rows}`;
    let sgf=`(;GM[${gm}]FF[4]SZ[${sz}]`;
    if(pl) sgf+=`PL[${pl}]`;
    if(ru) sgf+=`RU[${ru}]`;
    if(bs.length)sgf+=`\nAB[${bs.join('][')}]`;
    if(ws.length)sgf+=`\nAW[${ws.join('][')}]`;
    sgf+=')';
    // Store SGF body text (for Vault saving)
    this.lastSgfBody = sgf;
    // Textarea display: wrap in code block if configured
    const display=`\`\`\`grboard\n${sgf}\n\`\`\``;
    const ta=this.el('bd-sgfText') as HTMLTextAreaElement|null;if(ta)ta.value=display;
    const so=this.el('bd-sgfOutput');if(so)so.style.display='block';
    const fb=this.el('bd-copyFeedback');if(fb)fb.style.display='none';
  }

  private onCopySGF() {
    // Copy the textarea content as-is (including code block wrapper)
    const ta=this.el('bd-sgfText') as HTMLTextAreaElement|null;if(!ta||!ta.value)return;
    const text=ta.value;
    const showFB=(msg:string)=>{const fb=this.el('bd-copyFeedback');if(fb){fb.textContent=msg;fb.style.display='inline';setTimeout(()=>{fb.style.display='none';},2000);}};
    navigator.clipboard.writeText(text).then(()=>showFB(this.t('copyDone'))).catch(()=>{ta.select();document.execCommand('copy');showFB(this.t('copyDone'));});
  }

  private async onSaveSGF() {
    // Save to Vault: SGF body text only, without code block wrapper
    if(!this.lastSgfBody){new Notice(this.t('errNoSGF'));return;}
    const _d=new Date();
    const ts=`${_d.getFullYear()}${String(_d.getMonth()+1).padStart(2,'0')}${String(_d.getDate()).padStart(2,'0')}T${String(_d.getHours()).padStart(2,'0')}${String(_d.getMinutes()).padStart(2,'0')}${String(_d.getSeconds()).padStart(2,'0')}`;
    const fname=`grb-${ts}.sgf`;
    try{
      await this.app2.vault.create(normalizePath(fname),this.lastSgfBody);
      new Notice(this.t('saveOK',fname));
      const fb=this.el('bd-copyFeedback');if(fb){fb.textContent=this.t('saveDone',fname);fb.style.display='inline';setTimeout(()=>{fb.style.display='none';},3000);}
    }catch(e){new Notice(this.t('saveErr',e));}
  }

  private loadImageFile(file: File) {
    const reader=new FileReader();
    reader.onload=(e:ProgressEvent<FileReader>)=>{
      const img=new Image();
      img.onload=()=>{
        this.sourceImage=img;this.srcW=img.width;this.srcH=img.height;
        const scale=Math.min(1,500/Math.max(this.srcW,this.srcH));
        this.srcCanvas.width=Math.round(this.srcW*scale);this.srcCanvas.height=Math.round(this.srcH*scale);
        this.cropOverlay.width=this.srcCanvas.width;this.cropOverlay.height=this.srcCanvas.height;
        this.srcCtx.drawImage(img,0,0,this.srcCanvas.width,this.srcCanvas.height);
        this.updateMarginSliders(this.srcW,this.srcH);
        this.drawCropOverlay();
        // Clear detection results
        this.boardData=[];this.lastRenderedData=[];this.lastSgfBody='';
        const rc=this.el('bd-resultCanvas');if(rc)(rc as HTMLCanvasElement).style.display='none';
        const st=this.el('bd-statsText');if(st)st.textContent=this.t('statsInitial');
        // Reset correction mode
        this.correctionMap.clear();
        this.correctionMode=false;
        if(this.correctionBtn){this.correctionBtn.classList.remove('bd-btn-correction-active');this.correctionBtn.textContent=this.t('btnCorrection');}
        if(this.correctionOverlayCanvas)this.correctionOverlayCanvas.style.display='none';
        this.imageOverlayMode=false;
        if(this.imageOverlayBtn){this.imageOverlayBtn.classList.remove('bd-btn-image-overlay-active');this.imageOverlayBtn.textContent=this.t('btnImageOverlay');}
        if(this.imageOverlayCanvas)this.imageOverlayCanvas.style.display='none';
      };
      img.src=e.target!.result as string;
    };
    reader.readAsDataURL(file);
  }

  private updateMarginSliders(w: number, h: number) {
    const wEl=this.el('bd-imgSizeW'),hEl=this.el('bd-imgSizeH');
    if(wEl)wEl.textContent=String(w);if(hEl)hEl.textContent=String(h);
    (['marginTop','marginBottom','marginLeft','marginRight'] as const).forEach((id,i)=>{
      const max=i<2?h:w;
      const sl=this.el('bd-'+id) as HTMLInputElement|null;
      const nu=this.el('bd-'+id+'Num') as HTMLInputElement|null;
      if(sl){sl.max=String(max);sl.value='0';}
      if(nu){nu.max=String(max);nu.value='0';}
    });
  }
}

// ══════════════════════════════════════════
//  Reset confirmation modal
// ══════════════════════════════════════════

// ── PNG save modal with "include markers" checkbox ──
class SavePngModal extends Modal {
  private title: string;
  private message: string;
  private okLabel: string;
  private cancelLabel: string;
  private includeMarkersLabel: string;
  private includeBorderLabel: string;
  private onConfirm: (includeMarkers: boolean, includeBorder: boolean) => void;

  constructor(
    app: App,
    title: string,
    message: string,
    okLabel: string,
    cancelLabel: string,
    includeMarkersLabel: string,
    includeBorderLabel: string,
    onConfirm: (includeMarkers: boolean, includeBorder: boolean) => void,
  ) {
    super(app);
    this.title = title;
    this.message = message;
    this.okLabel = okLabel;
    this.cancelLabel = cancelLabel;
    this.includeMarkersLabel = includeMarkersLabel;
    this.includeBorderLabel = includeBorderLabel;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: this.title, attr: { style: 'margin-bottom:12px;font-size:1rem' } });
    contentEl.createEl('p', { text: this.message, attr: { style: 'margin-bottom:12px;color:var(--text-muted);white-space:pre-line' } });

    // ── "Include markers" checkbox ──
    const chkRow = contentEl.createEl('div', { attr: { style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px;' } });
    const chk = chkRow.createEl('input') as HTMLInputElement;
    chk.type = 'checkbox';
    chk.id = 'savepng-include-markers';
    chk.checked = true;
    const lbl = chkRow.createEl('label', { text: this.includeMarkersLabel });
    lbl.htmlFor = 'savepng-include-markers';
    lbl.style.cursor = 'pointer';

    // ── "Include border" checkbox ──
    const chkBorderRow = contentEl.createEl('div', { attr: { style: 'display:flex;align-items:center;gap:8px;margin-bottom:20px;' } });
    const chkBorder = chkBorderRow.createEl('input') as HTMLInputElement;
    chkBorder.type = 'checkbox';
    chkBorder.id = 'savepng-include-border';
    chkBorder.checked = false;
    const lblBorder = chkBorderRow.createEl('label', { text: this.includeBorderLabel });
    lblBorder.htmlFor = 'savepng-include-border';
    lblBorder.style.cursor = 'pointer';

    const btnRow = contentEl.createEl('div', { attr: { style: 'display:flex;gap:10px;justify-content:flex-end' } });

    const btnCancel = btnRow.createEl('button', { text: this.cancelLabel });
    btnCancel.style.cssText = 'padding:6px 16px;cursor:pointer';
    btnCancel.addEventListener('click', () => this.close());

    const btnOk = btnRow.createEl('button', { text: this.okLabel });
    btnOk.style.cssText = 'padding:6px 16px;background:var(--color-blue);color:#fff;border:none;border-radius:4px;cursor:pointer';
    btnOk.addEventListener('click', () => {
      this.close();
      this.onConfirm(chk.checked, chkBorder.checked);
    });
  }

  onClose() { this.contentEl.empty(); }
}

class ResetConfirmModal extends Modal {
  private title: string;
  private message: string;
  private okLabel: string;
  private cancelLabel: string;
  private onConfirm: () => void;

  private btnColor: string;
  constructor(app: App, title: string, message: string, okLabel: string, cancelLabel: string, onConfirm: () => void, btnColor: string = 'var(--color-red)') {
    super(app);
    this.title = title;
    this.message = message;
    this.okLabel = okLabel;
    this.cancelLabel = cancelLabel;
    this.onConfirm = onConfirm;
    this.btnColor = btnColor;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: this.title, attr: { style: 'margin-bottom:12px;font-size:1rem' } });
    contentEl.createEl('p', { text: this.message, attr: { style: 'margin-bottom:20px;color:var(--text-muted);white-space:pre-line' } });

    const btnRow = contentEl.createEl('div', { attr: { style: 'display:flex;gap:10px;justify-content:flex-end' } });

    const btnCancel = btnRow.createEl('button', { text: this.cancelLabel });
    btnCancel.style.cssText = 'padding:6px 16px;cursor:pointer';
    btnCancel.addEventListener('click', () => this.close());

    const btnOk = btnRow.createEl('button', { text: this.okLabel });
    btnOk.style.cssText = 'padding:6px 16px;background:' + this.btnColor + ';color:#fff;border:none;border-radius:4px;cursor:pointer';
    btnOk.addEventListener('click', () => {
      this.close();
      this.onConfirm();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ══════════════════════════════════════════
//  SGF file view (open .sgf files on click)
// ══════════════════════════════════════════

const SGF_FILE_VIEW_TYPE = 'sgf-file-view';

class SGFFileView extends FileView {
  plugin: BdDetectPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: BdDetectPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return SGF_FILE_VIEW_TYPE; }

  getDisplayText(): string {
    return this.file ? this.file.basename : 'SGF Board';
  }

  async onLoadFile(file: TFile): Promise<void> {
    const sgfContent = await this.app.vault.read(file);
    const container = this.contentEl;
    container.empty();
    const plugin = this.plugin;
    const t = (k: string) => plugin.t(k);

    // ── Mode selector dropdown ──
    const controlRow = container.createEl('div');
    controlRow.style.cssText =
      'display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.78rem;padding:4px 0;';
    controlRow.createEl('span', {
      text: t('sgfModeLabel') + ':',
      attr: { style: 'color:var(--text-muted)' },
    });
    const modeSelect = controlRow.createEl('select') as HTMLSelectElement;
    modeSelect.style.cssText =
      'background:var(--background-secondary);border:1px solid var(--background-modifier-border);' +
      'color:var(--text-normal);padding:2px 8px;border-radius:3px;font-size:0.78rem;cursor:pointer;';
    const optRef  = modeSelect.createEl('option', { text: t('sgfModeRef')  }) as HTMLOptionElement;
    optRef.value  = 'ref';
    const optPlay = modeSelect.createEl('option', { text: t('sgfModePlay') }) as HTMLOptionElement;
    optPlay.value = 'play';
    const optEdit = modeSelect.createEl('option', { text: t('sgfModeEdit') }) as HTMLOptionElement;
    optEdit.value = 'edit';
    modeSelect.value = 'ref';

    // ── Board rendering area ──
    const boardArea = container.createEl('div');

    const redraw = () => {
      boardArea.empty();
      const sel      = modeSelect.value;
      const editMode = sel === 'edit';
      const playMode = sel === 'play';
      void renderGoBoard(plugin.app, boardArea, sgfContent, editMode, undefined, 0,
        plugin.settings.boardBgColor, playMode, t, true,
        { onStone: plugin.settings.sgfMarkerColor, onEmpty: plugin.settings.sgfMarkerEmptyColor,
          moveNumOnBlack: plugin.settings.moveNumBlackStoneColor, moveNumOnWhite: plugin.settings.moveNumWhiteStoneColor,
          lastMove: plugin.settings.lastMoveColor });
    };
    modeSelect.addEventListener('change', () => redraw());
    redraw();
  }

  onUnloadFile(_file: TFile): Promise<void> {
    this.contentEl.empty();
    return Promise.resolve();
  }
}

// ── Add SGF embed processing as standalone functions (plugin instance passed as argument) ──


function setupMutationObserverForSGF(plugin: BdDetectPlugin): MutationObserver {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const element = node as HTMLElement;

        // If the element itself is an .internal-embed pointing to a .sgf file, process it
        if (element.classList.contains('internal-embed')) {
          const src = element.getAttribute('src') || element.getAttribute('alt');
          if (src && src.toLowerCase().endsWith('.sgf')) {
            processSingleSGFEmbed(plugin, element).catch(console.error);
          }
        }

        // Also scan descendant .internal-embed elements
        element.querySelectorAll<HTMLElement>('.internal-embed').forEach(el => {
          const src = el.getAttribute('src') || el.getAttribute('alt');
          if (src && src.toLowerCase().endsWith('.sgf')) {
            processSingleSGFEmbed(plugin, el).catch(console.error);
          }
        });
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}

async function processSingleSGFEmbed(plugin: BdDetectPlugin, embed: HTMLElement, sourcePath = ''): Promise<void> {
  if (embed.hasAttribute('data-sgf-processed')) return;
  embed.setAttribute('data-sgf-processed', 'true');

  // Obsidian renders ![[file.sgf|move=5]] as src="file.sgf", alt="move=5"
  const src = embed.getAttribute('src') ?? '';
  const alt = embed.getAttribute('alt') ?? '';
  const filePath = src || alt;
  if (!filePath.toLowerCase().endsWith('.sgf')) return;

  // Parse optional move= parameter from alt (e.g. "move=5")
  let initialMove = 0;
  const moveMatch = alt.match(/move=(\d+)/) ?? src.match(/move=(\d+)/);
  if (moveMatch) initialMove = parseInt(moveMatch[1], 10);

  const file = plugin.app.metadataCache.getFirstLinkpathDest(filePath, sourcePath);
  if (!file || !(file instanceof TFile)) {
    console.warn('SGF embed: file not found:', filePath, '(sourcePath:', sourcePath, ')');
    return;
  }

  let sgfContent: string;
  try {
    sgfContent = await plugin.app.vault.read(file);
  } catch (e) {
    console.error('SGF embed: failed to read file:', e);
    return;
  }

  if (!embed.isConnected) return;

  // Replace the embed element with a container, then render after it is
  // connected to the DOM (requestAnimationFrame ensures layout is ready
  // so that Sabaki's Goban flex layout and plugin CSS apply correctly).
  const container = document.createElement('div');
  container.className = 'grboard-embed-wrapper';
  embed.replaceWith(container);

  requestAnimationFrame(() => {
    renderGoBoard(
      plugin.app, container, sgfContent,
      false,                // editMode  – ref mode固定
      undefined,            // ctx       – write to noteボタン非表示（SGF書き換え防止）
      initialMove,          // ![[file.sgf|move=5]] でその手数から開始
      plugin.settings.boardBgColor,
      false,                // playMode
      (k) => plugin.t(k),
      false,                // showMoveNumbersInit=false → 最終手マーカーのみ表示
      { onStone: plugin.settings.sgfMarkerColor, onEmpty: plugin.settings.sgfMarkerEmptyColor,
        moveNumOnBlack: plugin.settings.moveNumBlackStoneColor, moveNumOnWhite: plugin.settings.moveNumWhiteStoneColor,
        lastMove: plugin.settings.lastMoveColor },
      true                  // showCoordinates=true
    );
  });
}

async function processSGFEmbedsInDoc(plugin: BdDetectPlugin): Promise<void> {
  const selectors = [
    '.internal-embed[src$=".sgf"]',
    '.internal-embed[src$=".SGF"]',
    '.internal-embed.file-embed[src*=".sgf"]',
  ];
  const seen = new Set<HTMLElement>();
  for (const sel of selectors) {
    document.querySelectorAll<HTMLElement>(sel).forEach(el => seen.add(el));
  }
  for (const embed of seen) {
    if (embed.hasAttribute('data-sgf-processed') && embed.isConnected) {
      embed.removeAttribute('data-sgf-processed');
    }
    await processSingleSGFEmbed(plugin, embed);
  }
}


// ══════════════════════════════════════════
//  SGF viewer (Sabaki Goban) ══════════════════════════════════════════

interface RgBoardParams {
  bgcolor: string | null;  // bgcolor option (null = use plugin setting background color)
}

/**
 * Reorder root node properties of an SGF string.
 * Target order: GM → FF → SZ → PL → RU → ... → AB → AW → moves
 */
/**
 * Build an SGF string by assembling fields in order directly from rootNode.
 * Order: GM → FF → SZ → PL → RU → game info → AB → AW → move node sequence
 */
function buildSGFString(root: SabakiSGFNode): string {
  const rd = root.data || {};

  // Format multi-value properties (AB/AW etc.) as [val][val]...
  const vals = (prop: string) =>
    (rd[prop] as string[]).map((v: string) => `[${v}]`).join('');

  // SZ in cols:rows or cols format
  const szRaw  = rd.SZ?.[0] ?? '19';
  const szStr  = szRaw;   // Already stored in the correct format, use as-is

  let sgf = ';';
  sgf += `GM[${rd.GM?.[0] ?? '1'}]`;
  sgf += `FF[${rd.FF?.[0] ?? '4'}]`;
  sgf += `SZ[${szStr}]`;

  // PL, RU (before AB/AW)
  if (rd.PL) sgf += `PL[${rd.PL[0]}]`;
  if (rd.RU) sgf += `RU[${rd.RU[0]}]`;

  // Game information properties
  for (const prop of ['PB','PW','BR','WR','GN','EV','RO','DT','PC','KM','HA','RE','CA','AP','C']) {
    if (rd[prop]) sgf += `${prop}[${rd[prop][0]}]`;
  }

  // AB / AW (setup stones)
  if (rd.AB && rd.AB.length > 0) sgf += `AB${vals('AB')}`;
  if (rd.AW && rd.AW.length > 0) sgf += `AW${vals('AW')}`;

  // AE (stone removal)
  if (rd.AE && rd.AE.length > 0) sgf += `AE${vals('AE')}`;

  // Traverse move nodes depth-first
  const buildMoves = (node: SabakiSGFNode): string => {
    if (!node.children || node.children.length === 0) return '';
    if (node.children.length === 1) {
      // No variation: concatenate directly
      const child = node.children[0];
      const cd = child.data || {};
      let ms = ';';
      if (cd.B)  ms += `B[${cd.B[0]}]`;
      if (cd.W)  ms += `W[${cd.W[0]}]`;
      // Markers etc.
      for (const prop of ['TR','SQ','CR','MA','LB','C','AB','AW','AE']) {
        if (cd[prop]) {
          if (['AB','AW','AE','TR','SQ','CR','MA','LB'].includes(prop)) {
            ms += `${prop}${(cd[prop] as string[]).map((v: string) => `[${v}]`).join('')}`;
          } else {
            ms += `${prop}[${cd[prop][0]}]`;
          }
        }
      }
      return ms + buildMoves(child);
    } else {
      // Variation: wrap each child in (;...)
      return node.children.map((child: SabakiSGFNode) => {
        const cd = child.data || {};
        let ms = ';';
        if (cd.B)  ms += `B[${cd.B[0]}]`;
        if (cd.W)  ms += `W[${cd.W[0]}]`;
        for (const prop of ['TR','SQ','CR','MA','LB','C','AB','AW','AE']) {
          if (cd[prop]) {
            if (['AB','AW','AE','TR','SQ','CR','MA','LB'].includes(prop)) {
              ms += `${prop}${(cd[prop] as string[]).map((v: string) => `[${v}]`).join('')}`;
            } else {
              ms += `${prop}[${cd[prop][0]}]`;
            }
          }
        }
        return `(${ms}${buildMoves(child)})`;
      }).join('');
    }
  };

  return `(${sgf}${buildMoves(root)})`;
}

/** Convert RGB string "(r, g, b)" or hex "#RRGGBB" to a CSS color string. */
function parseBgColor(raw: string): string | null {
  const trimmed = raw.trim();
  // "(r, g, b)" format
  const rgbMatch = trimmed.match(/^\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return `rgb(${r},${g},${b})`;
  }
  // "#RRGGBB" or "#RGB" format
  if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function parseInfoString(ctx: MarkdownPostProcessorContext, el: HTMLElement): RgBoardParams {
  let infoLine = '';
  try {
    const info = ctx.getSectionInfo(el);
    if (info) {
      const lines: string[] = info.text.split('\n');
      const startLine: string = lines[info.lineStart] ?? '';
      infoLine = startLine.replace(/^[`~]{3,}\s*\S+/, '');
    }
  } catch (_e) {}

  // bgcolor="(r,g,b)" or bgcolor="#RRGGBB"
  const bgcolorMatch = infoLine.match(/(?:^|\s)bgcolor=(["'])([^"']+)\1/);
  const bgcolor = bgcolorMatch ? parseBgColor(bgcolorMatch[2]) : null;

  return { bgcolor };
}


interface SabakiSGFNode {
  data?: Record<string, string[]>;
  children?: SabakiSGFNode[];
}

interface GobanMarkerData {
  type: "label" | "circle" | "cross" | "triangle" | "square" | "point" | "loader" | null | undefined;
  label?: string;
}

function point2vertex(point: string): { x: number; y: number } {
  if (!point || point.length < 2) return { x: -1, y: -1 };
  const x = point.charCodeAt(0) - 97;
  const y = point.charCodeAt(1) - 97;
  return { x, y };
}

function vertex2point(vertex: [number, number]): string {
  const [x, y] = vertex;
  return String.fromCharCode(97 + x) + String.fromCharCode(97 + y);
}

function getNextPlayer(
  currentNode: SabakiSGFNode,
  allMoves: Array<{ node: SabakiSGFNode; moveNum: number; variations: SabakiSGFNode[] }>,
  moveNumber: number
): 'B' | 'W' {
  if (moveNumber === 0) return 'B';
  const lastMove = allMoves[moveNumber - 1];
  if (lastMove?.node.data) {
    if (lastMove.node.data.B) return 'W';
    if (lastMove.node.data.W) return 'B';
  }
  return 'B';
}

function handleVertexClick(
  vertex: [number, number],
  currentNode: SabakiSGFNode,
  allMoves: Array<{ node: SabakiSGFNode; moveNum: number; variations: SabakiSGFNode[] }>,
  moveNumber: number,
  rebuildMoveTree: () => void,
  mode: string,
  labelText: string
): number | null {
  const point = vertex2point(vertex);

  if (mode === 'move') {
    const nextPlayer = getNextPlayer(currentNode, allMoves, moveNumber);
    const moveProperty = nextPlayer === 'B' ? 'B' : 'W';
    const existingChild = currentNode.children?.find((child: SabakiSGFNode) => {
      const childMove = child.data?.[moveProperty];
      return childMove && Array.isArray(childMove) && childMove[0] === point;
    });
    if (existingChild) return null;
    const newNode: SabakiSGFNode = { data: { [moveProperty]: [point] }, children: [] };
    if (!currentNode.children || currentNode.children.length === 0) {
      currentNode.children = [newNode];
      rebuildMoveTree();
      return moveNumber + 1;
    } else {
      currentNode.children.push(newNode);
      rebuildMoveTree();
      return null;
    }
  } else if (mode === 'black' || mode === 'white') {
    const property = mode === 'black' ? 'AB' : 'AW';
    const oppositeProperty = mode === 'black' ? 'AW' : 'AB';
    if (!currentNode.data) currentNode.data = {};
    if (currentNode.data[property] && currentNode.data[property].includes(point)) {
      currentNode.data[property] = currentNode.data[property].filter((p: string) => p !== point);
    } else {
      if (currentNode.data[oppositeProperty]) {
        currentNode.data[oppositeProperty] = currentNode.data[oppositeProperty].filter((p: string) => p !== point);
      }
      if (!currentNode.data[property]) currentNode.data[property] = [];
      currentNode.data[property].push(point);
    }
    return null;
  } else {
    let property: string;
    let value: string;
    switch (mode) {
      case 'triangle': property = 'TR'; value = point; break;
      case 'square':   property = 'SQ'; value = point; break;
      case 'circle':   property = 'CR'; value = point; break;
      case 'mark':     property = 'MA'; value = point; break;
      case 'label':    property = 'LB'; value = `${point}:${labelText}`; break;
      default: return null;
    }
    if (!currentNode.data) currentNode.data = {};
    let sameMarkerExists = false;
    if (mode === 'label') {
      if (currentNode.data[property]) sameMarkerExists = currentNode.data[property].some((item: string) => item === value);
    } else {
      if (currentNode.data[property]) sameMarkerExists = currentNode.data[property].includes(point);
    }
    if (sameMarkerExists) {
      if (mode === 'label') {
        currentNode.data[property] = currentNode.data[property].filter((item: string) => item !== value);
      } else {
        currentNode.data[property] = currentNode.data[property].filter((p: string) => p !== point);
      }
    } else {
      const markerProperties = ['TR', 'SQ', 'CR', 'MA', 'LB'];
      markerProperties.forEach(prop => {
        if (currentNode.data && currentNode.data[prop]) {
          if (prop === 'LB') {
            currentNode.data[prop] = currentNode.data[prop].filter((item: string) => !item.startsWith(`${point}:`));
          } else {
            currentNode.data[prop] = currentNode.data[prop].filter((p: string) => p !== point);
          }
        }
      });
      if (!currentNode.data[property]) currentNode.data[property] = [];
      currentNode.data[property].push(value);
    }
    return null;
  }
}

function deleteFromCurrentNode(
  rootNode: SabakiSGFNode,
  allMoves: Array<{ node: SabakiSGFNode; moveNum: number; variations: SabakiSGFNode[] }>,
  moveNumber: number,
  rebuildMoveTree: () => void
): number {
  if (moveNumber === 0) {
    if (rootNode.children) rootNode.children = [];
    rebuildMoveTree();
    return 0;
  }
  let parentNode: SabakiSGFNode;
  if (moveNumber === 1) {
    parentNode = rootNode;
  } else {
    parentNode = allMoves[moveNumber - 2].node;
  }
  const currentNode = allMoves[moveNumber - 1].node;
  if (parentNode.children) {
    const index = parentNode.children.indexOf(currentNode);
    if (index !== -1) parentNode.children.splice(index, 1);
  }
  rebuildMoveTree();
  return moveNumber - 1;
}

/**
 * Parse an SGF string and render it with the Sabaki Goban UI.
 * When editMode=true, also display editing controls.
 */
function renderGoBoard(
  app: App,
  container: HTMLElement,
  sgfContent: string,
  editMode: boolean = false,
  ctx?: MarkdownPostProcessorContext,
  initialMove: number = 0,
  bgColor: string = '#DCB35C',
  playMode: boolean = false,
  t: (key: string) => string = (k) => k,
  showMoveNumbersInit: boolean = true,
  markerColors: { onStone: string; onEmpty: string; moveNumOnBlack: string; moveNumOnWhite: string; lastMove: string } = { onStone: '#ff0000', onEmpty: '#222222', moveNumOnBlack: '#ffffff', moveNumOnWhite: '#000000', lastMove: '#00aa00' },
  showCoordinates: boolean = true
): { rerender: () => void } {
  try {
    const gameTrees = sabakiSgf.parse(sgfContent) as SabakiSGFNode[];
    if (!gameTrees || gameTrees.length === 0) throw new Error('No game tree found in SGF');

    const gameTree = gameTrees[0];
    const rootNode = (gameTree as any).root || gameTree;
    if (!rootNode) throw new Error('Could not find root node in game tree');

    const nodeData = rootNode.data || {};
    const sizeProperty = nodeData.SZ;
    // SZ[19] → cols=rows=19, SZ[5:3] → cols=5, rows=3
    const szRaw = sizeProperty ? sizeProperty[0] : '19';
    const szParts = szRaw.split(':');
    const boardCols = parseInt(szParts[0]) || 19;   // Horizontal (column count)
    const boardRows = parseInt(szParts[1] ?? szParts[0]) || boardCols;  // Vertical (row count)

    // Game information
    const gameInfo = {
      black:     nodeData.PB ? nodeData.PB[0] : null,
      white:     nodeData.PW ? nodeData.PW[0] : null,
      blackRank: nodeData.BR ? nodeData.BR[0] : null,
      whiteRank: nodeData.WR ? nodeData.WR[0] : null,
      result:    nodeData.RE ? nodeData.RE[0] : null,
      date:      nodeData.DT ? nodeData.DT[0] : null,
      event:     nodeData.EV ? nodeData.EV[0] : null,
      round:     nodeData.RO ? nodeData.RO[0] : null,
      place:     nodeData.PC ? nodeData.PC[0] : null,
      gameName:  nodeData.GN ? nodeData.GN[0] : null,
      komi:      nodeData.KM ? nodeData.KM[0] : null,
      handicap:  nodeData.HA ? nodeData.HA[0] : null,
      rules:       nodeData.RU ? nodeData.RU[0] : null,
      firstPlayer: nodeData.PL ? nodeData.PL[0] : null,  // 'B' | 'W' | null
    };

    const wrapper = document.createElement('div');
    wrapper.className = 'grboard-wrapper';
    container.appendChild(wrapper);

    const parentElement = container.parentElement;
    let availableContainerWidth = 700;
    if (parentElement) {
      const parentWidth = parentElement.clientWidth || parentElement.offsetWidth;
      if (parentWidth > 0) availableContainerWidth = parentWidth;
    }
    if (availableContainerWidth === 700) {
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const estimatedSidebarWidth = viewportWidth < 768 ? 0 : 350;
      availableContainerWidth = Math.max(300, viewportWidth - estimatedSidebarWidth - 40);
    }
    const containerWidth = Math.min(availableContainerWidth, 700);
    const calculatedVertexSize = 24;

    // Display game information
    if (gameInfo.black || gameInfo.white || gameInfo.event || gameInfo.gameName) {
      const infoSection = document.createElement('div');
      infoSection.className = 'grboard-game-info';
      if (gameInfo.gameName) {
        const titleEl = document.createElement('div');
        titleEl.className = 'game-info-title';
        titleEl.textContent = gameInfo.gameName;
        infoSection.appendChild(titleEl);
      }
      if (gameInfo.event) {
        const eventEl = document.createElement('div');
        eventEl.className = 'game-info-event';
        eventEl.textContent = gameInfo.event + (gameInfo.round ? ` - Round ${gameInfo.round}` : '');
        infoSection.appendChild(eventEl);
      }
      const playersEl = document.createElement('div');
      playersEl.className = 'game-info-players';
      if (gameInfo.black || gameInfo.white) {
        const blackName = gameInfo.black || 'Unknown';
        const whiteName = gameInfo.white || 'Unknown';
        const blackRank = gameInfo.blackRank ? ` (${gameInfo.blackRank})` : '';
        const whiteRank = gameInfo.whiteRank ? ` (${gameInfo.whiteRank})` : '';
        const blackSpan = playersEl.createSpan({ cls: 'player-black' });
        blackSpan.textContent = `⚫ ${blackName}${blackRank}`;
        playersEl.appendText(' vs ');
        const whiteSpan = playersEl.createSpan({ cls: 'player-white' });
        whiteSpan.textContent = `⚪ ${whiteName}${whiteRank}`;
        infoSection.appendChild(playersEl);
      }
      const details = [];
      if (gameInfo.date)     details.push(`Date: ${gameInfo.date}`);
      if (gameInfo.place)    details.push(`Place: ${gameInfo.place}`);
      if (gameInfo.komi)     details.push(`Komi: ${gameInfo.komi}`);
      if (gameInfo.handicap) details.push(`Handicap: ${gameInfo.handicap}`);
      if (gameInfo.rules)    details.push(`Rules: ${gameInfo.rules}`);
      if (gameInfo.result)   details.push(`Result: ${gameInfo.result}`);
      if (details.length > 0) {
        const detailsEl = document.createElement('div');
        detailsEl.className = 'game-info-details';
        detailsEl.textContent = details.join(' • ');
        infoSection.appendChild(detailsEl);
      }
      wrapper.appendChild(infoSection);
    }

    // If PL is present, show a banner above the board
    const plRaw: string | null = gameInfo.firstPlayer;
    const ruRaw: string | null = gameInfo.rules;
    if (plRaw) {
      const bannerEl = document.createElement('h3');
      bannerEl.className = 'grboard-pl-banner';
      bannerEl.style.cssText =
        'color:var(--text-muted);margin-bottom:4px;display:flex;gap:10px;align-items:center;';
      const plSpan = document.createElement('span');
        plSpan.textContent = '🧩' + (plRaw === 'W' ? t('sgfPLInfoWhite') : t('sgfPLInfoBlack'));
      plSpan.style.fontWeight = 'bold';
      bannerEl.appendChild(plSpan);

      if (ruRaw) {
        const ruSpan = document.createElement('span');
        ruSpan.textContent = ruRaw;
        bannerEl.appendChild(ruSpan);
      }
      wrapper.appendChild(bannerEl);
    }

    const autoPlayContainerPlaceholder = document.createElement('div');
    autoPlayContainerPlaceholder.className = 'grboard-autoplay-placeholder';
    wrapper.appendChild(autoPlayContainerPlaceholder);

    const boardContainer = document.createElement('div');
    boardContainer.className = 'grboard-display';
    boardContainer.style.setProperty('--grboard-bg-color', bgColor);
    boardContainer.style.setProperty('--grboard-marker-color', markerColors.onStone);
    boardContainer.style.setProperty('--grboard-marker-empty-color', markerColors.onEmpty);
    boardContainer.style.setProperty('--grboard-lastmove-color', markerColors.lastMove);
    boardContainer.style.setProperty('--grboard-movenum-black-color', markerColors.moveNumOnBlack);
    boardContainer.style.setProperty('--grboard-movenum-white-color', markerColors.moveNumOnWhite);
    wrapper.appendChild(boardContainer);

    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'grboard-controls';
    wrapper.appendChild(controlsContainer);

    const commentDisplayContainer = document.createElement('div');
    commentDisplayContainer.className = 'grboard-comment-display-container';
    wrapper.appendChild(commentDisplayContainer);

    interface MoveNode {
      node: SabakiSGFNode;
      moveNum: number;
      variations: SabakiSGFNode[];
    }

    const allMoves: MoveNode[] = [];
    let currentVariationPath: number[] = [];
    let rootVariationIndex: number = 0;

    const buildMoveTree = (startNode: SabakiSGFNode, path: number[] = []): MoveNode[] => {
      const moves: MoveNode[] = [];
      let current = startNode;
      while (current) {
        const data = current.data || {};
        if (data.B || data.W) {
          moves.push({ node: current, moveNum: moves.length + 1, variations: current.children || [] });
          if (current.children && Array.isArray(current.children) && current.children.length > 0) {
            const pathIndex = path[moves.length - 1] || 0;
            const childIndex = Math.min(pathIndex, current.children.length - 1);
            current = current.children[childIndex];
          } else { break; }
        } else {
          if (current.children && Array.isArray(current.children) && current.children.length > 0) {
            current = current.children[0];
          } else { break; }
        }
      }
      return moves;
    };

    const rebuildMoveTree = () => {
      let startNode = rootNode;
      if (rootNode?.children && rootNode.children.length > rootVariationIndex) {
        startNode = rootNode.children[rootVariationIndex];
      }
      const moves = buildMoveTree(startNode, currentVariationPath);
      allMoves.length = 0;
      allMoves.push(...moves);
    };

    rebuildMoveTree();
    let moveNumber = initialMove;

    const getSGFMarkers = (): (GobanMarkerData | null)[][] => {
      const showMoveNumbers = getShowMoveNumbers();  // Fetch the latest value each time
      const markerMap: (GobanMarkerData | null)[][] = [];
      for (let i = 0; i < boardRows; i++) markerMap[i] = new Array(boardCols).fill(null);

      let currentNodeData: Record<string, string[]> = {};
      if (moveNumber === 0) currentNodeData = rootNode?.data || {};
      else if (moveNumber > 0 && moveNumber <= allMoves.length)
        currentNodeData = allMoves[moveNumber - 1].node?.data || {};

      if (playMode) {
        if (showMoveNumbers) {
          // Move numbers ON: show labels on all moves (excluding captured stones)
          const currentSignMap = getBoardState();
          for (let i = 0; i < playMoveIndex; i++) {
            const pm = playMoves[i];
            const c = point2vertex(pm.point);
            if (c.x < 0 || c.y < 0 || c.x >= boardCols || c.y >= boardRows) continue;
            const stoneColor: 1 | -1 = pm.color === 'B' ? 1 : -1;
            if (currentSignMap[c.y][c.x] !== stoneColor) continue;
            markerMap[c.y][c.x] = { type: 'label', label: String(i + 1) };
          }
        } else if (playMoveIndex > 0) {
          // Move numbers OFF: circle marker on latest move only
          const lastPm = playMoves[playMoveIndex - 1];
          const c = point2vertex(lastPm.point);
          if (c.x >= 0 && c.y >= 0 && c.x < boardCols && c.y < boardRows) {
            markerMap[c.y][c.x] = { type: 'circle' };
            (boardContainer as any)._lastMovePos = [c.x, c.y];
          } else {
            (boardContainer as any)._lastMovePos = null;
          }
        } else {
          (boardContainer as any)._lastMovePos = null;
        }
      } else if (moveNumber > 0 && moveNumber <= allMoves.length) {
        // Normal mode: marker on the last move in allMoves
        const lastMoveData = allMoves[moveNumber - 1].node?.data || {};
        let lastMoveVertex: [number, number] | null = null;
        if (lastMoveData.B?.[0]) {
          const c = point2vertex(lastMoveData.B[0]);
          if (c.x >= 0 && c.y >= 0 && c.x < boardCols && c.y < boardRows) lastMoveVertex = [c.x, c.y];
        } else if (lastMoveData.W?.[0]) {
          const c = point2vertex(lastMoveData.W[0]);
          if (c.x >= 0 && c.y >= 0 && c.x < boardCols && c.y < boardRows) lastMoveVertex = [c.x, c.y];
        }
        if (lastMoveVertex) {
          markerMap[lastMoveVertex[1]][lastMoveVertex[0]] = { type: 'circle' };
          (boardContainer as any)._lastMovePos = lastMoveVertex; // [x, y]
        } else {
          (boardContainer as any)._lastMovePos = null;
        }
      }

      const addMarker = (points: string[], type: GobanMarkerData['type']) => {
        (Array.isArray(points) ? points : [points]).forEach((pt: string) => {
          const c = point2vertex(pt);
          if (c.x >= 0 && c.y >= 0 && c.x < boardCols && c.y < boardRows)
            markerMap[c.y][c.x] = { type };
        });
      };

      if (currentNodeData.TR) addMarker(currentNodeData.TR, 'triangle');
      if (currentNodeData.SQ) addMarker(currentNodeData.SQ, 'square');
      if (currentNodeData.CR) addMarker(currentNodeData.CR, 'circle');
      if (currentNodeData.MA) addMarker(currentNodeData.MA, 'point');

      // LB rendering: in view mode, if all nodes have only numeric labels,
      // accumulate LB up to moveNumber (functioning as move numbers)
      const applyLB = (lbData: string[]) => {
        (Array.isArray(lbData) ? lbData : [lbData]).forEach((labelData: string) => {
          const match = labelData.match(/^([a-z]{2}):(.+)$/);
          if (match) {
            const c = point2vertex(match[1]);
            if (c.x >= 0 && c.y >= 0 && c.x < boardCols && c.y < boardRows)
              markerMap[c.y][c.x] = { type: 'label', label: match[2] };
          }
        });
      };
      if (!playMode && !editMode && moveNumber > 0) {
        // View mode: collect all LB values from nodes up to moveNumber
        // If all labels are numeric, treat as move-number mode and display cumulatively
        const allLBs: string[] = [];
        for (let ni = 0; ni < moveNumber && ni < allMoves.length; ni++) {
          const nd = allMoves[ni].node?.data;
          if (nd?.LB) allLBs.push(...(Array.isArray(nd.LB) ? nd.LB : [nd.LB]));
        }
        const allAreNumbers = allLBs.length > 0 && allLBs.every(lb => /^[a-z]{2}:\d+$/.test(lb));
        if (allAreNumbers) {
          applyLB(allLBs);
        } else if (currentNodeData.LB) {
          applyLB(Array.isArray(currentNodeData.LB) ? currentNodeData.LB : [currentNodeData.LB]);
        }
      } else if (currentNodeData.LB) {
        applyLB(Array.isArray(currentNodeData.LB) ? currentNodeData.LB : [currentNodeData.LB]);
      }

      let variationSource: SabakiSGFNode | null = null;
      if (moveNumber === 0) variationSource = rootNode;
      else if (moveNumber > 0 && moveNumber <= allMoves.length) variationSource = allMoves[moveNumber - 1].node;

      if (variationSource?.children && variationSource.children.length > 1) {
        variationSource.children.forEach((variation: SabakiSGFNode, index: number) => {
          const firstMove = variation.data?.B || variation.data?.W;
          if (firstMove && Array.isArray(firstMove) && firstMove[0]) {
            const c = point2vertex(firstMove[0]);
            if (c.x >= 0 && c.y >= 0 && c.x < boardCols && c.y < boardRows && !markerMap[c.y][c.x]) {
              markerMap[c.y][c.x] = { type: 'label', label: String.fromCharCode(65 + index) };
            }
          }
        });
      }

      return markerMap;
    };

    const hasLiberties = (signMap: (0|1|-1)[][], x: number, y: number, color: 1|-1, visited: boolean[][]): boolean => {
      if (x < 0 || y < 0 || x >= boardCols || y >= boardRows) return false;
      if (visited[y][x]) return false;
      visited[y][x] = true;
      if (signMap[y][x] === 0) return true;
      if (signMap[y][x] !== color) return false;
      return hasLiberties(signMap, x+1, y, color, visited) || hasLiberties(signMap, x-1, y, color, visited) ||
             hasLiberties(signMap, x, y+1, color, visited) || hasLiberties(signMap, x, y-1, color, visited);
    };

    const removeGroup = (signMap: (0|1|-1)[][], x: number, y: number, color: 1|-1): void => {
      if (x < 0 || y < 0 || x >= boardCols || y >= boardRows || signMap[y][x] !== color) return;
      signMap[y][x] = 0;
      removeGroup(signMap, x+1, y, color); removeGroup(signMap, x-1, y, color);
      removeGroup(signMap, x, y+1, color); removeGroup(signMap, x, y-1, color);
    };

    const removeCapturedStones = (signMap: (0|1|-1)[][], lastX: number, lastY: number, lastColor: 1|-1): void => {
      const opponentColor: 1|-1 = lastColor === 1 ? -1 : 1;
      [{x:lastX+1,y:lastY},{x:lastX-1,y:lastY},{x:lastX,y:lastY+1},{x:lastX,y:lastY-1}].forEach(n => {
        if (n.x >= 0 && n.y >= 0 && n.x < boardCols && n.y < boardRows && signMap[n.y][n.x] === opponentColor) {
          const visited: boolean[][] = Array.from({length:boardRows}, () => new Array(boardCols).fill(false));
          if (!hasLiberties(signMap, n.x, n.y, opponentColor, visited)) removeGroup(signMap, n.x, n.y, opponentColor);
        }
      });
    };

    // GM[1]=Go only: perform stone capture (skip for Renju/Gomoku GM[4])
    const isGo = (rootNode?.data?.GM?.[0] ?? '1') === '1';

    const getBoardState = (): (0|1|-1)[][] => {
      const signMap: (0|1|-1)[][] = Array.from({length:boardRows}, () => new Array(boardCols).fill(0) as (0|1|-1)[]);
      const rootData = rootNode?.data || {};

      const placeSetup = (prop: string, val: 0|1|-1) => {
        const stones = rootData[prop];
        if (!stones) return;
        (Array.isArray(stones) ? stones : [stones]).forEach((pt: string) => {
          const c = point2vertex(pt);
          if (c.x >= 0 && c.y >= 0 && c.x < boardCols && c.y < boardRows) signMap[c.y][c.x] = val;
        });
      };
      placeSetup('AB', 1); placeSetup('AW', -1); placeSetup('AE', 0);

      if (!playMode) {
        // Normal mode: apply moves from SGF tree in order
        for (let i = 0; i < moveNumber && i < allMoves.length; i++) {
          const moveNode = allMoves[i];
          if (!moveNode?.node) continue;
          const data = moveNode.node.data || {};
          const move = data.B || data.W;
          const color: 1|-1 = data.B ? 1 : -1;
          if (move && Array.isArray(move) && move[0] && move[0] !== '') {
            const c = point2vertex(move[0]);
            if (c.x >= 0 && c.y >= 0 && c.x < boardCols && c.y < boardRows) {
              signMap[c.y][c.x] = color;
              if (isGo) removeCapturedStones(signMap, c.x, c.y, color);
            }
          }
          if (data.AB) (Array.isArray(data.AB) ? data.AB : [data.AB]).forEach((pt: string) => {
            const c = point2vertex(pt);
            if (c.x >= 0 && c.y >= 0 && c.x < boardCols && c.y < boardRows) signMap[c.y][c.x] = 1;
          });
          if (data.AW) (Array.isArray(data.AW) ? data.AW : [data.AW]).forEach((pt: string) => {
            const c = point2vertex(pt);
            if (c.x >= 0 && c.y >= 0 && c.x < boardCols && c.y < boardRows) signMap[c.y][c.x] = -1;
          });
          if (data.AE) (Array.isArray(data.AE) ? data.AE : [data.AE]).forEach((pt: string) => {
            const c = point2vertex(pt);
            if (c.x >= 0 && c.y >= 0 && c.x < boardCols && c.y < boardRows) signMap[c.y][c.x] = 0;
          });
        }
      } else {
        // Play mode: apply playMoves in order (including capture handling)
        for (let i = 0; i < playMoveIndex; i++) {
          const pm = playMoves[i];
          const c = point2vertex(pm.point);
          if (c.x >= 0 && c.y >= 0 && c.x < boardCols && c.y < boardRows) {
            const color: 1|-1 = pm.color === 'B' ? 1 : -1;
            signMap[c.y][c.x] = color;
            if (isGo) removeCapturedStones(signMap, c.x, c.y, color);
          }
        }
      }
      return signMap;
    };

    let zoomApplied = false;
    let currentMode = 'move';
    let currentLabelText = 'A';
    let playTurnLabelUpdater: (() => void) | null = null;
    // showMoveNumbers can be changed dynamically from outside (chkMove),
    // so container._showMoveNumbers is read with priority
    const getShowMoveNumbers = () =>
      (container as any)._showMoveNumbers !== undefined
        ? (container as any)._showMoveNumbers
        : showMoveNumbersInit;

    // Move history for play mode only (managed independently from SGF source data)
    interface PlayMove { color: 'B' | 'W'; point: string; }
    const playMoves: PlayMove[] = [];
    let playMoveIndex = 0;  // Current number of moves displayed

    // Pre-load existing SGF moves into playMoves when play mode starts
    // playMoveIndex starts at 0; use 'Next' to step through existing moves
    if (playMode) {
      for (const mv of allMoves) {
        const data = mv.node?.data || {};
        const bPt = data.B?.[0]; const wPt = data.W?.[0];
        if (bPt !== undefined && bPt !== '') playMoves.push({ color: 'B', point: bPt });
        else if (wPt !== undefined && wPt !== '') playMoves.push({ color: 'W', point: wPt });
      }
      // Keep playMoveIndex = 0: use 'Next' to step through existing moves one by one
    }

    const renderBoard = () => {
      const signMap = getBoardState();

      let currentNode: SabakiSGFNode;
      if (moveNumber === 0) currentNode = rootNode;
      else if (moveNumber > 0 && moveNumber <= allMoves.length) currentNode = allMoves[moveNumber - 1].node;
      else currentNode = rootNode;

      let comment = '';
      let hasVariations = false;
      if (moveNumber === 0) {
        comment = rootNode?.data?.C?.[0] ?? '';
        hasVariations = Boolean(rootNode?.children && rootNode.children.length > 1);
      } else if (allMoves && moveNumber > 0 && moveNumber <= allMoves.length) {
        const moveNode = allMoves[moveNumber - 1];
        comment = moveNode.node?.data?.C?.[0] ?? '';
        hasVariations = Boolean(moveNode.node?.children && moveNode.node.children.length > 1);
      }

      const markerMap = getSGFMarkers();
      const emptyPaintMap: (0|1|-1)[][] = Array.from({length:boardRows}, () => new Array(boardCols).fill(0) as (0|1|-1)[]);

      const gobanProps: any = {
        vertexSize: calculatedVertexSize,
        signMap,
        dimmedVertices: [],
        markerMap,
        paintMap: emptyPaintMap,
        showCoordinates: showCoordinates,
        busy: false,
        fuzzyStonePlacement: false,
        animateStonePlacement: false,
      };

      if (editMode) {
        gobanProps.onVertexClick = (_evt: MouseEvent, vertex: [number, number]) => {
          const newMoveNumber = handleVertexClick(vertex, currentNode, allMoves, moveNumber, rebuildMoveTree, currentMode, currentLabelText);
          if (newMoveNumber !== null) moveNumber = newMoveNumber;
          renderBoard();
        };
      } else if (playMode) {
        gobanProps.onVertexClick = (_evt: MouseEvent, vertex: [number, number]) => {
          const [vx, vy] = vertex;
          // Ignore intersections that already have a stone
          if (signMap[vy]?.[vx] !== 0) return;
          // Compute the next turn (first move determined by PL property, then alternate)
          const plVal: string = rootNode.data?.PL?.[0] ?? 'B';
          const nextColor: 'B' | 'W' = (playMoveIndex === 0)
            ? (plVal === 'W' ? 'W' : 'B')
            : (playMoves[playMoveIndex - 1].color === 'B' ? 'W' : 'B');
          const point = vertex2point(vertex);
          // Discard history beyond playMoveIndex and add the new move
          playMoves.splice(playMoveIndex);
          playMoves.push({ color: nextColor, point });
          playMoveIndex++;
          renderBoard();
          if (playTurnLabelUpdater) playTurnLabelUpdater();
        };
      }

      preactRender(h(Goban, gobanProps), boardContainer);

      // ── Assign marker colors via DOM traversal ──
      // Actual shudan DOM structure:
      //   <div class="shudan-vertex shudan-sign_1 shudan-marker_label">  ← vertex
      //     <div class="shudan-marker">3</div>                           ← marker element
      //   </div>
      // shudan-label / shudan-circle etc. are set on the vertex, not on the marker element itself
      // ── Set marker colors directly via JS style (completely avoids CSS !important conflicts) ──
      requestAnimationFrame(() => {
        const lastMovePos = (boardContainer as any)._lastMovePos as [number, number] | null;
        const mc = markerColors; // Capture in closure
        boardContainer.querySelectorAll('.shudan-vertex').forEach((vtxEl) => {
          const vtx = vtxEl as HTMLElement;
          const isBlackStone  = vtx.classList.contains('shudan-sign_1');
          const isWhiteStone  = vtx.classList.contains('shudan-sign_-1');
          const isEmptyVertex = !isBlackStone && !isWhiteStone;
          const isLabel       = vtx.classList.contains('shudan-marker_label');
          const isCircle      = vtx.classList.contains('shudan-marker_circle');
          const markerEl = vtx.querySelector('.shudan-marker') as HTMLElement | null;
          if (!markerEl) return;

          const dx = parseInt(vtx.dataset.x ?? '-1', 10);
          const dy = parseInt(vtx.dataset.y ?? '-1', 10);
          const isLastMove = isCircle && lastMovePos !== null &&
                             dx === lastMovePos[0] && dy === lastMovePos[1];

          let color: string;
          if (isLastMove) {
            color = mc.lastMove;
          } else if (isEmptyVertex) {
            color = mc.onEmpty;
          } else if (isLabel) {
            const isMoveNum = /^\d+$/.test((markerEl.textContent ?? '').trim());
            color = isMoveNum
              ? (isBlackStone ? mc.moveNumOnBlack : mc.moveNumOnWhite)
              : mc.onStone;
          } else {
            // circle / triangle / square / cross (symbol on stone)
            color = isEmptyVertex ? mc.onEmpty : mc.onStone;
          }

          // Labels (div text) are controlled via color
          markerEl.style.setProperty('color', color, 'important');
          // ::before (SVG fallback text) inherits color, but set explicitly for safety
          // ::before cannot be set directly from JS, so CSS variables are used instead
          vtx.style.setProperty('--mk-color', color);
        });
      });

      // Save board info to boardArea for PNG export
      (boardContainer as any)._signMap = signMap;
      (boardContainer as any)._boardCols = boardCols;
      (boardContainer as any)._boardRows = boardRows;
      (boardContainer as any)._bgColor = bgColor;
      (boardContainer as any)._markerMap = markerMap;
      (boardContainer as any)._markerColors = markerColors;
      // Save playMoves/playMoveIndex (for independent move-number computation during PNG rendering)
      if (playMode) {
        (boardContainer as any)._playMoves = playMoves.slice(0, playMoveIndex);
        (boardContainer as any)._isPlayMode = true;
      } else {
        (boardContainer as any)._isPlayMode = false;
      }

      if (!zoomApplied) {
        const applyZoom = () => {
          const gobanElement = boardContainer.querySelector('.shudan-goban') as HTMLElement;
          if (!gobanElement) return;
          (gobanElement as any).setCssProps?.({ zoom: '1' });
          void gobanElement.offsetHeight;
          const naturalWidth = gobanElement.scrollWidth || gobanElement.offsetWidth;
          const availableWidth = containerWidth - 32;
          if (naturalWidth > availableWidth) {
            const zoomFactor = availableWidth / naturalWidth;
            (gobanElement as any).setCssProps?.({ zoom: `${zoomFactor}` });
          } else {
            (gobanElement as any).setCssProps?.({ zoom: '1' });
          }
          zoomApplied = true;
        };
        setTimeout(applyZoom, 100);
      }

      // Variation marker styling
      setTimeout(() => {
        let variationSource: SabakiSGFNode | null = null;
        if (moveNumber === 0) variationSource = rootNode;
        else if (moveNumber > 0 && moveNumber <= allMoves.length) variationSource = allMoves[moveNumber - 1].node;
        if (variationSource?.children && variationSource.children.length > 1) {
          variationSource.children.forEach((variation: SabakiSGFNode, index: number) => {
            const firstMove = variation.data?.B || variation.data?.W;
            if (firstMove && Array.isArray(firstMove) && firstMove[0]) {
              const c = point2vertex(firstMove[0]);
              if (c.x >= 0 && c.y >= 0 && c.x < boardCols && c.y < boardRows) {
                const vertices = boardContainer.querySelectorAll('.shudan-vertex');
                const targetIndex = c.y * boardCols + c.x;
                if (vertices[targetIndex]) {
                  const marker = vertices[targetIndex].querySelector('.shudan-marker');
                  if (marker) marker.classList.add('variation-marker');
                }
              }
            }
          });
        }
      }, 10);

      // Move info (hidden in play mode)
      if (!playMode) {
        const totalMoves = allMoves?.length ?? 0;
        const existingInfo = controlsContainer.querySelector('.grboard-info');
        if (existingInfo) existingInfo.remove();
        const infoDiv = controlsContainer.createDiv({ cls: 'grboard-info' });
        const moveDiv = infoDiv.createDiv();
        const moveLabelStrong = moveDiv.createEl('strong');
        moveLabelStrong.textContent = 'Move:';
        moveDiv.appendText(` ${moveNumber} / ${totalMoves}`);
        if (hasVariations) {
          const variationSpan = moveDiv.createSpan({ cls: 'variation-indicator' });
          variationSpan.textContent = '(has variations)';
        }
        controlsContainer.insertBefore(infoDiv, controlsContainer.firstChild);
      }

      // Comment display (hidden in play mode)
      commentDisplayContainer.empty();
      if (!playMode && comment) {
        const commentDiv = commentDisplayContainer.createDiv({ cls: 'grboard-comment' });
        commentDiv.textContent = comment;
      }

      // Edit mode controls
      if (editMode) {
        const existingModeSelector = controlsContainer.querySelector('.grboard-mode-selector');
        if (existingModeSelector) existingModeSelector.remove();

        const modeSelectorContainer = controlsContainer.createDiv({ cls: 'grboard-mode-selector' });
        const modeLabel = modeSelectorContainer.createEl('strong');
        modeLabel.textContent = 'Click mode: ';

        const modeSelect = modeSelectorContainer.createEl('select') as HTMLSelectElement;
        modeSelect.className = 'grboard-mode-select';
        [
          { value: 'move', label: 'Move' },
          { value: 'black', label: 'Black Stone' },
          { value: 'white', label: 'White Stone' },
          { value: 'triangle', label: 'Triangle' },
          { value: 'square', label: 'Square' },
          { value: 'circle', label: 'Circle' },
          { value: 'mark', label: 'Mark (X)' },
          { value: 'label', label: 'Label' },
        ].forEach(m => {
          const option = modeSelect.createEl('option');
          option.value = m.value;
          option.textContent = m.label;
        });
        modeSelect.value = currentMode;

        const labelInputContainer = modeSelectorContainer.createDiv({ cls: 'grboard-label-input-container' });
        if (currentMode !== 'label') labelInputContainer.addClass('hidden');
        labelInputContainer.createEl('span').textContent = ' Text: ';
        const labelInput = labelInputContainer.createEl('input') as HTMLInputElement;
        labelInput.type = 'text'; labelInput.className = 'grboard-label-input'; labelInput.maxLength = 3; labelInput.value = currentLabelText;

        modeSelect.addEventListener('change', () => {
          currentMode = modeSelect.value;
          if (modeSelect.value === 'label') labelInputContainer.removeClass('hidden');
          else labelInputContainer.addClass('hidden');
        });
        labelInput.addEventListener('input', () => { currentLabelText = labelInput.value || 'A'; });

        // Comment editor
        const existingCommentEditor = controlsContainer.querySelector('.grboard-comment-editor');
        if (existingCommentEditor) existingCommentEditor.remove();
        const commentEditor = controlsContainer.createDiv({ cls: 'grboard-comment-editor' });
        commentEditor.createEl('strong').textContent = 'Comment for current position';
        const commentTextarea = commentEditor.createEl('textarea') as HTMLTextAreaElement;
        commentTextarea.className = 'grboard-comment-edit';
        commentTextarea.value = comment;
        commentTextarea.placeholder = 'Enter comment for this position';
        const nodeToEdit = currentNode;
        const saveCommentBtn = commentEditor.createEl('button');
        saveCommentBtn.className = 'grboard-btn grboard-btn-save';
        saveCommentBtn.textContent = '💾 save comment';
        saveCommentBtn.onclick = () => {
          if (!nodeToEdit.data) nodeToEdit.data = {};
          if (commentTextarea.value.trim()) nodeToEdit.data.C = [commentTextarea.value];
          else delete nodeToEdit.data.C;
          renderBoard();
          saveCommentBtn.textContent = '✓ saved';
          setTimeout(() => { saveCommentBtn.textContent = '💾 save comment'; }, 1000);
        };

        // Game information editor
        const existingGameInfoEditor = controlsContainer.querySelector('.grboard-game-info-editor');
        if (existingGameInfoEditor) existingGameInfoEditor.remove();
        const gameInfoEditor = controlsContainer.createDiv({ cls: 'grboard-game-info-editor' });
        gameInfoEditor.createEl('strong').textContent = 'Game information';
        const gameInfoGrid = gameInfoEditor.createDiv({ cls: 'game-info-grid' });
        const gameInfoInputs: HTMLInputElement[] = [];
        const createInfoInput = (label: string, property: string, placeholder: string) => {
          const row = gameInfoGrid.createDiv({ cls: 'game-info-row' });
          row.createEl('label').textContent = label + ':';
          const input = row.createEl('input') as HTMLInputElement;
          input.type = 'text'; input.placeholder = placeholder;
          input.value = rootNode.data?.[property]?.[0] || '';
          input.dataset.property = property;
          gameInfoInputs.push(input);
        };

        [
          ['Black player','PB','Player name'],['Black rank','BR','e.g. 5d'],
          ['White player','PW','Player name'],['White rank','WR','e.g. 3d'],
          ['Game name','GN','Game title'],['Event','EV','Tournament name'],
          ['Round','RO','Round number'],['Date','DT','YYYY-MM-DD'],
          ['Place','PC','Location'],['Komi','KM','e.g. 6.5'],
          ['Handicap','HA','Number of stones'],['Result','RE','e.g. B+3.5'],['Rules','RU','e.g. Puzzle info'],
        ].forEach(([l,p,ph]) => createInfoInput(l,p,ph));

        // PL (First move) dropdown — placed after Rules (at the end)
        const plEditRow = gameInfoGrid.createDiv({ cls: 'game-info-row' });
        plEditRow.createEl('label').textContent = t('sgfPLLabel') + ':';
        const plEditSel = plEditRow.createEl('select') as HTMLSelectElement;
        plEditSel.style.cssText = 'flex:1;background:var(--background-primary);border:1px solid var(--background-modifier-border);color:var(--text-normal);padding:2px 6px;border-radius:3px;font-size:0.8rem;';
        (() => { const o = plEditSel.createEl('option') as HTMLOptionElement; o.value = ''; o.text = '—'; })();
        (() => { const o = plEditSel.createEl('option') as HTMLOptionElement; o.value = 'B'; o.text = t('sgfPLBlack'); })();
        (() => { const o = plEditSel.createEl('option') as HTMLOptionElement; o.value = 'W'; o.text = t('sgfPLWhite'); })();
        // Set the current PL value as default
        plEditSel.value = rootNode.data?.PL?.[0] || '';
        // SGF output (declare sgfTextarea first so saveGameInfoBtn can reference it)
        const existingSgfOutput = controlsContainer.querySelector('.grboard-sgf-output');
        if (existingSgfOutput) existingSgfOutput.remove();
        const sgfOutputContainer = controlsContainer.createDiv({ cls: 'grboard-sgf-output' });
        sgfOutputContainer.createEl('strong').textContent = 'Output';
        const sgfTextarea = sgfOutputContainer.createEl('textarea') as HTMLTextAreaElement;
        sgfTextarea.className = 'grboard-sgf-textarea';
        sgfTextarea.readOnly = true;
        sgfTextarea.value = buildSGFString(rootNode);

        const saveGameInfoBtn = gameInfoEditor.createEl('button');
        saveGameInfoBtn.className = 'grboard-btn grboard-btn-save';
        saveGameInfoBtn.textContent = '💾 save game info';
        saveGameInfoBtn.onclick = () => {
          if (!rootNode.data) rootNode.data = {};
          // Save PL dropdown value (delete if blank)
          const plVal = plEditSel.value;
          if (plVal) rootNode.data['PL'] = [plVal];
          else delete rootNode.data['PL'];
          // Save other text fields
          gameInfoInputs.forEach(input => {
            const property = input.dataset.property;
            if (property && rootNode.data) {
              if (input.value.trim()) rootNode.data[property] = [input.value];
              else delete rootNode.data[property];
            }
          });
          // rootNode.data updated; immediately refresh sgfTextarea
          sgfTextarea.value = buildSGFString(rootNode);
          saveGameInfoBtn.textContent = '✓ saved';
          setTimeout(() => { saveGameInfoBtn.textContent = '💾 save game info'; }, 1000);
        };

        // Delete button
        const existingDeleteBtn = controlsContainer.querySelector('.grboard-delete-container');
        if (existingDeleteBtn) existingDeleteBtn.remove();
        const deleteContainer = controlsContainer.createDiv({ cls: 'grboard-delete-container' });
        const btnDeleteFromHere = deleteContainer.createEl('button');
        btnDeleteFromHere.className = 'grboard-btn grboard-btn-delete';
        btnDeleteFromHere.textContent = '🗑 delete from here';
        btnDeleteFromHere.onclick = () => {
          const newMoveNumber = deleteFromCurrentNode(rootNode, allMoves, moveNumber, rebuildMoveTree);
          moveNumber = newMoveNumber;
          renderBoard();
        };
        const btnContainer2 = sgfOutputContainer.createDiv({ cls: 'grboard-sgf-buttons' });
        if (ctx) {
          const writeBtn = btnContainer2.createEl('button');
          writeBtn.className = 'grboard-btn grboard-btn-write';
          writeBtn.textContent = '💾 write to note';
          writeBtn.onclick = async () => {
            // Copy content to variable first (DOM may be rebuilt after vault.modify)
            const sgfToWrite = sgfTextarea.value;
            if (!sgfToWrite) return;

            // Timer to reset button immediately (set short to handle DOM removal)
            const resetBtn = () => {
              try {
                writeBtn.textContent = '💾 write to note';
                writeBtn.disabled = false;
              } catch (_) { /* DOMが消えていた場合は無視 */ }
            };
            // Always reset after 3 seconds (fallback)
            const fallbackTimer = setTimeout(resetBtn, 3000);

            writeBtn.textContent = '⏳ writing...';
            writeBtn.disabled = true;

            try {
              const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
              if (!(file instanceof TFile)) {
                clearTimeout(fallbackTimer);
                resetBtn();
                return;
              }
              const fileContent = await app.vault.read(file);
              const regex = /(```grboard[^\n]*\n)[\s\S]*?\n```/i;
              if (!regex.test(fileContent)) {
                clearTimeout(fallbackTimer);
                try { writeBtn.textContent = '✗ block not found'; writeBtn.disabled = false; } catch (_) {}
                setTimeout(resetBtn, 2000);
                return;
              }
              // Use getSectionInfo to get the exact line range of this block
              // Replace only the target block (supports multiple grboard blocks)
              const sectionInfo = ctx.getSectionInfo(container.parentElement ?? container);
              let newContent: string;
              if (sectionInfo) {
                const lines = fileContent.split('\n');
                // lineStart = opening fence line, lineEnd = closing fence line
                const newLines = [
                  ...lines.slice(0, sectionInfo.lineStart + 1),  // Include the opening fence line
                  sgfToWrite,
                  ...lines.slice(sectionInfo.lineEnd),            // From the closing fence line onward
                ];
                newContent = newLines.join('\n');
              } else {
                // Fallback: replace the first matched block
                const regex = /(```grboard[^\n]*\n)[\s\S]*?\n```/i;
                newContent = fileContent.replace(regex, (_match: string, fence: string) => {
                  return fence + sgfToWrite + '\n```';
                });
              }
              clearTimeout(fallbackTimer);
              // Record the absolute position of this code block before writing
              const blockTop = (() => {
                let top = 0;
                let el: HTMLElement | null = container.parentElement;
                while (el) {
                  top += el.offsetTop;
                  el = el.offsetParent as HTMLElement | null;
                }
                return top;
              })();
              // Identify the scroll container
              const scrollEl = (() => {
                let el: HTMLElement | null = container.parentElement;
                while (el) {
                  const ov = window.getComputedStyle(el).overflowY;
                  if (ov === 'auto' || ov === 'scroll') return el;
                  el = el.parentElement;
                }
                return document.documentElement as HTMLElement;
              })();
              await app.vault.modify(file, newContent);
              resetBtn();
              // Scroll to block top after re-render (two-step)
              const scrollToBlock = () => {
                try { scrollEl.scrollTop = blockTop; } catch (_) {}
              };
              setTimeout(scrollToBlock, 150);
              setTimeout(scrollToBlock, 500);
            } catch (error) {
              clearTimeout(fallbackTimer);
              resetBtn();
            }
          };
        }
      }

      // Variation selector UI
      let variationContainer = controlsContainer.querySelector('.grboard-variations');
      if (variationContainer) variationContainer.remove();
      if (hasVariations) {
        let variations: SabakiSGFNode[] = [];
        let pathIndex = -1;
        if (moveNumber === 0) {
          variations = rootNode?.children || [];
        } else if (moveNumber > 0 && moveNumber <= allMoves.length) {
          const moveNode = allMoves[moveNumber - 1];
          variations = moveNode.node?.children || [];
          pathIndex = moveNumber - 1;
        }
        if (variations.length > 1) {
          const varContainer = document.createElement('div');
          varContainer.className = 'grboard-variations';
          const label = document.createElement('div');
          label.className = 'grboard-variations-label';
          label.textContent = 'Select variation:';
          varContainer.appendChild(label);
          const btnGroup = document.createElement('div');
          btnGroup.className = 'grboard-variations-buttons';
          const currentVariationIndex = moveNumber === 0 ? rootVariationIndex : (pathIndex >= 0 ? (currentVariationPath[pathIndex] || 0) : 0);
          variations.forEach((_variation: SabakiSGFNode, index: number) => {
            const btn = document.createElement('button');
            btn.className = 'grboard-variation-btn' + (index === currentVariationIndex ? ' selected' : '');
            btn.textContent = String.fromCharCode(65 + index);
            btn.onclick = () => {
              if (moveNumber === 0) {
                rootVariationIndex = index;
                currentVariationPath = [];
                moveNumber = 0;
              } else if (pathIndex >= 0) {
                currentVariationPath[pathIndex] = index;
              }
              rebuildMoveTree();
              renderBoard();
            };
            btnGroup.appendChild(btn);
          });
          varContainer.appendChild(btnGroup);
          const btnGroupEl = controlsContainer.querySelector('.grboard-btn-group');
          controlsContainer.insertBefore(varContainer, btnGroupEl);
        }
      }
    };

    // Navigation buttons
    const createButton = (text: string, onClick: () => void) => {
      const btn = document.createElement('button');
      btn.className = 'grboard-btn';
      btn.textContent = text;
      btn.onclick = () => { onClick(); renderBoard(); };
      return btn;
    };

    const btnFirst = createButton(t('sgfBtnFirst'), () => { moveNumber = 0; });
    const btnPrev  = createButton(t('sgfBtnPrev'),  () => { if (moveNumber > 0) moveNumber--; });
    const btnNext2 = createButton(t('sgfBtnNext'),  () => { if (moveNumber < (allMoves?.length ?? 0)) moveNumber++; });
    const btnLast  = createButton(t('sgfBtnLast'),  () => { moveNumber = allMoves?.length ?? 0; });
    btnFirst.classList.add('grboard-btn-first');
    btnPrev.classList.add('grboard-btn-prev');
    btnNext2.classList.add('grboard-btn-next');
    btnLast.classList.add('grboard-btn-last');

    if (!playMode) {
      const btnContainerEl = document.createElement('div');
      btnContainerEl.className = 'grboard-btn-group';
      [btnPrev, btnNext2, btnFirst, btnLast].forEach(b => btnContainerEl.appendChild(b));
      controlsContainer.appendChild(btnContainerEl);
    }

    // Play mode: prev/next buttons + turn label + copy button
    if (playMode) {
      // ── Prev/next button row ──
      const playNavRow = document.createElement('div');
      playNavRow.className = 'grboard-btn-group';

      const btnPlayFirst = document.createElement('button');
      btnPlayFirst.className = 'grboard-btn grboard-btn-first';
      btnPlayFirst.textContent = t('sgfBtnFirst');
      btnPlayFirst.onclick = () => {
        playMoveIndex = 0; renderBoard(); if (playTurnLabelUpdater) playTurnLabelUpdater();
      };

      const btnPlayPrev = document.createElement('button');
      btnPlayPrev.className = 'grboard-btn grboard-btn-prev';
      btnPlayPrev.textContent = t('sgfBtnPlayPrev');
      btnPlayPrev.onclick = () => {
        if (playMoveIndex > 0) { playMoveIndex--; renderBoard(); if (playTurnLabelUpdater) playTurnLabelUpdater(); }
      };

      const btnPlayNext = document.createElement('button');
      btnPlayNext.className = 'grboard-btn grboard-btn-next';
      btnPlayNext.textContent = t('sgfBtnPlayNext');
      btnPlayNext.onclick = () => {
        if (playMoveIndex < playMoves.length) { playMoveIndex++; renderBoard(); if (playTurnLabelUpdater) playTurnLabelUpdater(); }
      };

      const btnPlayLast = document.createElement('button');
      btnPlayLast.className = 'grboard-btn grboard-btn-last';
      btnPlayLast.textContent = t('sgfBtnLast');
      btnPlayLast.onclick = () => {
        playMoveIndex = playMoves.length; renderBoard(); if (playTurnLabelUpdater) playTurnLabelUpdater();
      };

      playNavRow.appendChild(btnPlayFirst);
      playNavRow.appendChild(btnPlayPrev);
      playNavRow.appendChild(btnPlayNext);
      playNavRow.appendChild(btnPlayLast);
      controlsContainer.appendChild(playNavRow);

      // ── Turn label + copy button row ──
      const playControls = document.createElement('div');
      playControls.className = 'grboard-btn-group';
      playControls.style.cssText = 'margin-top:4px;display:flex;align-items:center;justify-content:space-between;';

      const turnLabel = document.createElement('span');
      turnLabel.className = 'grboard-play-turn';
      turnLabel.style.cssText = 'color:var(--text-normal);font-size:1.1rem;font-weight:bold;flex:1;text-align:left;';

      const updateTurnLabel = () => {
        const plVal2: string = rootNode.data?.PL?.[0] ?? 'B';
        const nextColor: 'B' | 'W' = (playMoveIndex === 0)
          ? (plVal2 === 'W' ? 'W' : 'B')
          : (playMoves[playMoveIndex - 1].color === 'B' ? 'W' : 'B');
        turnLabel.textContent = nextColor === 'B' ? t('sgfTurnBlack') : t('sgfTurnWhite');
      };
      playTurnLabelUpdater = updateTurnLabel;
      updateTurnLabel();
      playControls.appendChild(turnLabel);

      const saveBtn = document.createElement('button');
      saveBtn.className = 'grboard-btn grboard-btn-save';
      saveBtn.textContent = t('sgfBtnCopy');
      saveBtn.onclick = async () => {
        try {
          const szVal = boardCols === boardRows ? String(boardCols) : `${boardCols}:${boardRows}`;

          // Retrieve AB/AW and other properties from the original SGF
          const rd = rootNode.data || {};
          let setupSGF = `;GM[${rd.GM?.[0] ?? '1'}]FF[4]SZ[${szVal}]`;
          // Carry over game info properties as-is (including PL)
          for (const prop of ['PL','PB','PW','BR','WR','GN','EV','RO','DT','PC','KM','HA','RE','RU']) {
            if (rd[prop]) setupSGF += `${prop}[${rd[prop][0]}]`;
          }
          // AB / AW (initial placement stones)
          if (rd.AB) setupSGF += `AB${(Array.isArray(rd.AB) ? rd.AB : [rd.AB]).map((p:string) => `[${p}]`).join('')}`;
          if (rd.AW) setupSGF += `AW${(Array.isArray(rd.AW) ? rd.AW : [rd.AW]).map((p:string) => `[${p}]`).join('')}`;

          // Concatenate moves played in play mode as ;B[..] ;W[..] (up to playMoveIndex)
          // When move numbers are ON, append LB[xx:N] to stones still on the board
          const showNums = getShowMoveNumbers();
          // Build a stone-color map of the final board state (for capture detection)
          let movesSGF = '';
          if (showNums) {
            // With move numbers: track board state per move and append LB
            const signMap: number[][] = [];
            for (let r = 0; r < boardRows; r++) signMap[r] = new Array(boardCols).fill(0);
            // Apply initial placement stones
            if (rd.AB) (Array.isArray(rd.AB) ? rd.AB : [rd.AB]).forEach((p: string) => {
              const v = point2vertex(p); if (v.x >= 0 && v.y >= 0) signMap[v.y][v.x] = 1;
            });
            if (rd.AW) (Array.isArray(rd.AW) ? rd.AW : [rd.AW]).forEach((p: string) => {
              const v = point2vertex(p); if (v.x >= 0 && v.y >= 0) signMap[v.y][v.x] = -1;
            });
            for (let i = 0; i < playMoveIndex; i++) {
              const pm = playMoves[i];
              const v = point2vertex(pm.point);
              const stoneColor = pm.color === 'B' ? 1 : -1;
              if (v.x >= 0 && v.y >= 0) signMap[v.y][v.x] = stoneColor;
              movesSGF += `;${pm.color}[${pm.point}]`;
            }
            // Append LB to stones remaining on the board (not captured)
            // For each node, determine whether its stone remains on the final board and append LB
            movesSGF = '';
            // Rebuild while appending LB
            const tempSign: number[][] = [];
            for (let r = 0; r < boardRows; r++) tempSign[r] = new Array(boardCols).fill(0);
            if (rd.AB) (Array.isArray(rd.AB) ? rd.AB : [rd.AB]).forEach((p: string) => {
              const v = point2vertex(p); if (v.x >= 0 && v.y >= 0) tempSign[v.y][v.x] = 1;
            });
            if (rd.AW) (Array.isArray(rd.AW) ? rd.AW : [rd.AW]).forEach((p: string) => {
              const v = point2vertex(p); if (v.x >= 0 && v.y >= 0) tempSign[v.y][v.x] = -1;
            });
            for (let i = 0; i < playMoveIndex; i++) {
              const pm = playMoves[i];
              const v = point2vertex(pm.point);
              const stoneColor = pm.color === 'B' ? 1 : -1;
              if (v.x >= 0 && v.y >= 0) tempSign[v.y][v.x] = stoneColor;
              // Check whether this stone remains on the final board (compare with signMap)
              const isOnBoard = v.x >= 0 && v.y >= 0 && signMap[v.y][v.x] === stoneColor;
              const lb = isOnBoard ? `LB[${pm.point}:${i + 1}]` : '';
              movesSGF += `;${pm.color}[${pm.point}]${lb}`;
            }
          } else {
            for (let i = 0; i < playMoveIndex; i++) {
              const pm = playMoves[i];
              movesSGF += `;${pm.color}[${pm.point}]`;
            }
          }

          const sgfText = `(${setupSGF}${movesSGF})`;
          const codeBlock = '```grboard\n' + sgfText + '\n```';

          await navigator.clipboard.writeText(codeBlock);
          saveBtn.textContent = t('sgfBtnCopied');
          setTimeout(() => { saveBtn.textContent = t('sgfBtnCopy'); updateTurnLabel(); }, 1500);
        } catch (e) {
          saveBtn.textContent = t('sgfBtnCopyErr');
          setTimeout(() => { saveBtn.textContent = t('sgfBtnCopy'); }, 1500);
        }
      };

      playControls.appendChild(saveBtn);
      controlsContainer.appendChild(playControls);
    }

    // Auto-play (view mode only; hidden in editMode and playMode)
    if (!editMode && !playMode) {
      let autoPlayInterval: ReturnType<typeof setInterval> | null = null;
      let isPlaying = false;
      let autoPlaySpeed = 2;

      const autoPlayContainer = document.createElement('div');
      autoPlayContainer.className = 'grboard-autoplay-controls';

      const btnAutoPlay = document.createElement('button');
      btnAutoPlay.className = 'grboard-btn grboard-btn-autoplay';
      btnAutoPlay.textContent = '▶ auto play';
      btnAutoPlay.onclick = () => {
        if (isPlaying) {
          if (autoPlayInterval) { clearInterval(autoPlayInterval); autoPlayInterval = null; }
          isPlaying = false;
          btnAutoPlay.textContent = '▶ auto play';
          btnAutoPlay.classList.remove('playing');
        } else {
          isPlaying = true;
          btnAutoPlay.textContent = '⏸ pause';
          btnAutoPlay.classList.add('playing');
          autoPlayInterval = setInterval(() => {
            if (moveNumber < (allMoves?.length ?? 0)) { moveNumber++; renderBoard(); }
            else {
              if (autoPlayInterval) { clearInterval(autoPlayInterval); autoPlayInterval = null; }
              isPlaying = false;
              btnAutoPlay.textContent = '▶ auto play';
              btnAutoPlay.classList.remove('playing');
            }
          }, autoPlaySpeed * 1000);
        }
      };

      const speedLabel = document.createElement('label');
      speedLabel.className = 'grboard-autoplay-label';
      speedLabel.textContent = 'Speed:';

      const speedSelect = document.createElement('select');
      speedSelect.className = 'grboard-autoplay-speed';
      [{value:1,label:'1 sec/move'},{value:2,label:'2 sec/move'},{value:3,label:'3 sec/move'},{value:5,label:'5 sec/move'},{value:10,label:'10 sec/move'}].forEach(s => {
        const option = document.createElement('option');
        option.value = String(s.value);
        option.textContent = s.label;
        if (s.value === autoPlaySpeed) option.selected = true;
        speedSelect.appendChild(option);
      });
      speedSelect.onchange = () => {
        autoPlaySpeed = parseInt(speedSelect.value);
        if (isPlaying && autoPlayInterval) {
          clearInterval(autoPlayInterval);
          autoPlayInterval = setInterval(() => {
            if (moveNumber < (allMoves?.length ?? 0)) { moveNumber++; renderBoard(); }
            else {
              if (autoPlayInterval) { clearInterval(autoPlayInterval); autoPlayInterval = null; }
              isPlaying = false;
              btnAutoPlay.textContent = '▶ auto play';
              btnAutoPlay.classList.remove('playing');
            }
          }, autoPlaySpeed * 1000);
        }
      };

      autoPlayContainer.appendChild(btnAutoPlay);
      autoPlayContainer.appendChild(speedLabel);
      autoPlayContainer.appendChild(speedSelect);
      autoPlayContainerPlaceholder.appendChild(autoPlayContainer);
    }

    renderBoard();

    // Return a reference so renderBoard() can be called externally
    const rerenderFn = () => renderBoard();

    // Resize handling
    let resizeTimeout: ReturnType<typeof setTimeout> | undefined;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const gobanElement = boardContainer.querySelector('.shudan-goban') as HTMLElement;
        if (!gobanElement) return;
        const parentEl = container.parentElement;
        let avail = 700;
        if (parentEl) { const pw = parentEl.clientWidth || parentEl.offsetWidth; if (pw > 0) avail = pw; }
        if (avail === 700) {
          const vw = window.innerWidth || document.documentElement.clientWidth;
          avail = Math.max(300, vw - (vw < 768 ? 0 : 350) - 40);
        }
        const newCW = Math.min(avail, 700);
        (gobanElement as any).setCssProps?.({ zoom: '1' });
        void gobanElement.offsetHeight;
        const nw = gobanElement.scrollWidth || gobanElement.offsetWidth;
        const aw = newCW - 32;
        (gobanElement as any).setCssProps?.({ zoom: nw > aw ? `${aw / nw}` : '1' });
      }, 100);
    });
    resizeObserver.observe(wrapper);

    return { rerender: rerenderFn };

  } catch (error) {
    console.error('Error rendering Go board:', error);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'grboard-error';
    errorDiv.textContent = 'Error rendering Go board: ' + (error instanceof Error ? error.message : 'Unknown error');
    container.appendChild(errorDiv);
    return { rerender: () => {} };
  }
}
