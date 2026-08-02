const SUPABASE_URL = 'https://gnwzertrmjerymlzzfuh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdud3plcnRybWplcnltbHp6ZnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwODU5MTIsImV4cCI6MjEwMDY2MTkxMn0.4Y8p6Um7qH8OUS6pAVpQDPxJ9d_wguqVKjnDiWESEZs';

async function testInsert() {
    console.log("Getting max ID...");
    const maxRes = await fetch(`${SUPABASE_URL}/rest/v1/shows?select=id&order=id.desc&limit=1`, {
        headers: {apikey: SUPABASE_KEY}
    });
    const maxData = await maxRes.json();
    const nextShowId = (maxData && maxData.length > 0 ? maxData[0].id : 0) + 1;
    console.log("Next ID:", nextShowId);
    
    console.log("Inserting mock show...");
    const insertPayload = {
        id: nextShowId,
        api_id: 999999999, // Fake API ID
        title: "Mock Show", 
        genre: "Drama",
        overview: "Mock overview", 
        poster_url: '', 
        total_episodes: 1,
        status: "Ended", 
        type: "tv", 
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
    
    // Cleanup
    if (insertRes.ok) {
        await fetch(`${SUPABASE_URL}/rest/v1/shows?id=eq.${nextShowId}`, {
            method: 'DELETE',
            headers: {apikey: SUPABASE_KEY}
        });
    }
}

testInsert().catch(console.error);
