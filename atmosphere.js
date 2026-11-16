(() => {
  'use strict';
  // Cosmetic particles use a separate random stream and never touch game state.
  const layers = [
    { canvas: document.querySelector('#room-dust'), front: false, particles: [] },
    { canvas: document.querySelector('#foreground-dust'), front: true, particles: [] }
  ];
  if (layers.some(layer => !layer.canvas)) return;
  layers.forEach(layer => { layer.context = layer.canvas.getContext('2d', { alpha: true }); });
  if (layers.some(layer => !layer.context)) return;

  let width = 1, height = 1, frameId = 0, lastTime = 0, clock = 0, running = false;
  const random = (min, max) => min + Math.random() * (max - min);
  function smooth01(value) {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  }
  function glowSprite(front) {
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 64;
    const context = sprite.getContext('2d');
    const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    glow.addColorStop(0, '#fffce1');
    glow.addColorStop(.065, '#fff4ba');
    glow.addColorStop(.15, front ? '#ffd35cc2' : '#ffdc6fa6');
    glow.addColorStop(.36, '#ffbf332c');
    glow.addColorStop(1, '#ef9a1200');
    context.fillStyle = glow;
    context.fillRect(0, 0, 64, 64);
    return sprite;
  }
  layers.forEach(layer => { layer.sprite = glowSprite(layer.front); });

  function makeParticle(front, index) {
    const firefly = index % (front ? 5 : 11) === 0;
    const lifetime = random(8, 16);
    return {
      x: random(0, width), y: random(0, height),
      age: random(0, lifetime), lifetime,
      radius: firefly ? random(1.3, front ? 2.1 : 1.65) : random(front ? .7 : .35, front ? 1.2 : .85),
      alpha: random(front ? .52 : .3, firefly ? .95 : .75),
      vx: random(-5, 7), vy: random(-8, -2),
      phase: random(0, Math.PI * 2), rate: random(.16, .4),
      sway: random(firefly ? 22 : 8, firefly ? 58 : 28),
      bob: random(6, firefly ? 30 : 16),
      firefly
    };
  }
  function resize() {
    const oldWidth = width, oldHeight = height;
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const narrow = width <= 600;
    const backCount = narrow ? 108 : Math.max(170, Math.min(262, Math.round(width * height / 6240)));
    layers.forEach(layer => {
      layer.canvas.width = Math.round(width * ratio);
      layer.canvas.height = Math.round(height * ratio);
      layer.context.setTransform(ratio, 0, 0, ratio, 0, 0);
      layer.particles.forEach(particle => {
        particle.x *= width / oldWidth;
        particle.y *= height / oldHeight;
      });
      const count = layer.front ? (narrow ? 20 : 32) : backCount;
      layer.particles.length = Math.min(layer.particles.length, count);
      while (layer.particles.length < count) layer.particles.push(makeParticle(layer.front, layer.particles.length));
    });
  }
  function paint(time) {
    frameId = 0;
    if (!running) return;
    const delta = lastTime ? Math.min(.05, Math.max(0, (time - lastTime) / 1000)) : 0;
    lastTime = time;
    clock += delta;
    layers.forEach(layer => {
      const context = layer.context;
      context.clearRect(0, 0, width, height);
      layer.particles.forEach(particle => {
        particle.age += delta;
        if (particle.age >= particle.lifetime) {
          // Relocate only while fully faded, so a new mote appears elsewhere softly.
          particle.age = 0;
          particle.lifetime = random(8, 16);
          particle.x = random(0, width);
          particle.y = random(0, height);
        }
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        const margin = 90;
        if (particle.y < -margin) { particle.y = height + margin; particle.x = random(0, width); }
        if (particle.x < -margin) particle.x = width + margin;
        if (particle.x > width + margin) particle.x = -margin;
        const phase = clock * particle.rate + particle.phase;
        const x = particle.x + Math.sin(phase) * particle.sway;
        const y = particle.y + Math.cos(phase * .78) * particle.bob;
        const edge = Math.max(0, Math.min(1, (x + 12) / 45, (width + 12 - x) / 45, (y + 12) / 45, (height + 12 - y) / 45));
        const shimmer = .78 + .22 * Math.sin(clock * .65 + particle.phase);
        const radius = particle.radius * 6;
        const lifePhase = particle.age / particle.lifetime;
        const fade = smooth01(lifePhase / .16) * smooth01((1 - lifePhase) / .22);
        context.globalAlpha = particle.alpha * shimmer * edge * fade;
        context.drawImage(layer.sprite, x - radius, y - radius, radius * 2, radius * 2);
      });
      context.globalAlpha = 1;
    });
    frameId = requestAnimationFrame(paint);
  }
  function sync() {
    running = !document.hidden && !document.body.classList.contains('reduced-motion');
    if (!running) {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      lastTime = 0;
      layers.forEach(layer => layer.context.clearRect(0, 0, width, height));
    } else if (!frameId) {
      lastTime = 0;
      frameId = requestAnimationFrame(paint);
    }
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', sync);
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  sync();
})();
