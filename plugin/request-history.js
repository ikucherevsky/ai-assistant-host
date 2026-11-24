(function(){'use strict';
  // Per-panel document history. Never share credentials or route results between tabs.
  const records=[];
  window.AIRequestHistory={
    remember(task,snapshot,formatCapture,settings,checkpoint){
      let entry=records.find(e=>e.task.id===task.id);
      if(entry){entry.task=task;if(checkpoint)entry.checkpoint=checkpoint;}
      else{entry={task,snapshot,formatCapture,settings,checkpoint};records.unshift(entry);if(records.length>20)records.pop();}
      return entry;
    },
    find:id=>records.find(e=>e.task.id===id),latest:scenario=>records.find(e=>e.task.scenario===scenario),all:()=>records.slice(),
    label(entry){const t=entry.task,names={style:'Стиль текста',summary:'Вывод',presentation:'Слайды',questions:'Вопросы',image:'Изображение',format:'Форматирование'},styles={poetic:'Стихотворный',official:'Официальный',conversational:'Разговорный',technical:'Технический'};
      return names[t.scenario]+(t.scenario==='style'?' · '+styles[t.style]:'')+' · '+new Date(t.created).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})+' · '+({queued:'В очереди',working:'В работе',ready:'Готово',applied:'Применено',cancelled:'Отменено',failed:'Ошибка',unknown:'Проверьте документ',applying:'Вставка'}[t.state]||t.state);
    }
  };
})();
