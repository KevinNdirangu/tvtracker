const fs = require('fs');
const Papa = require('papaparse');

const SUPABASE_URL = 'https://gnwzertrmjerymlzzfuh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdud3plcnRybWplcnltbHp6ZnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwODU5MTIsImV4cCI6MjEwMDY2MTkxMn0.4Y8p6Um7qH8OUS6pAVpQDPxJ9d_wguqVKjnDiWESEZs';

const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
};

async function run() {
    const logFile = 'C:/Users/user/Downloads/media-tracker-log (2).csv';
    const logText = fs.readFileSync(logFile, 'utf8');
    const logData = Papa.parse(logText, { header: true, skipEmptyLines: true }).data;

    let fixedCount = 0;

    for (const row of logData) {
        if (!row.external_id || row.type !== 'movie') continue;
        
        // 1. Get show ID
        const showRes = await fetch(`${SUPABASE_URL}/rest/v1/shows?api_id=eq.${row.external_id}&select=id`, {headers});
        const showData = await showRes.json();
        if (!showData || showData.length === 0) continue;
        const showId = showData[0].id;
        
        // 2. Ensure S1E1 exists
        const epRes = await fetch(`${SUPABASE_URL}/rest/v1/episodes?show_id=eq.${showId}&select=id`, {headers});
        let eps = await epRes.json();
        let epId;
        
        if (!eps || eps.length === 0) {
            const insertEp = await fetch(`${SUPABASE_URL}/rest/v1/episodes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ show_id: showId, season_number: 1, episode_number: 1, title: row.title || 'Movie', runtime: 120 })
            });
            const newEp = await insertEp.json();
            if(newEp && newEp.length > 0) {
                epId = newEp[0].id;
                console.log(`Created missing S1E1 for movie ${row.title}`);
            }
        } else {
            epId = eps[0].id;
        }
        
        // 3. Ensure watch history exists
        if (epId) {
            const watchRes = await fetch(`${SUPABASE_URL}/rest/v1/watch_history?episode_id=eq.${epId}&select=id`, {headers});
            const watches = await watchRes.json();
            if (!watches || watches.length === 0) {
                await fetch(`${SUPABASE_URL}/rest/v1/watch_history`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ episode_id: epId, watched_at: row.logged_at })
                });
                console.log(`Fixed missing watch log for movie ${row.title}`);
                fixedCount++;
            }
        }
    }
    console.log(`Done. Fixed watch status for ${fixedCount} movies.`);
}

run().catch(console.error);
