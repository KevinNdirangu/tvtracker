const Database = require('better-sqlite3');
const path = require('path');

const SUPABASE_URL = 'https://gnwzertrmjerymlzzfuh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdud3plcnRybWplcnltbHp6ZnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwODU5MTIsImV4cCI6MjEwMDY2MTkxMn0.4Y8p6Um7qH8OUS6pAVpQDPxJ9d_wguqVKjnDiWESEZs';

const dbPath = path.join(__dirname, 'tracker.db');
const db = new Database(dbPath);

async function supabaseInsert(table, data) {
    if(data.length === 0) return;
    
    // Process in chunks of 500 to respect POST limits
    const chunkSize = 500;
    for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(chunk)
        });
        
        if (!res.ok) {
            const err = await res.text();
            console.error(`Failed to insert into ${table}:`, err);
            throw new Error(`Migration Failed on ${table}`);
        }
        console.log(`Inserted ${chunk.length} rows into ${table}...`);
    }
}

async function migrate() {
    try {
        console.log("Reading local SQLite data...");
        const shows = db.prepare('SELECT * FROM shows').all();
        const episodes = db.prepare('SELECT * FROM episodes').all();
        const watchHistory = db.prepare('SELECT * FROM watch_history').all();
        const settings = db.prepare('SELECT * FROM app_settings').all();

        console.log(`Found ${shows.length} shows, ${episodes.length} episodes, ${watchHistory.length} history records.`);

        console.log("Uploading Shows to Supabase...");
        await supabaseInsert('shows', shows);

        console.log("Uploading Episodes to Supabase...");
        await supabaseInsert('episodes', episodes);

        console.log("Uploading Watch History to Supabase...");
        await supabaseInsert('watch_history', watchHistory);

        console.log("Uploading App Settings to Supabase...");
        await supabaseInsert('app_settings', settings);

        console.log("Migration Complete! You can now safely switch to the Cloud version.");
    } catch(e) {
        console.error("Migration Error:", e);
    }
}

migrate();
