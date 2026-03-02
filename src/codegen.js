const { openai } = require('./memory');

async function generateProjectFiles(description) {
  const prompt = `You are a senior frontend developer. Generate a complete, production-ready static website.

PROJECT DESCRIPTION:
${description}

REQUIREMENTS:
- Modern, responsive design with clean UI
- HTML5, CSS3, vanilla JavaScript
- Mobile-friendly (responsive layout)
- Professional appearance, real content based on the description
- Use modern CSS (flexbox/grid, variables, smooth transitions)
- All interactive elements should work
- Do NOT use placeholder text like "Lorem ipsum" - create real, relevant content

Return a JSON object:
{
  "files": [
    {"path": "index.html", "content": "...complete HTML..."},
    {"path": "style.css", "content": "...complete CSS..."},
    {"path": "script.js", "content": "...complete JS if needed..."}
  ]
}

Add more files if the project needs them (e.g., additional pages, images via SVG).
Generate complete, working, deployable code.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.7,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const result = JSON.parse(response.choices[0].message.content);
  return result.files || [];
}

module.exports = { generateProjectFiles };
