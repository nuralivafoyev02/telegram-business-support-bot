const fs = require('fs');
const path = require('path');

// Manually parse env file
const envPath = 'c:/Users/Asus/Desktop/adminpanel/telegram-business-support-bot/.env';
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const parts = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (parts) {
      const key = parts[1];
      let value = parts[2] || '';
      // Remove quotes if any
      if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value;
    }
  });
}

const supabase = require('c:/Users/Asus/Desktop/adminpanel/telegram-business-support-bot/backend/lib/supabase');

async function main() {
  try {
    const companies = await supabase.select('companies', { select: 'id,name,is_active', limit: '500' });
    console.log('--- All Companies ---');
    console.log(companies);

    const uyqur = companies.find(c => c.name && c.name.toUpperCase().includes('UYQUR'));
    if (!uyqur) {
      console.log('UYQUR company not found');
      return;
    }
    console.log('\n--- UYQUR Company ---');
    console.log(uyqur);

    const chats = await supabase.select('tg_chats', {
      select: 'chat_id,title,username,type,source_type,company_id,is_active',
      company_id: `eq.${uyqur.id}`
    });
    console.log('\n--- UYQUR Chats ---');
    console.log(chats);

    const chatIds = chats.map(c => c.chat_id);
    if (chatIds.length === 0) {
      console.log('No chats linked to UYQUR');
      return;
    }

    const requests = await supabase.select('support_requests', {
      select: 'id,chat_id,company_id,status,created_at,closed_at',
      chat_id: `in.(${chatIds.join(',')})`
    });
    console.log('\n--- Support Requests for UYQUR Chats ---');
    console.log(requests);

    for (const chatId of chatIds) {
      const msgCount = await supabase.select('messages', {
        select: 'id',
        chat_id: `eq.${chatId}`
      });
      console.log(`\nChat ${chatId} messages count: ${msgCount.length}`);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
