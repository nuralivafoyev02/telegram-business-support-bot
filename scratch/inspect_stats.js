const fs = require('fs');
const path = require('path');

// Manually parse .env file
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split('=');
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    process.env[key] = value;
  });
}

const supabase = require('../backend/lib/supabase');

async function inspect() {
  try {
    const stats = await supabase.select('employee_statistics');
    console.log("=== Employee Statistics (All-Time) ===");
    console.log(stats);

    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

    const requests = await supabase.select('support_requests', {
      select: 'id,status,created_at,closed_at,closed_by_name,closed_by_employee_id',
      created_at: `gt.${twoDaysAgo}`
    });

    console.log("\n=== Support Requests (Last 48 Hours) ===");
    console.log(requests);

  } catch (err) {
    console.error("Error:", err);
  }
}

inspect();
