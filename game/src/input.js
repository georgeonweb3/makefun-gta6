// Keyboard + mouse input for Cayo Verde: held keys, one-shot presses, drag-look.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.wheel = 0;
    this.mouseDown = false;
    this.dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true; this.dragging = true;
      this._lastX = e.clientX; this._lastY = e.clientY;
    });
    window.addEventListener('mouseup', () => { this.mouseDown = false; this.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.lookDX += e.clientX - this._lastX;
      this.lookDY += e.clientY - this._lastY;
      this._lastX = e.clientX; this._lastY = e.clientY;
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(code) { return this.keys.has(code); }
  // True once for the frame the key went down; main loop clears it each frame.
  hit(code) { return this.pressed.has(code); }
  forward() { return (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0) - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0); }
  strafe() { return (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0) - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0); }
  endFrame() {
    this.pressed.clear();
    this.lookDX = 0; this.lookDY = 0; this.wheel = 0;
  }
}
