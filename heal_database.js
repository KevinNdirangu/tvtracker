const { createClient } = require('@supabase/supabase-js');
const TMDB_KEY = '3231f417eebcb0be99878b403487c6be';
const supabase = createClient('https://gnwzertrmjerymlzzfuh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdud3plcnRybWplcnltbHp6ZnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwODU5MTIsImV4cCI6MjEwMDY2MTkxMn0.4Y8p6Um7qH8OUS6pAVpQDPxJ9d_wguqVKjnDiWESEZs');

async function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function fetchTmdb(url) {
    for(let i=0; i<3; i++) {
        try {
            const res = await fetch(url);
            if(res.ok) return await res.json();
            await delay(500);
        } catch(e) {
            await delay(500);
        }
    }
    return null;
}

async function run() {
    console.log('Starting heal process...');
    let { data: shows } = await supabase.from('shows').select('id, title, api_id, type, timezone_offset');
    let { data: eps } = await supabase.from('episodes').select('show_id');
    let epCounts = {};
    eps.forEach(e => { epCounts[e.show_id] = (epCounts[e.show_id]||0)+1; });
    
    let missing = shows.filter(s => !epCounts[s.id]);
    console.log('Found ' + missing.length + ' shows needing healing.');
    
    const { data: maxEpIdData } = await supabase.from('episodes').select('id').order('id', { ascending: false }).limit(1).maybeSingle();
    let nextEpId = (maxEpIdData ? maxEpIdData.id : 0) + 1;
    console.log('Starting episode ID at: ' + nextEpId);
    
    for (let i = 0; i < missing.length; i++) {
        const show = missing[i];
        console.log('[' + (i+1) + '/' + missing.length + '] Healing ' + show.title);
        let allEpisodes = [];
        if (show.type === 'movie') {
            const data = await fetchTmdb(`https://api.themoviedb.org/3/movie/${show.api_id}?api_key=${TMDB_KEY}`);
            if(data) allEpisodes.push({ season_number: 1, episode_number: 1, name: data.title, air_date: data.release_date, runtime: data.runtime });
        } else {
            const data = await fetchTmdb(`https://api.themoviedb.org/3/tv/${show.api_id}?api_key=${TMDB_KEY}`);
            if(data && data.number_of_seasons) {
                for (let s = 1; s <= data.number_of_seasons; s++) {
                    const sData = await fetchTmdb(`https://api.themoviedb.org/3/tv/${show.api_id}/season/${s}?api_key=${TMDB_KEY}`);
                    if (sData && sData.episodes) {
                        allEpisodes = allEpisodes.concat(sData.episodes);
                    }
                    await delay(20);
                }
            }
        }
        
        if (allEpisodes.length > 0) {
            const newEps = [];
            const shouldShift = show.timezone_offset === 1;
            allEpisodes.forEach(ep => {
                if (ep.season_number > 0) {
                    let finalAirDate = ep.air_date || '';
                    if (shouldShift && finalAirDate) {
                        const d = new Date(finalAirDate);
                        d.setDate(d.getDate() + 1);
                        finalAirDate = d.toISOString().split('T')[0];
                    }
                    newEps.push({
                        id: nextEpId++, 
                        show_id: show.id, 
                        season_number: ep.season_number, 
                        episode_number: ep.episode_number, 
                        title: ep.name, 
                        air_date: finalAirDate, 
                        runtime: ep.runtime || 0
                    });
                }
            });
            for(let j=0; j<newEps.length; j+=100) {
                const {error} = await supabase.from('episodes').insert(newEps.slice(j, j+100));
                if(error) console.error('Error inserting:', error);
            }
        }
        await delay(50);
    }
    console.log('Heal complete!');
}
run();
