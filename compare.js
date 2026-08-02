const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const SUPABASE_URL = 'https://gnwzertrmjerymlzzfuh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdud3plcnRybWplcnltbHp6ZnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwODU5MTIsImV4cCI6MjEwMDY2MTkxMn0.4Y8p6Um7qH8OUS6pAVpQDPxJ9d_wguqVKjnDiWESEZs';

async function fetchAll(table, select) {
    let allData = [];
    let from = 0;
    const step = 1000;
    while(true) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&offset=${from}&limit=${step}`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
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

async function main() {
    console.log("Reading CSV...");
    const csvContent = fs.readFileSync('C:\\Users\\user\\Downloads\\gdpr-data\\tracking-prod-records-v2.csv', 'utf8');
    
    // Parse CSV
    const csvData = Papa.parse(csvContent, { header: true }).data;
    
    // Process CSV: Count episodes per series
    const csvShows = {};
    for (const row of csvData) {
        if (!row.series_name) continue;
        const name = row.series_name.trim();
        if (!csvShows[name]) csvShows[name] = new Set();
        // TV Time exports often include duplicates for rewatches, we'll use ep_no + s_no or episode_id to deduplicate unique watched episodes
        // If s_no is 0, it's a special. Let's include it.
        const epKey = row.episode_id || `${row.s_no}-${row.ep_no}`;
        csvShows[name].add(epKey);
    }
    
    const csvCounts = {};
    for (const [name, eps] of Object.entries(csvShows)) {
        csvCounts[name] = eps.size;
    }

    console.log("Fetching from Supabase...");
    const [shows, episodes, history] = await Promise.all([
        fetchAll('shows', 'id,title,type'),
        fetchAll('episodes', 'id,show_id'),
        fetchAll('watch_history', 'episode_id')
    ]);
    
    console.log(`Fetched ${shows.length} shows, ${episodes.length} episodes, ${history.length} watch history records.`);
    
    const showMap = new Map();
    for (const s of shows) {
        showMap.set(s.id, { title: s.title, type: s.type, watchCount: 0 });
    }
    
    const epToShow = new Map();
    for (const e of episodes) {
        epToShow.set(e.id, e.show_id);
    }
    
    // Deduplicate watch history (in case of bugs)
    const uniqueHistory = new Set();
    for (const h of history) {
        uniqueHistory.add(h.episode_id);
    }
    
    for (const epId of uniqueHistory) {
        const showId = epToShow.get(epId);
        if (showId && showMap.has(showId)) {
            showMap.get(showId).watchCount++;
        }
    }
    
    const sbCounts = {};
    for (const s of showMap.values()) {
        const title = s.title;
        // If it's a movie, the export might not have it in tracking-prod-records-v2.csv (usually TV Tracker handles series there, movies might be elsewhere or same)
        // Let's just track all.
        sbCounts[title] = (sbCounts[title] || 0) + s.watchCount;
    }
    
    console.log("\n--- Comparison ---");
    let missingInDb = [];
    let differences = [];
    let totalCsv = 0;
    let totalSb = 0;
    
    for (const [name, csvCount] of Object.entries(csvCounts)) {
        totalCsv += csvCount;
        const sbCount = sbCounts[name] || 0;
        totalSb += sbCount;
        
        if (sbCount === 0) {
            missingInDb.push({ name, csvCount });
        } else if (sbCount !== csvCount) {
            differences.push({ name, csvCount, sbCount, diff: Math.abs(csvCount - sbCount) });
        }
        
        // Remove from sbCounts so we can find ones in DB but not in CSV
        delete sbCounts[name];
    }
    
    let extraInDb = [];
    for (const [name, sbCount] of Object.entries(sbCounts)) {
        totalSb += sbCount;
        if (sbCount > 0) {
            extraInDb.push({ name, sbCount });
        }
    }
    
    differences.sort((a, b) => b.diff - a.diff);
    missingInDb.sort((a, b) => b.csvCount - a.csvCount);
    extraInDb.sort((a, b) => b.sbCount - a.sbCount);
    
    console.log(`Total Watched Episodes in CSV: ${totalCsv}`);
    console.log(`Total Watched Episodes in DB: ${totalSb}`);
    
    console.log(`\nTop 10 Shows missing entirely in DB (out of ${missingInDb.length}):`);
    for (const s of missingInDb.slice(0, 10)) console.log(`- ${s.name}: ${s.csvCount} eps`);
    
    console.log(`\nTop 10 Shows with differences (out of ${differences.length}):`);
    for (const s of differences.slice(0, 10)) console.log(`- ${s.name}: CSV=${s.csvCount}, DB=${s.sbCount} (Diff: ${s.diff})`);
    
    console.log(`\nTop 10 Shows only in DB (out of ${extraInDb.length}):`);
    for (const s of extraInDb.slice(0, 10)) console.log(`- ${s.name}: DB=${s.sbCount} eps`);
}

main().catch(console.error);
