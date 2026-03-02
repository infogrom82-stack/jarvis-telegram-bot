const { OpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js');
const { config } = require('./config');

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);

async function createEmbedding(text) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

async function saveConversation(role, content) {
  try {
    const embedding = await createEmbedding(content);
    await supabase.from('memory').insert({
      role,
      content,
      embedding,
    });
  } catch (error) {
    console.error('[Memory] Save failed:', error.message);
  }
}

async function retrieveRelevantMemory(userText) {
  try {
    const queryEmbedding = await createEmbedding(userText);
    const { data, error } = await supabase.rpc('match_memory', {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
      match_count: 5,
    });
    if (error) throw error;

    if (data && data.length > 0) {
      return data.map(item => `${item.role.toUpperCase()}: ${item.content}`).join('\n');
    }
    return "";
  } catch (error) {
    console.error('[Memory] Retrieve failed:', error.message);
    return "";
  }
}

async function loadAllFacts() {
  try {
    const { data, error } = await supabase
      .from('facts')
      .select('category, fact')
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!data || data.length === 0) return "";

    const grouped = {};
    for (const row of data) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push(row.fact);
    }

    const CATEGORY_LABELS = {
      personal: 'Личное',
      business: 'Бизнес и финансы',
      health: 'Здоровье и спорт',
      relationships: 'Отношения и семья',
      goals: 'Цели и планы',
      preferences: 'Предпочтения и ценности',
      habits: 'Привычки и распорядок',
      emotions: 'Эмоции и состояние',
    };

    let profile = "";
    for (const [category, facts] of Object.entries(grouped)) {
      const label = CATEGORY_LABELS[category] || category;
      profile += `${label}:\n`;
      for (const fact of facts) {
        profile += `- ${fact}\n`;
      }
      profile += "\n";
    }
    return profile.trim();
  } catch (error) {
    console.error('[Facts] Load failed:', error.message);
    return "";
  }
}

async function extractAndSaveFacts(userMessage, assistantReply) {
  try {
    const existingFacts = await loadAllFacts();

    const prompt = `Analyze the conversation below. Extract NEW personal facts about the user that are NOT already known.

ALREADY KNOWN FACTS (do NOT repeat):
${existingFacts || "(none yet)"}

CONVERSATION:
User: ${userMessage}
Assistant: ${assistantReply}

Categories: personal, business, health, relationships, goals, preferences, habits, emotions

Rules:
- Only extract concrete, specific facts (not opinions or generic statements)
- Do NOT repeat facts already listed above
- Facts should be concise (one sentence max)
- If no new facts found, return empty array

Return a JSON object: {"facts": [{"category": "...", "fact": "..."}]}
If nothing new: {"facts": []}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);
    const facts = parsed.facts || (Array.isArray(parsed) ? parsed : []);

    if (facts.length === 0) return;

    for (const item of facts) {
      if (!item.category || !item.fact) continue;
      const embedding = await createEmbedding(item.fact);
      await supabase.from('facts').insert({
        category: item.category,
        fact: item.fact,
        embedding,
      });
    }
    console.log(`[Facts] Extracted ${facts.length} new fact(s)`);
  } catch (error) {
    console.error('[Facts] Extraction failed:', error.message);
  }
}

async function keepAlive() {
  try {
    await supabase.from('memory').select('id').limit(1);
    console.log('[System] Supabase keep-alive OK');
  } catch (error) {
    console.error('[System] Keep-alive failed:', error.message);
  }
}

module.exports = {
  openai,
  createEmbedding,
  saveConversation,
  retrieveRelevantMemory,
  loadAllFacts,
  extractAndSaveFacts,
  keepAlive,
};
