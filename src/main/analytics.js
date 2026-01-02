const fetch = require("node-fetch");
const config = require('../../config/analytics-conf.json');

// Configuración
const MEASUREMENT_ID = config.MEASUREMENT_ID;
const API_SECRET = config.API_SECRET;

const { v4: uuidv4 } = require("uuid");

// Genera un client_id único para el usuario
const CLIENT_ID = uuidv4();

async function sendAnalyticsEvent(eventName, params = {}) {
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`;

  const payload = {
    client_id: CLIENT_ID,
    events: [
      {
        name: eventName,
        params: params,
      },
    ],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("Error al enviar evento GA:", res.statusText);
    }
  } catch (err) {
    console.error("Error de red:", err);
  }
}

module.exports = { sendAnalyticsEvent };
