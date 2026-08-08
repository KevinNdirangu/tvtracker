const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://gnwzertrmjerymlzzfuh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdud3plcnRybWplcnltbHp6ZnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwODU5MTIsImV4cCI6MjEwMDY2MTkxMn0.4Y8p6Um7qH8OUS6pAVpQDPxJ9d_wguqVKjnDiWESEZs');
async function test() {
    let { data: show } = await supabase.from('shows').select('id, created_at, title').limit(1);
    let { data: ep } = await supabase.from('episodes').select('id, created_at').limit(1);
    let { data: w } = await supabase.from('watch_history').select('id, watched_at, created_at').limit(1);
    console.log("show", show);
    console.log("ep", ep);
    console.log("watch", w);
}
test();
