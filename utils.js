
import 'dotenv/config';

export async function DiscordRequest(endpoint, options) {
  const url = 'https://discord.com/api/v10/' + endpoint;

  // Convertir el cuerpo de la petición a JSON
  if (options.body) {
    options.body = JSON.stringify(options.body);
  }

  // Enviar la petición a Discord
  const res = await fetch(url, {
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'User-Agent':
        'DiscordBot (https://github.com/discord/discord-example-app, 1.0.0)',
    },
    ...options,
  });

  // Mostrar el error real si Discord rechaza la petición
  if (!res.ok) {
    const errorDetails = await res.text();

    throw new Error(
      `Discord API respondió con HTTP ${res.status}: ${errorDetails}`
    );
  }

  return res;
}

export async function InstallGlobalCommands(appId, commands) {
  const endpoint = `applications/${appId}/commands`;

  try {
    console.log('Registrando comandos en Discord...');

    const response = await DiscordRequest(endpoint, {
      method: 'PUT',
      body: commands,
    });

    const registeredCommands = await response.json();

    console.log('¡Comandos registrados correctamente!');

    if (registeredCommands.length > 0) {
      console.table(
        registeredCommands.map((command) => ({
          nombre: command.name,
          id: command.id,
          descripción: command.description,
        }))
      );
    } else {
      console.log('Discord no devolvió comandos registrados.');
    }
  } catch (err) {
    console.error('No se pudieron registrar los comandos:');
    console.error(err.message);
  }
}

// Devolver un emoji aleatorio
export function getRandomEmoji() {
  const emojiList = [
    '😭', '😄', '😌', '🤓', '😎', '😤', '🤖',
    '😶‍🌫️', '🌏', '📸', '💿', '👋', '🌊', '✨',
  ];

  return emojiList[Math.floor(Math.random() * emojiList.length)];
}

// Convertir la primera letra a mayúscula
export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
