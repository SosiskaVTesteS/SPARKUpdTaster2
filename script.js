/**
 * SPARK — 404 | script-404.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Модули:
 *  1. StarfieldEngine   — Canvas: три слоя звёзд с мерцанием (micro/mid/giant)
 *  2. TypewriterEngine  — Последовательная «печать» строк терминала
 *  3. HeaderEngine      — Поведение шапки (показ/скрытие при скролле)
 *  4. Init              — Точка входа
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';


/* ═══════════════════════════════════════════════════════════════════════════
   1. STARFIELD ENGINE
   Три независимых слоя звёзд на одном canvas:
     • micro  — 200 звёзд, 0.2–0.8px,  быстрое мерцание
     • mid    — 90  звёзд, 0.8–1.6px,  медленное дыхание
     • giant  — 4   звезды, 2.0–3.0px, мятный отблеск, почти статичные
   Конечный автомат на каждую звезду: BORN → BRIGHT → DIM → DEAD → respawn
   ═══════════════════════════════════════════════════════════════════════════ */

const StarfieldEngine = (() => {

  /* ── Настройки слоёв ─────────────────────────────────────── */
  const LAYERS = [
    {
      name:      'micro',
      count:     200,
      sizeMin:   0.2,  sizeMax:  0.8,
      alphaMin:  0.15, alphaMax: 0.55,
      speedMin:  0.005, speedMax: 0.012,
      warm:      0.15,   // вероятность тёплого оттенка
    },
    {
      name:      'mid',
      count:     90,
      sizeMin:   0.8,  sizeMax:  1.6,
      alphaMin:  0.25, alphaMax: 0.75,
      speedMin:  0.002, speedMax: 0.006,
      warm:      0.25,
    },
    {
      name:      'giant',
      count:     4,
      sizeMin:   2.0,  sizeMax:  3.0,
      alphaMin:  0.5,  alphaMax: 0.85,
      speedMin:  0.001, speedMax: 0.002,
      warm:      0,      // гиганты — всегда мятные/холодные
      mint:      true,   // специальный флаг для мятного свечения
    },
  ];

  const FPS_TARGET = 40;
  const FRAME_MS   = 1000 / FPS_TARGET;

  /* Состояния жизненного цикла */
  const S = { BORN: 0, BRIGHT: 1, DIM: 2, DEAD: 3 };

  let canvas, ctx;
  let W = 0, H = 0;
  let stars     = [];
  let lastFrame = 0;
  let raf       = null;

  /* ── Создать одну звезду ──────────────────────────────────── */
  function createStar(layer, x, y) {
    const size     = layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin);
    const maxAlpha = layer.alphaMin + Math.random() * (layer.alphaMax - layer.alphaMin);
    const speed    = layer.speedMin + Math.random() * (layer.speedMax - layer.speedMin);

    return {
      x:          x ?? Math.random() * W,
      y:          y ?? Math.random() * H,
      size,
      maxAlpha,
      alpha:      0,
      state:      S.BORN,
      speed,
      phase:      Math.random() * Math.PI * 2,
      brightTicks: 0,
      warm:        Math.random() < (layer.warm ?? 0.2),
      mint:        layer.mint ?? false,
      layer,
    };
  }

  /* ── Обновить состояние одной звезды ─────────────────────── */
  function tickStar(s) {
    s.phase += s.speed;

    switch (s.state) {

      case S.BORN:
        s.alpha += s.speed * 2;
        if (s.alpha >= s.maxAlpha) {
          s.alpha = s.maxAlpha;
          s.state = Math.random() < 0.35 ? S.DIM : S.BRIGHT;
          s.brightTicks = Math.floor(
            Math.random() * (s.mint ? 600 : 250) + (s.mint ? 300 : 60)
          );
        }
        break;

      case S.BRIGHT:
        // Мягкое «дыхание» вокруг maxAlpha
        s.alpha = s.maxAlpha + Math.sin(s.phase) * (s.maxAlpha * 0.15);
        s.brightTicks--;
        if (s.brightTicks <= 0) s.state = S.DIM;
        break;

      case S.DIM:
        s.alpha -= s.speed * 0.9;
        if (s.alpha <= 0) {
          s.alpha = 0;
          s.state = S.DEAD;
        }
        break;

      case S.DEAD:
        // Respawn: гиганты остаются на месте, остальные — в случайной позиции
        if (Math.random() < (s.mint ? 0.001 : 0.006)) {
          const nx = s.mint ? s.x : undefined;
          const ny = s.mint ? s.y : undefined;
          Object.assign(s, createStar(s.layer, nx, ny));
        }
        break;
    }
  }

  /* ── Нарисовать одну звезду ───────────────────────────────── */
  function drawStar(s) {
    const a = Math.max(0, Math.min(1, s.alpha));
    if (a <= 0.005) return;

    ctx.save();
    ctx.globalAlpha = a;

    let color;
    if (s.mint) {
      color = '110,231,183';   // мятные гиганты
    } else if (s.warm) {
      color = '255,235,190';   // тёплые (желтоватые)
    } else {
      color = '210,225,255';   // холодные (голубоватые)
    }

    ctx.fillStyle = `rgba(${color},1)`;

    /* Свечение — только для mid и giant */
    if (s.size > 0.8 && a > 0.25) {
      ctx.shadowBlur  = s.size * (s.mint ? 14 : 5);
      ctx.shadowColor = s.mint
        ? `rgba(110,231,183,${a * 0.55})`
        : s.warm
          ? `rgba(255,220,130,${a * 0.45})`
          : `rgba(150,185,255,${a * 0.4})`;
    }

    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ── Главный цикл ─────────────────────────────────────────── */
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (ts - lastFrame < FRAME_MS) return;
    lastFrame = ts;

    /* Мягкий trail: не полный clear — создаёт «хвосты» у ярких звёзд */
    ctx.fillStyle = 'rgba(5,7,10,0.52)';
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < stars.length; i++) {
      tickStar(stars[i]);
      drawStar(stars[i]);
    }
  }

  /* ── Пересчитать размер canvas ────────────────────────────── */
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight; // 404 — один экран, fixed canvas достаточно

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);
  }

  /* ── Создать все звёзды ───────────────────────────────────── */
  function populateStars() {
    stars = [];
    LAYERS.forEach(layer => {
      for (let i = 0; i < layer.count; i++) {
        const s = createStar(layer);
        // Начинаем в случайном состоянии жизненного цикла для естественности
        s.alpha       = Math.random() * s.maxAlpha;
        s.state       = Math.random() < 0.55 ? S.BRIGHT : S.DIM;
        s.brightTicks = Math.floor(Math.random() * 200 + 30);
        stars.push(s);
      }
    });
  }

  /* ── Публичный интерфейс ──────────────────────────────────── */
  function init() {
    canvas = document.getElementById('starfield');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    resize();
    populateStars();

    raf = requestAnimationFrame(loop);

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => resize(), 220);
    }, { passive: true });
  }

  function destroy() {
    if (raf) cancelAnimationFrame(raf);
  }

  return { init, destroy };
})();


/* ═══════════════════════════════════════════════════════════════════════════
   2. TYPEWRITER ENGINE
   Последовательно «печатает» строки терминала, управляя через data-delay.

   Алгоритм:
     1. Собираем все .t-line в порядке data-delay.
     2. Для каждой строки:
        a. Делаем её видимой (.t-line--visible).
        b. Находим .t-text внутри и запускаем typewriter посимвольно.
           Если внутри .t-text есть дочерние span (акценты, glitch) —
           обходим DOM-дерево, печатая текстовые узлы, сохраняя разметку.
        c. По окончании — переходим к следующей строке.
     3. После последней строки — показываем кнопку .return-wrap.

   Строки-исключения (не печатаются посимвольно):
     • .t-divider       — просто появляется (нет текста)
     • .t-line--cursor  — просто появляется (курсор управляется CSS)
     • .t-line--meta    — появляется целиком (технические теги выглядят
                          лучше как мгновенный «вывод данных»)
   ═══════════════════════════════════════════════════════════════════════════ */

const TypewriterEngine = (() => {

  /* ── Настройки тайминга ────────────────────────────────────── */
  const CHAR_DELAY_MS  = 30;    // мс между символами (обычный текст)
  const ERROR_CHAR_MS  = 22;    // чуть быстрее для строки ошибки (напряжение)
  const LINE_PAUSE_MS  = 380;   // пауза между строками
  const INIT_DELAY_MS  = 1400;  // задержка перед стартом (дать CSS-анимациям отыграть)

  /* ── Вспомогательная: собрать все текстовые узлы из элемента ── */
  /**
   * Рекурсивно собирает «задания» на печать.
   * Каждое задание: { node: TextNode, text: string }
   * Изначально все текстовые узлы очищаются, потом JS вставляет символы.
   */
  function collectTextNodes(el) {
    const jobs = [];

    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (text.trim() === '') return; // пустые пробелы — пропускаем
        node.textContent = ''; // очищаем — будем печатать
        jobs.push({ node, text });
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Не трогаем .t-dots — у него анимация CSS
        if (node.classList.contains('t-dots')) return;
        node.childNodes.forEach(walk);
      }
    }

    walk(el);
    return jobs;
  }

  /* ── Напечатать один текстовый узел ──────────────────────── */
  function typeNode(job, charDelayMs) {
    return new Promise(resolve => {
      let i = 0;
      const chars = [...job.text]; // корректная итерация по Unicode

      function nextChar() {
        if (i >= chars.length) {
          resolve();
          return;
        }
        job.node.textContent += chars[i++];

        // Случайные микро-паузы — имитируют живой ввод
        const jitter = Math.random() < 0.08 ? charDelayMs * 2.5 : 0;
        setTimeout(nextChar, charDelayMs + jitter);
      }

      nextChar();
    });
  }

  /* ── Напечатать все текстовые узлы строки последовательно ── */
  async function typeLine(line) {
    const isError = line.classList.contains('t-line--error');
    const charMs  = isError ? ERROR_CHAR_MS : CHAR_DELAY_MS;

    const textEl = line.querySelector('.t-text');
    if (!textEl) return; // .t-divider, .t-cursor — текста нет

    const jobs = collectTextNodes(textEl);

    for (const job of jobs) {
      await typeNode(job, charMs);
    }
  }

  /* ── Главная функция: запускаем строки последовательно ────── */
  async function run() {
    // Ждём: CSS-анимации появления терминала должны отыграть
    await pause(INIT_DELAY_MS);

    // Собираем строки в порядке data-delay
    const lines = [...document.querySelectorAll('.t-line, .t-divider')]
      .sort((a, b) => +a.dataset.delay - +b.dataset.delay);

    for (const line of lines) {
      // Показываем строку (CSS transition opacity: 0 → 1)
      line.classList.add('t-line--visible');

      const isMeta   = line.classList.contains('t-line--meta');
      const isCursor = line.classList.contains('t-line--cursor');
      const isDivider = line.classList.contains('t-divider');

      if (isDivider || isCursor) {
        // Просто ждём паузу и идём дальше
        await pause(LINE_PAUSE_MS * 0.6);
        continue;
      }

      if (isMeta) {
        // Метаданные — появляются как мгновенный дамп данных,
        // без посимвольной печати. Пауза чуть длиннее — эффект «загрузки».
        await pause(LINE_PAUSE_MS * 1.4);
        continue;
      }

      // Обычная строка — печатаем посимвольно
      await typeLine(line);
      await pause(LINE_PAUSE_MS);
    }

    // Все строки напечатаны — показываем кнопку
    showReturnButton();
  }

  /* ── Показать кнопку возврата ─────────────────────────────── */
  function showReturnButton() {
    const wrap = document.querySelector('.return-wrap');
    if (!wrap) return;

    wrap.classList.add('is-visible');
    wrap.removeAttribute('aria-hidden');

    // Делаем кнопку доступной для скринридеров
    const btn = wrap.querySelector('.return-btn');
    if (btn) btn.removeAttribute('tabindex');
  }

  /* ── Утилита: Promise-обёртка над setTimeout ──────────────── */
  function pause(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /* ── Reduced-motion: пропускаем анимацию, показываем всё сразу ── */
  function runInstant() {
    document.querySelectorAll('.t-line, .t-divider').forEach(el => {
      el.classList.add('t-line--visible');
    });
    showReturnButton();
  }

  /* ── Публичный интерфейс ──────────────────────────────────── */
  function init() {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      runInstant();
    } else {
      run();
    }
  }

  return { init };
})();


/* ═══════════════════════════════════════════════════════════════════════════
   3. HEADER ENGINE
   Прячет шапку при быстром скролле вниз, показывает при скролле вверх.
   Идентично поведению на /about.
   ═══════════════════════════════════════════════════════════════════════════ */

const HeaderEngine = (() => {
  function init() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    let lastScroll = 0;
    let ticking    = false;

    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        const curr  = window.scrollY;
        const delta = curr - lastScroll;

        if (curr < 60) {
          header.classList.remove('header--hidden');
        } else if (delta > 8) {
          header.classList.add('header--hidden');
        } else if (delta < -8) {
          header.classList.remove('header--hidden');
        }

        lastScroll = curr;
        ticking    = false;
      });
    }, { passive: true });
  }

  return { init };
})();


/* ═══════════════════════════════════════════════════════════════════════════
   4. REDUCED MOTION — глобальная проверка системных настроек
   ═══════════════════════════════════════════════════════════════════════════ */

function respectReducedMotion() {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (mq.matches) {
    document.documentElement.classList.add('reduced-motion');
    // Скрываем canvas — CSS обработает остальное
    const canvas = document.getElementById('starfield');
    if (canvas) canvas.style.display = 'none';
  }
}


/* ═══════════════════════════════════════════════════════════════════════════
   INIT — точка входа
   ═══════════════════════════════════════════════════════════════════════════ */

function init() {
  respectReducedMotion();

  StarfieldEngine.init();
  TypewriterEngine.init();
  HeaderEngine.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
