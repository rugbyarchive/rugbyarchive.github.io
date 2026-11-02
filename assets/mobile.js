/* Phone-only navigation. Existing controls/data remain authoritative; every
   moved node returns to its original place when the desktop breakpoint wins. */
(function () {
  'use strict';
  var mq = matchMedia('(max-width:700px)'), undo = [], stop;
  var $ = function (s) { return document.querySelector(s); };
  function mount() {
    stop = new AbortController();
    function on(el, event, fn) { el.addEventListener(event, fn, {signal:stop.signal}); }
    function make(tag, cls, text) { var el=document.createElement(tag);el.className=cls||'';if(text)el.textContent=text;return el; }
    function add(parent, el) { parent.appendChild(el);undo.push(function(){el.remove();});return el; }
    function move(el, parent) { var mark=document.createComment('desktop position');el.before(mark);parent.appendChild(el);undo.push(function(){mark.replaceWith(el);}); }
    function button(text, fn) { var el=make('button','ghostbtn',text);el.type='button';on(el,'click',fn);return el; }
    function jump(el) { el.scrollIntoView({block:'start'}); }
    function group(parent, nodes, title) {
      var details=add(parent,make('details','mobile-group'));add(details,make('summary','',title));nodes.forEach(function(n){move(n,details);});return details;
    }
    var brand=$('.topbar .brand'), nav=$('.mainnav'), themes=$('.themeswitch');
    if(brand&&nav){var menu=add(brand,make('details','mobile-menu'));add(menu,make('summary','','Menu · '+(nav.querySelector('.here')?.textContent||'Archive')));move(nav,menu);if(themes)move(themes,menu);}

    var filters=$('#filters'), toggle=$('#filtertoggle');
    if(filters&&toggle){
      var dialog=add(document.body,make('dialog','mobile-filters'));
      dialog.setAttribute('aria-label','Filter matches');move(filters,dialog);
      var head=filters.querySelector('.filters-head'), body=add(filters,make('div','mobile-filter-fields'));
      add(body,make('p','mobile-filter-note','Results update as you choose. Close keeps your selections.'));
      Array.from(filters.querySelectorAll(':scope > .fgroup')).forEach(function(n){move(n,body);});
      var footer=add(filters,make('div','mobile-filter-footer'));
      function closed(){document.body.classList.remove('filters-open','mobile-modal-open');toggle.setAttribute('aria-expanded','false');toggle.textContent='Filters';toggle.focus({preventScroll:true});}
      function close(results){dialog.close();closed();if(results)jump($('.results > .tablebar'));}
      var closeButton=add(head,button('Close',function(){close(false);}));
      closeButton.setAttribute('aria-label','Close filters and keep selections');
      var view=add(footer,button('View results',function(){close(true);}));view.classList.add('mobile-primary');
      function count(){view.textContent='View '+($('#rowcount')?.textContent||'matching')+' matches';}
      var ob=new MutationObserver(count);ob.observe($('#rowcount'),{childList:true,subtree:true,characterData:true});undo.push(function(){ob.disconnect();});count();
      toggle.addEventListener('click',function(e){e.stopImmediatePropagation();document.body.classList.add('filters-open','mobile-modal-open');toggle.setAttribute('aria-expanded','true');dialog.showModal();closeButton.focus();},{capture:true,signal:stop.signal});
      on(dialog,'cancel',function(e){e.preventDefault();close(false);});
      undo.push(function(){if(dialog.open)dialog.close();closed();});
      var cards=$('.analysis .cards');if(cards){var extras=Array.from(cards.children).slice(4);if(extras.length)group(cards,extras,'Records, streaks and rankings');}
      var analysis=$('#analysis');if(analysis)add(analysis,button('Back to matches',function(){if(document.body.classList.contains('stats-open'))$('#statstoggle').click();jump($('.results > .tablebar'));}));
      var actions=$('.results > .tablebar .tablebar-right');
      if(actions)group(actions,[$('#expandall'),$('#export')].filter(Boolean),'More actions');
    }

    var rivalry=$('#rivalry');
    if(rivalry){
      var links=add(rivalry,make('div','mobile-jumps'));rivalry.prepend(links);
      var meetings=$('#meetwrap');var go=add(links,button('View meetings',function(){jump($('#meethead'));}));
      function meetingCount(){go.textContent='View '+$('#meetcount').textContent+' meetings';}
      var mo=new MutationObserver(meetingCount);mo.observe($('#meetcount'),{childList:true});undo.push(function(){mo.disconnect();});meetingCount();
      var back=add(rivalry,button('Back to comparison',function(){jump($('.h2h .pickbar'));}));$('#meethead').before(back);
      var hint=add(rivalry,make('p','mobile-table-hint','Swipe the table sideways for venue and competition details.'));$('#meethead').before(hint);
      var chart=$('#chart');if(chart)on(chart,'click',function(e){if(chart.onmousemove)chart.onmousemove(e);});
      if($('#chart-note'))add($('#chart-note'),make('span','',' Tap a point to inspect its match.'));
    }
    var search=$('.tmoptions #f-find');
    if(search){var row=add($('#app'),make('label','mobile-team-search'));$('.tmoptions').before(row);add(row,make('span','','Find a team'));move(search,row);var optionsTitle=$('.tmoptions > summary'),oldTitle=optionsTitle.textContent;optionsTitle.textContent='Ranking options and export';undo.push(function(){optionsTitle.textContent=oldTitle;});}
    var sc=$('main.sc');
    if(sc){
      var intro=$('.sc .intro');if(intro){var copy=Array.from(intro.children);add(intro,make('p','','Compare recorded scores under another era’s points system. Complete scoring breakdowns only.'));group(intro,copy,'How this works and limitations');}
      var summary=$('#sccards');if(summary){var d=group(sc,[summary],'Summary of score changes');$('.scbody').before(d);}
      var ref=$('.eraref');if(ref)group($('.scbody'),[ref],'Scoring systems and data coverage');
      var st=$('.sctable');if(st){var full=add(st,button('Show full scoring table',function(){var open=sc.classList.toggle('mobile-full-table');full.textContent=open?'Show compact score comparison':'Show full scoring table';full.setAttribute('aria-expanded',String(open));window.dispatchEvent(new Event('resize'));}));full.setAttribute('aria-expanded','false');st.prepend(full);undo.push(function(){sc.classList.remove('mobile-full-table');});}
    }
  }
  function update(){if(stop){stop.abort();while(undo.length)undo.pop()();stop=null;}if(mq.matches)mount();}
  mq.addEventListener('change',update);update();
})();
