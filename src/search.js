const axios = require('axios');

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

async function webSearch(query) {
  if (!TAVILY_API_KEY) {
    console.error('[Search] TAVILY_API_KEY not set');
    return "";
  }

  try {
    const response = await axios.post('https://api.tavily.com/search', {
      api_key: TAVILY_API_KEY,
      query: query,
      search_depth: "advanced",
      max_results: 5,
      include_answer: true,
    }, { timeout: 15000 });

    const data = response.data;
    let output = "";

    if (data.answer) {
      output += `Краткий ответ: ${data.answer}\n\n`;
    }

    if (data.results && data.results.length > 0) {
      output += "Источники:\n";
      output += data.results.map((r, i) =>
        `${i + 1}. ${r.title}\n${r.content}\nURL: ${r.url}`
      ).join('\n\n');
    }

    return output || "";
  } catch (error) {
    console.error('[Search] Tavily failed:', error.message);
    return "";
  }
}

module.exports = { webSearch };
