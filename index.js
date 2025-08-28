const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const express = require("express");
const QRCode = require("qrcode");

const app = express();
const port = 8000;

app.use(express.json());

let sock;
let qrCodeString = ""; // simpan QR terakhir

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: true, // tetap tampil di terminal
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, qr }) => {
    if (qr) {
      qrCodeString = qr; // simpan QR terbaru
    }
    if (connection === "open") {
      console.log("✅ WhatsApp connected");
      qrCodeString = ""; // kosongkan kalau sudah connect
    } else if (connection === "close") {
      console.log("❌ Koneksi terputus, reconnect...");
      connectToWhatsApp();
    }
  });
}

// Endpoint auth: tampilkan QR di web
app.get("/auth", async (req, res) => {
  if (!qrCodeString) {
    return res.send("<h2>✅ WhatsApp sudah terhubung atau belum ada QR aktif.</h2>");
  }

  try {
    const qrImage = await QRCode.toDataURL(qrCodeString);
    res.send(`
      <html>
        <head><title>Login WhatsApp</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
          <h2>Scan QR WhatsApp</h2>
          <img src="${qrImage}" />
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("Gagal generate QR: " + err.message);
  }
});

// Endpoint POST kirim pesan
app.post("/send-message", async (req, res) => {
  const { number, message } = req.body;
  if (!number || !message) {
    return res.status(400).json({ status: false, response: "Nomor dan pesan harus diisi" });
  }
  sendMessage(number, message, res);
});

// Endpoint GET kirim pesan
app.get("/send-message-get", async (req, res) => {
  const number = req.query.no;
  const message = req.query.mass;
  if (!number || !message) {
    return res.status(400).json({ status: false, response: "Parameter ?no= & ?mass= harus diisi" });
  }
  sendMessage(number, message, res);
});

// Fungsi kirim pesan
async function sendMessage(number, message, res) {
  try {
    const numberWA = "62" + number.replace(/^0/, "") + "@s.whatsapp.net";
    const exists = await sock.onWhatsApp(numberWA);

    if (!exists || !exists[0]?.jid) {
      return res.status(404).json({
        status: false,
        response: `Nomor ${number} tidak terdaftar di WhatsApp`,
      });
    }

    await sock.sendMessage(exists[0].jid, { text: message });
    res.json({ status: true, response: `Pesan terkirim ke ${number}` });
  } catch (err) {
    res.status(500).json({ status: false, response: err.message });
  }
}

connectToWhatsApp();
app.listen(port, () => console.log("🚀 Server jalan di http://localhost:" + port));
