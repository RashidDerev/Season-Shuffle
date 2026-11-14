(() => {
  'use strict';
  const G = window.WoodGame;
  const $ = s => document.querySelector(s);
  const names = ['лето — солнце','зима — снежинка','осень — лист','весна — цветок'];
  const symbols = ['sun', 'snow', 'leaf', 'flower'];
  const storageKey = 'four-secrets-drum-v8';
  let state, history = [], busy = false, audio;
  let preferences = { sound: false, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches };
  const freshSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] || 714235;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || localStorage.getItem('four-secrets-single-row-v5') || localStorage.getItem('four-secrets-game-v4') || localStorage.getItem('four-secrets-game-v3') || localStorage.getItem('five-secrets-game-v2') || localStorage.getItem('five-secrets-game-v1'));
    preferences = { ...preferences, ...saved?.preferences };
    const restored=G.migrate(saved?.state);
    if (restored) {
      state = restored;
      history = (saved.history || []).map(G.migrate).filter(Boolean).slice(-20);
    }
  } catch (_) { /* The game also works when browser storage is unavailable. */ }
  if (!state) state = G.create(freshSeed());
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify({ state, history, preferences })); } catch (_) {}
  }
  function icon(name) {
    const el = document.createElementNS('http://www.w3.org/2000/svg','svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg','use');
    use.setAttribute('href','#icon-' + name);
    el.setAttribute('viewBox', symbols.includes(name) ? '0 0 64 64' : '0 0 24 24');
    el.setAttribute('preserveAspectRatio','xMidYMid meet');
    use.setAttribute('width','100%'); use.setAttribute('height','100%');
    el.append(use); el.setAttribute('aria-hidden','true');
    return el;
  }
  function makeToken(t, row) {
    const el = document.createElement('div');
    el.className = 'token c' + t.color;
    el.dataset.id = t.id;
    if (row !== undefined) el.style.setProperty('--row',row);
    el.setAttribute('role','img');
    el.setAttribute('aria-label',names[t.color]);
    el.append(icon(symbols[t.color]));
    return el;
  }
  function makeDoor(animate = false) {
    const door = document.createElement('div');
    door.className = 'door' + (animate ? ' closing' : '');
    door.setAttribute('aria-hidden','true');
    // The floral relief and check medallion are painted into the door sprite.
    return door;
  }
  function render() {
    const tray = $('#tray'), channels = $('#channels');
    tray.replaceChildren(); channels.replaceChildren();
    state.rows.forEach((tiles, rowIndex) => {
      const active = rowIndex === G.ACTIVE_ROW;
      const row = document.createElement('div');
      row.className = active ? 'drum-row is-active' : 'drum-row';
      row.dataset.rowId = tiles[0].id;
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', ['Верхний ряд', 'Активный средний ряд', 'Нижний ряд'][rowIndex]);
      tiles.forEach((tile, i) => {
        const slot = document.createElement('div');
        slot.className = 'slot';
        slot.dataset.column = i;
        slot.setAttribute('role', 'group');
        const dropStatus = active && state.closed[i] ? ', колонка закрыта для сброса' : '';
        slot.setAttribute('aria-label', `Колонка ${i + 1}: ${names[tile.color]}${dropStatus}`);
        slot.append(makeToken(tile));
        const number = document.createElement('span');
        number.className = 'slot-number';
        number.setAttribute('aria-hidden', 'true');
        number.textContent = i + 1;
        slot.append(number);
        row.append(slot);
      });
      tray.append(row);
      Object.assign(row.style, drumPose((rowIndex - G.ACTIVE_ROW) * 60));
    });
    for (let i = 0; i < G.COLUMNS; i++) {
      const channel = document.createElement('div');
      channel.className = 'channel' + (state.stacks[i].length === G.CAPACITY ? G.assess(state,i) === 'rescue' ? ' rescue-ready' : ' danger' : '');
      channel.dataset.column = i;
      channel.setAttribute('role','group');
      channel.setAttribute('aria-label',state.closed[i] ? `Колонка ${i+1} закрыта` : `Колонка ${i+1}: ${state.stacks[i].length} из 12 ячеек`);
      const grid = document.createElement('div');grid.className='cell-grid';grid.setAttribute('aria-hidden','true');
      for(let c=0;c<12;c++) grid.append(document.createElement('i'));
      const number = document.createElement('span');number.className='channel-number';number.textContent=i+1;number.setAttribute('aria-hidden','true');
      channel.append(grid,number);
      state.stacks[i].forEach((t,row) => channel.append(makeToken(t,row)));
      if (state.closed[i]) channel.append(makeDoor());
      channels.append(channel);
      $('.drop-guide').children[i].classList.toggle('muted',state.closed[i]);
    }
    updateControls();
  }
  function updateControls() {
    const closed = state.closed.filter(Boolean).length;
    $('#closed-count').textContent = closed;
    $('#mobile-closed').textContent = `${closed} / 4`;
    $('#progress').setAttribute('aria-label',`Закрыто колонок: ${closed} из ${G.COLUMNS}`);
    $('#progress-dots').replaceChildren(...state.closed.map(done => { const dot=document.createElement('i');if(done)dot.className='done';return dot; }));
    const canPlay = !busy && state.status === 'playing';
    for (const id of ['rotate', 'rotate-down', 'drop', 'shift-left', 'shift-right']) $(`#${id}`).disabled = !canPlay;
    $('#undo').disabled = busy || !history.length;
    $('#hint').disabled = busy || state.status !== 'playing';
    $('#new-game').disabled = busy;
    $('#move-count').textContent = String(state.moves).padStart(2,'0');
    $('#seed-label').textContent = String(state.seed % 10000).padStart(4,'0');
    document.body.classList.toggle('reduced-motion',preferences.reduced);
  }
  function status(text,warning=false) { $('#status').textContent=text;$('#status').classList.toggle('warning',warning); }
  function rowStatus(message) {
    const full = state.stacks.map((stack,i)=>!state.closed[i] && stack.length === G.CAPACITY ? i : -1).filter(i=>i>=0);
    if(!full.length) { status(message); return; }
    const blocked = full.find(i=>G.assess(state,i)==='danger');
    if(blocked !== undefined)status(`Колонка ${blocked+1} заполнена. Ещё один ход на спасение: нужна комбинация с двумя верхними фишками.`,true);
    else status(full.length === 1 ? `Колонка ${full[0]+1} заполнена, но совпадение готово — DROP освободит место.` : 'Для всех полных колонок готовы совпадения — можно нажать DROP.');
  }
  function sound(kind) {
    if (!preferences.sound) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if(audio.state === 'suspended') audio.resume();
      const oscillator=audio.createOscillator(),gain=audio.createGain();
      const now=audio.currentTime;
      const frequency=kind==='merge'?690:kind==='close'?880:280;
      oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,now);
      oscillator.frequency.exponentialRampToValueAtTime(frequency*.52,now+.12);
      gain.gain.setValueAtTime(.055,now);gain.gain.exponentialRampToValueAtTime(.001,now+.17);
      oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(now);oscillator.stop(now+.18);
    } catch (_) {}
  }
  const wait = ms => new Promise(resolve => setTimeout(resolve,preferences.reduced?18:ms));
  // Project a row on the front half of a cylinder. The back half is invisible.
  function drumPose(angle) {
    const radians = angle * Math.PI / 180;
    const facing = Math.max(0, Math.cos(radians));
    return {
      top: (50 + 41 * Math.sin(radians)).toFixed(5) + '%',
      transform: 'translateY(-50%) scale(' + (.94 + .06 * facing).toFixed(5) + ',' + (.18 + .82 * facing).toFixed(5) + ')',
      filter: 'brightness(' + (.38 + .74 * facing).toFixed(5) + ') saturate(' + (.78 + .22 * facing).toFixed(5) + ')',
      opacity: String(Math.min(1, facing / .16)),
      zIndex: String(1 + Math.round(50 * facing))
    };
  }
  async function rotate(direction = 'up') {
    if (busy || state.status !== 'playing') return;
    const tray = $('#tray');
    const rows = Array.from(tray.children);
    if (!G.rotate(state, direction)) return;
    busy = true;
    updateControls();
    sound('tap');
    rowStatus(direction === 'down' ? 'Нижний ряд перешёл в центр.' : 'Верхний ряд перешёл в центр.');
    save();
    let ghost;
    try {
      if (!preferences.reduced) {
        const sign = direction === 'down' ? -1 : 1;
        const faces = rows.map((row, i) => ({ row, angle: (i - G.ACTIVE_ROW) * 60 }));
        // A visual copy enters over the rear rim while the original disappears below it.
        ghost = rows[sign === 1 ? 2 : 0].cloneNode(true);
        ghost.className = 'drum-row drum-ghost';
        ghost.setAttribute('aria-hidden','true');
        ghost.removeAttribute('role');
        ghost.removeAttribute('data-row-id');
        ghost.querySelectorAll('[data-id]').forEach(el => el.removeAttribute('data-id'));
        Object.assign(ghost.style, drumPose(sign === 1 ? -120 : 120));
        tray.append(ghost);
        faces.push({ row: ghost, angle: sign === 1 ? -120 : 120 });
        tray.classList.add('is-spinning');
        document.querySelectorAll('.drum-axle').forEach(axle => axle.classList.add('spinning'));
        await Promise.all(faces.map(face => {
          const frames = Array.from({ length: 33 }, (_, step) => ({
            ...drumPose(face.angle + sign * 60 * step / 32), offset: step / 32
          }));
          return face.row.animate(frames, {
            duration: 560, easing: 'cubic-bezier(.35,.05,.2,1)', fill: 'forwards'
          }).finished.catch(() => {});
        }));
      }
    } finally {
      ghost?.remove();
      tray.classList.remove('is-spinning');
      document.querySelectorAll('.drum-axle').forEach(axle => axle.classList.remove('spinning'));
      busy = false;
      render();
    }
  }
  async function shift(direction) {
    if(busy || state.status !== 'playing')return;
    const activeSelector = '.drum-row.is-active .token';
    const previous = new Map(Array.from(document.querySelectorAll(activeSelector),el=>[el.dataset.id,el.getBoundingClientRect()]));
    if(!G.shift(state,direction))return;
    busy=true;
    render();sound('tap');
    rowStatus(`Активный ряд сдвинут ${direction === 'left' ? 'влево' : 'вправо'} по кругу.`);
    const animations=[];
    if(!preferences.reduced) {
      const trayWidth=$('#tray').getBoundingClientRect().width;
      document.querySelectorAll(activeSelector).forEach(el=>{
        const before=previous.get(el.dataset.id),after=el.getBoundingClientRect();
        if(!before || !el.animate)return;
        const distance=before.left-after.left;
        const wrapped=direction==='right' ? distance>0 : distance<0;
        const frames=wrapped ? [{opacity:0,transform:`translateX(${direction==='right'?-16:16}px)`},{opacity:1,transform:'translateX(0)'}] :
          [{opacity:1,transform:`translateX(${Math.max(-trayWidth,Math.min(trayWidth,distance))}px)`},{opacity:1,transform:'translateX(0)'}];
        animations.push(el.animate(frames,{duration:280,easing:'cubic-bezier(.22,.65,.25,1)'}).finished.catch(()=>{}));
      });
    }
    save();
    await Promise.all(animations);
    busy=false;updateControls();
  }
  async function animateColumn(action) {
    const channel=document.querySelector(`.channel[data-column="${action.column}"]`);
    const slot=document.querySelector(`.drum-row.is-active .slot[data-column="${action.column}"]`);
    const old=slot.querySelector('.token');
    let incoming;
    if(action.rescue) {
      // A full column has no thirteenth cell. Animate the match from the upper slot.
      incoming=old;
      if(!preferences.reduced && incoming.animate) {
        await incoming.animate([{transform:'translateY(0)',filter:'brightness(1)'},{transform:'translateY(5px)',filter:'brightness(1.3)'}],{duration:260,easing:'ease-in-out'}).finished;
      }
    } else {
      const start=old.getBoundingClientRect();
      old.style.visibility='hidden';
      incoming=makeToken(action.incoming,action.landing);
      channel.append(incoming);
      const end=incoming.getBoundingClientRect();
      if (!preferences.reduced && incoming.animate) {
        const flight = old.cloneNode(true);
        flight.classList.add('drop-flight');
        flight.setAttribute('aria-hidden', 'true');
        Object.assign(flight.style, { left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, height: `${start.height}px`, visibility: 'visible' });
        document.body.append(flight);
        incoming.style.visibility = 'hidden';
        try {
          await flight.animate([{ transform: 'none', width: `${start.width}px`, height: `${start.height}px` }, { transform: `translate(${end.left - start.left}px, ${end.top - start.top}px)`, width: `${end.width}px`, height: `${end.height}px` }],
            { duration: 440 + Math.max(0, 9 - action.landing) * 16, easing: 'cubic-bezier(.48,.06,.84,.55)' }).finished;
        } finally {
          flight.remove();
          incoming.style.visibility = '';
        }
      }
    }
    incoming.classList.add('landing');sound('tap');await wait(160);
    const findToken = id => channel.querySelector(`[data-id="${id}"]`) || slot.querySelector(`[data-id="${id}"]`);
    for (const event of action.events) {
      event.removed.forEach(t => {
        const el = findToken(t.id);
        if(el && !preferences.reduced) sparkle(el);
        el?.classList.remove('landing');
        el?.classList.add('merging');
      });
      sound('merge');await wait(320);
      event.removed.forEach(t => findToken(t.id)?.remove());
      event.after.forEach((t, index) => findToken(t.id)?.style.setProperty('--row', index));
      await wait(330);
    }
    if(action.closed) {
      channel.append(makeDoor(true));sound('close');await wait(750);
    }
  }
  function sparkle(el) {
    const r = el.getBoundingClientRect();
    for (let i = 0; i < 9; i++) {
      const particle = document.createElement('i');
      particle.className = 'merge-spark';
      const angle = i * Math.PI * 2 / 9;
      particle.style.cssText = `left:${r.left+r.width/2}px;top:${r.top+r.height/2}px;--dx:${Math.cos(angle)*(15+Math.random()*25)}px;--dy:${Math.sin(angle)*(15+Math.random()*25)}px`;
      document.body.append(particle);
      setTimeout(() => particle.remove(), 650);
    }
  }
  async function drop() {
    if(busy || state.status!=='playing')return;
    busy=true;
    history.push(G.clone(state));if(history.length>20)history.shift();
    const result=G.drop(state);
    updateControls();
    status('Фишки находят своё место…');
    try {
      if(result.overflow.length) {
        result.overflow.forEach(i=>document.querySelector(`.channel[data-column="${i}"]`).classList.add('danger'));
        status(`Колонка ${result.overflow[0]+1} заполнена, а совпадение сверху не получилось.`,true);
        await wait(450);
      } else {
        await Promise.all(result.columns.map(animateColumn));
      }
    } catch (error) { console.error('Animation interrupted',error); }
    busy=false;
    render();save();
    if(state.status==='won') { status('Все четыре дверцы закрыты!');celebrate();await wait(500);showResult(); }
    else if(state.status==='lost')showResult();
    else {
      const closedNow=result.columns.filter(c=>c.closed).length;
      const clearedNow=result.columns.some(c=>c.events.length);
      rowStatus(closedNow ? `Дверца закрылась! Осталось колонок: ${G.COLUMNS-state.closed.filter(Boolean).length}.` :
        clearedNow ? 'Три одинаковые фишки исчезли.' : 'В центре новый ряд.');
    }
  }
  function undo() {
    if(busy||!history.length)return;
    state=history.pop();
    render();save();rowStatus('Ход отменён. Попробуйте другое решение.');
    $('#result-dialog').close();
  }
  let hintTimer;
  function hint() {
    if(busy||state.status!=='playing')return;
    clearTimeout(hintTimer);
    document.querySelectorAll('.hint-color').forEach(e=>e.remove());
    document.querySelectorAll('.channel').forEach((el,i)=>{
      if(state.closed[i])return;
      el.classList.remove('hinted');void el.offsetWidth;el.classList.add('hinted');
      const dot=document.createElement('i');dot.className='hint-color c'+G.bestColor(state.stacks[i]);dot.setAttribute('aria-hidden','true');el.append(dot);
    });
    const open = state.closed.map((closed,i)=>closed ? -1 : i).filter(i=>i>=0);
    const i = open.find(i=>G.assess(state,i)==='danger') ?? open.find(i=>G.assess(state,i)==='rescue') ?? open.find(i=>G.assess(state,i)==='match') ?? open.reduce((a,b)=>state.stacks[b].length>state.stacks[a].length?b:a);
    const assessment=G.assess(state,i);
    status(assessment==='danger'?(G.compatible(state.stacks[i].slice(-2)) ?
      `Полная колонка ${i+1}: нужна фишка «${names[G.bestColor(state.stacks[i])]}». Сдвиньте ряд или прокрутите барабан.` :
      `Колонка ${i+1} заполнена, а две верхние фишки разные. Для спасения можно отменить предыдущий ход.`):
      assessment==='rescue'?`Полная колонка ${i+1}: совпадение готово. После DROP три одинаковые фишки исчезнут и освободят место.`:
      assessment==='match'?`Колонка ${i+1}: верхняя фишка уже даёт комбинацию. Можно нажать DROP.`:
      `Колонка ${i+1}: подойдёт фишка «${names[G.bestColor(state.stacks[i])]}». Точки показывают нужные сезоны.`,assessment==='danger');
    hintTimer=setTimeout(()=>document.querySelectorAll('.hint-color').forEach(e=>e.remove()),6500);
  }
  function celebrate() {
    if(preferences.reduced)return;
    for(let i=0;i<38;i++) {
      const confetti=document.createElement('i');confetti.className='celebration';
      confetti.style.cssText=`left:${20+Math.random()*60}%;top:30%;background:var(--c${i%G.COLOR_COUNT});--dx:${(Math.random()-.5)*400}px;--dy:${150+Math.random()*370}px;--rot:${Math.random()*700}deg;animation-delay:${Math.random()*.2}s`;
      $('.game-area').append(confetti);setTimeout(()=>confetti.remove(),2100);
    }
  }
  function showResult() {
    const won=state.status==='won';
    $('#result-emblem').textContent=won?'★':'↶';
    $('#result-kicker').textContent=won?'ВСЕ СЕКРЕТЫ РАСКРЫТЫ':'У КАЖДОЙ ЗАДАЧИ ЕСТЬ РЕШЕНИЕ';
    $('#result-title').innerHTML=won?'Мастерская закрыта.<br>Чудеса продолжаются.':'В этой колонке<br>не хватило совпадения.';
    $('#result-text').textContent=won?`Все четыре дверцы закрыты за ${state.moves} ходов. Можно снова заглянуть в мастерскую.`:'Колонка заполнена, а верхняя фишка не собирает комбинацию с двумя последними в стопке. Отмените ход или начните новую партию.';
    $('#result-back').textContent=won?'Посмотреть поле':'Отменить последний ход';
    if(!$('#result-dialog').open)$('#result-dialog').showModal();
  }
  function newGame() {
    document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    state=G.create(freshSeed());history=[];busy=false;
    render();save();status('Пробел — DROP · ↑ ↓ барабан · ← → сдвиг');
  }
  $('#rotate').addEventListener('click',()=>rotate('up'));
  $('#rotate-down').addEventListener('click',()=>rotate('down'));
  $('#drop').addEventListener('click',drop);
  $('#shift-left').addEventListener('click',()=>shift('left'));$('#shift-right').addEventListener('click',()=>shift('right'));
  $('#undo').addEventListener('click',undo);$('#hint').addEventListener('click',hint);
  $('#new-game').addEventListener('click',()=>$('#new-dialog').showModal());
  $('#confirm-new').addEventListener('click',newGame);$('#play-again').addEventListener('click',newGame);
  $('#result-back').addEventListener('click',()=>state.status==='lost'?undo():$('#result-dialog').close());
  document.querySelectorAll('.rules-trigger').forEach(b=>b.addEventListener('click',()=>$('#rules-dialog').showModal()));
  $('#start-playing').addEventListener('click',()=>$('#rules-dialog').close());
  $('#settings').addEventListener('click',()=>{
    $('#sound-setting').checked=preferences.sound;$('#motion-setting').checked=preferences.reduced;
    $('#settings-dialog').showModal();
  });
  $('#sound-setting').addEventListener('change',e=>{preferences.sound=e.target.checked;save();sound('tap');});
  $('#motion-setting').addEventListener('change',e=>{preferences.reduced=e.target.checked;updateControls();save();});
  document.querySelectorAll('.dialog-close,.dialog-cancel').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{
    if(e.target!==d)return;const r=d.getBoundingClientRect();
    if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();
  }));
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey||document.querySelector('dialog[open]')||e.target.matches('input,textarea'))return;
    if(e.code==='Space'){e.preventDefault();if(!e.repeat)drop();}
    else if(e.code==='ArrowUp'){e.preventDefault();rotate('up');}
    else if(e.code==='ArrowDown'){e.preventDefault();rotate('down');}
    else if(e.code==='ArrowLeft'){e.preventDefault();shift('left');}
    else if(e.code==='ArrowRight'){e.preventDefault();shift('right');}
    else if(e.code==='KeyZ'){e.preventDefault();undo();}
  });
  // A vertical swipe turns the cylinder; a horizontal swipe shifts its active row.
  let pointerStart;
  const drumWindow = $('.drum-window');
  drumWindow.style.touchAction = 'none';
  drumWindow.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    pointerStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
    drumWindow.setPointerCapture(e.pointerId);
  });
  drumWindow.addEventListener('pointerup', e => {
    if (!pointerStart || pointerStart.id !== e.pointerId) return;
    const dx = e.clientX - pointerStart.x, dy = e.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.max(Math.abs(dx),Math.abs(dy)) < 18) return;
    if (Math.abs(dx) > Math.abs(dy)) shift(dx < 0 ? 'left' : 'right');
    else rotate(dy < 0 ? 'down' : 'up');
  });
  drumWindow.addEventListener('pointercancel', () => { pointerStart = null; });
  for (let i=0; i<15; i++) {
    const spark = document.createElement('i'); spark.className='ambient-spark';
    spark.setAttribute('aria-hidden','true');
    spark.style.cssText=`left:${5+(i*31)%90}%;top:${10+(i*17)%80}%;--duration:${5+i%4}s;--delay:${-i*.7}s`;
    $('#machine').append(spark);
  }
  render();save();
  if(state.status!=='playing')status(state.status==='won'?'Все четыре дверцы закрыты. Можно начать новую партию.':'Партия завершена. Отмените ход или начните заново.',state.status==='lost');
  else rowStatus('Пробел — DROP · ↑ ↓ барабан · ← → сдвиг');
})();
