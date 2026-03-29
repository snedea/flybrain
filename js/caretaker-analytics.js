(function() {
  var API_URL = 'http://' + (location.hostname || 'localhost') + ':7600';
  var analyticsSection = null;
  var analyticsContent = null;
  var analyticsToggle = null;
  var refreshTimer = null;
  var REFRESH_INTERVAL = 30000;

  function init() {
    analyticsSection = document.getElementById('analytics-section');
    if (analyticsSection === null) return;
    analyticsContent = document.getElementById('analytics-content');
    analyticsToggle = document.getElementById('analytics-toggle');
    if (analyticsToggle !== null) {
      analyticsToggle.addEventListener('click', togglePanel);
    }
  }

  function togglePanel() {
    if (analyticsContent === null) return;
    var isCollapsed = analyticsContent.classList.contains('collapsed');
    if (isCollapsed) {
      analyticsContent.classList.remove('collapsed');
      analyticsToggle.textContent = 'Hide';
    } else {
      analyticsContent.classList.add('collapsed');
      analyticsToggle.textContent = 'Show';
    }
  }

  function refresh() {
    Promise.all([
      fetch(API_URL + '/analytics/summary').then(function(r) { return r.json(); }),
      fetch(API_URL + '/analytics/hunger-timeline').then(function(r) { return r.json(); })
    ]).then(function(results) {
      renderMetrics(results[0], results[1]);
    }).catch(function(err) {
      console.warn('[analytics] fetch error:', err.message);
    });
  }

  function renderMetrics(summary, timeline) {
    if (analyticsContent === null) return;
    var html = '';
    html += renderScoreGauge(summary.composite_score);
    html += renderHungerSparkline(timeline.observations, timeline.feedMarkers);
    html += renderMetricRow('Fear Incidents', summary.fear_incidents !== null ? summary.fear_incidents : 0, '/today', 'error');
    html += renderMetricRow('Avg Response', summary.avg_response_time !== null ? summary.avg_response_time.toFixed(1) + 's' : 'N/A', '', null);
    html += renderMetricRow('Feed Rate', summary.feeds_per_hour !== null ? summary.feeds_per_hour.toFixed(1) : '0', '/hr', null);
    html += renderMetricRow('Active Time', summary.connected_hours !== null ? summary.connected_hours.toFixed(1) : '0', 'hrs', null);
    analyticsContent.innerHTML = html;
  }

  function renderScoreGauge(score) {
    var displayScore, color;
    if (score === null || score === undefined) {
      displayScore = '--';
      color = 'var(--text-muted)';
    } else {
      displayScore = Math.round(score);
      if (score >= 80) {
        color = 'var(--success)';
      } else if (score >= 50) {
        color = 'var(--warning)';
      } else {
        color = 'var(--error)';
      }
    }
    return '<div class="analytics-metric analytics-score"><div class="analytics-score-value" style="color:' + color + '">' + displayScore + '</div><div class="analytics-metric-label">Caretaker Score</div></div>';
  }

  function renderHungerSparkline(observations, feedMarkers) {
    if (observations === null || observations === undefined || observations.length === 0) {
      return '<div class="analytics-metric"><div class="analytics-metric-label">Hunger Timeline</div><div class="analytics-sparkline-empty">No data yet</div></div>';
    }
    var W = 240, H = 40;
    var startTime = new Date(observations[0].timestamp).getTime();
    var endTime = new Date(observations[observations.length - 1].timestamp).getTime();
    var timeRange = Math.max(1, endTime - startTime);

    var points = [];
    for (var i = 0; i < observations.length; i++) {
      var x = ((new Date(observations[i].timestamp).getTime() - startTime) / timeRange) * W;
      var y = H - (observations[i].hunger * H);
      if (y < 0) y = 0;
      if (y > H) y = H;
      points.push(x.toFixed(1) + ',' + y.toFixed(1));
    }
    var pointsStr = points.join(' ');

    var feedMarkerLines = '';
    if (feedMarkers) {
      for (var j = 0; j < feedMarkers.length; j++) {
        var markerX = ((new Date(feedMarkers[j].timestamp).getTime() - startTime) / timeRange) * W;
        if (markerX >= 0 && markerX <= W) {
          feedMarkerLines += '<line x1="' + markerX.toFixed(1) + '" y1="0" x2="' + markerX.toFixed(1) + '" y2="' + H + '" stroke="var(--success)" stroke-width="1" opacity="0.6"/>';
        }
      }
    }

    var threshY = H - (0.7 * H);
    var thresholdLine = '<line x1="0" y1="' + threshY + '" x2="' + W + '" y2="' + threshY + '" stroke="var(--warning)" stroke-width="0.5" stroke-dasharray="3,3" opacity="0.5"/>';

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="analytics-sparkline-svg" preserveAspectRatio="none">' +
      thresholdLine + feedMarkerLines +
      '<polyline points="' + pointsStr + '" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';

    return '<div class="analytics-metric"><div class="analytics-metric-label">Hunger Timeline <span class="analytics-legend"><span class="analytics-legend-marker" style="background:var(--success)"></span>fed <span class="analytics-legend-marker" style="background:var(--warning)"></span>0.7</span></div><div class="analytics-sparkline-container">' + svg + '</div></div>';
  }

  function renderMetricRow(label, value, unit, colorKey) {
    var colorStyle = '';
    if (colorKey !== null) {
      colorStyle = ' style="color:var(--' + colorKey + ')"';
    }
    return '<div class="analytics-metric"><div class="analytics-metric-value"' + colorStyle + '>' + value + '<span class="analytics-metric-unit">' + unit + '</span></div><div class="analytics-metric-label">' + label + '</div></div>';
  }

  init();

  function activate() {
    refresh();
    if (refreshTimer === null) {
      refreshTimer = setInterval(refresh, REFRESH_INTERVAL);
    }
  }

  window.CaretakerAnalytics = { init: init, refresh: refresh, activate: activate };
})();
