const fs = require('fs');
const Papa = require('papaparse');

const TMDB_KEY = '87ca90817435c5a482ec6cb70ce71199';
const SUPABASE_URL = 'https://gnwzertrmjerymlzzfuh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdud3plcnRybWplcnltbHp6ZnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwODU5MTIsImV4cCI6MjEwMDY2MTkxMn0.4Y8p6Um7qH8OUS6pAVpQDPxJ9d_wguqVKjnDiWESEZs';

const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
};

async function getTmdbDetails(tmdbId, type) {
    const res = await fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_KEY}`);
    return await res.json();
}

async function addMediaToSupabase(tmdbId, type) {
    console.log(`Adding ${type} ${tmdbId} to library...`);
    // 1. Check if it already exists
    const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/shows?api_id=eq.${tmdbId}&select=id`, { headers });
    const existing = await checkRes.json();
    if (existing && existing.length > 0) {
        console.log(` Already exists in Supabase with ID ${existing[0].id}`);
        return existing[0].id;
    }

    // 2. Fetch TMDB details
    const data = await getTmdbDetails(tmdbId, type);
    if (!data.id) {
        console.error(` TMDB ID ${tmdbId} not found.`);
        return null;
    }

    const posterUrl = data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '';
    // Fetch next ID manually to bypass sequence desync
    const maxIdRes = await fetch(`${SUPABASE_URL}/rest/v1/shows?select=id&order=id.desc&limit=1`, { headers });
    const maxIdData = await maxIdRes.json();
    const nextId = (maxIdData && maxIdData.length > 0) ? maxIdData[0].id + 1 : 1;

    const showPayload = {
        id: nextId,
        api_id: data.id,
        title: data.title || data.name,
        type: type,
        poster_url: posterUrl,
        is_stopped: 0
    };

    // 3. Insert Show
    let showId;
    try {
        const showInsertRes = await fetch(`${SUPABASE_URL}/rest/v1/shows`, {
            method: 'POST',
            headers,
            body: JSON.stringify(showPayload)
        });
        const showResult = await showInsertRes.json();
        if (!showResult || !showResult[0] || !showResult[0].id) {
            console.error(`Failed to insert show ${showPayload.title}. Result:`, showResult);
            return null;
        }
        showId = showResult[0].id;
    } catch (e) {
        console.error(`Exception inserting show ${showPayload.title}:`, e);
        return null;
    }

    // 4. Gather Episodes
    let allEpisodes = [];
    if (type === 'movie') {
        allEpisodes.push({ 
            show_id: showId, 
            season_number: 1, 
            episode_number: 1, 
            title: data.title, 
            air_date: data.release_date || null, 
            runtime: data.runtime || 0 
        });
    } else {
        for (let i = 1; i <= (data.number_of_seasons || 1); i++) {
            const sRes = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${i}?api_key=${TMDB_KEY}`);
            const sData = await sRes.json();
            if (sData.episodes) {
                sData.episodes.forEach(ep => {
                    allEpisodes.push({
                        show_id: showId,
                        season_number: ep.season_number,
                        episode_number: ep.episode_number,
                        title: ep.name,
                        air_date: ep.air_date || null,
                        runtime: ep.runtime || 0
                    });
                });
            }
        }
    }

    // 5. Insert Episodes in chunks
    const chunkSize = 500;
    for (let i = 0; i < allEpisodes.length; i += chunkSize) {
        const chunk = allEpisodes.slice(i, i + chunkSize);
        await fetch(`${SUPABASE_URL}/rest/v1/episodes`, {
            method: 'POST',
            headers,
            body: JSON.stringify(chunk)
        });
    }
    console.log(` Successfully added ${showPayload.title} and ${allEpisodes.length} episodes.`);
    return showId;
}

async function markMovieWatched(showId, watchedAt) {
    // get episode id for movie (S1E1)
    const epRes = await fetch(`${SUPABASE_URL}/rest/v1/episodes?show_id=eq.${showId}&season_number=eq.1&episode_number=eq.1&select=id`, { headers });
    const eps = await epRes.json();
    if (!eps || eps.length === 0) return;
    const epId = eps[0].id;

    // insert watch history
    await fetch(`${SUPABASE_URL}/rest/v1/watch_history`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            episode_id: epId,
            watched_at: watchedAt
        })
    });
    console.log(` Marked movie as watched.`);
}

async function run() {
    const followingFile = 'C:/Users/user/Downloads/media-tracker-following (2).csv';
    const logFile = 'C:/Users/user/Downloads/media-tracker-log (2).csv';

    // 1. Process Following
    if (fs.existsSync(followingFile)) {
        console.log("=== Processing Following ===");
        const followingText = fs.readFileSync(followingFile, 'utf8');
        const followingData = Papa.parse(followingText, { header: true, skipEmptyLines: true }).data;
        
        for (const row of followingData) {
            if (!row.item_id) continue;
            const type = row.type === 'movie' ? 'movie' : 'tv';
            const tmdbId = row.item_id.replace('tv-', '').replace('movie-', '');
            await addMediaToSupabase(tmdbId, type);
        }
    }

    // 2. Process Logs
    if (fs.existsSync(logFile)) {
        console.log("=== Processing Logs ===");
        const logText = fs.readFileSync(logFile, 'utf8');
        const logData = Papa.parse(logText, { header: true, skipEmptyLines: true }).data;

        for (const row of logData) {
            if (!row.external_id) continue;
            const type = row.type === 'movie' ? 'movie' : 'tv';
            const tmdbId = row.external_id;
            const watchedAt = row.logged_at;
            
            const showId = await addMediaToSupabase(tmdbId, type);
            
            if (type === 'movie' && showId) {
                await markMovieWatched(showId, watchedAt);
            } else if (type === 'tv') {
                console.log(` TV show logged but no episodes specified. Followed show successfully.`);
            }
        }
    }
    
    console.log("=== IMPORT COMPLETE ===");
}

run().catch(console.error);
