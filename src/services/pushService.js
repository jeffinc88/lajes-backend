const { Expo } = require('expo-server-sdk');

const expo = new Expo();

// destinatarios: [{ push_token, orcamento_id, tipo, user_id }]
const enviarPush = async (destinatarios, montarMensagem) => {
  const validos = destinatarios.filter(d => Expo.isExpoPushToken(d.push_token));
  if (validos.length === 0) return [];

  const mensagens = validos.map(d => ({
    to: d.push_token,
    sound: 'default',
    ...montarMensagem(d),
  }));

  const chunks = expo.chunkPushNotifications(mensagens);
  const enviados = [];
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
      enviados.push(...chunk);
    } catch (e) {
      console.error('Erro ao enviar push:', e);
    }
  }
  return validos;
};

module.exports = { enviarPush };
