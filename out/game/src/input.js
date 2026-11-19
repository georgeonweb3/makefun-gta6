// Keyboard + mouse state. One owner for every key the game reads, so the
// controllers never attach their own listeners and never disagree.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.dragging = false;
    this.pointerLocked = false;
    this.canvas = canvas;
    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      if (this.pointerLocked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
      else if (this.dragging) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    };
    this._onMouseDown = (e) => {
      if (e.button !== 0) return;
      this.mouseDown = true;
      this.mouseClicked = true;
      this.dragging = true;
    };
    this._onMouseUp = (e) => { if (e.button === 0) { this.mouseDown = false; this.dragging = false; } };
    this._onBlur = () => { this.keys.clear(); this.mouseDown = false; this.dragging = false; };
    this._onLockChange = () => { this.pointerLocked = document.pointerLockElement === canvas; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('pointerlockchange', this._onLockChange);
    canvas.addEventListener('click', () => {
      if (!this.pointerLocked && document.pointerLockElement !== canvas) {
        try { canvas.requestPointerLock(); } catch { /* drag-look still works */ }
      }
    });
  }
  down(code) { return this.keys.has(code); }
  pressed(code) { // one-shot: call once per frame; true only on the frame the key went down
    if (this.keys.has(code) && !this._prev?.has(code)) return true;
    return false;
  }
  consumeClick() { const c = this.mouseClicked; this.mouseClicked = false; return c; }
  consumeLook() { const dx = this.mouseDX, dy = this.mouseDY; this.mouseDX = 0; this.mouseDY = 0; return { dx, dy }; }
  beginFrame() { this._prev = new Set(this.keys); }
  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }
}
