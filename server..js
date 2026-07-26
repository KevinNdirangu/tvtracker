const Database = require('better-sqlite3');
const path = require('path');

// 1. Initialize the Database
const dbPath = path.join(__dirname, 'tracker.db');
// The API is entirely synchronous now. No callbacks needed.
const db = new Database(dbPath, { verbose: console.log });

// Performance boost: Turn on Write-Ahead Logging (highly recommended for better-sqlite3)
db.pragma('journal_mode = WAL');

console.log("Connected to the local SQLite database.");

// 2. Create Tables
// We can execute all table creations at once using db.exec()
db.exec(`
    CREATE TABLE IF NOT EXISTS shows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_id INTEGER UNIQUE,
        title TEXT NOT NULL,
        genre TEXT,
        overview TEXT,
        poster_url TEXT,
        total_episodes INTEGER DEFAULT 0,
        status TEXT
    );

    CREATE TABLE IF NOT EXISTS episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        show_id INTEGER NOT NULL,
        season_number INTEGER NOT NULL,
        episode_number INTEGER NOT NULL,
        title TEXT,
        air_date TEXT,
        FOREIGN KEY (show_id) REFERENCES shows (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS watch_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        episode_id INTEGER NOT NULL,
        watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (episode_id) REFERENCES episodes (id) ON DELETE CASCADE
    );
`);

console.log("Schema initialized successfully.");

// 3. Insert Dummy Data using Prepared Statements
const insertShow = db.prepare(`INSERT OR IGNORE INTO shows (id, title, genre, total_episodes) VALUES (?, ?, ?, ?)`);
insertShow.run(1, 'Dark', 'Sci-Fi / Suspense', 26);

const insertEpisode = db.prepare(`INSERT OR IGNORE INTO episodes (id, show_id, season_number, episode_number, title) VALUES (?, ?, ?, ?, ?)`);
insertEpisode.run(101, 1, 1, 1, 'Secrets');

const insertHistory = db.prepare(`INSERT OR IGNORE INTO watch_history (episode_id) VALUES (?)`);
insertHistory.run(101);

// 4. The UI Query
const getDashboardData = db.prepare(`
    SELECT 
        s.id, 
        s.title, 
        s.genre, 
        s.poster_url, 
        s.total_episodes,
        COUNT(DISTINCT w.episode_id) as watchedEpisodes
    FROM shows s
    LEFT JOIN episodes e ON s.id = e.show_id
    LEFT JOIN watch_history w ON e.id = w.episode_id
    GROUP BY s.id;
`);

// .all() synchronously grabs all rows and returns the array immediately
const rows = getDashboardData.all(); 

console.log("\n--- Dashboard Data Ready for Frontend ---");
console.log(rows);