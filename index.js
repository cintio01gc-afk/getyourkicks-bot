const { Client, GatewayIntentBits } = require('discord.js');
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

// ── Configurazione ──────────────────────────────────────────────
const DISCORD_TOKEN        = process.env.DISCORD_TOKEN;
const TELEGRAM_TOKEN       = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHANNEL     = process.env.TELEGRAM_CHANNEL; // es. @getyourkickss
const WEBHOOK_SOLEBACK     = process.env.WEBHOOK_SOLEBACK;
const SOURCE_CHANNEL_ID    = process.env.SOURCE_CHANNEL_ID; // canale cloude-prova-nuova
// ────────────────────────────────────────────────────────────────

const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

const telegramBot = new TelegramBot(TELEGRAM_TOKEN);

discordClient.once('ready', () => {
    console.log(`✅ Bot connesso come ${discordClient.user.tag}`);
});

discordClient.on('messageCreate', async (message) => {
    // Ascolta solo il canale sorgente e ignora i messaggi del bot stesso
    if (message.channelId !== SOURCE_CHANNEL_ID) return;
    if (message.author.bot && !message.webhookId) return;

    console.log(`📨 Nuovo messaggio ricevuto nel canale sorgente`);

    try {
        // ── Estrai dati dall'embed Discord ──────────────────────
        const embed = message.embeds?.[0];
        if (!embed) {
            console.log('Nessun embed trovato, skip.');
            return;
        }

        const title  = embed.title  || 'Nuova offerta';
        const fields = embed.fields || [];
        const imageURL = message.attachments?.first()?.url || embed.image?.url || null;

        // Costruisci il testo per Telegram
        let telegramText = `🔥 *${escapeMarkdown(title)}*\n\n`;

        for (const field of fields) {
            const fieldName  = field.name  || '';
            const fieldValue = field.value || '';

            if (fieldName.toLowerCase().includes('prezzo') || fieldName.toLowerCase().includes('price')) {
                telegramText += `💰 *Prezzo:* ${escapeMarkdown(fieldValue)}\n`;
            } else if (fieldName.toLowerCase().includes('sconto') || fieldName.toLowerCase().includes('discount') || fieldName.toLowerCase().includes('codice')) {
                telegramText += `🏷️ *Codice sconto:* \`${fieldValue}\`\n`;
            } else if (fieldName.toLowerCase().includes('size')) {
                telegramText += `👟 *Size rimaste:* ${escapeMarkdown(fieldValue)}\n`;
            } else if (fieldName.toLowerCase().includes('detail') || fieldName.toLowerCase().includes('info')) {
                telegramText += `ℹ️ *Info:* ${escapeMarkdown(fieldValue)}\n`;
            } else if (fieldName.toLowerCase().includes('regional') || fieldName.toLowerCase().includes('link')) {
                // Converti i link Markdown Discord in link Telegram
                const telegramLinks = convertDiscordLinksToTelegram(fieldValue);
                telegramText += `\n🌍 *Link regionali:*\n${telegramLinks}\n`;
            } else {
                telegramText += `*${escapeMarkdown(fieldName)}:* ${escapeMarkdown(fieldValue)}\n`;
            }
        }

        telegramText += `\n_via soleback\\.com_`;

        // ── Invia su Telegram ────────────────────────────────────
        if (imageURL && !imageURL.includes('attachment://')) {
            await telegramBot.sendPhoto(TELEGRAM_CHANNEL, imageURL, {
                caption: telegramText,
                parse_mode: 'MarkdownV2'
            });
        } else {
            await telegramBot.sendMessage(TELEGRAM_CHANNEL, telegramText, {
                parse_mode: 'MarkdownV2',
                disable_web_page_preview: false
            });
        }
        console.log('✅ Inviato su Telegram');

        // ── Inoltra su Discord Soleback via webhook ──────────────
        // Ricrea il payload embed originale e lo manda al canale Soleback
        const embedData = {
            embeds: [{
                title:  embed.title,
                color:  embed.color || 16767107,
                fields: embed.fields,
                footer: embed.footer,
                image:  embed.image
            }]
        };

        // Se il messaggio ha un allegato immagine, usalo come URL diretto nell'embed
        const attachment = message.attachments?.first();
        if (attachment) {
            embedData.embeds[0].image = { url: attachment.url };
        }

        const webhookRes = await fetch(WEBHOOK_SOLEBACK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(embedData)
        });

        if (webhookRes.ok) {
            console.log('✅ Inviato su Discord Soleback');
        } else {
            const err = await webhookRes.text();
            console.error('❌ Errore Discord Soleback:', webhookRes.status, err);
        }

    } catch (error) {
        console.error('❌ Errore nel processare il messaggio:', error);
    }
});

// ── Helper: escaping per MarkdownV2 Telegram ────────────────────
function escapeMarkdown(text) {
    if (!text) return '';
    return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

// ── Helper: converti link Markdown Discord [testo](url) in Telegram ─
function convertDiscordLinksToTelegram(text) {
    if (!text) return '';
    // Discord usa [testo](url), Telegram MarkdownV2 usa [testo](url) uguale
    // Ma dobbiamo fare escaping corretto
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
        return `[${escapeMarkdown(linkText)}](${url})`;
    });
}

discordClient.login(DISCORD_TOKEN);
