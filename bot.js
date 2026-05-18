const { Client, GatewayIntentBits } = require('discord.js');
const fetch = require('node-fetch');

// ============================================================
// CONFIGURAZIONE
// ============================================================
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL = process.env.TELEGRAM_CHANNEL;
const WEBHOOK_SOLEBACK = process.env.WEBHOOK_SOLEBACK;

// I 3 canali del server personale
const CHANNEL_SOLEBACK   = process.env.SOURCE_CHANNEL_ID;
const CHANNEL_TW_TG      = process.env.CHANNEL_TW_TG;
const CHANNEL_TUTTI      = process.env.CHANNEL_TUTTI;
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

client.once('ready', () => {
    console.log(`✅ Bot online come ${client.user.tag}`);
    console.log(`📡 Monitorando canali:`);
    console.log(`   #solo-soleback:  ${CHANNEL_SOLEBACK}`);
    console.log(`   #solo-tw-e-tg:   ${CHANNEL_TW_TG}`);
    console.log(`   #tutti-i-social: ${CHANNEL_TUTTI}`);
});

client.on('messageCreate', async (message) => {
    const channelId = message.channel.id;

    if (![CHANNEL_SOLEBACK, CHANNEL_TW_TG, CHANNEL_TUTTI].includes(channelId)) return;
    if (!message.embeds || message.embeds.length === 0) return;

    console.log(`📨 Messaggio ricevuto nel canale ${channelId}`);
    const embed = message.embeds[0];

    try {
        if (channelId === CHANNEL_SOLEBACK) {
            await publishToSolebackDiscord(message, embed);
        } else if (channelId === CHANNEL_TW_TG) {
            await publishToTelegram(embed, message);
        } else if (channelId === CHANNEL_TUTTI) {
            await publishToSolebackDiscord(message, embed);
            await publishToTelegram(embed, message);
        }
        console.log(`✅ Offerta pubblicata con successo`);
    } catch (error) {
        console.error(`❌ Errore nella pubblicazione:`, error);
    }
});

async function publishToSolebackDiscord(message, embed) {
    try {
        const FormData = require('form-data');
        const formData = new FormData();
        const payload = { embeds: [embed.toJSON()] };

        if (message.attachments.size > 0) {
            const attachment = message.attachments.first();
            const imageResponse = await fetch(attachment.url);
            const imageBuffer = await imageResponse.buffer();
            formData.append('file', imageBuffer, { filename: 'screenshot.png', contentType: 'image/png' });
            payload.embeds[0].image = { url: 'attachment://screenshot.png' };
        }

        formData.append('payload_json', JSON.stringify(payload));

        const response = await fetch(WEBHOOK_SOLEBACK, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });

        if (response.ok) {
            console.log(`✅ Pubblicato su Soleback Discord`);
        } else {
            const err = await response.text();
            console.error(`❌ Errore Soleback Discord: ${response.status} - ${err}`);
        }
    } catch (error) {
        console.error(`❌ Errore pubblicazione Soleback Discord:`, error);
    }
}

async function publishToTelegram(embed, message) {
    try {
        let text = '';

        if (embed.title) {
            if (embed.url) {
                text += `🔥 [${embed.title}](${embed.url})\n\n`;
            } else {
                text += `🔥 *${escapeMarkdown(embed.title)}*\n\n`;
            }
        }

        if (embed.fields && embed.fields.length > 0) {
            for (const field of embed.fields) {
                if (field.name === 'Link' || field.name === 'Regional Links:') {
                    text += `🔗 ${field.value}\n`;
                } else if (field.name === 'Price') {
                    text += `💰 *Prezzo:* ${escapeMarkdown(field.value)}\n`;
                } else if (field.name === 'Discount code:') {
                    text += `🏷️ *Codice sconto:* \`${field.value}\`\n`;
                } else if (field.name === 'Size Left:') {
                    text += `📦 *Size rimaste:* ${escapeMarkdown(field.value)}\n`;
                } else if (field.name === 'Detail:') {
                    text += `ℹ️ *Info:* ${escapeMarkdown(field.value)}\n`;
                }
            }
        }

        if (embed.footer) {
            text += `\n_${escapeMarkdown(embed.footer.text)}_`;
        }

        if (message.attachments.size > 0) {
            const attachment = message.attachments.first();
            const imageResponse = await fetch(attachment.url);
            const imageBuffer = await imageResponse.buffer();

            const FormData = require('form-data');
            const formData = new FormData();
            formData.append('chat_id', TELEGRAM_CHANNEL);
            formData.append('caption', text);
            formData.append('parse_mode', 'Markdown');
            formData.append('photo', imageBuffer, { filename: 'screenshot.png', contentType: 'image/png' });

            const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                body: formData,
                headers: formData.getHeaders()
            });

            const result = await response.json();
            if (result.ok) {
                console.log(`✅ Pubblicato su Telegram con immagine`);
            } else {
                console.error(`❌ Errore Telegram:`, result);
            }
        } else {
            const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHANNEL,
                    text: text,
                    parse_mode: 'Markdown'
                })
            });

            const result = await response.json();
            if (result.ok) {
                console.log(`✅ Pubblicato su Telegram`);
            } else {
                console.error(`❌ Errore Telegram:`, result);
            }
        }
    } catch (error) {
        console.error(`❌ Errore pubblicazione Telegram:`, error);
    }
}

function escapeMarkdown(text) {
    if (!text) return '';
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

client.login(DISCORD_BOT_TOKEN);
