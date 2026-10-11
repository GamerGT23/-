
import 'dotenv/config';
import express from 'express';
import { Client } from 'discord.js';
import fs from 'node:fs';
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { getRandomEmoji, DiscordRequest } from './utils.js';

// --------------------------------------------------
// CONFIGURACIÓN
// --------------------------------------------------

const app = express();
const PORT = process.env.PORT || 3000;

const ACTIVITY_CHANNEL_ID = '1558633853080313897';

const AUDIT_CHANNEL_ID = '1558728733341520036';


const ACTIVITY_ALLOWED_ROLE_IDS = [
  '1558338000700841994',
  '1558572434699980820',
];

const SCOREBOARD_CHANNEL_ID = '1558708695318138911';
const ADMIN_CHANNEL_ID = '1558708951472808086';

// Configuración de /taiming
const TAIMING_CHANNEL_ID = '1558640957845540904';
const TAIMING_ROLE_ID = '1558573179331412110';
const TAIMING_THUMBNAIL_URL = 'https://cdn-longterm.mee6.xyz/plugins/embeds/images/1558333932674486448/cbff36bade522c30b1aa9110136b882ccce790a7a8f7016692d8c4785b1e9016.png';
const TAIMING_BANNER_URL = 'https://cdn-longterm.mee6.xyz/plugins/embeds/images/1558333932674486448/86bcd020f67ec3928deebec9277f44f7075434fa1b205fa0f715eab3dcc23868.png';
const TAIMING_REMINDER_INTERVAL_MS = 3 * 60 * 1000;
const TAIMING_REMINDER_LEAD_MS = 30 * 60 * 1000;
const TAIMING_DURATION_MS = 10 * 60 * 1000;

const DATA_FILE = './puntos.json';

const CHANNEL_ID = '1558333935832932456';


const ACTIVITY_TYPES = [
  'Robo de vehículo',
  'Misión de tráfico ilegal',
  'Robo de negocio',
  'Lancha encallada',
  'Elaboración de metanfetamina',
  'Día de recompensa',
  'Reparto aéreo',
  'Búsqueda de contenedores',
  'Comunicado interno',
];

// --------------------------------------------------
// ALMACENAMIENTO PERSISTENTE
// --------------------------------------------------

function getOption(options, name) {
  return options?.find((option) => option.name === name);
}
function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initialData = {
        points: {},
        users: {},
        activities: [],
        scoreboardMessageId: null,
        auditLog: [],
        taimings: []
      };

      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(initialData, null, 2)
      );

      return initialData;
    }

    const saved = JSON.parse(
      fs.readFileSync(DATA_FILE, 'utf8')
    );

    return {
      points: saved.points || {},
      users: saved.users || {},
      activities: saved.activities || [],
      scoreboardMessageId: saved.scoreboardMessageId || null,
      auditLog: saved.auditLog || [],
      taimings: saved.taimings || [],
    };
  } catch (error) {
    console.error('Error leyendo puntos.json:', error.message);
    throw error;
  }
}

let db = loadData();

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

// --------------------------------------------------
// UTILIDADES
// --------------------------------------------------

function getUserName(user, member) {
  return (
    member?.nick ||
    user?.globalName ||
    user?.global_name ||
    user?.username ||
    'Usuario'
  );
}


function hasActivityRole(member) {
  const roles = member?.roles || [];

  return roles.some((roleId) =>
    ACTIVITY_ALLOWED_ROLE_IDS.includes(roleId)
  );
}


function rememberUser(userId, user, member) {
  if (!db.users[userId]) {
    db.users[userId] = {
      username: getUserName(user, member),
    };
  } else {
    db.users[userId].username = getUserName(user, member);
  }

  if (db.points[userId] === undefined) {
    db.points[userId] = 0;
  }
}

function isAdministrator(member) {
  const permissions = member?.permissions;

  if (!permissions) return false;

  const value = BigInt(permissions);
  const administrator = 8n;
  const manageGuild = 32n;

  return (
    (value & administrator) !== 0n ||
    (value & manageGuild) !== 0n
  );
}

function privateReply(res, content) {
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: 64,
      content,
    },
  });
}

function validateTime(value) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '')) {
    return false;
  }

  return true;
}

async function getActivityParticipants(options) {
  const option = getOption(options, 'participantes');
  const text = option?.value || '';

  // Extraer IDs de menciones de Discord.
  const ids = [
    ...new Set(
      [...text.matchAll(/<@!?(\d+)>/g)].map((match) => match[1])
    ),
  ];

  const participants = [];

  for (const userId of ids) {
    let user = null;

    try {
      user = await discordClient.users.fetch(userId);
    } catch (error) {
      console.warn(
        `No se pudo obtener el usuario ${userId}:`,
        error.message
      );
    }

    participants.push({
      id: userId,
      username: getUserName(user, null),
      user,
      member: null,
    });
  }

  return participants;
}

// --------------------------------------------------
// CLASIFICACIÓN ACTUALIZABLE
// --------------------------------------------------

async function updateScoreboard() {
  const channelResponse = await DiscordRequest(
    `channels/${SCOREBOARD_CHANNEL_ID}`,
    { method: 'GET' }
  );

  const channel = await channelResponse.json();

  if (!channel || channel.type !== 0) {
    throw new Error(
      'El canal de puntos no es un canal de texto compatible.'
    );
  }

  
  const rankedUsers = Object.entries(db.points)
  .sort((a, b) => b[1] - a[1]);


  const description = rankedUsers.length
    ? rankedUsers
        .map(([userId, points], index) => {
          const name = db.users[userId]?.username || 'Usuario';
          return `**${index + 1}.** <@${userId}> — **${points} punto(s)**`;
        })
        .join('\n')
    : 'Todavía no hay puntos registrados.';

  const embed = {
    title: '🏆 Clasificación de actividades',
    description,
    color: 0xD4AF37,
    footer: { text: 'Make Money Boyz • Sistema de puntuación' },
    timestamp: new Date().toISOString(),
  };

  const body = { embeds: [embed] };

  if (db.scoreboardMessageId) {
    try {
      await DiscordRequest(
        `channels/${SCOREBOARD_CHANNEL_ID}/messages/${db.scoreboardMessageId}`,
        {
          method: 'PATCH',
          body,
        }
      );

      return;
    } catch (error) {
      console.warn(
        'No se pudo editar el mensaje anterior; se creará otro.',
        error.message
      );

      db.scoreboardMessageId = null;
      saveData();
    }
  }

  const response = await DiscordRequest(
    `channels/${SCOREBOARD_CHANNEL_ID}/messages`,
    {
      method: 'POST',
      body,
    }
  );

  const message = await response.json();

  db.scoreboardMessageId = message.id;
  saveData();
}

// --------------------------------------------------
// REGISTRO DE ACTIVIDADES
// --------------------------------------------------

async function handleActivity(res, data) {
  const options = data.options || [];

  if (data.channel_id !== ACTIVITY_CHANNEL_ID) {
    return privateReply(
      res,
      `Este comando solo puede usarse en <#${ACTIVITY_CHANNEL_ID}>.`
    );
  }

  
if (!hasActivityRole(data.member)) {
  return privateReply(
    res,
    'No tienes permiso para registrar actividades. Necesitas uno de los roles autorizados.'
  );
}


  const typeOption = getOption(options, 'tipo');
  const timeOption = getOption(options, 'hora');
  const attachmentOption = getOption(options, 'evidencia');

  const activityType = typeOption?.value;
  const activityTime = timeOption?.value;
  const attachmentId = attachmentOption?.value;
  const attachment = data.resolved?.attachments?.[attachmentId];

  const participants = await getActivityParticipants(options);

  if (!ACTIVITY_TYPES.includes(activityType)) {
    return privateReply(
      res,
      'Selecciona un tipo de actividad válido.'
    );
  }

  if (!validateTime(activityTime)) {
    return privateReply(
      res,
      'La hora es obligatoria y debe tener formato HH:MM, por ejemplo 02:56.'
    );
  }

  if (!attachment) {
    return privateReply(
      res,
      'Debes adjuntar un archivo como evidencia de la actividad.'
    );
  }

  if (participants.length === 0) {
    return privateReply(
      res,
      'Debes seleccionar al menos un participante.'
    );
  }

  // Validar todo antes de modificar los puntos.
  for (const participant of participants) {
    rememberUser(
      participant.id,
      participant.user,
      participant.member
    );
  }

  for (const participant of participants) {
    db.points[participant.id] += 1;
  }

  const activity = {
    id: `${Date.now()}-${data.id}`,
    type: activityType,
    time: activityTime,
    attachmentUrl: attachment.url,
    participants: participants.map((participant) => ({
      id: participant.id,
      username: participant.username,
    })),
    createdAt: new Date().toISOString(),
  };

  db.activities.push(activity);
  saveData();

  const participantFields = participants.map((participant) => ({
    name: participant.username,
    value: `<@${participant.id}> — **${db.points[participant.id]} punto(s)**`,
    inline: true,
  }));

  const embed = {
    title: '📋 Registro de actividad',
    color: 0xD4AF37,
    fields: [
      {
        name: 'Tipo de actividad',
        value: activityType,
        inline: false,
      },
      {
        name: 'Hora de la actividad',
        value: activityTime,
        inline: true,
      },
      {
        name: 'Participantes y puntos actuales',
        value: participants
          .map(
            (participant) =>
              `<@${participant.id}>: **${db.points[participant.id]} punto(s)**`
          )
          .join('\n'),
        inline: false,
      },
      {
        name: 'Evidencia adjunta',
        value: `[Abrir archivo](${attachment.url})`,
        inline: false,
      },
    ],
    timestamp: new Date().toISOString(),
    footer: {
      
text: `Registrado por Make Money Boyz • ${participants.length} participante(s)`,

    },
  };

  if (attachment.content_type?.startsWith('image/')) {
    embed.image = { url: attachment.url };
  }

  // Responder a Discord antes de realizar llamadas adicionales.
  res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [embed],
    },
  });

  try {
    await updateScoreboard();
  } catch (error) {
    console.error(
      'La actividad se guardó, pero no se pudo actualizar la clasificación:',
      error.message
    );
  }
}

// --------------------------------------------------
// REINICIAR PUNTOS
// --------------------------------------------------


async function handleResetPoints(res, data) {
  if (data.channel_id !== ADMIN_CHANNEL_ID) {
    return privateReply(
      res,
      `Este comando solo puede usarse en <#${ADMIN_CHANNEL_ID}>.`
    );
  }

  if (!isAdministrator(data.member)) {
    return privateReply(
      res,
      'No tienes permisos para reiniciar los puntos.'
    );
  }

  // Registrar quién realiza el reinicio y cuándo.
  const resetAt = new Date().toISOString();
  const actor = data.member?.user || data.user || null;
  const actorId = actor?.id || 'desconocido';
  const actorName = getUserName(actor, data.member);

  // Guardar las puntuaciones anteriores.
  const previousScores = Object.entries(db.points).map(
    ([userId, points]) => ({
      userId,
      username: db.users[userId]?.username || 'Usuario',
      pointsBefore: points,
      pointsAfter: 0,
    })
  );

  // Guardar el registro permanente en puntos.json.
  db.auditLog = db.auditLog || [];

  db.auditLog.push({
    type: 'points_reset',
    timestamp: resetAt,
    performedBy: {
      id: actorId,
      username: actorName,
    },
    channelId: data.channel_id,
    scores: previousScores,
  });

  // Reiniciar los puntos.
  for (const userId of Object.keys(db.points)) {
    db.points[userId] = 0;
  }

  saveData();

  // Confirmar la operación al administrador.
  res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: '♻️ Se han reiniciado todos los puntos.',
    },
  });

  // Publicar el registro de auditoría en Discord.
  try {
    const scoreLines = previousScores.map(
      (entry) =>
        `• <@${entry.userId}> — Antes: **${entry.pointsBefore}** | Después: **0**`
    );

    const maxDescriptionLength = 3900;
    let description =
      scoreLines.join('\n') || 'No había puntuaciones registradas.';

    if (description.length > maxDescriptionLength) {
      description =
        description.slice(0, maxDescriptionLength) +
        '\n\n…Listado acortado por el límite de Discord. Consulta puntos.json para ver el registro completo.';
    }

    const auditEmbed = {
      title: '🛡️ Auditoría de reinicio de puntuaciones',
      color: 0xD4AF37,
      description,
      fields: [
        {
          name: 'Administrador',
          value:
            actorId !== 'desconocido'
              ? `<@${actorId}>`
              : actorName,
          inline: true,
        },
        {
          name: 'Usuarios registrados',
          value: String(previousScores.length),
          inline: true,
        },
        {
          name: 'Fecha y hora',
          value: `<t:${Math.floor(
            new Date(resetAt).getTime() / 1000
          )}:F>`,
          inline: false,
        },
      ],
      footer: {
        text: 'Make Money Boyz • Registro de auditoría',
      },
    };

    await DiscordRequest(
      `channels/${AUDIT_CHANNEL_ID}/messages`,
      {
        method: 'POST',
        body: {
          embeds: [auditEmbed],
        },
      }
    );

    console.log('Auditoría del reinicio publicada correctamente.');
  } catch (error) {
    console.error(
      'No se pudo publicar la auditoría:',
      error.message
    );
  }

  // Actualizar la clasificación.
  try {
    await updateScoreboard();
  } catch (error) {
    console.error(
      'No se pudo actualizar la clasificación tras el reinicio:',
      error.message
    );
  }
}


// --------------------------------------------------
// MODIFICAR PUNTOS
// --------------------------------------------------

async function handleModifyPoints(res, data) {
  if (!isAdministrator(data.member)) {
    return privateReply(
      res,
      'Solo los administradores pueden modificar los puntos.'
    );
  }

  const options = data.options || [];
  const userOption = getOption(options, 'usuario');
  const amountOption = getOption(options, 'cantidad');

  const userId = userOption?.value;
  const amount = amountOption?.value;
  const user = data.resolved?.users?.[userId];
  const member = data.resolved?.members?.[userId];

  if (!userId || !Number.isInteger(amount) || amount === 0) {
    return privateReply(
      res,
      'Indica un usuario y una cantidad distinta de cero.'
    );
  }

  rememberUser(userId, user, member);

  if (db.points[userId] + amount < 0) {
    return privateReply(
      res,
      'No puedes dejar los puntos de un usuario por debajo de cero.'
    );
  }

  db.points[userId] += amount;
  saveData();

  const action = amount > 0 ? 'sumaron' : 'restaron';

  res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content:
        `✅ Se ${action} **${Math.abs(amount)}** punto(s) a <@${userId}>.\n` +
        `Puntuación actual: **${db.points[userId]}**.`,
    },
  });

  try {
    await updateScoreboard();
  } catch (error) {
    console.error(
      'No se pudo actualizar la clasificación:',
      error.message
    );
  }
}

// --------------------------------------------------
// TAIMING: MODAL, EMBED Y RECORDATORIOS PROGRAMADOS
// --------------------------------------------------

function buildTaimingEmbed(taiming) {
  const startTimestamp = Math.floor(taiming.startAt / 1000);
  const endTimestamp = Math.floor(taiming.endAt / 1000);
  let statusLine = '🟢 **Estado:** En preparación';

  if (taiming.status === 'started') {
    statusLine = '🚨 **Estado:** Actividad en curso';
  } else if (taiming.status === 'ended') {
    statusLine = '✅ **Estado:** Actividad finalizada';
  }

  return {
    title: `⏱️ TAIMING • ${taiming.zoneName}`,
    description: [
      `📍 **Zona:** ${taiming.zoneName}`,
      `🕒 **Comienza:** <t:${startTimestamp}:F>`,
      `⏳ **Tiempo restante:** <t:${startTimestamp}:R>`,
      `🏁 **Finaliza:** <t:${endTimestamp}:F>`,
      '',
      statusLine,
    ].join('\n'),
    color: 0xD4AF37,
    thumbnail: { url: TAIMING_THUMBNAIL_URL },
    image: { url: TAIMING_BANNER_URL },
    footer: { text: 'Make Money Boyz • Sistema de taiming' },
    timestamp: new Date().toISOString(),
  };
}

function getModalTextValues(components) {
  const values = {};
  for (const row of components || []) {
    for (const component of row.components || []) {
      values[component.custom_id] = component.value || '';
    }
  }
  return values;
}

function parseDurationToMs(value) {
  const match = /^\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*$/i.exec(value || '');
  if (!match || (!match[1] && !match[2])) return null;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  if (!Number.isSafeInteger(hours) || !Number.isSafeInteger(minutes)) return null;
  if (hours < 0 || minutes < 0 || (hours === 0 && minutes === 0)) return null;

  const duration = (hours * 60 + minutes) * 60 * 1000;
  // Límite de seguridad: no permitir programaciones de más de 7 días.
  if (!Number.isSafeInteger(duration) || duration > 7 * 24 * 60 * 60 * 1000) return null;
  return duration;
}

function showTaimingModal(res) {
  return res.send({
    type: 9, // MODAL
    data: {
      custom_id: 'taiming_modal',
      title: 'Registrar taiming',
      components: [
        {
          type: 1,
          components: [{
            type: 4,
            custom_id: 'taiming_zone',
            label: 'Nombre de la zona',
            style: 1,
            min_length: 1,
            max_length: 100,
            required: true,
            placeholder: 'Ej. Puerto, casino, almacén...',
          }],
        },
        {
          type: 1,
          components: [{
            type: 4,
            custom_id: 'taiming_duration',
            label: 'Tiempo de comienzo',
            style: 1,
            min_length: 1,
            max_length: 30,
            required: true,
            placeholder: 'Ej. 1h 8m, 68m o 2h',
          }],
        },
      ],
    },
  });
}

async function handleTaimingModalSubmit(res, reqBody) {
  const data = reqBody.data || {};
  const channelId = reqBody.channel_id;

  if (data.custom_id !== 'taiming_modal') {
    return res.status(400).json({ error: 'Formulario desconocido.' });
  }
  if (channelId !== TAIMING_CHANNEL_ID) {
    return privateReply(res, `Este comando solo puede usarse en <#${TAIMING_CHANNEL_ID}>.`);
  }

  const values = getModalTextValues(data.components);
  const zoneName = (values.taiming_zone || '').trim();
  const durationText = (values.taiming_duration || '').trim();
  const durationMs = parseDurationToMs(durationText);

  if (!zoneName || zoneName.length > 100) {
    return privateReply(res, 'Escribe un nombre de zona válido (máximo 100 caracteres).');
  }
  if (durationMs === null) {
    return privateReply(res, 'Tiempo no válido. Usa formatos como `1h 8m`, `68m` o `2h` (máximo 7 días).');
  }

  const now = Date.now();
  const startAt = now + durationMs;
  const taiming = {
    id: `${now}-${reqBody.id || Math.random().toString(36).slice(2, 8)}`,
    zoneName,
    createdBy: reqBody.member?.user?.id || reqBody.user?.id || null,
    channelId: TAIMING_CHANNEL_ID,
    startAt,
    endAt: startAt + TAIMING_DURATION_MS,
    status: 'scheduled',
    mainMessageId: null,
    notificationMessageId: null,
    nextReminderAt: Math.max(now, startAt - TAIMING_REMINDER_LEAD_MS),
  };

  try {
    const response = await DiscordRequest(
      `channels/${TAIMING_CHANNEL_ID}/messages`,
      {
        method: 'POST',
        body: {
          embeds: [buildTaimingEmbed(taiming)],
          allowed_mentions: { parse: [] },
        },
      }
    );
    const message = await response.json();
    if (!message?.id) throw new Error('Discord no devolvió el ID del mensaje principal.');

    taiming.mainMessageId = message.id;
    db.taimings.push(taiming);
    saveData();

    return privateReply(res, `✅ Taiming publicado para **${zoneName}**. La actividad comenzará <t:${Math.floor(startAt / 1000)}:R> y finalizará 10 minutos después.`);
  } catch (error) {
    console.error('No se pudo publicar el taiming:', error);
    return privateReply(res, 'No se pudo publicar el taiming. Revisa los registros del bot e inténtalo de nuevo.');
  }
}

async function deleteTaimingNotification(taiming) {
  if (!taiming.notificationMessageId) return;
  try {
    await DiscordRequest(
      `channels/${taiming.channelId}/messages/${taiming.notificationMessageId}`,
      { method: 'DELETE' }
    );
  } catch (error) {
    // Si ya se borró manualmente, se continúa con la siguiente notificación.
    console.warn('No se pudo borrar el aviso anterior de taiming:', error.message);
  }
  taiming.notificationMessageId = null;
}

async function sendTaimingReminder(taiming) {
  await deleteTaimingNotification(taiming);
  const remainingMs = Math.max(0, taiming.startAt - Date.now());
  const remainingMinutes = Math.ceil(remainingMs / 60000);
  const response = await DiscordRequest(
    `channels/${taiming.channelId}/messages`,
    {
      method: 'POST',
      body: {
        content: `<@&${TAIMING_ROLE_ID}> ⏰ **Taiming en ${taiming.zoneName}**: comienza <t:${Math.floor(taiming.startAt / 1000)}:R> (aprox. ${remainingMinutes} min).`,
        allowed_mentions: { parse: [], roles: [TAIMING_ROLE_ID] },
      },
    }
  );
  const message = await response.json();
  taiming.notificationMessageId = message.id || null;
}

async function updateTaimingMainMessage(taiming) {
  if (!taiming.mainMessageId) return;
  await DiscordRequest(
    `channels/${taiming.channelId}/messages/${taiming.mainMessageId}`,
    {
      method: 'PATCH',
      body: {
        embeds: [buildTaimingEmbed(taiming)],
        allowed_mentions: { parse: [] },
      },
    }
  );
}

let processingTaimings = false;
async function processTaimings() {
  if (processingTaimings) return;
  processingTaimings = true;
  try {
    const now = Date.now();
    for (const taiming of db.taimings || []) {
      try {
        if (taiming.status === 'ended') continue;

        if (taiming.status === 'scheduled' && now >= taiming.startAt) {
          await deleteTaimingNotification(taiming);
          taiming.status = 'started';
          await updateTaimingMainMessage(taiming);
          saveData();
        }

        if (taiming.status === 'started' && now >= taiming.endAt) {
          taiming.status = 'ended';
          await updateTaimingMainMessage(taiming);
          saveData();
          continue;
        }

        if (taiming.status === 'scheduled' && now >= taiming.nextReminderAt && now < taiming.startAt) {
          await sendTaimingReminder(taiming);
          // Evita mandar una ráfaga de avisos si Railway estuvo reiniciado o pausado.
          taiming.nextReminderAt = Date.now() + TAIMING_REMINDER_INTERVAL_MS;
          saveData();
        }
      } catch (error) {
        console.error(`Error procesando taiming ${taiming.id}:`, error.message);
      }
    }
  } finally {
    processingTaimings = false;
  }
}

// --------------------------------------------------
// ENDPOINT DE INTERACCIONES
// --------------------------------------------------

app.post(
  '/interactions',
  verifyKeyMiddleware(process.env.PUBLIC_KEY),
  async function (req, res) {
    
const { type, data } = req.body;
const interactionData = { ...req.body, ...data };


    if (type === InteractionType.PING) {
      return res.send({
        type: InteractionResponseType.PONG,
      });
    }

    if (type === InteractionType.MODAL_SUBMIT || type === 5) {
      try {
        return await handleTaimingModalSubmit(res, req.body);
      } catch (error) {
        console.error('Error procesando el formulario de taiming:', error);
        if (!res.headersSent) return privateReply(res, 'Ocurrió un error al procesar el formulario de taiming.');
        return;
      }
    }

    if (type !== InteractionType.APPLICATION_COMMAND) {
      return res.status(400).json({
        error: 'Tipo de interacción desconocido',
      });
    }

    const { name } = data;

    try {
      if (name === 'test') {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `hello world ${getRandomEmoji()}`,
          },
        });
      }

      if (name === 'taiming') {
        if (interactionData.channel_id !== TAIMING_CHANNEL_ID) {
          return privateReply(res, `Este comando solo puede usarse en <#${TAIMING_CHANNEL_ID}>.`);
        }
        return showTaimingModal(res);
      }

      if (name === 'actividad') {
        return await handleActivity(res, interactionData);
      }

      if (name === 'reiniciarpuntos') {
        return await handleResetPoints(res, interactionData);
      }

      if (name === 'modificarpuntos') {
        return await handleModifyPoints(res, interactionData);
      }


      return privateReply(res, 'Comando desconocido.');
    } catch (error) {
      console.error('Error procesando el comando:', error);

      if (!res.headersSent) {
        return privateReply(
          res,
          'Ocurrió un error al procesar el comando. Revisa la consola del bot.'
        );
      }
    }
  }
);

// --------------------------------------------------
// MENSAJE AUTOMÁTICO DIARIO
// --------------------------------------------------






// --------------------------------------------------
// PRESENCIA ONLINE
// --------------------------------------------------

const discordClient = new Client({
  intents: [],
});



discordClient.once('clientReady', async () => {
  console.log(`Make Money Boyz está en línea como ${discordClient.user.tag}`);

  try {
    await updateScoreboard();
    console.log('Clasificación inicializada correctamente.');
  } catch (error) {
    console.error(
      'No se pudo inicializar la clasificación:',
      error.message
    );
  }
});


// Procesar recordatorios y estados de taiming; los datos se recuperan de puntos.json.
setInterval(() => {
  processTaimings().catch((error) => console.error('Error general en recordatorios de taiming:', error));
}, 15000);

// Ejecutar una vez al iniciar para recuperar programaciones tras reinicios.
setTimeout(() => {
  processTaimings().catch((error) => console.error('Error recuperando taiming:', error));
}, 1000);

discordClient.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error(
    'No se pudo conectar Only a Discord:',
    error.message
  );
});

// --------------------------------------------------
// INICIAR SERVIDOR
// --------------------------------------------------

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});
