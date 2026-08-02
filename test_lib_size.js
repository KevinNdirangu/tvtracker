const SUPABASE_URL = 'https://gnwzertrmjerymlzzfuh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdud3plcnRybWplcnltbHp6ZnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwODU5MTIsImV4cCI6MjEwMDY2MTkxMn0.4Y8p6Um7qH8OUS6pAVpQDPxJ9d_wguqVKjnDiWESEZs';

async function fetchAllParallel(table, select) {
    const step = 999;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1`, {
        headers: {apikey: SUPABASE_KEY, 'Prefer': 'count=exact'}
    });
    const rangeHeader = res.headers.get('content-range');
    const count = rangeHeader ? parseInt(rangeHeader.split('/')[1]) : 0;
    
    const promises = [];
    for (let from = 0; from < count; from += (step + 1)) {
        promises.push(
            fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&offset=${from}&limit=${step+1}`, {
                headers: {apikey: SUPABASE_KEY}
            }).then(r => r.json())
        );
    }
    const results = await Promise.all(promises);
    let allData = [];
    results.forEach(d => allData = allData.concat(d));
    return allData;
}

async function testLibSize() {
    console.log("Fetching library...");
    const [shows, episodes, history] = await Promise.all([
        fetchAllParallel('shows', '*'),
        fetchAllParallel('episodes', 'id, show_id, season_number, runtime, air_date'),
        fetchAllParallel('watch_history', 'id, episode_id, watched_at')
    ]);
    
    console.log(`Shows: ${shows.length}, Eps: ${episodes.length}, Hist: ${history.length}`);
    
    const showMap = new Map();
    shows.forEach(s => {
        s.episodes = [];
        showMap.set(s.id, s);
    });
    
    const epMap = new Map();
    episodes.forEach(e => {
        e.watch_history = [];
        epMap.set(e.id, e);
        if (showMap.has(e.show_id)) showMap.get(e.show_id).episodes.push(e);
    });
    
    history.forEach(h => {
        if (epMap.has(h.episode_id)) epMap.get(h.episode_id).watch_history.push(h);
    });
    
    const processedShows = shows.map(show => {
        const processedEps = show.episodes.map(ep => ({
            ...ep,
            is_watched: ep.watch_history.length > 0,
            watch_count: ep.watch_history.length,
            watched_at: ep.watch_history.length > 0 ? ep.watch_history[0].watched_at : null
        })).sort((a,b) => a.season_number !== b.season_number ? a.season_number - b.season_number : a.episode_number - b.episode_number);
        return { show, episodes: processedEps };
    });
    
    const jsonStr = JSON.stringify(processedShows);
    console.log("JSON Length (MB):", (jsonStr.length / 1024 / 1024).toFixed(2) + " MB");
}

testLibSize().catch(console.error);
