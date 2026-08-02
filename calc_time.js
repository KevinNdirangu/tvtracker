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
    const episodes = await fetchAll('episodes', 'id,runtime');
    const epMap = new Map();
    episodes.forEach(e => epMap.set(e.id, e.runtime));
    
    let totalRuntime = 0;
    history.forEach(h => {
        const rt = epMap.get(h.episode_id) || 0;
        totalRuntime += rt;
    });
    console.log('Total Minutes: ' + totalRuntime);
    console.log('Total Hours: ' + (totalRuntime/60).toFixed(2));
    console.log('Total Days: ' + (totalRuntime/60/24).toFixed(2));
    console.log('Total Months (30 days): ' + (totalRuntime/60/24/30).toFixed(2));
}
run();
