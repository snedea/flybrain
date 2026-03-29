(function() {
  var API_URL = 'http://' + (location.hostname || 'localhost') + ':7600';
  var calendarSection = null;
  var calendarContent = null;
  var calendarToggle = null;
  var selectedDate = null;
  var currentMonth = null;
  var scores = {};

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function formatDateStr(year, month, day) {
    return year + '-' + pad(month) + '-' + pad(day);
  }

  function togglePanel() {
    if (calendarContent === null) return;
    if (calendarContent.classList.contains('collapsed')) {
      calendarContent.classList.remove('collapsed');
      calendarToggle.textContent = 'Hide';
    } else {
      calendarContent.classList.add('collapsed');
      calendarToggle.textContent = 'Show';
    }
  }

  function fetchAndRender() {
    var startDate = currentMonth.getFullYear() + '-' + pad(currentMonth.getMonth() + 1) + '-01';
    var lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    var endDate = lastDay.getFullYear() + '-' + pad(lastDay.getMonth() + 1) + '-' + pad(lastDay.getDate());
    fetch(API_URL + '/calendar/scores?start=' + startDate + '&end=' + endDate)
      .then(function(res) { return res.json(); })
      .then(function(data) {
        scores = {};
        for (var i = 0; i < data.length; i++) {
          scores[data[i].date] = data[i];
        }
        renderCalendar();
      })
      .catch(function(err) {
        console.warn('[calendar] fetch error:', err.message);
      });
  }

  function renderCalendar() {
    if (calendarContent === null) return;
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var monthName = monthNames[currentMonth.getMonth()];
    var year = currentMonth.getFullYear();

    var navHtml = '<div class="cal-nav">' +
      '<button class="cal-nav-btn" id="cal-prev">&lt;</button>' +
      '<span class="cal-nav-title">' + monthName + ' ' + year + '</span>' +
      '<button class="cal-nav-btn" id="cal-next">&gt;</button>' +
      '</div>';

    var gridHtml = '<div class="cal-grid">' +
      '<div class="cal-dow">Su</div><div class="cal-dow">Mo</div><div class="cal-dow">Tu</div>' +
      '<div class="cal-dow">We</div><div class="cal-dow">Th</div><div class="cal-dow">Fr</div>' +
      '<div class="cal-dow">Sa</div>';

    var firstDayOfWeek = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
    var daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();

    for (var i = 0; i < firstDayOfWeek; i++) {
      gridHtml += '<div class="cal-cell cal-empty"></div>';
    }

    for (var day = 1; day <= daysInMonth; day++) {
      var dateStr = formatDateStr(currentMonth.getFullYear(), currentMonth.getMonth() + 1, day);
      var score = scores[dateStr];
      var colorClass;
      if (score && score.composite_score !== null) {
        if (score.composite_score > 80) {
          colorClass = 'cal-green';
        } else if (score.composite_score >= 50) {
          colorClass = 'cal-yellow';
        } else {
          colorClass = 'cal-red';
        }
      } else {
        colorClass = 'cal-nodata';
      }
      var selectedClass = selectedDate === dateStr ? ' cal-selected' : '';
      gridHtml += '<div class="cal-cell ' + colorClass + selectedClass + '" data-date="' + dateStr + '">' +
        '<div class="cal-day">' + day + '</div>' +
        (score ? '<div class="cal-score">' + Math.round(score.composite_score) + '</div>' +
          '<div class="cal-details">' +
            '<span title="Incidents">' + score.fear_incidents + 'i</span>' +
            '<span title="Feeds">' + score.total_feeds + 'f</span>' +
            '<span title="Avg Hunger">' + (score.avg_hunger !== null ? score.avg_hunger.toFixed(1) : '-') + 'h</span>' +
          '</div>' : '') +
        '</div>';
    }

    gridHtml += '</div>';
    calendarContent.innerHTML = navHtml + gridHtml;

    document.getElementById('cal-prev').addEventListener('click', prevMonth);
    document.getElementById('cal-next').addEventListener('click', nextMonth);
  }

  function onCellClick(e) {
    var cell = e.target.closest('.cal-cell');
    if (cell === null || cell.classList.contains('cal-empty')) return;
    var dateStr = cell.getAttribute('data-date');
    if (!dateStr) return;
    if (selectedDate === dateStr) {
      selectedDate = null;
      var allCells = calendarContent.querySelectorAll('.cal-cell');
      for (var i = 0; i < allCells.length; i++) allCells[i].classList.remove('cal-selected');
      restoreFullFeed();
      return;
    }
    selectedDate = dateStr;
    var allCells2 = calendarContent.querySelectorAll('.cal-cell');
    for (var j = 0; j < allCells2.length; j++) allCells2[j].classList.remove('cal-selected');
    cell.classList.add('cal-selected');
    filterFeedToDate(dateStr);
  }

  function buildEntryEl(entry) {
    var kind = entry.kind;
    var action = entry.name;
    var params = entry.params;
    var reasoning = entry.reasoning;
    var timestamp = entry.timestamp;

    var colorClass;
    if (kind === 'incident') {
      colorClass = 'incident';
    } else if (action === 'place_food' || action === 'clear_food') {
      colorClass = 'feed';
    } else if (action === 'set_light' || action === 'set_temp') {
      colorClass = 'comfort';
    } else {
      colorClass = 'neutral';
    }

    var icon;
    if (kind === 'incident') {
      icon = '!';
    } else {
      icon = {place_food:'F', clear_food:'X', set_light:'L', set_temp:'T', touch:'H', blow_wind:'W'}[action] || '*';
    }

    var timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    var desc;
    if (kind === 'incident') {
      desc = reasoning;
    } else {
      var p = {};
      try { if (params) p = JSON.parse(params); } catch (e) { /* ignore */ }
      switch (action) {
        case 'place_food': desc = 'Placed food at (' + Math.round(p.x || 0) + ', ' + Math.round(p.y || 0) + ')'; break;
        case 'clear_food': desc = 'Cleared all food'; break;
        case 'set_light': desc = 'Set light to ' + (p.level || 'unknown'); break;
        case 'set_temp': desc = 'Set temp to ' + (p.level || 'unknown'); break;
        case 'touch': desc = 'Touched fly'; break;
        case 'blow_wind': desc = 'Blew wind'; break;
        default: desc = action;
      }
    }

    var reasoningText = kind === 'incident' ? '' : (reasoning || '');

    var el = document.createElement('div');
    el.className = 'activity-entry activity-' + colorClass;
    el.innerHTML = '<div class="activity-entry-header">' +
      '<span class="activity-icon">' + icon + '</span>' +
      '<span class="activity-time">' + timeStr + '</span>' +
      '<span class="activity-desc">' + desc + '</span>' +
      '</div>' +
      (reasoningText ? '<div class="activity-entry-detail">' + reasoningText + '</div>' : '');
    return el;
  }

  function filterFeedToDate(dateStr) {
    fetch(API_URL + '/calendar/day-activity?date=' + dateStr)
      .then(function(res) { return res.json(); })
      .then(function(data) {
        var feedList = document.getElementById('activity-feed-list');
        if (!feedList) return;
        feedList.innerHTML = '';
        if (data.length === 0) {
          feedList.innerHTML = '<div class="cal-no-activity">No activity on ' + dateStr + '</div>';
          return;
        }
        var header = document.createElement('div');
        header.className = 'cal-feed-date-header';
        header.textContent = 'Activity for ' + dateStr;
        feedList.appendChild(header);
        for (var i = 0; i < data.length; i++) {
          feedList.appendChild(buildEntryEl(data[i]));
        }
      })
      .catch(function(err) {
        console.warn('[calendar] day-activity fetch error:', err.message);
      });
  }

  function restoreFullFeed() {
    var feedList = document.getElementById('activity-feed-list');
    if (!feedList) return;
    fetch(API_URL + '/activity/recent')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        feedList.innerHTML = '';
        for (var i = 0; i < data.length; i++) {
          feedList.appendChild(buildEntryEl(data[i]));
        }
      })
      .catch(function() {
        feedList.innerHTML = '<div class="cal-no-activity">Could not reload feed</div>';
      });
  }

  function prevMonth() {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    selectedDate = null;
    fetchAndRender();
  }

  function nextMonth() {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    selectedDate = null;
    fetchAndRender();
  }

  function init() {
    calendarSection = document.getElementById('calendar-section');
    if (!calendarSection) return;
    calendarContent = document.getElementById('calendar-content');
    calendarToggle = document.getElementById('calendar-toggle');
    if (calendarToggle) calendarToggle.addEventListener('click', togglePanel);
    calendarContent.addEventListener('click', onCellClick);
    currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);
  }

  init();
  function activate() {
    fetchAndRender();
  }

  window.CaretakerCalendar = { init: init, refresh: fetchAndRender, activate: activate };
})();
