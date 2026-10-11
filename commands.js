
import 'dotenv/config';
import { getRPSChoices } from './game.js';
import { capitalize, InstallGlobalCommands } from './utils.js';

function createCommandChoices() {
  return getRPSChoices().map((choice) => ({
    name: capitalize(choice),
    value: choice.toLowerCase(),
  }));
}

const TEST_COMMAND = {
  name: 'test',
  description: 'Basic command',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const CHALLENGE_COMMAND = {
  name: 'challenge',
  description: 'Challenge to a match of rock paper scissors',
  options: [
    {
      type: 3,
      name: 'object',
      description: 'Pick your object',
      required: true,
      choices: createCommandChoices(),
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 2],
};

const ACTIVITY_TYPES = [
  { name: 'Robo de vehículo', value: 'Robo de vehículo' },
  { name: 'Misión de tráfico ilegal', value: 'Misión de tráfico ilegal' },
  { name: 'Robo de negocio', value: 'Robo de negocio' },
  { name: 'Lancha encallada', value: 'Lancha encallada' },
  {
    name: 'Elaboración de metanfetamina',
    value: 'Elaboración de metanfetamina',
  },
  { name: 'Día de recompensa', value: 'Día de recompensa' },
  { name: 'Reparto aéreo', value: 'Reparto aéreo' },
  { name: 'Búsqueda de contenedores', value: 'Búsqueda de contenedores' },
  { name: 'Comunicado interno', value: 'Comunicado interno' },
];


const ACTIVITY_OPTIONS = [
  {
    type: 3,
    name: 'tipo',
    description: 'Tipo de actividad realizada',
    required: true,
    choices: ACTIVITY_TYPES,
  },
  {
    type: 3,
    name: 'hora',
    description: 'Hora en formato 24 horas, por ejemplo 02:56',
    required: true,
    max_length: 5,
    min_length: 5,
  },
  {
    type: 11,
    name: 'evidencia',
    description: 'Archivo adjunto como evidencia',
    required: true,
  },
  {
    type: 3,
    name: 'participantes',
    description: 'Menciona a los participantes, separados por espacios',
    required: true,
    max_length: 1000,
  },
];


const ACTIVITY_COMMAND = {
  name: 'actividad',
  description: 'Registrar una actividad y asignar puntos a sus participantes',
  options: ACTIVITY_OPTIONS,
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 2],
};

const RESET_POINTS_COMMAND = {
  name: 'reiniciarpuntos',
  description: 'Reiniciar todos los puntos de los usuarios',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 2],
};

const MODIFY_POINTS_COMMAND = {
  name: 'modificarpuntos',
  description: 'Sumar o restar puntos a un usuario',
  options: [
    {
      type: 6,
      name: 'usuario',
      description: 'Usuario al que se modificarán los puntos',
      required: true,
    },
    {
      type: 4,
      name: 'cantidad',
      description: 'Puntos a modificar: positivo suma, negativo resta',
      required: true,
      min_value: -100000,
      max_value: 100000,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 2],
};

const ALL_COMMANDS = [
  TEST_COMMAND,
  ACTIVITY_COMMAND,
  RESET_POINTS_COMMAND,
  MODIFY_POINTS_COMMAND,
];

await InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
