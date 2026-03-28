var fs = require('fs');
var path = require('path');
var readline = require('readline');
var dbModule = require('./db');

var LOG_PATH = process.argv[2] || path.join(__dirname, '..', 'caretaker.log');
var DB_PATH = process.argv[3] || undefined;

function migrate() {
  try {
    if (!fs.existsSync(LOG_PATH)) {
      process.stderr.write('No log file found at ' + LOG_PATH + '\n');
      process.exit(1);
    }

    var caretakerDb = dbModule.openDb(DB_PATH);
    var content = fs.readFileSync(LOG_PATH, 'utf8');
    var lines = content.split('\n');

    var obsCount = 0;
    var actCount = 0;
    var incCount = 0;
    var errCount = 0;
    var skipCount = 0;

    var insertMany = caretakerDb.db.transaction(function(rows) {
      for (var i = 0; i < rows.length; i++) {
        var line = rows[i];
        if (!line.trim()) continue;
        var entry;
        try { entry = JSON.parse(line); } catch (e) { errCount++; continue; }

        var ts = entry.timestamp;

        if (entry.type === 'observation') {
          caretakerDb.insertObservation(ts, entry.data);
          obsCount++;
        } else if (entry.type === 'action') {
          caretakerDb.insertAction(ts, entry.action, entry.params || {}, entry.reasoning || '', entry.flyState || null);
          actCount++;
        } else if (entry.type === 'incident') {
          var severity = entry.incident === 'scared_the_fly' ? 'high' : 'medium';
          var description = entry.incident;
          if (entry.hunger != null) description += ' (hunger: ' + entry.hunger + ')';
          if (entry.fearBefore != null) description += ' (fear: ' + entry.fearBefore + ' -> ' + entry.fearAfter + ')';
          caretakerDb.insertIncident(ts, entry.incident, severity, description, entry.flyState || null);
          incCount++;
        } else {
          skipCount++;
        }
      }
    });

    insertMany(lines);

    process.stderr.write('Migration complete: ' + obsCount + ' observations, ' + actCount + ' actions, ' + incCount + ' incidents, ' + errCount + ' parse errors, ' + skipCount + ' skipped\n');

    var days = caretakerDb.db.prepare('SELECT DISTINCT substr(timestamp, 1, 10) as day FROM observations ORDER BY day').all();
    for (var i = 0; i < days.length; i++) {
      caretakerDb.computeDailyScore(days[i].day);
    }
    process.stderr.write('Computed daily scores for ' + days.length + ' days\n');

    caretakerDb.close();
    process.stderr.write('Done.\n');
  } catch (e) {
    process.stderr.write(e.message + '\n');
    process.exit(1);
  }
}

migrate();
