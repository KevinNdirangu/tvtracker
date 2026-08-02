const fs = require('fs');
const path = require('path');
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

const unmatchedLogFile = 'unmatched_shows.txt';

async function fetchAll(table, select, order = 'id') {
    let allData = [];
    let from = 0;
    const step = 1000;
    while(true) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&offset=${from}&limit=${step}&order=${order}.asc`, {
            headers
        });
        if (!res.ok) {
            console.error('Error fetching', table, await res.text());
            break;
        }
        const data = await res.json();
        allData = allData.concat(data);
        if (data.length < step) break;
        from += step;
    }
    return allData;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const res = await fetch(url, options);
            if (res.status === 429) {
                console.log('Rate limited, waiting 3 seconds...');
                await sleep(3000);
                continue;
            }
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${await res.text()}`);
            }
            return await res.json();
        } catch (e) {
            if (i === maxRetries - 1) throw e;
            await sleep(1000 * (i + 1));
        }
    }
}

async function searchTmdb(query) {
    let url = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}`;
    
    // Check if query has (YYYY) at the end
    const yearMatch = query.match(/^(.*?)\s*\((\d{4})\)$/);
    if (yearMatch) {
        const title = yearMatch[1];
        const year = yearMatch[2];
        url = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}&first_air_date_year=${year}`;
    }
    
    const data = await fetchWithRetry(url);
    if (data && data.results && data.results.length > 0) {
        return data.results[0]; // Take best match
    }
    
    // Fallback: search without year just in case
    if (yearMatch) {
        const fallbackUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(yearMatch[1])}`;
        const fallbackData = await fetchWithRetry(fallbackUrl);
        if (fallbackData && fallbackData.results && fallbackData.results.length > 0) {
            return fallbackData.results[0]; // Take best match
        }
    }
    
    return null;
}

async function getTmdbDetails(tmdbId) {
    return await fetchWithRetry(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_KEY}`);
}

async function getTmdbSeason(tmdbId, seasonNumber) {
    return await fetchWithRetry(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNumber}?api_key=${TMDB_KEY}`);
}

async function getNextId(table) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&order=id.desc&limit=1`, { headers });
    const data = await res.json();
    return (data && data.length > 0) ? data[0].id + 1 : 1;
}

async function main() {
    console.log("=== Starting GDPR Import ===");
    
    // 1. Fetch DB state
    console.log("Pre-fetching database state...");
    const [dbShows, dbEpisodes, dbHistory] = await Promise.all([
        fetchAll('shows', 'id,title,api_id,type,timezone_offset'),
        fetchAll('episodes', 'id,show_id,season_number,episode_number'),
        fetchAll('watch_history', 'id,episode_id,watched_at')
    ]);

    const showsByTitleLower = new Map();
    dbShows.forEach(s => showsByTitleLower.set((s.title || '').toLowerCase().trim(), s));
    
    const epsByShow = new Map(); // show_id -> Map of "S-E" -> episode_id
    dbEpisodes.forEach(ep => {
        if (!epsByShow.has(ep.show_id)) epsByShow.set(ep.show_id, new Map());
        epsByShow.get(ep.show_id).set(`${ep.season_number}-${ep.episode_number}`, ep.id);
    });

    const existingWatchSet = new Set();
    dbHistory.forEach(h => existingWatchSet.add(h.episode_id));

    let maxEpId = (dbEpisodes.length > 0 ? Math.max(...dbEpisodes.map(e => e.id)) : 0);

    // 2. Load CSV
    const csvContent = fs.readFileSync('C:\\Users\\user\\Downloads\\gdpr-data\\tracking-prod-records-v2.csv', 'utf8');
    const csvData = Papa.parse(csvContent, { header: true, skipEmptyLines: true }).data;
    
    // Group by series
    const csvShows = {};
    for (const row of csvData) {
        if (!row.series_name) continue;
        const name = row.series_name.trim();
        if (!csvShows[name]) csvShows[name] = [];
        
        let s = parseInt(row.s_no);
        let e = parseInt(row.ep_no);
        if (isNaN(s) || isNaN(e)) continue;
        
        csvShows[name].push({
            season_number: s,
            episode_number: e,
            watched_at: row.updated_at || row.created_at || new Date().toISOString()
        });
    }

    const watchHistoryBuffer = [];
    const unmatched = [];
    let processed = 0;
    const totalShows = Object.keys(csvShows).length;

    for (const [title, episodes] of Object.entries(csvShows)) {
        processed++;
        const titleLower = title.toLowerCase();
        let show = showsByTitleLower.get(titleLower);

        if (!show) {
            // Need to add show from TMDB
            console.log(`[${processed}/${totalShows}] Searching TMDB for missing show: "${title}"...`);
            const searchResult = await searchTmdb(title);
            if (!searchResult) {
                console.log(` -> Could not find TMDB match for "${title}". Logging to unmatched.`);
                unmatched.push(title);
                continue;
            }

            const tmdbId = searchResult.id;
            const details = await getTmdbDetails(tmdbId);
            
            // Try to find if we actually have it by tmdbId (API ID) already just with a different name
            show = dbShows.find(s => s.api_id == tmdbId && s.type === 'tv');
            
            if (!show) {
                console.log(` -> Adding Show "${details.name}" (ID: ${tmdbId}) to database...`);
                const nextShowId = await getNextId('shows');
                const posterUrl = details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : '';
                
                const showPayload = {
                    id: nextShowId,
                    api_id: tmdbId,
                    title: details.name,
                    genre: (details.genres || []).map(g=>g.name).join(', '),
                    overview: details.overview,
                    poster_url: posterUrl,
                    total_episodes: details.number_of_episodes || 0,
                    status: details.status,
                    type: 'tv',
                    is_stopped: 0,
                    timezone_offset: 0 // Simplification
                };

                try {
                    await fetchWithRetry(`${SUPABASE_URL}/rest/v1/shows`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(showPayload)
                    });
                } catch(e) {
                    console.log(` -> Failed to insert show: ${e.message}. Logging to unmatched.`);
                    unmatched.push(title);
                    continue;
                }
                
                show = showPayload;
                dbShows.push(show);
                showsByTitleLower.set(titleLower, show);
                epsByShow.set(show.id, new Map());

                // Now fetch all episodes from TMDB and insert
                let allEpisodes = [];
                for (let i = 1; i <= (details.number_of_seasons || 1); i++) {
                    const sData = await getTmdbSeason(tmdbId, i);
                    if (sData && sData.episodes) {
                        for (const ep of sData.episodes) {
                            maxEpId++;
                            allEpisodes.push({
                                id: maxEpId,
                                show_id: show.id,
                                season_number: ep.season_number,
                                episode_number: ep.episode_number,
                                title: ep.name,
                                air_date: ep.air_date || null,
                                runtime: ep.runtime || 0
                            });
                            epsByShow.get(show.id).set(`${ep.season_number}-${ep.episode_number}`, maxEpId);
                        }
                    }
                    await sleep(100); // Rate limit respect
                }

                if (allEpisodes.length > 0) {
                    for (let i = 0; i < allEpisodes.length; i += 500) {
                        const chunk = allEpisodes.slice(i, i + 500);
                        await fetchWithRetry(`${SUPABASE_URL}/rest/v1/episodes`, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify(chunk)
                        });
                    }
                }
                console.log(` -> Inserted ${allEpisodes.length} episodes for "${title}".`);
            } else {
                console.log(` -> Found TMDB ID ${tmdbId} already exists as "${show.title}".`);
                showsByTitleLower.set(titleLower, show); // Map CSV title to existing show
            }
        }

        // We have the show and its episodes in DB/memory.
        // Let's queue watch history.
        let addedCount = 0;
        let showEpMap = epsByShow.get(show.id);
        if (!showEpMap) {
            showEpMap = new Map(); // Failsafe
        }

        // De-duplicate CSV episodes by s_no-ep_no (sometimes they are repeated if rewatched)
        const uniqueEps = new Map();
        for (const ep of episodes) {
            const k = `${ep.season_number}-${ep.episode_number}`;
            // Keep the latest watched_at
            if (!uniqueEps.has(k) || new Date(ep.watched_at) > new Date(uniqueEps.get(k).watched_at)) {
                uniqueEps.set(k, ep);
            }
        }

        for (const ep of uniqueEps.values()) {
            const epKey = `${ep.season_number}-${ep.episode_number}`;
            const dbEpId = showEpMap.get(epKey);
            if (dbEpId) {
                if (!existingWatchSet.has(dbEpId)) {
                    watchHistoryBuffer.push({
                        episode_id: dbEpId,
                        watched_at: ep.watched_at
                    });
                    existingWatchSet.add(dbEpId); // Prevent duplicates within this run
                    addedCount++;
                }
            }
        }
        
        if (processed % 50 === 0) {
            console.log(`[${processed}/${totalShows}] Buffered ${watchHistoryBuffer.length} total watch records so far...`);
        }
    }

    console.log(`\n=== Writing ${watchHistoryBuffer.length} new watch records to Database ===`);
    let nextWatchId = await getNextId('watch_history');
    
    // Assign IDs
    for (const record of watchHistoryBuffer) {
        record.id = nextWatchId++;
    }

    for (let i = 0; i < watchHistoryBuffer.length; i += 500) {
        const chunk = watchHistoryBuffer.slice(i, i + 500);
        await fetchWithRetry(`${SUPABASE_URL}/rest/v1/watch_history`, {
            method: 'POST',
            headers,
            body: JSON.stringify(chunk)
        });
        console.log(` -> Inserted ${Math.min(i + 500, watchHistoryBuffer.length)} / ${watchHistoryBuffer.length} records...`);
    }

    if (unmatched.length > 0) {
        fs.writeFileSync(unmatchedLogFile, unmatched.join('\n'), 'utf8');
        console.log(`\nWritten ${unmatched.length} unmatched shows to ${unmatchedLogFile}`);
    }

    console.log("\n=== IMPORT COMPLETE ===");
}

main().catch(console.error);
