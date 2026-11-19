// HUD: cash, health/armor bars, wanted stars, clock, objective line, the
// round minimap (roads, blocks, player arrow, mission beacon, police blips),
// speedometer, banners, toasts and the start/pause/end screens.
import { MISSIONS } from './config.js';

export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      cash: document.getElementById('cashVal'),
      health: document.getElementById('healthBar'),
      armor: document.getElementById('armorBar'),
      stars: document.getElementById('stars'),
      clock: document.getElementById('clock'),
      objTitle: document.getElementById('objectiveTitle'),
      objText: document.getElementById('objectiveText'),
      objDist: document.getElementById('objectiveDist'),
      minimap: document.getElementById('minimap'),
      speed: document.getElementById('speedVal'),
      speedUnit: document.getElementById('speedUnit'),
      carName: document.getElementById('carName'),
      radio: document.getElementById('radio'),
      crosshair: document.getElementById('crosshair'),
      banner: document.getElementById('banner'),
      bannerTitle: document.getElementById('bannerTitle'),
      bannerSub: document.getElementById('bannerSub'),
      toast: document.getElementById('toast'),
      hint: document.getElementById('hint'),
      damage: document.getElementById('damage'),
      start: document.getElementById('startScreen'),
      pause: document.getElementById('pauseScreen'),
      pauseStats: document.getElementById('pauseStats'),
      end: document.getElementById('endScreen'),
      endTitle: document.getElementById('endTitle'),
      endText: document.getElementById('endText'),
      missionList: document.getElementById('missionList'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this._toastTimer = 0;
    this._bannerTimer = 0;
    this._lastStars = -1;
  }
  showGame() {
    this.el.hud.classList.remove('hidden');
    this.el.start.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.end.classList.add('hidden');
  }
  showStart(missionIndex, cash) {
    this.el.hud.classList.add('hidden');
    this.el.start.classList.remove('hidden');
    const rows = MISSIONS.map((m, i) => {
      const cls = i < missionIndex ? 'done' : (i === missionIndex ? 'next' : '');
      const mark = i < missionIndex ? '✓' : (i === missionIndex ? '▸' : '·');
      return `<div class="${cls}">${mark} ${i + 1}. ${m.title} — $${m.pay}</div>`;
    }).join('');
    this.el.missionList.innerHTML = rows + `<div style="margin-top:6px;color:#cfe3ef">Cash on hand: <b style="color:#7dff9a">$${cash}</b></div>`;
    document.getElementById('playBtn').textContent = missionIndex > 0 ? '▶  CONTINUE THE STORY' : '▶  START THE STORY';
  }
  showPause(stats) {
    this.el.pause.classList.remove('hidden');
    this.el.pauseStats.textContent = stats;
  }
  hidePause() { this.el.pause.classList.add('hidden'); }
  showEnd(title, text) {
    this.el.end.classList.remove('hidden');
    this.el.endTitle.textContent = title;
    this.el.endText.textContent = text;
  }
  hideEnd() { this.el.end.classList.add('hidden'); }
  setCash(v) { this.el.cash.textContent = v.toLocaleString('en-US'); }
  setHealth(h, armor) {
    this.el.health.style.width = `${Math.max(0, h)}%`;
    this.el.armor.style.width = `${Math.max(0, armor)}%`;
    this.el.health.style.background = h < 30 ? 'linear-gradient(90deg,#d63a2f,#ff7a5e)' : 'linear-gradient(90deg,#37d67a,#9dff6e)';
  }
  setStars(n) {
    if (n === this._lastStars) return;
    this._lastStars = n;
    let s = '';
    for (let i = 0; i < 5; i++) s += `<span class="star${i < n ? '' : ' off'}">★</span>`;
    this.el.stars.innerHTML = s;
  }
  setClock(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    this.el.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  setObjective(info) {
    if (!info) {
      this.el.objTitle.textContent = 'SOLMAR BAY';
      this.el.objText.textContent = 'Free roam — cause trouble or cruise the coast.';
      this.el.objDist.textContent = '';
      return;
    }
    this.el.objTitle.textContent = `${info.title}  ·  ${info.progress}`;
    this.el.objText.textContent = info.label;
    this.el.objDist.textContent = info.dist != null ? `${info.dist} m` : '';
  }
  setSpeed(mph, carName, inCar) {
    this.el.speed.textContent = Math.round(Math.abs(mph));
    this.el.speedUnit.textContent = 'MPH';
    this.el.carName.textContent = inCar ? carName : '';
    this.el.speed.parentElement.style.visibility = inCar ? 'visible' : 'hidden';
  }
  setRadio(name) { this.el.radio.textContent = name; }
  setCrosshair(on) { this.el.crosshair.classList.toggle('hidden', !on); }
  setHint(text) { this.el.hint.textContent = text || ''; }
  setDamage(opacity) { this.el.damage.style.opacity = String(Math.max(0, Math.min(1, opacity))); }
  toast(text, seconds = 3) {
    this.el.toast.textContent = text;
    this.el.toast.classList.remove('hidden');
    this._toastTimer = seconds;
  }
  banner(title, sub, seconds = 3.2) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub || '';
    this.el.banner.classList.remove('hidden');
    this._bannerTimer = seconds;
  }
  update(dt) {
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) this.el.toast.classList.add('hidden');
    }
    if (this._bannerTimer > 0) {
      this._bannerTimer -= dt;
      if (this._bannerTimer <= 0) this.el.banner.classList.add('hidden');
    }
  }
  // Round minimap: draw the road grid, blocks, beach, beacon, cars, cops.
  drawMinimap(world) {
    const { ctx, size } = { ctx: this.mm, size: 190 };
    const half = world.half + 70;
    const scale = size / (half * 2);
    const toMap = (x, z) => [size / 2 + x * scale, size / 2 + z * scale];
    ctx.clearRect(0, 0, size, size);
    // sea + sand
    ctx.fillStyle = '#1d6f9e';
    ctx.fillRect(0, 0, size, size);
    const [, beachY] = toMap(0, world.half);
    ctx.fillStyle = '#e8d5a4';
    ctx.fillRect(0, beachY, size, size - beachY);
    // land
    ctx.fillStyle = '#22303c';
    const [lx, ly] = toMap(-world.half, -world.half);
    ctx.fillRect(lx, ly, world.half * 2 * scale, world.half * 2 * scale);
    // blocks
    ctx.fillStyle = '#3d4c5c';
    for (const bx of world.centers) {
      for (const bz of world.centers) {
        const [x, y] = toMap(bx - 32, bz - 32);
        ctx.fillRect(x, y, 64 * scale, 64 * scale);
      }
    }
    // roads
    ctx.strokeStyle = '#8a97a3';
    ctx.lineWidth = 2;
    for (const l of world.lines) {
      const [x1, y1] = toMap(l, -world.half);
      const [x2, y2] = toMap(l, world.half);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [hx1, hy1] = toMap(-world.half, l);
      const [hx2, hy2] = toMap(world.half, l);
      ctx.beginPath(); ctx.moveTo(hx1, hy1); ctx.lineTo(hx2, hy2); ctx.stroke();
    }
    // mission beacon
    if (world.beacon) {
      const [x, y] = toMap(world.beacon.x, world.beacon.z);
      const pulse = 6 + Math.sin(performance.now() / 180) * 2;
      ctx.fillStyle = '#ffd94a';
      ctx.beginPath(); ctx.arc(x, y, pulse, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, pulse + 3, 0, Math.PI * 2); ctx.stroke();
    }
    // traffic (white dots) + police (blue/red flashing)
    for (const c of world.trafficCars || []) {
      const [x, y] = toMap(c.pos.x, c.pos.z);
      ctx.fillStyle = c.isPolice ? (Math.floor(performance.now() / 250) % 2 ? '#ff2a22' : '#2244ff') : '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, c.isPolice ? 4 : 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // player arrow (rotates with heading)
    const [px, py] = toMap(world.player.x, world.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-world.player.heading + Math.PI);
    ctx.fillStyle = '#7dff9a';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#10202e'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    // north tick
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Verdana';
    ctx.fillText('N', size / 2 - 4, 14);
  }
}
