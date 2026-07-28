const TMDB_KEY = '87ca90817435c5a482ec6cb70ce71199';
const SUPABASE_URL = 'https://gnwzertrmjerymlzzfuh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdud3plcnRybWplcnltbHp6ZnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwODU5MTIsImV4cCI6MjEwMDY2MTkxMn0.4Y8p6Um7qH8OUS6pAVpQDPxJ9d_wguqVKjnDiWESEZs';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchAllParallel(table, select) {
    const step = 999;
    const { count } = await supabaseClient.from(table).select('*', { count: 'exact', head: true });
    const promises = [];
    for (let from = 0; from < count; from += (step + 1)) {
        promises.push(supabaseClient.from(table).select(select).range(from, from + step));
    }
    const results = await Promise.all(promises);
    let allData = [];
    for (const res of results) {
        if (res.error) console.error('Supabase fetch error:', res.error);
        else if (res.data) allData = allData.concat(res.data);
    }
    return allData;
}

async function fetchAll(queryBuilderFn, step = 999) {
    let allData = [];
    let from = 0;
    while(true) {
        const { data, error } = await queryBuilderFn().range(from, from + step);
        if (error) { console.error('Supabase fetch error:', JSON.stringify(error)); break; }
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length <= step) break;
        from += (step + 1);
    }
    return allData;
}

const api = {
    async getLocalIds() {
        const data = await fetchAll(() => supabaseClient.from('shows').select('api_id'));
        return data.map(d => d.api_id);
    },

    async getTrending(type = 'all', page = 1, genre = 'all') {
        if (genre === 'all') {
            if (type === 'anime') {
                const res = await fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&with_genres=16&with_original_language=ja&page=${page}`);
                const data = await res.json();
                return data.results;
            } else {
                const res = await fetch(`https://api.themoviedb.org/3/trending/${type}/week?api_key=${TMDB_KEY}&page=${page}`);
                const data = await res.json();
                return data.results;
            }
        }
        
        const gMap = {
            'action': { movie: 28, tv: 10759 },
            'animation': { movie: 16, tv: 16 },
            'comedy': { movie: 35, tv: 35 },
            'crime': { movie: 80, tv: 80 },
            'documentary': { movie: 99, tv: 99 },
            'drama': { movie: 18, tv: 18 },
            'family': { movie: 10751, tv: 10751 },
            'fantasy': { movie: '14,878', tv: 10765 },
            'horror': { movie: 27, tv: 27 },
            'mystery': { movie: 9648, tv: 9648 },
            'romance': { movie: 10749, tv: 18 },
            'thriller': { movie: 53, tv: 9648 }
        };
        
        const g = gMap[genre];
        if (!g) return [];
        
        if (type === 'all') {
            const [mRes, tRes] = await Promise.all([
                fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_genres=${g.movie}&page=${page}`),
                fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&with_genres=${g.tv}&page=${page}`)
            ]);
            const mData = await mRes.json();
            const tData = await tRes.json();
            const results = [];
            const len = Math.max((mData.results || []).length, (tData.results || []).length);
            for (let i = 0; i < len; i++) {
                if (mData.results && mData.results[i]) results.push(mData.results[i]);
                if (tData.results && tData.results[i]) results.push(tData.results[i]);
            }
            return results;
        } else if (type === 'anime') {
            const res = await fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&with_genres=16,${g.tv}&with_original_language=ja&page=${page}`);
            const data = await res.json();
            return data.results;
        } else {
            const gid = type === 'movie' ? g.movie : g.tv;
            const res = await fetch(`https://api.themoviedb.org/3/discover/${type}?api_key=${TMDB_KEY}&with_genres=${gid}&page=${page}`);
            const data = await res.json();
            return data.results;
        }
    },

    async searchTmdb(query, page = 1) {
        const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&page=${page}`);
        const data = await res.json();
        return data.results.filter(i => i.media_type === 'movie' || i.media_type === 'tv');
    },

    async getLibrary() {
        const [shows, episodes, history] = await Promise.all([
            fetchAllParallel('shows', '*'),
            fetchAllParallel('episodes', 'id, show_id, season_number, runtime, air_date'),
            fetchAllParallel('watch_history', 'id, episode_id, watched_at')
        ]);

        const showMap = new Map();
        shows.forEach(s => { s.episodes = []; showMap.set(s.id, s); });

        const epMap = new Map();
        episodes.forEach(ep => {
            ep.watch_history = [];
            epMap.set(ep.id, ep);
            if (showMap.has(ep.show_id)) showMap.get(ep.show_id).episodes.push(ep);
        });

        history.forEach(h => {
            if (epMap.has(h.episode_id)) epMap.get(h.episode_id).watch_history.push(h);
        });
        
        if (!shows) return [];
        return shows.map(s => {
            let watched = 0;
            let aired = 0;
            let lastWatched = 0;
            let runtime = 0;
            
            if (s.episodes) {
                s.episodes.forEach(ep => {
                    if (ep.season_number > 0) {
                        if (ep.air_date && new Date(ep.air_date) <= new Date()) aired++;
                        if (ep.watch_history && ep.watch_history.length > 0) {
                            watched++;
                            runtime += (ep.runtime || 0);
                            const wAt = new Date(ep.watch_history[0].watched_at).getTime();
                            if (wAt > lastWatched) lastWatched = wAt;
                        }
                    }
                });
            }
            
            return {
                id: s.id, api_id: s.api_id, title: s.title, genre: s.genre, overview: s.overview, 
                posterUrl: s.poster_url, totalEpisodes: s.total_episodes, status: s.status, type: s.type,
                is_stopped: s.is_stopped, user_rating: s.user_rating, user_notes: s.user_notes, 
                custom_tags: s.custom_tags, timezone_offset: s.timezone_offset,
                watchedEpisodes: watched, airedEpisodes: aired, runtime, 
                lastWatched: lastWatched > 0 ? new Date(lastWatched).toISOString() : null
            };
        });
    },

    async getCalendar(includePast = false) {
        let fromDate;
        if (includePast) {
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 30);
            fromDate = pastDate.toISOString().split('T')[0];
        } else {
            fromDate = new Date().toISOString().split('T')[0];
        }
        
        const { data: eps } = await supabaseClient.from('episodes')
            .select('id, show_id, season_number, episode_number, title, air_date')
            .gte('air_date', fromDate)
            .order('air_date', { ascending: true })
            .limit(300);
            
        const shows = await fetchAllParallel('shows', 'id, api_id, title, poster_url, type, is_stopped');
        const showMap = new Map();
        shows.forEach(s => showMap.set(s.id, s));
        
        return eps
            .filter(e => showMap.has(e.show_id) && showMap.get(e.show_id).is_stopped === 0)
            .map(e => {
                const s = showMap.get(e.show_id);
                return {
                    id: e.id, api_id: s.api_id, season_number: e.season_number,
                    episode_number: e.episode_number, ep_title: e.title, air_date: e.air_date,
                    show_title: s.title, poster_url: s.poster_url, type: s.type
                };
            });
    },

    async getShowDetails(localId) {
        const { data: show } = await supabaseClient.from('shows').select('*').eq('id', localId).single();
        let { data: episodes } = await supabaseClient.from('episodes').select('*, watch_history(id, watched_at)').eq('show_id', localId);
        
        // Self-heal missing episodes (fixes bug where shows were added but episode insertion failed)
        if (!episodes || episodes.length === 0) {
            console.log("Healing missing episodes for", show.title);
            await this.addMedia(show.api_id, show.type, false);
            const { data: newEps } = await supabaseClient.from('episodes').select('*, watch_history(id, watched_at)').eq('show_id', localId);
            if (newEps) episodes = newEps;
        }
        
        const processedEps = episodes.map(ep => ({
            ...ep,
            is_watched: ep.watch_history && ep.watch_history.length > 0,
            watch_count: ep.watch_history ? ep.watch_history.length : 0,
            watched_at: ep.watch_history && ep.watch_history.length > 0 ? ep.watch_history[0].watched_at : null
        })).sort((a,b) => a.season_number !== b.season_number ? a.season_number - b.season_number : a.episode_number - b.episode_number);
        
        return { show, episodes: processedEps };
    },

    async getTmdbDetails(tmdbId, type) {
        const res = await fetch(`https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/${tmdbId}?api_key=${TMDB_KEY}`);
        return await res.json();
    },

    async getTmdbExtra(tmdbId, type) {
        const res = await fetch(`https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=videos,credits`);
        return await res.json();
    },

    async addMedia(tmdbId, type, markSeen = false) {
        const data = await this.getTmdbDetails(tmdbId, type);
        const posterUrl = data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '';
        const isMovie = type === 'movie';
        
        let allEpisodes = [];
        if (isMovie) {
            allEpisodes.push({ season_number: 1, episode_number: 1, name: data.title, air_date: data.release_date, runtime: data.runtime });
        } else {
            for (let i = 1; i <= data.number_of_seasons; i++) {
                const sRes = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${i}?api_key=${TMDB_KEY}`);
                const sData = await sRes.json();
                if (sData.episodes) allEpisodes = allEpisodes.concat(sData.episodes);
            }
        }

        let shouldShift = false;
        const shiftSetting = await this.getSetting('autoTimezoneShift');
        if (shiftSetting === '1') {
            const americas = ['US', 'CA', 'MX', 'BR', 'AR', 'CO'];
            if (data.origin_country && data.origin_country.some(c => americas.includes(c))) shouldShift = true;
        }

        const { data: existingShow } = await supabaseClient.from('shows').select('id').eq('api_id', data.id).maybeSingle();
        let localId;
        
        if (existingShow) {
            localId = existingShow.id;
        } else {
            let insertedShow = null;
            let error = null;
            
            for (let attempt = 1; attempt <= 10; attempt++) {
                const { data: maxIdData } = await supabaseClient.from('shows').select('id').order('id', { ascending: false }).limit(1).maybeSingle();
                const nextShowId = (maxIdData ? maxIdData.id : 0) + attempt;
                
                const res = await supabaseClient.from('shows').insert({
                    id: nextShowId,
                    api_id: data.id, title: data.title || data.name, genre: (data.genres || []).map(g=>g.name).join(', '),
                    overview: data.overview, poster_url: posterUrl, total_episodes: isMovie ? 1 : (data.number_of_episodes || 0),
                    status: data.status, type: type, timezone_offset: shouldShift ? 1 : 0
                }).select().single();
                
                if (!res.error) {
                    insertedShow = res.data;
                    error = null;
                    break;
                }
                error = res.error;
                if (error.code !== '23505') break; // If it's not a duplicate key error, don't retry
            }
            
            if (!insertedShow) {
                console.error("Error inserting show:", error);
                throw error;
            }
            localId = insertedShow.id;
        }

        const { data: existingEps } = await supabaseClient.from('episodes').select('season_number, episode_number').eq('show_id', localId);
        const existingSet = new Set((existingEps || []).map(e => `${e.season_number}-${e.episode_number}`));

        const newEps = [];
        allEpisodes.forEach(ep => {
            if (ep.season_number > 0 && !existingSet.has(`${ep.season_number}-${ep.episode_number}`)) {
                let finalAirDate = ep.air_date || '';
                if (shouldShift && finalAirDate && (!existingEps || existingEps.length === 0)) {
                    const d = new Date(finalAirDate);
                    d.setDate(d.getDate() + 1);
                    finalAirDate = d.toISOString().split('T')[0];
                }
                newEps.push({
                    show_id: localId, season_number: ep.season_number, episode_number: ep.episode_number,
                    title: ep.name, air_date: finalAirDate, runtime: ep.runtime || 0
                });
            }
        });
        
        if (newEps.length > 0) {
            // Fetch max episode ID to bypass broken sequence
            const { data: maxEpIdData } = await supabaseClient.from('episodes').select('id').order('id', { ascending: false }).limit(1).maybeSingle();
            let nextEpId = (maxEpIdData ? maxEpIdData.id : 0) + 1;
            
            for (let i = 0; i < newEps.length; i++) {
                newEps[i].id = nextEpId++;
            }

            // Chunk episode inserts to avoid payload limits
            for (let i = 0; i < newEps.length; i += 500) {
                const { error: epError } = await supabaseClient.from('episodes').insert(newEps.slice(i, i + 500));
                if (epError) console.error("Error inserting episodes:", epError);
            }
        }

        await supabaseClient.from('shows').update({ is_stopped: 0 }).eq('id', localId);

        if (markSeen && isMovie) {
            const { data: epData, error: selErr } = await supabaseClient.from('episodes').select('id').eq('show_id', localId).maybeSingle();
            if (selErr) console.error("Error finding movie episode:", selErr);
            if (epData) await this.logEpisode(epData.id);
        }
        return true;
    },

    async getNextId(tableName) {
        const { data } = await supabaseClient.from(tableName).select('id').order('id', { ascending: false }).limit(1).maybeSingle();
        return (data ? data.id : 0) + 1;
    },

    async removeShow(id) {
        await supabaseClient.from('shows').delete().eq('id', id);
        return true;
    },

    async setStopped(id, val) {
        await supabaseClient.from('shows').update({ is_stopped: val }).eq('id', id);
    },

    async logEpisode(epId) {
        for(let attempt=0; attempt<10; attempt++) {
            const nextId = await this.getNextId('watch_history') + attempt;
            const { error } = await supabaseClient.from('watch_history').insert({ id: nextId, episode_id: epId });
            if (!error) break;
            if (error.code !== '23505') break; // If not duplicate key, stop retrying
        }
    },

    async unlogEpisode(epId) {
        await supabaseClient.from('watch_history').delete().eq('episode_id', epId);
    },

    async getSetting(key) {
        const { data } = await supabaseClient.from('app_settings').select('value').eq('key', key).single();
        return data ? data.value : null;
    },

    async setSetting(key, value) {
        const { data: existing } = await supabaseClient.from('app_settings').select('key').eq('key', key).single();
        if(existing) {
            await supabaseClient.from('app_settings').update({ value }).eq('key', key);
        } else {
            await supabaseClient.from('app_settings').insert({ key, value });
        }
    },
    
    async updateShowMeta(id, rating, tags, notes) {
        await supabaseClient.from('shows').update({ user_rating: rating, custom_tags: tags, user_notes: notes }).eq('id', id);
    },
    
    async syncLibraryTimezones() {
        const { data: shows } = await supabaseClient.from('shows').select('id, api_id, type').eq('timezone_offset', 0);
        if(!shows) return { success: false, count: 0 };
        
        const americas = ['US', 'CA', 'MX', 'BR', 'AR', 'CO'];
        let updatedCount = 0;
        
        for (const show of shows) {
            const res = await fetch(`https://api.themoviedb.org/3/${show.type === 'movie' ? 'movie' : 'tv'}/${show.api_id}?api_key=${TMDB_KEY}`);
            const data = await res.json();
            if (data.origin_country && data.origin_country.some(c => americas.includes(c))) {
                await supabaseClient.from('shows').update({ timezone_offset: 1 }).eq('id', show.id);
                
                const { data: eps } = await supabaseClient.from('episodes').select('id, air_date').eq('show_id', show.id).neq('air_date', '');
                if(eps) {
                    for(let i = 0; i < eps.length; i+=100) {
                        const chunk = eps.slice(i, i+100);
                        const updates = chunk.map(e => {
                            const d = new Date(e.air_date);
                            d.setDate(d.getDate() + 1);
                            return { id: e.id, air_date: d.toISOString().split('T')[0] };
                        });
                        await supabaseClient.from('episodes').upsert(updates);
                    }
                }
                updatedCount++;
            }
        }
        return { success: true, count: updatedCount };
    },
    
    async toggleTimezoneShift(localId) {
        const { data: show } = await supabaseClient.from('shows').select('timezone_offset').eq('id', localId).single();
        if(!show) return;
        const newVal = show.timezone_offset === 1 ? 0 : 1;
        const shiftDays = show.timezone_offset === 1 ? -1 : 1;
        
        await supabaseClient.from('shows').update({ timezone_offset: newVal }).eq('id', localId);
        
        const { data: eps } = await supabaseClient.from('episodes').select('id, air_date').eq('show_id', localId).neq('air_date', '');
        if(eps) {
            for(let i = 0; i < eps.length; i+=100) {
                const chunk = eps.slice(i, i+100);
                const updates = chunk.map(e => {
                    const d = new Date(e.air_date);
                    d.setDate(d.getDate() + shiftDays);
                    return { id: e.id, air_date: d.toISOString().split('T')[0] };
                });
                await supabaseClient.from('episodes').upsert(updates);
            }
        }
    },

    async getStats() {
        const today = new Date().toISOString().split('T')[0];
        const { data: upcomingData } = await supabaseClient.from('episodes')
            .select('title, season_number, episode_number, air_date, shows!inner(title, poster_url, type, api_id, id, is_stopped)')
            .eq('shows.is_stopped', 0)
            .gte('air_date', today)
            .order('air_date', { ascending: true })
            .limit(50);
            
        let upcoming = [];
        if (upcomingData) {
            upcoming = upcomingData.map(e => ({
                ep_title: e.title,
                season_number: e.season_number,
                episode_number: e.episode_number,
                air_date: e.air_date,
                show_title: e.shows.title,
                poster_url: e.shows.poster_url,
                type: e.shows.type,
                api_id: e.shows.api_id,
                id: e.shows.id
            }));
        }

        const history = await fetchAllParallel('watch_history', 'episode_id, watched_at');
        const episodes = await fetchAllParallel('episodes', 'id, runtime, air_date, show_id');
        
        return { 
            history,
            episodes,
            upcoming
        };
    },

    async logSeason(showId, seasonNum) {
        const { data: eps } = await supabaseClient.from('episodes').select('id, air_date, watch_history(id)').eq('show_id', showId).eq('season_number', seasonNum);
        if (!eps) return;
        const toInsert = eps.filter(e => e.air_date && new Date(e.air_date) <= new Date() && (!e.watch_history || e.watch_history.length === 0)).map(e => ({ episode_id: e.id }));
        if(toInsert.length > 0) {
            let nextId = await this.getNextId('watch_history');
            for(let i=0; i<toInsert.length; i++) toInsert[i].id = nextId + i;
            for(let i=0; i<toInsert.length; i+=500) await supabaseClient.from('watch_history').insert(toInsert.slice(i, i+500));
        }
    },

    async unlogSeason(showId, seasonNum) {
        const { data: eps } = await supabaseClient.from('episodes').select('id').eq('show_id', showId).eq('season_number', seasonNum);
        if (!eps || eps.length === 0) return;
        const epIds = eps.map(e => e.id);
        
        for(let i=0; i<epIds.length; i+=100) {
            await supabaseClient.from('watch_history').delete().in('episode_id', epIds.slice(i, i+100));
        }
    },

    async logUpTo(showId, seasonNum, epNum) {
        seasonNum = parseInt(seasonNum);
        epNum = parseInt(epNum);
        const { data: eps } = await supabaseClient.from('episodes').select('id, season_number, episode_number, air_date, watch_history(id)').eq('show_id', showId);
        if (!eps) return;
        const toInsert = eps.filter(e => {
            const hasAired = e.air_date && new Date(e.air_date) <= new Date();
            const isBeforeOrEq = e.season_number < seasonNum || (e.season_number === seasonNum && e.episode_number <= epNum);
            const isUnwatched = (!e.watch_history || e.watch_history.length === 0);
            return hasAired && isBeforeOrEq && isUnwatched;
        }).map(e => ({ episode_id: e.id }));
        if(toInsert.length > 0) {
            let nextId = await this.getNextId('watch_history');
            for(let i=0; i<toInsert.length; i++) toInsert[i].id = nextId + i;
            for(let i=0; i<toInsert.length; i+=500) await supabaseClient.from('watch_history').insert(toInsert.slice(i, i+500));
        }
    },

    async exportData() {
        const shows = await fetchAllParallel('shows', '*');
        const episodes = await fetchAllParallel('episodes', '*');
        const history = await fetchAllParallel('watch_history', '*');
        return { shows, episodes, watch_history: history };
    }
};

// Create the unified bridge that mocks Electron's ipcRenderer using our API
window.ipcRenderer = {
    invoke: async (channel, ...args) => {
        if(channel === 'get-local-ids') return api.getLocalIds();
        if(channel === 'get-trending') return api.getTrending(...args);
        if(channel === 'search-tmdb') return api.searchTmdb(...args);
        if(channel === 'get-library') return api.getLibrary();
        if(channel === 'get-calendar') return api.getCalendar(...args);
        if(channel === 'get-show-details') return api.getShowDetails(...args);
        if(channel === 'get-tmdb-details') return api.getTmdbDetails(...args);
        if(channel === 'get-tmdb-extra') return api.getTmdbExtra(...args);
        if(channel === 'add-media') return api.addMedia(...args);
        if(channel === 'remove-show') return api.removeShow(...args);
        if(channel === 'set-stopped') return api.setStopped(...args);
        if(channel === 'log-episode') return api.logEpisode(...args);
        if(channel === 'unlog-episode') return api.unlogEpisode(...args);
        if(channel === 'get-setting') return api.getSetting(...args);
        if(channel === 'set-setting') return api.setSetting(...args);
        if(channel === 'update-show-meta') return api.updateShowMeta(...args);
        if(channel === 'sync-library-timezones') return api.syncLibraryTimezones();
        if(channel === 'toggle-timezone-offset') return api.toggleTimezoneShift(...args);
        if(channel === 'get-stats') return api.getStats();
        if(channel === 'log-season') return api.logSeason(...args);
        if(channel === 'unlog-season') return api.unlogSeason(...args);
        if(channel === 'log-up-to') return api.logUpTo(...args);
        if(channel === 'export-data') return api.exportData();
        
        // Unsupported operations that require native Node filesystem access
        if(channel === 'import-csv') { alert("Importing CSV is not supported on Web/Mobile"); return { success: false }; }
        if(channel === 'gcal-auth' || channel === 'gcal-token' || channel === 'gcal-sync') { alert("GCal API requires desktop."); return { success: false }; }
        if(channel === 'gist-setup' || channel === 'gist-sync') { alert("Gist Sync not supported on web."); return { success: false }; }
        
        return null;
    }
};
