(function(){'use strict';
  const $=id=>document.getElementById(id),F=AIFormat,box=$('formatBuilder');
  function field(label,id,type,value,min,max){const l=document.createElement('label');l.textContent=label;const input=document.createElement('input');input.id=id;input.type=type;input.value=value;if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;if(type==='number')input.step='.1';l.append(input);return l;}
  function select(label,id,items){const l=document.createElement('label');l.textContent=label;const e=document.createElement('select');e.id=id;items.forEach(([value,text])=>{const o=document.createElement('option');o.value=value;o.textContent=text;e.append(o);});l.append(e);return l;}
  // Use the editor's Windows font catalogue, which also includes per-user fonts.
  const installedFonts = [...new Set((parent.AscFonts?.g_font_infos || [])
    .map(info => info.Name)
    .filter(name => typeof name === 'string' && name.trim() && name.length <= 80 && !/[<>;:{}\x00-\x1f]/.test(name)))]
    .sort((a, b) => a.localeCompare(b, 'ru'));
  const fontPickers = new Map();

  function fontField(label, id, value) {
    if (!installedFonts.length) return field(label, id, 'text', value);
    const group = document.createElement('div');
    group.className = 'format-font-picker';
    const caption = document.createElement('label');
    caption.textContent = label;
    caption.htmlFor = id + '-toggle';
    const picker = document.createElement('input');
    picker.type = 'hidden';
    picker.id = id;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = caption.htmlFor;
    toggle.setAttribute('aria-expanded', 'false');
    const popup = document.createElement('div');
    popup.className = 'format-font-popup';
    popup.id = id + '-popup';
    popup.hidden = true;
    toggle.setAttribute('aria-controls', popup.id);
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Поиск шрифта';
    search.setAttribute('aria-label', 'Поиск: ' + label);
    search.autocomplete = 'off';
    const list = document.createElement('div');
    list.className = 'format-font-options';
    popup.append(search, list);
    group.append(caption, picker, toggle, popup);

    function close(restoreFocus = false) {
      popup.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (restoreFocus) toggle.focus();
    }

    function choose(name) {
      setFont(picker, name);
      picker.dispatchEvent(new Event('change', {bubbles: true}));
      close(true);
    }

    function filter() {
      const query = search.value.trim().toLocaleLowerCase('ru');
      const matches = installedFonts.filter(name => name.toLocaleLowerCase('ru').includes(query));
      list.replaceChildren(...matches.map(name => {
        const option = document.createElement('button');
        option.type = 'button';
        option.textContent = name;
        option.setAttribute('aria-pressed', String(name === picker.value));
        option.onclick = () => choose(name);
        return option;
      }));
      if (!matches.length) list.textContent = 'Шрифты не найдены';
      list.scrollTop = 0;
    }

    toggle.onclick = () => {
      if (!popup.hidden) { close(); return; }
      search.value = '';
      filter();
      popup.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      search.focus();
    };
    search.addEventListener('input', filter);
    group.addEventListener('focusout', event => {
      if (!group.contains(event.relatedTarget)) close();
    });
    popup.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(true);
      } else if (!event.isComposing && event.target === search && event.key === 'Enter') {
        event.preventDefault();
        list.querySelector('button')?.click();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = event.target === search ? list.firstElementChild :
          event.key === 'ArrowDown' ? event.target.nextElementSibling : event.target.previousElementSibling || search;
        next?.focus();
      }
    });
    fontPickers.set(picker, toggle);
    setFont(picker, value);
    return group;
  }

  function setFont(control, value) {
    control.value = value;
    const toggle = fontPickers.get(control);
    if (toggle) toggle.textContent = value;
  }
  let closeEditorColor;
  window.addEventListener('beforeunload', () => closeEditorColor?.());

  function openEditorColor(initial, confirm) {
    const host = parent;
    const Dialog = host.Common?.UI?.ExtendedColorDialog;
    const api = host.Asc?.editor;
    if (!Dialog) {
      window.AIAssistant.status('Стандартное окно выбора цвета недоступно в этой версии Р7.', true);
      return;
    }

    closeEditorColor?.();
    const dialog = new Dialog({});
    dialog.options.animate = false;
    dialog.setColor(initial.slice(1));
    let closed = false, sampling = false, timer, sample;
    function cleanup() {
      closed = true;
      clearInterval(timer);
      closeEditorColor = null;
    }
    closeEditorColor = () => {
      if (sampling && api.isEyedropperStarted()) api.asc_cancelEyedropper();
      if (sampling) dialog.show();
      cleanup();
      dialog.close(true);
    };
    dialog.on('onmodalresult', result => {
      const color = dialog.getColor();
      cleanup();
      if (result === 1 && /^[a-f0-9]{6}$/i.test(color)) confirm('#' + color);
    });
    dialog.show();
    const footer = dialog.getChild('.footer')[0];
    dialog.getChild('.footer .dlg-btn[result="1"]').text('Добавить');
    dialog.getChild('.footer .dlg-btn[result="0"]').text('Отмена');
    if (!footer || !api?.asc_startEyedropper) return;

    const eye = host.document.createElement('button');
    eye.type = 'button';
    eye.className = 'btn btn-default';
    eye.title = 'Пипетка';
    eye.setAttribute('aria-label', 'Пипетка');
    eye.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="m13 6 5-4 4 4-5 5M10 7l7 7M12 9l-8 8-1 4 4-1 8-8"/></svg>';
    footer.prepend(eye);
    eye.onclick = () => {
      if (closed || sampling || api.isEyedropperStarted()) return;
      sampling = true;
      sample = null;
      dialog.hide();
      api.asc_startEyedropper((r,g,b) => {
        if ([r,g,b].every(Number.isInteger)) sample = host.Common.Utils.ThemeColor.getHexColor(r,g,b);
      });
      timer = setInterval(() => {
        if (api.isEyedropperStarted()) return;
        clearInterval(timer);
        sampling = false;
        if (closed) return;
        if (sample) { dialog.textColor.setValue(sample.toUpperCase()); dialog.onChangeMaskedField(null, sample); }
        dialog.show();
        eye.focus();
      }, 40);
    };
  }

  function colorField(label, id, value) {
    const group = document.createElement('div');
    group.className = 'format-font-picker format-color-picker';
    const caption = document.createElement('label');
    caption.textContent = label;
    caption.htmlFor = id + '-toggle';
    const input = document.createElement('input');
    input.type = 'color';
    input.id = id;
    input.value = value;
    input.tabIndex = -1;
    input.className = 'format-custom-color';
    input.setAttribute('aria-label', 'Произвольный цвет: ' + label);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = caption.htmlFor;
    toggle.setAttribute('aria-expanded', 'false');
    const popup = document.createElement('div');
    popup.className = 'format-font-popup format-color-popup';
    popup.id = id + '-popup';
    popup.hidden = true;
    toggle.setAttribute('aria-controls', popup.id);
    const swatches = document.createElement('div');
    const custom = document.createElement('button');
    custom.type = 'button';
    custom.textContent = 'Другие цвета…';
    popup.append(swatches, custom, input);
    group.append(caption, toggle, popup);
    updateColor(input);

    function positionPopup() {
      const padding = 6;
      const width = document.documentElement.clientWidth;
      const height = document.documentElement.clientHeight;
      const anchor = toggle.getBoundingClientRect();
      const menu = popup.getBoundingClientRect();
      const left = Math.max(padding, Math.min(anchor.right - menu.width, width - menu.width - padding));
      const preferredTop = anchor.bottom + menu.height + padding <= height
        ? anchor.bottom : anchor.top - menu.height;
      const top = Math.max(padding, Math.min(preferredTop, height - menu.height - padding));
      popup.style.left = left + 'px';
      popup.style.top = top + 'px';
    }

    function close() {
      popup.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      window.removeEventListener('resize', positionPopup);
      window.removeEventListener('scroll', positionPopup, true);
    }

    function palette(label, colors) {
      if (!colors?.length) return;
      const title = document.createElement('div');
      title.textContent = label;
      const grid = document.createElement('div');
      grid.className = 'format-color-swatches';
      for (const {color, tip, effectId} of colors) {
        if (!/^[0-9a-f]{6}$/i.test(color)) continue;
        const hex = '#' + color.toLowerCase();
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.style.backgroundColor = hex;
        chip.title = tip || hex;
        chip.setAttribute('aria-label', chip.title);
        chip.setAttribute('aria-pressed', String(input.value === hex));
        chip.onclick = () => {
          input.value = hex;
          if (Number.isInteger(effectId)) input.dataset.themeColor = String(effectId);
          else delete input.dataset.themeColor;
          updateColor(input);
          input.dispatchEvent(new Event('input', {bubbles: true}));
          toggle.focus();
          close();
        };
        grid.append(chip);
      }
      swatches.append(title, grid);
    }

    toggle.onclick = () => {
      if (!popup.hidden) { close(); return; }
      const theme = parent.Common?.Utils?.ThemeColor;
      swatches.replaceChildren();
      palette('Цвета темы документа', theme?.getEffectColors?.());
      palette('Стандартные цвета', theme?.getStandartColors?.());
      popup.hidden = false;
      positionPopup();
      window.addEventListener('resize', positionPopup);
      window.addEventListener('scroll', positionPopup, true);
      toggle.setAttribute('aria-expanded', 'true');
      (swatches.querySelector('button') || custom).focus({preventScroll: true});
    };
    custom.onclick = () => {
      close();
      openEditorColor(input.value, color => {
        input.value = color;
        delete input.dataset.themeColor;
        input.dispatchEvent(new Event('change', {bubbles:true}));
      });
    };
    input.onchange = () => { updateColor(input); toggle.focus(); close(); };
    group.addEventListener('focusout', event => {
      if (event.relatedTarget && !group.contains(event.relatedTarget)) close();
    });
    group.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !popup.hidden) {
        event.stopPropagation();
        toggle.focus();
        close();
      }
    });
    document.addEventListener('pointerdown', event => {
      if (!popup.hidden && !group.contains(event.target)) close();
    });
    return group;
  }

  function setProfileColor(input, style) {
    input.value = style.color;
    if (style.themeColor === undefined) delete input.dataset.themeColor;
    else input.dataset.themeColor = String(style.themeColor);
    updateColor(input);
  }

  function readProfileColor(input, style) {
    style.color = input.value;
    if (input.dataset.themeColor !== undefined) style.themeColor = Number(input.dataset.themeColor);
  }

  function updateColor(input) {
    const toggle = input.closest('.format-color-picker').querySelector('button');
    toggle.style.setProperty('--font-color', input.value);
    toggle.textContent = input.value.toUpperCase();
  }
  function grid(...fields){const e=document.createElement('div');e.className='format-grid';e.append(...fields);return e;}
  const paths={library:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',text:'M4 5h16 M12 5v15 M8 20h8',paragraph:'M4 5h16 M4 10h16 M4 15h16 M4 20h10',heading:'M5 4v16 M19 4v16 M5 12h14',table:'M3 4h18v16H3z M3 10h18 M10 4v16',structure:'M4 5h16 M4 12h4 M11 12h9 M4 19h4 M11 19h9'};
  function decorate(title,key){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','format-icon');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[key]);svg.append(path);title.prepend(svg);}
  function section(name,key,open=false){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=name;decorate(summary,key);details.open=open;details.append(summary);box.append(details);return details;}
  let samplePage, loadingSamplePage = false;
  function styleSamples() {
    const samples = document.createElement('div');
    samples.className = 'format-style-samples';
    const paper = document.createElement('article');
    const content = document.createElement('div');
    content.className = 'format-sample-content';
    paper.append(content);
    samples.append(paper);
    const blocks = [
      {type:'heading',level:1,text:'Проект документа'},
      {type:'paragraph',text:'В этом разделе описаны цели проекта и порядок работы. Согласованные решения фиксируются в итоговом документе.'},
      {type:'heading',level:2,text:'Порядок работы'},
      {type:'paragraph',text:'Работа состоит из двух этапов. Каждый этап завершается проверкой результата.'},
      {type:'heading',level:3,text:'Сроки и результаты'},
      {type:'table',rows:[['Этап','Результат'],['Анализ','Требования'],['Проверка','Отчёт']]}
    ];
    return {
      samples,
      update(profile) {
        const px = 96 / 25.4;
        const page = samplePage || {widthMm:210,heightMm:297};
        const margins = samplePage && !$('fmtMargins').checked ? samplePage.marginsMm : profile.margins;
        const width = Math.max(100,(page.widthMm-margins.left-margins.right)*px);
        paper.style.width = width + 'px';
        const counters = Array(9).fill(0);
        const html = blocks.map(block => AIResultHTML.block(block, profile, {}, document, counters));
        const list = document.createElement('ol');
        const number = profile.lists?.number;
        list.style.listStyleType = ({upperRoman:'upper-roman',lowerRoman:'lower-roman',upperLetter:'upper-alpha',lowerLetter:'lower-alpha'})[number] || 'decimal';
        for (const text of ['Подготовить материалы.', 'Проверить результат.']) {
          const li = document.createElement('li');
          li.innerHTML = AIResultHTML.block({type:'paragraph',text}, profile, {}, document, []);
          list.append(li);
        }
        if(number === 'decimalParen') list.classList.add('format-sample-number-paren');
        Object.assign(list.style,{fontFamily:profile.body.font,fontSize:profile.body.size+'pt',color:profile.body.color});
        content.innerHTML = html.slice(0,4).join('') + list.outerHTML + html.slice(4).join('');
        const height = content.offsetHeight;
        if (!height) return;
        const availableWidth = Math.max(48, Math.min(154, carousel.clientWidth - 28));
        const availableHeight = Math.max(45, Math.min(155, window.innerHeight * .23));
        const scale = Math.min(availableWidth / width, availableHeight / height);
        paper.style.height = height + 'px';
        paper.style.transform = 'scale(' + scale + ')';
        samples.style.width = width * scale + 'px';
        samples.style.height = height * scale + 'px';
      }
    };
  }

  function paletteChoices(select) {
    const group = document.createElement('div');
    group.className = 'format-palette-choices';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Стандартные палитры');
    for (const theme of F.themes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = theme.name;
      button.setAttribute('aria-label', theme.name);
      button.dataset.palette = theme.id;
      for (const color of (theme.swatches || [theme.ink, theme.accent, theme.light, theme.border])) {
        const swatch = document.createElement('span');
        swatch.style.backgroundColor = color;
        button.append(swatch);
      }
      button.onclick = () => {
        select.value = theme.id;
        select.dispatchEvent(new Event('change', {bubbles: true}));
      };
      group.append(button);
    }
    return {
      group,
      update() {
        for (const button of group.children) {
          button.setAttribute('aria-pressed', String(button.dataset.palette === select.value));
        }
      }
    };
  }

  const controls=grid(select('Шаблон документа','fmtPreset',F.presets.map(p=>[p.id,p.name])),select('Стандартная палитра','fmtTheme',F.themes.map(t=>[t.id,t.name])));box.append(controls);
  const library=section('Шаблоны и темы','library',true);library.append(controls);
  const carousel = document.createElement('div');
  carousel.className = 'format-style-carousel';
  carousel.setAttribute('role', 'group');
  carousel.setAttribute('aria-label', 'Карусель шаблонов оформления');
  carousel.tabIndex = 0;
  const cards = F.presets.map(preset => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.preset = preset.id;
    button.setAttribute('aria-label', preset.name);
    const title = document.createElement('strong');
    title.textContent = preset.name;
    const sample = styleSamples();
    button.append(title, sample.samples);
    button.onclick = () => {
      $('fmtPreset').value = preset.id;
      $('fmtPreset').dispatchEvent(new Event('change'));
    };
    carousel.append(button);
    return {preset, button, sample};
  });
  const builderPalettes = paletteChoices($('fmtTheme'));
  const carouselControls = document.createElement('div');
  carouselControls.className = 'format-carousel-controls';
  for (const [direction, label] of [[-1, 'Предыдущий шаблон'], [1, 'Следующий шаблон']]) {
    const arrow = document.createElement('button');
    arrow.type = 'button';
    arrow.textContent = direction < 0 ? '‹' : '›';
    arrow.setAttribute('aria-label', label);
    arrow.onclick = () => carousel.scrollBy({left: direction * carousel.clientWidth});
    carouselControls.append(arrow);
  }
  library.append(builderPalettes.group);
  const main = document.querySelector('main');
  const previewShelf = document.createElement('section');
  previewShelf.className = 'format-preview-shelf';
  previewShelf.hidden = true;
  previewShelf.setAttribute('aria-label', 'Предпросмотр шаблонов');
  previewShelf.append(carouselControls, carousel);
  main.before(previewShelf);

  const actionShelf = document.createElement('div');
  actionShelf.className = 'format-action-shelf';
  actionShelf.hidden = true;
  main.after(actionShelf);
  const pinnedActions = ['send','cancel','previewOpen'].map(id => {
    const button = $(id);
    const home = document.createComment(id);
    button.before(home);
    return {button,home};
  });
  function syncLayout() {
    const visible = !!document.querySelector('[data-tab="format"].active') && $('formatMode').value === 'builder';
    previewShelf.hidden = actionShelf.hidden = !visible;
    for (const {button,home} of pinnedActions) {
      if (visible) {
        if (button.parentElement !== actionShelf) actionShelf.append(button);
      } else if (button.parentElement === actionShelf) home.after(button);
    }
    if (visible) refreshBuilderSamples();
  }
  window.addEventListener('resize', () => { if (!previewShelf.hidden) refreshBuilderSamples(); });
  const text=section('Основной текст','text',true);
  box.append(grid(fontField('Шрифт текста','fmtFont','Arial'),field('Размер, пт','fmtSize','number',11,6,72)));
  box.append(grid(select('Выравнивание','fmtAlign',[['left','Слева'],['both','По ширине'],['center','По центру'],['right','Справа']]),colorField('Цвет текста','fmtColor','#243447')));
  text.append($('fmtFont').closest('.format-grid'),$('fmtAlign').closest('.format-grid'));
  const paras=document.createElement('details');const title=document.createElement('summary');title.textContent='Абзацы и поля';decorate(title,'paragraph');paras.append(title);
  paras.append(grid(field('Межстрочный множитель','fmtLine','number',1.15,.8,3),field('Первая строка, мм','fmtFirst','number',0,0,80)),grid(field('До абзаца, пт','fmtBefore','number',0,0,144),field('После абзаца, пт','fmtAfter','number',6,0,144)),grid(field('Отступ слева, мм','fmtLeft','number',0,0,80),field('Отступ справа, мм','fmtRight','number',0,0,80)));
  paras.append(grid(...['top','bottom','left','right'].map((key,i)=>field(['Поле сверху, мм','Поле снизу, мм','Поле слева, мм','Поле справа, мм'][i],'fmtMargin-'+key,'number',20,0,80))));
  const margins=document.createElement('label');margins.className='format-check';margins.innerHTML='<input type="checkbox" id="fmtMargins" checked> Изменять поля разделов всего документа';paras.append(margins);box.append(paras);
  const headings=document.createElement('details'),headingTitle=document.createElement('summary');headingTitle.textContent='Заголовки 1–9';decorate(headingTitle,'heading');headings.append(headingTitle);
  const headingScroll=document.createElement('div');
  headingScroll.className='format-heading-scroll';
  headingScroll.tabIndex=0;
  headingScroll.setAttribute('role','region');
  headingScroll.setAttribute('aria-label','Настройки заголовков 1–9');
  headings.append(headingScroll);
  for(let level=1;level<=9;level++){const row=document.createElement('div');row.className='format-heading-row';const name=document.createElement('strong');name.textContent='Заголовок '+level;row.append(name,grid(fontField('Шрифт','fmtHFont'+level,'Arial'),field('Размер, пт','fmtHSize'+level,'number',level===1?22:level===2?17:14,6,96)),grid(colorField('Цвет','fmtHColor'+level,'#2F5496'),field('После, пт','fmtHAfter'+level,'number',6,0,144)));for(const [key,label] of [['Bold','Полужирный'],['Underline','Подчёркивание']]){const l=document.createElement('label');l.className='format-check';const input=document.createElement('input');input.type='checkbox';input.id='fmtH'+key+level;input.checked=key==='Bold';l.append(input,document.createTextNode(label));row.append(l);}
    const decoration = select('Оформление заголовка','fmtHDecoration'+level,[
      ['none','Без оформления'],['bottom','Сплошная линия снизу'],['left','Линия сбоку'],['band','Плашка']
    ]);
    const band = colorField('Цвет плашки','fmtHBand'+level,'#E8EFF8');
    const choice = decoration.querySelector('select');
    band.hidden = true;
    choice.addEventListener('change',()=>{band.hidden=choice.value!=='band';});
    band.addEventListener('input',()=>{const input=$('fmtHBand'+level);input.dataset.customBand=input.value;});
    band.addEventListener('change',()=>{const input=$('fmtHBand'+level);input.dataset.customBand=input.value;});
    row.append(grid(decoration,band));
    headingScroll.append(row);}box.append(headings);
  box.append(select('Нумерация заголовков','fmtNumbering',[['keep','Сохранить имеющуюся'],['decimal','1, 1.1, 1.1.1…'],['none','Без нумерации']]));
  box.append(select('Стиль таблиц','fmtTable',[['banded','Чередующиеся строки'],['accent','Акцентная шапка'],['light','Светлая шапка'],['grid','Сетка'],['none','Без оформления']]),grid(fontField('Шрифт таблиц','fmtTableFont','Arial'),field('Размер таблиц, пт','fmtTableSize','number',11,6,40)));
  headingScroll.append($('fmtNumbering').parentElement);const tables=section('Таблицы','table');tables.append($('fmtTable').parentElement,$('fmtTableFont').closest('.format-grid'));
  const lists=section('Списки','structure');
  lists.append(select('Маркер списка','fmtBulletStyle',F.bulletStyles),select('Нумерация списка','fmtListNumberStyle',F.numberStyles));
  const request=$('formatRequest');
  const requestMargins=document.createElement('label');requestMargins.className='format-check';requestMargins.innerHTML='<input type="checkbox" id="fmtRequestMargins"> Разрешить изменение полей всего документа';request.append(requestMargins);
  const semantic=document.createElement('details'),semanticTitle=document.createElement('summary');semanticTitle.textContent='Структура по смыслу';decorate(semanticTitle,'structure');semantic.append(semanticTitle);semantic.open=true;
  for(const [id,label] of [['Headings','Заглавие и разделы — если уместны'],['Bullets','Перечисления в буллеты — если уместны'],['Tables','Свести подходящие данные в таблицы']]){const l=document.createElement('label');l.className='format-check';l.innerHTML='<input type="checkbox" id="fmtAuto'+id+'"> '+label;inputDefaults(l,id);semantic.append(l);}request.append(semantic);
  function inputDefaults(label,id){label.querySelector('input').checked=id==='Headings'||id==='Bullets';}
  const hint=document.createElement('p');hint.className='muted';hint.textContent='Шрифт обычного выделения меняется в его границах. Параметры абзацев, заголовков и таблиц действуют на целые элементы. Поля относятся к разделам документа. Автоматическая структура готовится GigaCowork для проверки.';box.append(hint);
  function put(p){setFont($('fmtFont'),p.body.font);$('fmtSize').value=p.body.size;setProfileColor($('fmtColor'),p.body);$('fmtAlign').value=p.body.align;for(const [key,id] of [['line','Line'],['first','First'],['before','Before'],['after','After'],['left','Left'],['right','Right']])$('fmt'+id).value=p.body[key];Object.keys(p.margins).forEach(k=>$('fmtMargin-'+k).value=p.margins[k]);p.headings.forEach(h=>{const i=h.level;setFont($('fmtHFont'+i),h.font);$('fmtHSize'+i).value=h.size;setProfileColor($('fmtHColor'+i),h);$('fmtHBold'+i).checked=h.bold;$('fmtHUnderline'+i).checked=h.underline;$('fmtHAfter'+i).value=h.after;$('fmtHDecoration'+i).value=h.decoration||'none';const band=$('fmtHBand'+i);setProfileColor(band,{color:h.bandColor||p.table.light});band.dataset.customBand=h.bandColor||'';band.closest('.format-color-picker').hidden=h.decoration!=='band';});$('fmtTable').value=p.table.style;setFont($('fmtTableFont'),p.table.font);$('fmtTableSize').value=p.table.size;$('fmtBulletStyle').value=p.lists?.bullet||'keep';$('fmtListNumberStyle').value=p.lists?.number||'keep';refreshBuilderSamples();}
  function collect(){const p=F.profile($('fmtPreset').value,$('fmtTheme').value);p.body.font=$('fmtFont').value;p.body.size=+$('fmtSize').value;readProfileColor($('fmtColor'),p.body);p.body.align=$('fmtAlign').value;for(const [key,id] of [['line','Line'],['first','First'],['before','Before'],['after','After'],['left','Left'],['right','Right']])p.body[key]=+$('fmt'+id).value;Object.keys(p.margins).forEach(k=>p.margins[k]=+$('fmtMargin-'+k).value);p.headings.forEach(h=>{const i=h.level;h.font=$('fmtHFont'+i).value;h.size=+$('fmtHSize'+i).value;readProfileColor($('fmtHColor'+i),h);h.bold=$('fmtHBold'+i).checked;h.underline=$('fmtHUnderline'+i).checked;h.after=+$('fmtHAfter'+i).value;h.decoration=$('fmtHDecoration'+i).value;const band=$('fmtHBand'+i);if(band.dataset.customBand)h.bandColor=band.value;});p.table.style=$('fmtTable').value;p.table.font=$('fmtTableFont').value;p.table.size=+$('fmtTableSize').value;p.numbering=$('fmtNumbering').value;p.lists={bullet:$('fmtBulletStyle').value,number:$('fmtListNumberStyle').value};F.validateProfile(p);return p;}
  $('scope').addEventListener('change',()=>{syncScope();});
  function refreshBuilderSamples() {
    const selected = $('fmtPreset').value;
    const theme = $('fmtTheme').value;
    for (const {preset, button, sample} of cards) {
      const active = preset.id === selected;
      button.setAttribute('aria-pressed', String(active));
      try { sample.update(active ? collect() : F.profile(preset.id, theme)); }
      catch (_) { /* Keep the last valid sample while editing a number. */ }
    }
    builderPalettes.update();
  }


  $('fmtPreset').onchange = () => {
    put(F.profile($('fmtPreset').value, $('fmtTheme').value));
    const card = cards.find(item => item.preset.id === $('fmtPreset').value);
    if (card) carousel.scrollLeft += card.button.getBoundingClientRect().left - carousel.getBoundingClientRect().left;
  };
  $('fmtTheme').onchange = () => {
    const palette = F.profile($('fmtPreset').value, $('fmtTheme').value);
    for (const [id, color] of [['fmtColor', palette.body.color],
      ...palette.headings.map(h => ['fmtHColor' + h.level, h.color])]) {
      setProfileColor($(id), {color});
    }
    for(const h of palette.headings){const band=$('fmtHBand'+h.level);if(!band.dataset.customBand)setProfileColor(band,{color:palette.table.light});}
    refreshBuilderSamples();
  };
  box.addEventListener('input', refreshBuilderSamples);
  box.addEventListener('change', refreshBuilderSamples);
  put(F.profile());
  function syncScope(){ $('fmtMargins').checked=$('scope').value==='document';$('fmtRequestMargins').checked=$('scope').value==='document';}
  function syncMode(){
    if(!samplePage&&!loadingSamplePage){
      loadingSamplePage=true;
      R7Native.pageSettings().then(value=>{
        samplePage=value.sections[value.activeSection]||value.sections[0];
        refreshBuilderSamples();
      }).catch(()=>{}).finally(()=>{loadingSamplePage=false;});
    }
    const prompt=$('formatMode').value==='prompt';box.hidden=prompt;request.hidden=!prompt;syncLayout();if(document.querySelector('[data-tab="format"].active')){$('promptLabel').hidden=!prompt;$('send').textContent=prompt?'Отправить запрос в GigaCowork':'Подготовить оформление';}document.querySelectorAll('[data-format-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.formatMode===$('formatMode').value)));}
  $('formatMode').addEventListener('change',syncMode);document.querySelectorAll('[data-format-mode]').forEach(b=>b.onclick=()=>{$('formatMode').value=b.dataset.formatMode;syncMode();});
  window.AIFormatUI={collect:()=> $('formatMode').value==='prompt'?F.profile():collect(),syncScope,syncMode,syncLayout,options(){const enabled=$('formatMode').value==='prompt';return {headings:enabled&&$('fmtAutoHeadings').checked,bullets:enabled&&$('fmtAutoBullets').checked,tables:enabled&&$('fmtAutoTables').checked};},mode:()=>$('formatMode').value,applyMargins:()=>$($('formatMode').value==='prompt'?'fmtRequestMargins':'fmtMargins').checked,put};
})();
