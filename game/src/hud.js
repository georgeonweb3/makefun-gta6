// HUD for Cayo Verde: cash and health, wanted stars, mission objective, a live
// 2D minimap, speedometer, ammo, toasts, and the menu / busted / wasted screens.
export class Hud {
  constructor(city) {
    this.city = city;
    this.el = {
      cash: document.getElementById('cash'),
      health: document.getElementById('healthFill'),
      stars: document.getElementById('stars'),
      title: document.getElementById('missionTitle'),
      text: document.getElementById('missionText'),
      speed: document.getElementById('speed'),
      ammo: document.getElementById('ammoBox'),
      crosshair: document.getElementById('crosshair'),
      toast: document.getElementById('toast'),
      radio: document.getElementById('radioTag'),
      menu: document.getElementById('menu'),
      end: document.getElementById('endScreen'),
      endTitle: document.getElementById('endTitle'),
      endSub: document.getElementById('endSub'),
      endText: document.getElementById('endText'),
      vaultBar: document.getElementById('vaultBar'),
      vaultFill: document.getElementById('vaultFill'),
    };
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this._toastTimer = 0;
    this._lastObjective = '';
  }

  showToast(text, seconds = 3.5) {
    this.el.toast.textContent = text;
    this.el.toast.style.display = 'block';
    this._toastTimer = seconds;
  }

  setMenuVisible(visible) { this.el.menu.style.display = visible ? 'flex' : 'none'; }

  showEnd(kind, text) {
    this.el.endTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    this.el.endSub.textContent = kind === 'busted'
      ? 'THE VERDE POLICE GOT YOU'
      : 'LENA DID NOT MAKE IT';
    this.el.endText.textContent = text;
    this.el.end.style.display = 'flex';
  }

  hideEnd() { this.el.end.style.display = 'none'; }

  update(dt, world) {
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) this.el.toast.style.display = 'none';
    }
    const p = world.player;
    this.el.cash.textContent = String(world.cash);
    this.el.health.style.width = `${Math.max(0, Math.min(100, p.health))}%`;
    let stars = '';
    for (let i = 0; i < 5; i += 1) {
      stars += i < world.wanted ? '★' : '<span class="dim">★</span>';
    }
    this.el.stars.innerHTML = stars;
    const mission = world.missions.current();
    const title = mission ? mission.title : 'CAYO VERDE — FREE ROAM';
    const text = world.missions.objectiveText();
    if (title !== this._lastObjective) {
      this.el.title.textContent = title;
      this.el.text.textContent = text;
      this._lastObjective = title;
    } else {
      this.el.text.textContent = text;
    }
    const kmh = Math.round(Math.abs(p.inCar && p.car ? p.car.speed : 0) * 3.6);
    this.el.speed.textContent = String(kmh);
    this.el.ammo.textContent = world.combat.reloading
      ? 'RELOADING…'
      : `PISTOL  ${world.combat.ammo} / 12`;
    this.el.crosshair.style.display = world.screen === 'playing' ? 'block' : 'none';
    this.el.radio.textContent = world.audio.radioOn ? `♪ ${world.audio.stationName()}` : '♪ RADIO OFF';
    const vault = world.missions.vaultProgress;
    this.el.vaultBar.style.display = vault > 0 && vault < 1 ? 'block' : 'none';
    this.el.vaultFill.style.width = `${Math.round(vault * 100)}%`;
    this._drawMinimap(world);
  }

  _drawMinimap(world) {
    const ctx = this.mapCtx;
    const S = 180;
    const scale = S / 440;
    const toMap = (x, z) => [(x + 220) * scale, (z + 220) * scale];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#0d2733';
    ctx.fillRect(0, 0, S, S);
    // Ocean on the west edge.
    ctx.fillStyle = '#2e86c1';
    ctx.fillRect(0, 0, (CITY_WATER_EDGE + 220) * scale, S);
    // Roads.
    ctx.strokeStyle = '#5a5f66';
    ctx.lineWidth = 4;
    for (const line of this.city.streetLines) {
      const [ax] = toMap(line, 0);
      const [, bz] = toMap(0, line);
      ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, bz); ctx.lineTo(S, bz); ctx.stroke();
    }
    // Buildings.
    ctx.fillStyle = '#31465c';
    for (const b of this.city.buildings) {
      const [x, z] = toMap(b.x - b.w / 2, b.z - b.d / 2);
      ctx.fillRect(x, z, Math.max(2, b.w * scale), Math.max(2, b.d * scale));
    }
    // Traffic.
    ctx.fillStyle = '#9aa5b1';
    for (const car of world.traffic.cars) {
      const [x, z] = toMap(car.x, car.z);
      ctx.fillRect(x - 1, z - 1, 2, 2);
    }
    // Police.
    ctx.fillStyle = '#ff3b30';
    for (const car of world.police.cars) {
      const [x, z] = toMap(car.x, car.z);
      ctx.beginPath(); ctx.arc(x, z, 3, 0, Math.PI * 2); ctx.fill();
    }
    // Mission target.
    const target = world.missions.targetPos();
    if (target) {
      const [x, z] = toMap(target.x, target.z);
      const pulse = 4 + Math.sin(performance.now() * 0.006) * 2;
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath(); ctx.arc(x, z, pulse, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, z, pulse + 2, 0, Math.PI * 2); ctx.stroke();
    }
    // Player arrow.
    const p = world.player;
    const [px, pz] = toMap(p.x, p.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(Math.PI - p.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// West edge of the water on the minimap (matches city.js water placement).
const CITY_WATER_EDGE = -208;
