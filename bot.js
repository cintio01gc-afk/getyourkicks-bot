const { Client, GatewayIntentBits } = require('discord.js');
const fetch = require('node-fetch');

// ============================================================
// CONFIGURAZIONE
// ============================================================
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL = process.env.TELEGRAM_CHANNEL; // es. @getyourkickss
const WEBHOOK_SOLEBACK = process.env.WEBHOOK_SOLEBACK;  // webhook canale #deals Soleback
const SOURCE_CHANNEL_ID = process.env.SOURCE_CHANNEL_ID; // canale da monitorare
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
    console.log(`📡 Monitorando canale: ${SOURCE_CHANNEL_ID}`);
});

client.on('messageCreate', async (message) => {
    // Ignora messaggi che non vengono dal canale giusto
    if (message.channel.id !== SOURCE_CHANNEL_ID) return;

    // Ignora messaggi normali senza embed (non dall'estensione)
    if (!message.embeds || message.embeds.length === 0) return;

    console.log(`📨 Nuovo messaggio ricevuto nel canale monitorato`);

    const embed = message.embeds[0];

    try {
        // ---- 1. Pubblica su Soleback Discord ----
        await publishToSolebackDiscord(message, embed);

        // ---- 2. Pubblica su Telegram ----
        await publishToTelegram(embed, message);

        console.log(`✅ Offerta pubblicata con successo su tutti i canali`);
    } catch (error) {
        console.error(`❌ Errore nella pubblicazione:`, error);
    }
});

// ============================================================
// PUBBLICA SU SOLEBACK DISCORD
// ============================================================
async function publishToSolebackDiscord(message, embed) {
    try {
        const formData = new (require('form-data'))();

        // Ricrea il payload con lo stesso embed
        const payload = {
            embeds: [embed.toJSON()]
        };

        // Se c'è un'immagine allegata, la includiamo
        if (message.attachments.size > 0) {
            const attachment = message.attachments.first();
            const imageResponse = await fetch(attachment.url);
            const imageBuffer = await imageResponse.buffer();
            formData.append('file', imageBuffer, { filename: 'screenshot.png', contentType: 'image/png' });

            // Aggiorna l'embed per usare l'allegato
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

// ============================================================
// PUBBLICA SU TELEGRAM
// ============================================================
async function publishToTelegram(embed, message) {
    try {
        // Costruisci il testo del messaggio Telegram
        let text = '';

        if (embed.title) {
            text += `🔥 *${escapeMarkdown(embed.title)}*\n\n`;
        }

        // Aggiungi i campi dell'embed
        if (embed.fields && embed.fields.length > 0) {
            for (const field of embed.fields) {
                if (field.name === 'Link' || field.name === 'Regional Links:') {
                    // I link li mettiamo separati
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

        // Se c'è un'immagine allegata, invia foto + caption
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
            // Nessuna immagine, invia solo testo
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

// Escape caratteri speciali Markdown per Telegram
function escapeMarkdown(text) {
    if (!text) return '';
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

client.login(DISCORD_BOT_TOKEN);
