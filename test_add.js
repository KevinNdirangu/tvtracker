const TMDB_KEY = '87ca90817435c5a482ec6cb70ce71199';
const SUPABASE_URL = 'https://gnwzertrmjerymlzzfuh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdud3plcnRybWplcnltbHp6ZnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwODU5MTIsImV4cCI6MjEwMDY2MTkxMn0.4Y8p6Um7qH8OUS6pAVpQDPxJ9d_wguqVKjnDiWESEZs';

async function testAddMedia() {
    const tmdbId = 1399; // Game of Thrones
    const type = 'tv';
    
    console.log("Fetching TMDB details...");
    const res = await fetch(`https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/${tmdbId}?api_key=${TMDB_KEY}`);
    const data = await res.json();
    console.log("TMDB Data title:", data.name);
    
    console.log("Getting max ID...");
    const maxRes = await fetch(`${SUPABASE_URL}/rest/v1/shows?select=id&order=id.desc&limit=1`, {
        headers: {apikey: SUPABASE_KEY}
    });
    const maxData = await maxRes.json();
    const nextShowId = (maxData && maxData.length > 0 ? maxData[0].id : 0) + 1;
    console.log("Next ID:", nextShowId);
    
    console.log("Inserting show...");
    const insertPayload = {
        id: nextShowId,
        api_id: data.id, 
        title: data.title || data.name, 
        genre: (data.genres || []).map(g=>g.name).join(', '),
        overview: data.overview, 
        poster_url: '', 
        total_episodes: (data.number_of_episodes || 0),
        status: data.status, 
        type: type, 
        timezone_offset: 0
    };
    
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/shows`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(insertPayload)
    });
    const insertData = await insertRes.text();
    console.log("Insert Response:", insertData);
}

testAddMedia().catch(console.error);
