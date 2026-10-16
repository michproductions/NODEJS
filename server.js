require('dotenv').config();
const express = require('express');
const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

const app = express();
app.use(express.json({ limit: '1mb' }));
const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.BRIDGE_SECRET || '';
const AUTH_DIR = path.resolve(process.env.AUTH_DIR || './auth_info');
const WP_INBOUND = process.env.WORDPRESS_INBOUND_URL || '';
let sock = null, qrText = '', qrDataUrl = '', connected = false, connecting = false, lastError = '', phone = '';
let startPromise = null;
const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });

function authorized(req, res, next) {
  if (!SECRET || req.get('x-h2e-secret') !== SECRET) return res.status(401).json({ error: 'Não autorizado' });
  next();
}
function textFromMessage(m) {
  const msg = m.message || {};
  return msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption || msg.documentMessage?.caption || msg.buttonsResponseMessage?.selectedDisplayText || msg.listResponseMessage?.title || '';
}
async function notifyWordPress(payload) {
  if (!WP_INBOUND) return;
  try {
    const response = await fetch(WP_INBOUND, { method: 'POST', headers: { 'content-type': 'application/json', 'x-h2e-secret': SECRET }, body: JSON.stringify(payload), signal: AbortSignal.timeout(12000) });
    if (!response.ok) logger.warn({ status: response.status }, 'WordPress inbound callback failed');
  } catch (e) { logger.warn({ err: e.message }, 'WordPress callback unavailable'); }
}
async function startWhatsApp() {
  if (startPromise) return startPromise;
  startPromise = (async () => {
    connecting = true; lastError = '';
    try {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      let version;
      try { ({ version } = await fetchLatestBaileysVersion()); } catch (_) { version = undefined; }
      sock = makeWASocket({ auth: state, version, logger, printQRInTerminal: false, browser: ['H2E CRM WhatsApp', 'Chrome', '1.0.0'], markOnlineOnConnect: false, syncFullHistory: false });
      sock.ev.on('creds.update', saveCreds);
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) { qrText = qr; qrDataUrl = await QRCode.toDataURL(qr, { width: 280, margin: 2 }); connected = false; }
        if (connection === 'open') { connected = true; connecting = false; qrText = ''; qrDataUrl = ''; phone = sock?.user?.id?.split(':')[0]?.split('@')[0] || ''; }
        if (connection === 'close') {
          connected = false; connecting = false;
          const code = lastDisconnect?.error?.output?.statusCode;
          if (code === DisconnectReason.loggedOut) { lastError = 'Sessão desconectada. Remova a sessão no painel e pareie novamente.'; }
          else { lastError = 'Conexão interrompida; tentando reconectar.'; setTimeout(() => { startPromise = null; startWhatsApp().catch(() => {}); }, 2500); }
        }
      });
      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const m of messages || []) {
          if (!m.message || m.key?.fromMe || m.key?.remoteJid?.endsWith('@g.us') || m.key?.remoteJid === 'status@broadcast') continue;
          const from = (m.key.remoteJid || '').split('@')[0].split(':')[0];
          const body = textFromMessage(m);
          if (!from || !body) continue;
          const pushName = m.pushName || from;
          await notifyWordPress({ event: 'message', from, name: pushName, text: body, id: m.key.id || '', timestamp: m.messageTimestamp ? Number(m.messageTimestamp) : Math.floor(Date.now()/1000), type: 'text' });
        }
      });
      return true;
    } catch (e) { connecting = false; lastError = e.message || 'Falha ao iniciar WhatsApp'; startPromise = null; throw e; }
  })();
  return startPromise;
}
app.get('/health', (_req, res) => res.json({ ok: true, service: 'H2E CRM WhatsApp Web Bridge' }));
app.get('/api/status', authorized, (_req, res) => res.json({ connected, connecting, hasQr: !!qrDataUrl, phone, lastError }));
app.get('/api/qr', authorized, (_req, res) => res.json({ connected, qr: qrDataUrl, lastError }));
app.post('/api/connect', authorized, async (_req, res) => {
  try { await startWhatsApp(); res.json({ ok: true, connected, hasQr: !!qrDataUrl, message: 'Serviço iniciado. Aguarde o QR Code.' }); }
  catch (e) { res.status(500).json({ error: 'Não foi possível iniciar a sessão', detail: e.message }); }
});
app.post('/api/send', authorized, async (req, res) => {
  const phoneNumber = String(req.body?.phone || '').replace(/\D/g, '');
  const message = String(req.body?.message || '').trim();
  if (!connected || !sock) return res.status(409).json({ error: 'WhatsApp não está conectado' });
  if (!phoneNumber || !message) return res.status(400).json({ error: 'Telefone e mensagem são obrigatórios' });
  try {
    const jid = phoneNumber + '@s.whatsapp.net';
    const sent = await sock.sendMessage(jid, { text: message });
    res.json({ ok: true, id: sent?.key?.id || '' });
  } catch (e) { res.status(500).json({ error: 'Falha ao enviar mensagem', detail: e.message }); }
});
app.post('/api/logout', authorized, async (_req, res) => {
  try { if (sock) await sock.logout(); } catch (_) {}
  sock = null; connected = false; connecting = false; qrText = ''; qrDataUrl = ''; phone = ''; startPromise = null;
  try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (_) {}
  res.json({ ok: true });
});
app.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  if (!SECRET) logger.error('BRIDGE_SECRET não definido. Configure o .env antes de usar.');
  logger.info(`H2E bridge listening on ${PORT}`);
  startWhatsApp().catch(e => logger.error({ err: e.message }, 'Initial WhatsApp start failed'));
});
