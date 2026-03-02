const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { config } = require('./config');
const { sendMessage, getFileUrl, sendTyping } = require('./telegram');
const {
  openai,
  saveConversation,
  retrieveRelevantMemory,
  loadAllFacts,
  extractAndSaveFacts,
} = require('./memory');
const { webSearch } = require('./search');
const { generateProjectFiles } = require('./codegen');
const { deployToGitHubPages, deleteRepo, listRepos } = require('./github');

const SYSTEM_PROMPT = `
ТЫ — ДЖАРВИС. Ты не просто бот, ты — цифровое продолжение личности пользователя.
Твоя цель: Максимизировать эффективность, ясность мышления и душевное равновесие пользователя.

ТВОИ СУПЕР-СПОСОБНОСТИ (ИСТОЧНИКИ ДАННЫХ):
1. [ТЕКУЩИЙ КОНТЕКСТ]: То, что мы обсуждаем прямо сейчас.
2. [ДОЛГОСРОЧНАЯ ПАМЯТЬ]: Факты, которые ты знаешь обо мне из прошлых диалогов (Supabase).
ВАЖНО: Если данные из [ПАМЯТИ] противоречат твоим общим знаниям, ВЕРЬ [ПАМЯТИ].

РОЛЕВАЯ МОДЕЛЬ (ДИНАМИЧЕСКОЕ ПЕРЕКЛЮЧЕНИЕ):
Проанализируй запрос и выбери одну из ролей. Твой тон и стиль (включая эмодзи) должны меняться:

🛡️ ROLE: "PSYCHOLOGIST"
- Триггеры: Усталость, страх, сомнения, отношения, выгорание.
- Стиль: Теплый, принимающий, глубокий. Используй техники активного слушания. Задавай вопросы, которые помогают мне самому найти ответ.
- Эмодзи: Используй редко, но метко (🌿, 🧘‍♂️, 💡, ❤️‍🩹).
- Формат: Мягкие абзацы, отсутствие жестких списков.

💼 ROLE: "BOARD_MEMBER"
- Триггеры: Деньги, метрики, стратегия, SaaS, маркетинг, конкуренты, решения.
- Стиль: Жесткий, структурный, "без воды". Думай как McKinsey консультант. Используй ментальные модели (Pareto, First Principles). Критикуй слабые идеи.
- Эмодзи: Только функциональные для структуры (🚀, 📉, 💰, 🎯, ⚠️).
- Формат: Маркированные списки, жирный шрифт для главного.

🤝 ROLE: "FRIEND"
- Триггеры: Болтовня, рассказ о дне, шутки, новости, мнения.
- Стиль: Неформальный, с юмором, поддержка, легкий сарказм (если уместно). Как лучший друг в баре.
- Эмодзи: Свободно и живо (🔥, 😂, 👀, 🙌, 😎).
- Формат: Короткие сообщения, сленг.

👨‍💻 ROLE: "DEVELOPER"
- Триггеры: "Напиши код", "Сделай страницу", "Поправь баг", "HTML".
- Стиль: Senior Fullstack. Лучшие практики, чистый код, Tailwind CSS.
- Эмодзи: Технические (💻, 🛠️, ⚡).
- Output: В поле "reply" давай краткое пояснение. В поле "code" пиши ПОЛНЫЙ готовый код.

🤖 ROLE: "ASSISTANT"
- Триггеры: "Найди", "Напомни", "Составь план", факты.
- Стиль: Четкий, исполнительный, нейтральный.
- Эмодзи: (✅, 📅, 📌, 🔎).

ДОПОЛНИТЕЛЬНЫЕ ВОЗМОЖНОСТИ:
- Анализ фотографий: Если пользователь прислал фото, подробно опиши что на нем, дай обратную связь.
- Поиск в интернете: Если нужна актуальная информация, добавь поле "searchQuery" в JSON-ответ с поисковым запросом. Используй когда: нужны цены, новости, события, или ты не уверен в фактах.
- Создание сайтов: Если просят создать сайт/лендинг/приложение, добавь поле "createApp": {"name": "короткое-имя-латиницей", "description": "подробное описание"}. Сайт автоматически задеплоится на GitHub Pages.
- Управление репозиториями: Если просят удалить репозиторий, добавь "deleteRepo": "имя-репозитория". Если просят показать список репозиториев, добавь "listRepos": true.

ПРАВИЛА ОФОРМЛЕНИЯ ОТВЕТА (BEAUTIFUL ANSWERS):
1. Структура: Никогда не пиши сплошной текст длиннее 3 строк. Дели на абзацы.
2. Акценты: Выделяй ключевые мысли, цифры и выводы **жирным шрифтом**.

ФОРМАТ ВЫВОДА (JSON):
Ты обязан вернуть валидный JSON.
{
  "selectedRole": "PSYCHOLOGIST" | "BOARD_MEMBER" | "FRIEND" | "DEVELOPER" | "ASSISTANT",
  "reply": "Твой ответ здесь. Если это код — просто описание, код клади в поле code.",
  "code": "Здесь ТОЛЬКО код (HTML/JS), если выбрана роль DEVELOPER. Иначе пустая строка.",
  "searchQuery": "поисковый запрос (ТОЛЬКО если нужен поиск, иначе не включай)",
  "createApp": {"name": "имя", "description": "описание"} (ТОЛЬКО если нужно создать сайт),
  "deleteRepo": "имя-репозитория" (ТОЛЬКО если нужно удалить репозиторий),
  "listRepos": true (ТОЛЬКО если нужно показать список репозиториев)
}
`.trim();

const shortTermMemory = [{ role: "system", content: SYSTEM_PROMPT }];

async function transcribeAudio(fileUrl) {
  const tempFilePath = path.join('/tmp', `voice_${Date.now()}.ogg`);
  try {
    const response = await axios({
      method: 'GET',
      url: fileUrl,
      responseType: 'stream',
      timeout: config.AXIOS_TIMEOUT,
    });
    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
    });
    return transcription.text;
  } finally {
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
  }
}

async function downloadImageAsBase64(fileUrl) {
  const response = await axios({
    method: 'GET',
    url: fileUrl,
    responseType: 'arraybuffer',
    timeout: config.AXIOS_TIMEOUT,
  });
  return Buffer.from(response.data).toString('base64');
}

function trimShortTermMemory() {
  while (shortTermMemory.length > config.MAX_SHORT_MEMORY) {
    shortTermMemory.splice(1, 1);
  }
}

function parseGPTResponse(rawContent) {
  try {
    return JSON.parse(rawContent);
  } catch {
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return { selectedRole: "ASSISTANT", reply: rawContent };
      }
    }
    return { selectedRole: "ASSISTANT", reply: rawContent };
  }
}

async function callGPT(messages, hasImage) {
  const params = {
    model: "gpt-4o",
    temperature: 0.7,
    messages,
  };
  if (!hasImage) {
    params.response_format = { type: "json_object" };
  }
  const aiResponse = await openai.chat.completions.create(params);
  return aiResponse.choices[0].message.content;
}

async function processMessage(message) {
  const chatId = message.chat.id;
  const senderId = message.from ? message.from.id : chatId;
  if (senderId !== config.MY_TELEGRAM_ID) return;

  let userText = "";
  let imageBase64 = null;

  try {
    if (message.voice) {
      await sendTyping(chatId);
      const fileUrl = await getFileUrl(message.voice.file_id);
      userText = await transcribeAudio(fileUrl);
      console.log(`[Message] Voice transcribed: "${userText.substring(0, 100)}..."`);

    } else if (message.photo) {
      await sendTyping(chatId);
      const photo = message.photo[message.photo.length - 1];
      const fileUrl = await getFileUrl(photo.file_id);
      imageBase64 = await downloadImageAsBase64(fileUrl);
      userText = message.caption || "Что на этом фото?";
      console.log(`[Message] Photo received with caption: "${userText.substring(0, 100)}"`);

    } else if (message.text) {
      userText = message.text;
      console.log(`[Message] Text received: "${userText.substring(0, 100)}..."`);

    } else {
      return;
    }

    await sendTyping(chatId);

    await saveConversation("user", userText + (imageBase64 ? " [фото приложено]" : ""));

    const [relevantMemory, userProfile] = await Promise.all([
      retrieveRelevantMemory(userText),
      loadAllFacts(),
    ]);

    await sendTyping(chatId);

    shortTermMemory.push({ role: "user", content: userText });
    trimShortTermMemory();

    let contextBlock = "";
    if (userProfile) {
      contextBlock += `[ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ]:\n${userProfile}\n\n`;
    }
    if (relevantMemory) {
      contextBlock += `[ДОЛГОСРОЧНАЯ ПАМЯТЬ (Прошлые диалоги)]:\n${relevantMemory}\n\n`;
    }

    const enrichedUserText = `${contextBlock}[ТЕКУЩЕЕ СООБЩЕНИЕ]:\n${userText}`;

    const messagesForGPT = [
      shortTermMemory[0],
      ...shortTermMemory.slice(1, -1),
    ];

    if (imageBase64) {
      messagesForGPT.push({
        role: "user",
        content: [
          { type: "text", text: enrichedUserText },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        ],
      });
    } else {
      messagesForGPT.push({ role: "user", content: enrichedUserText });
    }

    let rawContent = await callGPT(messagesForGPT, !!imageBase64);
    let aiResult = parseGPTResponse(rawContent);

    if (aiResult.searchQuery && typeof aiResult.searchQuery === 'string') {
      console.log(`[Search] Query: "${aiResult.searchQuery}"`);
      await sendTyping(chatId);

      const searchResults = await webSearch(aiResult.searchQuery);

      if (searchResults) {
        messagesForGPT.push({
          role: "assistant",
          content: JSON.stringify({ selectedRole: aiResult.selectedRole, reply: "Ищу информацию..." }),
        });
        messagesForGPT.push({
          role: "user",
          content: `[РЕЗУЛЬТАТЫ ПОИСКА по запросу "${aiResult.searchQuery}"]:\n${searchResults}\n\nТеперь дай полный ответ пользователю, используя найденную информацию. Формат JSON: {"selectedRole": "...", "reply": "...", "forceText": true}`,
        });

        await sendTyping(chatId);

        const searchRawContent = await callGPT(messagesForGPT, false);
        aiResult = parseGPTResponse(searchRawContent);
      }
    }

    if (aiResult.listRepos) {
      try {
        await sendTyping(chatId);
        const repos = await listRepos();
        if (repos.length === 0) {
          await sendMessage(chatId, "У тебя нет репозиториев на GitHub.");
        } else {
          const repoList = repos.map(r => `${r.name}${r.pages ? ' (GitHub Pages)' : ''}\n${r.url}`).join('\n\n');
          await sendMessage(chatId, `Твои репозитории (${repos.length}):\n\n${repoList}`);
        }
        await saveConversation("assistant", `Показал список репозиториев (${repos.length})`);
        shortTermMemory.push({ role: "assistant", content: `Показал список из ${repos.length} репозиториев.` });
      } catch (error) {
        console.error('[GitHub] List repos failed:', error);
        await sendMessage(chatId, `Ошибка при получении списка: ${error.message}`);
      }
      return;
    }

    if (aiResult.deleteRepo && typeof aiResult.deleteRepo === 'string') {
      try {
        await sendTyping(chatId);
        const result = await deleteRepo(aiResult.deleteRepo);
        const msg = `Репозиторий "${result.deleted}" удалён.`;
        await sendMessage(chatId, aiResult.reply || msg);
        await saveConversation("assistant", msg);
        shortTermMemory.push({ role: "assistant", content: msg });
      } catch (error) {
        console.error('[GitHub] Delete repo failed:', error);
        if (error.response && error.response.status === 404) {
          await sendMessage(chatId, `Репозиторий "${aiResult.deleteRepo}" не найден.`);
        } else {
          await sendMessage(chatId, `Ошибка при удалении: ${error.message}`);
        }
      }
      return;
    }

    if (aiResult.createApp && typeof aiResult.createApp === 'object') {
      const { name, description } = aiResult.createApp;
      if (name && description) {
        await sendMessage(chatId, aiResult.reply || "Начинаю создание проекта...");
        await sendTyping(chatId);

        try {
          console.log(`[CodeGen] Generating project: ${name}`);
          await sendMessage(chatId, "Генерирую код...");
          await sendTyping(chatId);

          const files = await generateProjectFiles(description);

          if (!files || files.length === 0) {
            throw new Error('No files generated');
          }

          await sendMessage(chatId, `Код готов (${files.length} файлов). Загружаю на GitHub и деплою...`);
          await sendTyping(chatId);

          const result = await deployToGitHubPages(name, description, files);

          const deployMessage = `Проект создан и задеплоен!\n\nСайт (появится через 1-2 минуты):\n${result.pagesUrl}\n\nРепозиторий:\n${result.repoUrl}`;
          await sendMessage(chatId, deployMessage);

          await saveConversation("assistant", `Создал проект "${name}": ${result.pagesUrl}`);
          shortTermMemory.push({ role: "assistant", content: `Создал проект "${name}". Сайт: ${result.pagesUrl}, Репозиторий: ${result.repoUrl}` });

          console.log(`[CodeGen] Deployed: ${result.pagesUrl}`);
        } catch (error) {
          console.error('[CodeGen] Failed:', error);
          await sendMessage(chatId, `Ошибка при создании проекта: ${error.message}`);
        }

        extractAndSaveFacts(userText, `Создал проект ${name}`).catch(console.error);
        return;
      }
    }

    if (!aiResult.reply || typeof aiResult.reply !== 'string') {
      aiResult.reply = String(aiResult.reply || rawContent || "Не удалось сформировать ответ.");
    }

    await saveConversation("assistant", aiResult.reply);
    shortTermMemory.push({ role: "assistant", content: aiResult.reply });

    await sendMessage(chatId, aiResult.reply);

    if (aiResult.code && typeof aiResult.code === 'string' && aiResult.code.trim()) {
      const codeBlock = `\`\`\`\n${aiResult.code}\n\`\`\``;
      await sendMessage(chatId, codeBlock);
    }

    console.log(`[Message] Reply sent (${aiResult.selectedRole})`);

    extractAndSaveFacts(userText, aiResult.reply).catch(err =>
      console.error('[Facts] Background extraction failed:', err.message)
    );

  } catch (error) {
    console.error('[Processing Error]:', error);
    await sendMessage(chatId, "Произошла ошибка при обработке сообщения. Попробуй еще раз.");
  }
}

module.exports = { processMessage };
