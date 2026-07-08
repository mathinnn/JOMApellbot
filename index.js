import 'dotenv/config';
import { Telegraf } from 'telegraf';
import Anthropic from '@anthropic-ai/sdk';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ||
  'You are a warm, friendly, helpful chat assistant talking with users on Telegram. Keep replies conversational and not overly long unless the user asks for detail.';

if (!BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN environment variable.');
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY environment variable.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Simple in-memory per-chat conversation history.
// Resets on restart/redeploy — fine for small bots.
const MAX_TURNS = 20;
const histories = new Map();

function getHistory(chatId) {
  if (!histories.has(chatId)) histories.set(chatId, []);
  return histories.get(chatId);
}

function pushToHistory(chatId, role, content) {
  const history = getHistory(chatId);
  history.push({ role, content });
  while (history.length > MAX_TURNS) history.shift();
}

bot.start((ctx) =>
  ctx.reply(
    "Hey! I'm your chat bot — just message me anything and I'll respond. No commands needed, just talk to me like you would with ChatGPT."
  )
);

bot.command('reset', (ctx) => {
  histories.delete(ctx.chat.id);
  ctx.reply('Conversation history cleared. Fresh start!');
});

bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const userMessage = ctx.message.text;

  pushToHistory(chatId, 'user', userMessage);

  try {
    await ctx.sendChatAction('typing');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: getHistory(chatId),
    });

    const reply = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim() || "Sorry, I didn't quite catch that — could you rephrase?";

    pushToHistory(chatId, 'assistant', reply);
    await ctx.reply(reply);
  } catch (err) {
    console.error('Error generating reply:', err);
    await ctx.reply('Oops, something went wrong on my end. Try again in a moment.');
  }
});

bot.launch();
console.log('Bot is up and running.');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
