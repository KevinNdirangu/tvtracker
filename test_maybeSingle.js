const SUPABASE_URL = 'https://gnwzertrmjerymlzzfuh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdud3plcnRybWplcnltbHp6ZnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwODU5MTIsImV4cCI6MjEwMDY2MTkxMn0.4Y8p6Um7qH8OUS6pAVpQDPxJ9d_wguqVKjnDiWESEZs';
async function test() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/shows?select=id&api_id=eq.84958`, {
        headers: {apikey: SUPABASE_KEY, 'Accept': 'application/vnd.pgrst.object+json'}
    });
    console.log("Status:", res.status);
    console.log(await res.text());
}
test();
