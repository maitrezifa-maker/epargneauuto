// ===== ÉPARGNEAUTO - GITHUB + RENDER - 2025 =====
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const twilio = require('twilio');
const { Pool } = require('pg');
const app = express();

app.use(bodyParser.json());
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/epargneauuto'
});

pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    balance INTEGER DEFAULT 0,
    referred_by INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
  );
`).catch(() => {});

const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

// === PAGE D'ACCUEIL ===
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>ÉpargneAuto</title>
<style>body{font-family:sans-serif;background:#f0f7ff;padding:20px;text-align:center}
.container{max-width:400px;margin:auto;background:white;padding:24px;border-radius:16px;box-shadow:0 10px 30px #0001}
input,button{width:100%;padding:12px;margin:10px 0;border:1px solid #ccc;border-radius:8px;font-size:16px}
button{background:#1a5fb4;color:white;font-weight:bold;cursor:pointer}
#result{margin-top:20px;padding:15px;background:#e8f4ff;border-radius:8px;font-weight:bold}
</style></head>
<body><div class="container">
<h1>ÉpargneAuto</h1>
<input id="phone" placeholder="Numéro (+229...)"/>
<input id="referrer" placeholder="Code parrain"/>
<button onclick="fetch('/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:phone.value,referrer:referrer.value||null})}).then(r=>r.json()).then(d=>result.innerHTML=d.success?'Inscrit !':'Erreur')">S'inscrire</button>
<button onclick="fetch('/user/'+phone.value).then(r=>r.json()).then(u=>result.innerHTML='Épargne: '+ (u.balance||0) +' FCFA')" style="background:#2e7d32">Voir solde</button>
<div id="result"></div>
</div></body></html>
  `);
});

// === API ===
app.post('/register', async (req, res) => {
  const { phone, referrer } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO users (phone, referred_by) VALUES ($1, $2) ON CONFLICT (phone) DO NOTHING RETURNING id',
      [phone, referrer || null]
    );
    if (result.rowCount === 0) return res.json({ success: false, error: "Déjà inscrit" });
    if (referrer) await pool.query('UPDATE users SET balance = balance + 500 WHERE id = $1', [referrer]);
    if (twilioClient) twilioClient.messages.create({ body: 'ÉpargneAuto : +500 FCFA offert !', from: process.env.TWILIO_NUMBER, to: phone });
    res.json({ success: true });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/roundup', async (req, res) => {
  const { phone, amount } = req.body;
  const roundup = 1000 - (amount % 1000);
  if (roundup <= 0) return res.json({ saved: 0 });
  try {
    await axios.post('https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay', {
      amount: roundup.toString(), currency: 'XOF', externalId: Date.now().toString(),
      payer: { partyIdType: 'MSISDN', partyId: phone.replace('+', '') },
      payerMessage: 'ÉpargneAuto', payeeNote: 'Arrondi'
    }, { headers: { Authorization: `Bearer ${process.env.MTN_API_KEY}`, 'Ocp-Apim-Subscription-Key': process.env.MTN_SUBSCRIPTION_KEY } });
    await pool.query('UPDATE users SET balance = balance + $1 WHERE phone = $2', [roundup, phone]);
    res.json({ saved: roundup });
  } catch { res.json({ error: "MTN sandbox" }); }
});

app.get('/user/:phone', async (req, res) => {
  const result = await pool.query('SELECT * FROM users WHERE phone = $1', [req.params.phone]);
  res.json(result.rows[0] || { balance: 0 });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Live on ${PORT}`));
