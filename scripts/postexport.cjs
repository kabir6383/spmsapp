// Netlify's deploy upload rejects filenames containing "+" (it is decoded as a
// space, so the uploaded file never matches the deploy manifest). Expo Router
// exports its not-found route as "+not-found.html", so rename any such files.
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');

const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.includes('+')) {
      const target =
        entry.name === '+not-found.html'
          ? path.join(dir, '404.html')
          : path.join(dir, entry.name.replace(/\+/g, '_'));
      if (!fs.existsSync(target)) {
        fs.renameSync(full, target);
      } else {
        fs.unlinkSync(full);
      }
      console.log(`Renamed ${path.relative(distDir, full)} -> ${path.relative(distDir, target)}`);
    }
  }
};

if (fs.existsSync(distDir)) walk(distDir);
