var Database = require('better-sqlite3');
var path = require('path');

var DB_PATH = path.join(__dirname, '..', 'data', 'caretaker.db');

function createSchema(db) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS observations (' +
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    '  timestamp TEXT NOT NULL,' +
    '  hunger REAL,' +
    '  fear REAL,' +
    '  fatigue REAL,' +
    '  curiosity REAL,' +
    '  groom REAL,' +
    '  behavior TEXT,' +
    '  pos_x REAL,' +
    '  pos_y REAL,' +
    '  facing_dir REAL,' +
    '  speed REAL,' +
    '  fired_neurons INTEGER,' +
    '  food_count INTEGER,' +
    '  light_level REAL,' +
    '  temperature REAL,' +
    '  raw_data TEXT NOT NULL' +
    ');' +
    'CREATE TABLE IF NOT EXISTS actions (' +
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    '  timestamp TEXT NOT NULL,' +
    '  action TEXT NOT NULL,' +
    '  params TEXT NOT NULL DEFAULT \'{}\',' +
    '  reasoning TEXT NOT NULL DEFAULT \'\',' +
    '  fly_state TEXT' +
    ');' +
    'CREATE TABLE IF NOT EXISTS incidents (' +
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    '  timestamp TEXT NOT NULL,' +
    '  type TEXT NOT NULL,' +
    '  severity TEXT NOT NULL DEFAULT \'medium\',' +
    '  description TEXT NOT NULL DEFAULT \'\',' +
    '  state_snapshot TEXT' +
    ');' +
    'CREATE TABLE IF NOT EXISTS chat_messages (' +
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    '  timestamp TEXT NOT NULL,' +
    '  role TEXT NOT NULL,' +
    '  message TEXT NOT NULL' +
    ');' +
    'CREATE TABLE IF NOT EXISTS daily_scores (' +
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    '  date TEXT NOT NULL UNIQUE,' +
    '  composite_score REAL,' +
    '  total_feeds INTEGER NOT NULL DEFAULT 0,' +
    '  avg_hunger REAL,' +
    '  fear_incidents INTEGER NOT NULL DEFAULT 0,' +
    '  avg_response_time REAL,' +
    '  updated_at TEXT NOT NULL' +
    ');' +
    'CREATE INDEX IF NOT EXISTS idx_observations_timestamp ON observations(timestamp);' +
    'CREATE INDEX IF NOT EXISTS idx_actions_timestamp ON actions(timestamp);' +
    'CREATE INDEX IF NOT EXISTS idx_incidents_timestamp ON incidents(timestamp);' +
    'CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp);' +
    'CREATE INDEX IF NOT EXISTS idx_daily_scores_date ON daily_scores(date);'
  );
}

function openDb(dbPath) {
  var fs = require('fs');
  if (dbPath === undefined) dbPath = DB_PATH;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  var db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createSchema(db);

  var stmtInsertObservation = db.prepare(
    'INSERT INTO observations (timestamp, hunger, fear, fatigue, curiosity, groom, behavior, pos_x, pos_y, facing_dir, speed, fired_neurons, food_count, light_level, temperature, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  var stmtInsertAction = db.prepare(
    'INSERT INTO actions (timestamp, action, params, reasoning, fly_state) VALUES (?, ?, ?, ?, ?)'
  );

  var stmtInsertIncident = db.prepare(
    'INSERT INTO incidents (timestamp, type, severity, description, state_snapshot) VALUES (?, ?, ?, ?, ?)'
  );

  var stmtInsertChatMessage = db.prepare(
    'INSERT INTO chat_messages (timestamp, role, message) VALUES (?, ?, ?)'
  );

  var stmtUpsertDailyScore = db.prepare(
    'INSERT INTO daily_scores (date, composite_score, total_feeds, avg_hunger, fear_incidents, avg_response_time, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(date) DO UPDATE SET composite_score=excluded.composite_score, total_feeds=excluded.total_feeds, avg_hunger=excluded.avg_hunger, fear_incidents=excluded.fear_incidents, avg_response_time=excluded.avg_response_time, updated_at=excluded.updated_at'
  );

  var stmtGetLatestObservation = db.prepare(
    'SELECT raw_data FROM observations ORDER BY id DESC LIMIT 1'
  );

  var stmtGetLastIncidentByType = db.prepare(
    'SELECT timestamp FROM incidents WHERE type = ? ORDER BY id DESC LIMIT 1'
  );

  return {
    insertObservation: function(timestamp, data) {
      var d = data.drives || {};
      var b = data.behavior || {};
      var p = data.position || {};
      var f = data.firingStats || {};
      var e = data.environment || {};
      stmtInsertObservation.run(
        timestamp,
        d.hunger != null ? d.hunger : null,
        d.fear != null ? d.fear : null,
        d.fatigue != null ? d.fatigue : null,
        d.curiosity != null ? d.curiosity : null,
        d.groom != null ? d.groom : null,
        b.current || null,
        p.x != null ? p.x : null,
        p.y != null ? p.y : null,
        p.facingDir != null ? p.facingDir : null,
        p.speed != null ? p.speed : null,
        f.firedNeurons != null ? f.firedNeurons : null,
        data.food ? data.food.length : 0,
        e.lightLevel != null ? e.lightLevel : null,
        e.temperature != null ? e.temperature : null,
        JSON.stringify(data)
      );
    },

    insertAction: function(timestamp, action, params, reasoning, flyState) {
      stmtInsertAction.run(
        timestamp,
        action,
        JSON.stringify(params),
        reasoning,
        flyState ? JSON.stringify(flyState) : null
      );
    },

    insertIncident: function(timestamp, type, severity, description, stateSnapshot) {
      stmtInsertIncident.run(
        timestamp,
        type,
        severity,
        description,
        stateSnapshot ? JSON.stringify(stateSnapshot) : null
      );
    },

    insertChatMessage: function(timestamp, role, message) {
      stmtInsertChatMessage.run(timestamp, role, message);
    },

    getLatestObservation: function() {
      var row = stmtGetLatestObservation.get();
      return row ? JSON.parse(row.raw_data) : null;
    },

    getLastIncidentTime: function(type) {
      var row = stmtGetLastIncidentByType.get(type);
      return row ? row.timestamp : null;
    },

    getRecentActivity: function(limit) {
      if (limit === undefined) limit = 50;
      return db.prepare(
        'SELECT id, timestamp, kind, name, params, reasoning, state_snapshot FROM (' +
        '  SELECT id, timestamp, \'action\' AS kind, action AS name, params, reasoning, fly_state AS state_snapshot FROM actions' +
        '  UNION ALL' +
        '  SELECT id, timestamp, \'incident\' AS kind, type AS name, NULL AS params, description AS reasoning, state_snapshot FROM incidents' +
        ') ORDER BY timestamp DESC LIMIT ?'
      ).all(limit);
    },

    getRecentObservations: function(limit) {
      if (limit === undefined) limit = 20;
      var rows = db.prepare(
        'SELECT timestamp, hunger, fear, fatigue, curiosity, groom, behavior, pos_x, pos_y, food_count, light_level, temperature FROM observations ORDER BY id DESC LIMIT ?'
      ).all(limit);
      rows.reverse();
      return rows;
    },

    getRecentActions: function(limit) {
      if (limit === undefined) limit = 20;
      var rows = db.prepare(
        'SELECT timestamp, action, params, reasoning FROM actions ORDER BY id DESC LIMIT ?'
      ).all(limit);
      rows.reverse();
      return rows;
    },

    getRecentIncidents: function(limit) {
      if (limit === undefined) limit = 20;
      var rows = db.prepare(
        'SELECT timestamp, type, severity, description FROM incidents ORDER BY id DESC LIMIT ?'
      ).all(limit);
      rows.reverse();
      return rows;
    },

    getChatHistory: function(limit) {
      if (limit === undefined) limit = 50;
      var rows = db.prepare(
        'SELECT id, timestamp, role, message FROM chat_messages ORDER BY id DESC LIMIT ?'
      ).all(limit);
      rows.reverse();
      return rows;
    },

    computeDailyScore: function(dateStr) {
      var dayStart = dateStr + 'T00:00:00.000Z';
      var dayEnd = dateStr + 'T23:59:59.999Z';

      var obsStats = db.prepare(
        'SELECT AVG(hunger) as avg_hunger FROM observations WHERE timestamp >= ? AND timestamp <= ?'
      ).get(dayStart, dayEnd);

      var feedCount = db.prepare(
        'SELECT COUNT(*) as cnt FROM actions WHERE action = ? AND timestamp >= ? AND timestamp <= ?'
      ).get('place_food', dayStart, dayEnd);

      var fearCount = db.prepare(
        'SELECT COUNT(*) as cnt FROM incidents WHERE type = ? AND timestamp >= ? AND timestamp <= ?'
      ).get('scared_the_fly', dayStart, dayEnd);

      var forgotCount = db.prepare(
        'SELECT COUNT(*) as cnt FROM incidents WHERE type = ? AND timestamp >= ? AND timestamp <= ?'
      ).get('forgot_to_feed', dayStart, dayEnd);

      var avgHunger = obsStats && obsStats.avg_hunger != null ? obsStats.avg_hunger : 0.5;
      var totalFeeds = feedCount ? feedCount.cnt : 0;
      var fearIncidents = fearCount ? fearCount.cnt : 0;
      var forgotIncidents = forgotCount ? forgotCount.cnt : 0;

      var hungerPenalty = Math.max(0, (avgHunger - 0.3)) * 40;
      var fearPenalty = Math.min(fearIncidents * 5, 30);
      var forgotPenalty = Math.min(forgotIncidents * 0.5, 20);
      var composite = Math.max(0, Math.min(100, 100 - hungerPenalty - fearPenalty - forgotPenalty));
      composite = Math.round(composite * 10) / 10;

      var avgResponseTime = forgotIncidents;

      var now = new Date().toISOString();
      stmtUpsertDailyScore.run(dateStr, composite, totalFeeds, avgHunger, fearIncidents, avgResponseTime, now);

      return { date: dateStr, composite_score: composite, total_feeds: totalFeeds, avg_hunger: avgHunger, fear_incidents: fearIncidents, avg_response_time: avgResponseTime };
    },

    close: function() {
      db.close();
    },

    db: db
  };
}

module.exports = { openDb: openDb };
