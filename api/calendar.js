module.exports = async function handler(req, res) {
    const SUPABASE_URL = 'https://gnwzertrmjerymlzzfuh.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdud3plcnRybWplcnltbHp6ZnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwODU5MTIsImV4cCI6MjEwMDY2MTkxMn0.4Y8p6Um7qH8OUS6pAVpQDPxJ9d_wguqVKjnDiWESEZs';
    
    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
    };

    try {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 30);
        const fromDate = pastDate.toISOString().split('T')[0];
        
        // Fetch episodes from last 30 days onwards (limit 500)
        const epRes = await fetch(`${SUPABASE_URL}/rest/v1/episodes?select=id,show_id,season_number,episode_number,title,air_date&air_date=gte.${fromDate}&order=air_date.asc&limit=500`, { headers });
        if (!epRes.ok) throw new Error('Failed to fetch episodes');
        const eps = await epRes.json();
        
        // Fetch active shows
        const showsRes = await fetch(`${SUPABASE_URL}/rest/v1/shows?select=id,title,is_stopped&is_stopped=eq.0`, { headers });
        if (!showsRes.ok) throw new Error('Failed to fetch shows');
        const shows = await showsRes.json();
        
        const showMap = new Map();
        shows.forEach(s => showMap.set(s.id, s));
        
        const calData = eps
            .filter(e => showMap.has(e.show_id))
            .map(e => {
                const s = showMap.get(e.show_id);
                return {
                    id: e.id, season_number: e.season_number,
                    episode_number: e.episode_number, ep_title: e.title, air_date: e.air_date,
                    show_title: s.title
                };
            });

        let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TV Tracker//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:TV Time Tracker\r\nX-WR-TIMEZONE:UTC\r\n";
        calData.forEach(ep => {
            const dtStart = ep.air_date.replace(/-/g, '') + 'T000000Z';
            const d = new Date(ep.air_date);
            d.setDate(d.getDate() + 1);
            const dtEnd = d.toISOString().split('T')[0].replace(/-/g, '') + 'T000000Z';
            
            ics += "BEGIN:VEVENT\r\n";
            ics += `UID:${ep.id}@tvtracker\r\n`;
            ics += `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z\r\n`;
            ics += `DTSTART;VALUE=DATE:${dtStart.substring(0,8)}\r\n`;
            ics += `DTEND;VALUE=DATE:${dtEnd.substring(0,8)}\r\n`;
            ics += `SUMMARY:${ep.show_title} - ${ep.season_number}x${ep.episode_number} - ${ep.ep_title}\r\n`;
            ics += "END:VEVENT\r\n";
        });
        ics += "END:VCALENDAR";

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="tvtracker.ics"');
        res.status(200).send(ics);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
