import sqlite3
import json
import urllib.request
import urllib.error

SUPABASE_URL = 'https://gnwzertrmjerymlzzfuh.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdud3plcnRybWplcnltbHp6ZnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwODU5MTIsImV4cCI6MjEwMDY2MTkxMn0.4Y8p6Um7qH8OUS6pAVpQDPxJ9d_wguqVKjnDiWESEZs'

def supabase_insert(table, data):
    if not data: return
    chunk_size = 500
    for i in range(0, len(data), chunk_size):
        chunk = data[i:i+chunk_size]
        req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/{table}', data=json.dumps(chunk).encode('utf-8'))
        req.add_header('apikey', SUPABASE_KEY)
        req.add_header('Authorization', f'Bearer {SUPABASE_KEY}')
        req.add_header('Content-Type', 'application/json')
        req.add_header('Prefer', 'resolution=merge-duplicates')
        
        try:
            with urllib.request.urlopen(req) as response:
                print(f"Inserted {len(chunk)} rows into {table}...")
        except urllib.error.HTTPError as e:
            print(f"Failed to insert into {table}: {e.read().decode('utf-8')}")
        except Exception as e:
            print(f"Failed to insert into {table}: {e}")

def main():
    conn = sqlite3.connect('tracker.db')
    conn.row_factory = sqlite3.Row
    
    print("Reading local SQLite data...")
    shows = [dict(row) for row in conn.execute('SELECT * FROM shows').fetchall()]
    episodes = [dict(row) for row in conn.execute('SELECT * FROM episodes').fetchall()]
    watch_history = [dict(row) for row in conn.execute('SELECT * FROM watch_history').fetchall()]
    settings = [dict(row) for row in conn.execute('SELECT * FROM app_settings').fetchall()]
    
    print(f"Found {len(shows)} shows, {len(episodes)} episodes, {len(watch_history)} history records.")
    
    print("Uploading Shows to Supabase...")
    supabase_insert('shows', shows)
    
    print("Uploading Episodes to Supabase...")
    supabase_insert('episodes', episodes)
    
    print("Uploading Watch History to Supabase...")
    supabase_insert('watch_history', watch_history)
    
    print("Uploading App Settings to Supabase...")
    supabase_insert('app_settings', settings)
    
    print("Migration Complete!")

if __name__ == '__main__':
    main()
