const SUPABASE_URL = 'https://gnwzertrmjerymlzzfuh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdud3plcnRybWplcnltbHp6ZnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwODU5MTIsImV4cCI6MjEwMDY2MTkxMn0.4Y8p6Um7qH8OUS6pAVpQDPxJ9d_wguqVKjnDiWESEZs';
async function fetchAll(table, select) {
    let allData = []; let from = 0; const step = 999;
    while(true) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&offset=${from}&limit=${step}`, {headers: {apikey: SUPABASE_KEY}});
        const data = await res.json();
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        from += step;
    }
    return allData;
}
async function run() {
    const history = await fetchAll('watch_history', 'episode_id');
    const episodes = await fetchAll('episodes', 'id,runtime,show_id');
    const shows = await fetchAll('shows', 'id,title,type');
    
    const showMap = new Map();
    shows.forEach(s => showMap.set(s.id, s));

    const epMap = new Map();
    episodes.forEach(e => epMap.set(e.id, e));
    
    let totalRuntime = 0;
    let missingRuntimeEps = 0;
    let fallbackRuntimeUsed = 0;

    history.forEach(h => {
        const ep = epMap.get(h.episode_id);
        if (!ep) return;
        
        if (!ep.runtime || ep.runtime === 0) {
            missingRuntimeEps++;
            totalRuntime += 45; // TV Time often falls back to 45 mins or 60 mins for missing runtimes
            fallbackRuntimeUsed += 45;
        } else {
            totalRuntime += ep.runtime;
        }
    });
    
    console.log('Total watched episodes with 0 or null runtime: ' + missingRuntimeEps);
    console.log('Minutes added if assuming 45 mins for missing runtimes: ' + fallbackRuntimeUsed);
    console.log('Adjusted Total Minutes: ' + totalRuntime);
}
run();
