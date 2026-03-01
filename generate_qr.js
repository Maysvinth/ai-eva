const QRCode = require('qrcode');
const crypto = require('crypto');

const code = crypto.randomBytes(3).toString('hex').toUpperCase();
const link = `https://myai.example.com/connect?code=${code}`;

QRCode.toDataURL(link, function (err, url) {
  if (err) throw err;
  console.log(JSON.stringify({
    code: code,
    qr: url,
    link: link
  }, null, 2));
});
