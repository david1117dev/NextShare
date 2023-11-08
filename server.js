const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const config = require('./config.json');
const app = express();
const port = config.port || 3000;

const uploadsDirectory = 'uploads';
if (!fs.existsSync(uploadsDirectory)) {
  fs.mkdirSync(uploadsDirectory);
}

const db = new sqlite3.Database('urls.db');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const extname = path.extname(file.originalname);
    const randomName = getRandomFileName(6) + extname;
    cb(null, randomName);
  },
});

const upload = multer({ storage: storage });

db.serialize(() => {
  db.run('CREATE TABLE IF NOT EXISTS shortened_urls (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, url TEXT)');
});

console.log(`[${chalk.green.bold('INFO')}] Starting NextShare...`);

app.use('/uploads', express.static('uploads', {
  setHeaders: (res, path) => {
    if (isTextFile(path)) {
      res.setHeader('Content-Type', 'text/plain');
    }
  }
}));

app.use(bodyParser.urlencoded({ extended: false }));

app.get('/config.json', (req, res) => {
  res.json(config);
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (req.file) {
    const fileName = req.file.filename;
    const fileSize = req.file.size;
    const fileType = req.file.mimetype;
    res.redirect(`/file-info?fileName=${fileName}&fileSize=${fileSize}&fileType=${fileType}`);
  } else {
    res.redirect('/file-info?fileName=No%20File&fileSize=0&fileType=Unknown');
  }
});

app.post('/shorten', (req, res) => {
  const urlToShorten = req.body.url;
  const shortenedCode = getRandomFileName(6);

  db.run('INSERT INTO shortened_urls (code, url) VALUES (?, ?)', [shortenedCode, urlToShorten], function(err) {
    if (err) {
      console.error('Error saving shortened URL:', err);
      res.status(500).send('Internal Server Error');
    } else {
      const shortenedURL = `/s/${shortenedCode}`;
      res.redirect(`/url-info.html?shortenedURL=${shortenedURL}&originalURL=${urlToShorten}`);
    }
  });
});

app.get('/s/:shortURL', (req, res) => {
  const shortURL = req.params.shortURL;

  db.get('SELECT url FROM shortened_urls WHERE code = ?', [shortURL], (err, row) => {
    if (err || !row) {
      res.status(404).send('Shortened URL not found');
    } else {
      const originalURL = row.url;
      res.redirect(originalURL);
    }
  });
});


app.get('/file-info', (req, res) => {
  res.sendFile(__dirname + '/public/file-info.html');
});

app.get('/url-info.html', (req, res) => {
  res.sendFile(__dirname + '/public/url-info.html');
});

app.use((req, res, next) => {
  res.status(404).sendFile(path.join(__dirname, 'public/error-404.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).sendFile(path.join(__dirname, 'public/error-500.html'));
});

process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing the database:', err);
    } else {
      console.log(`[${chalk.green.bold('INFO')}] Database closed`);
      process.exit(0);
    }
  });
});

app.listen(port, () => {
  console.log(`[${chalk.green.bold('INFO')}] NextShare is running on port ${port}`);
});

function getRandomFileName(letterCount) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let randomName = '';
  for (let i = 0; i < letterCount; i++) {
    randomName += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return randomName;
}

function isTextFile(filePath) {
  const textExtensions = ['.txt', '.sh', '.js', '.html', '.css', '.md'];
  const fileExtension = path.extname(filePath).toLowerCase();
  return textExtensions.includes(fileExtension);
}
